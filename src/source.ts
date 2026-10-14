/**
 * Input resolution for the check tools: inline `text`, or a local `path` that
 * the server reads itself, optionally narrowed to a code-point range.
 *
 * Why a path: an agent that reads a file and then retypes its contents into a
 * tool call can drift from the file without anyone noticing. With `path` the
 * server reads the exact bytes, and every check reports the SHA-256 of the
 * text it actually checked, so the caller can reconcile it with a coverage
 * manifest. `expected_sha256` turns that comparison into a hard gate.
 *
 * Conventions (shared with full-coverage language review manifests):
 * - Ranges are half-open `[start, end)` in Unicode code points of the decoded
 *   file, not bytes or UTF-16 units.
 * - Hashes are SHA-256 over the exact UTF-8 bytes; nothing is normalized (no
 *   BOM stripping, no newline conversion). For the full range, input_sha256
 *   equals the file's own SHA-256 (`sha256sum <file>`).
 * - Finding positions stay UTF-16 offsets into the checked text, so with a
 *   range they are relative to the range start.
 * - Inline `text` is hashed as UTF-8 of the JS string; a lone surrogate is
 *   encoded as U+FFFD, so "exact bytes" holds for well-formed text only.
 *   File input cannot contain lone surrogates (the decoder is fatal).
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ROOTS_ENV = 'LANGUAGE_MCP_ROOTS';

export const sourceSchema = {
  path: z.string().min(1).optional().describe(
    'Absolute path of a local UTF-8 text file to check instead of text. The server reads the file itself, so the content is never retyped. Use either text or path.',
  ),
  start: z.number().int().nonnegative().optional().describe(
    'With path: first code point of the range to check (inclusive, default 0). Ranges are half-open [start, end) in Unicode code points.',
  ),
  end: z.number().int().nonnegative().optional().describe(
    'With path: code point where the range ends (exclusive, default end of file).',
  ),
  expected_sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional().describe(
    'SHA-256 (hex) the checked text must have. On a mismatch the check does not run and the tool returns an error. Works with text and path.',
  ),
};

export interface SourceArgs {
  text?: string;
  path?: string;
  start?: number;
  end?: number;
  expected_sha256?: string;
}

export interface ResolvedInput {
  text: string;
  /** One-line provenance summary for the tool output. */
  summary: string;
  inputSha256: string;
  codePoints: number;
  file?: { path: string; sha256: string; codePoints: number; start: number; end: number };
}

export class InputError extends Error {}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function codePointLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** Slice by code points: [start, end). Both must be within 0..length. */
export function sliceCodePoints(text: string, start: number, end: number): string {
  let cp = 0;
  let from = -1;
  let to = -1;
  for (let i = 0; i <= text.length; ) {
    if (cp === start && from < 0) from = i;
    if (cp === end) { to = i; break; }
    if (i === text.length) break;
    const c = text.charCodeAt(i);
    const pair = c >= 0xd800 && c <= 0xdbff && i + 1 < text.length
      && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff;
    i += pair ? 2 : 1;
    cp++;
  }
  if (from < 0 || to < 0) throw new InputError(`range [${start}, ${end}) is outside the text`);
  return text.slice(from, to);
}

/** null = no restriction (variable unset); a set variable without any folder fails closed. */
function allowedRoots(): string[] | null {
  const raw = process.env[ROOTS_ENV];
  if (raw === undefined) return null;
  const roots = raw.split(path.delimiter).map((r) => r.trim()).filter(Boolean);
  if (roots.length === 0) throw new InputError(`${ROOTS_ENV} is set but names no folder; refusing to read files`);
  return roots;
}

function inside(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
}

async function readTextFile(filePath: string): Promise<{ real: string; text: string; sha256: string }> {
  if (!path.isAbsolute(filePath)) throw new InputError(`path must be absolute: ${filePath}`);
  let real: string;
  try {
    real = await fs.realpath(filePath);
  } catch {
    throw new InputError(`file not found or not readable: ${filePath}`);
  }
  const roots = allowedRoots();
  if (roots !== null) {
    const realRoots = await Promise.all(roots.map((r) => fs.realpath(r).catch(() => path.resolve(r))));
    if (!realRoots.some((r) => inside(real, r))) {
      throw new InputError(`path is outside the folders allowed by ${ROOTS_ENV}: ${filePath}`);
    }
  }
  const stat = await fs.stat(real);
  if (!stat.isFile()) throw new InputError(`not a regular file: ${filePath}`);
  const tooLarge = `file is larger than ${MAX_FILE_BYTES} bytes; split it into smaller files or pass text`;
  if (stat.size > MAX_FILE_BYTES) throw new InputError(tooLarge);
  const bytes = await fs.readFile(real);
  // stat.size can lie (pseudo-files report 0, a file can grow): check what was read.
  if (bytes.length > MAX_FILE_BYTES) throw new InputError(tooLarge);
  if (bytes.includes(0)) throw new InputError(`file looks binary (contains NUL bytes): ${filePath}`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InputError(`file is not valid UTF-8: ${filePath}`);
  }
  return { real, text, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function resolveInput(args: SourceArgs): Promise<ResolvedInput> {
  const hasText = typeof args.text === 'string';
  const hasPath = typeof args.path === 'string';
  if (hasText === hasPath) throw new InputError('pass exactly one of text or path');
  if (hasText && (args.start !== undefined || args.end !== undefined)) {
    throw new InputError('start and end only apply to path');
  }

  let resolved: ResolvedInput;
  if (hasText) {
    const text = args.text as string;
    const inputSha256 = sha256Hex(text);
    const codePoints = codePointLength(text);
    resolved = {
      text,
      inputSha256,
      codePoints,
      summary: `Input: inline text, ${codePoints} code points, input_sha256 ${inputSha256}`,
    };
  } else {
    const file = await readTextFile(args.path as string);
    const total = codePointLength(file.text);
    const start = args.start ?? 0;
    const end = args.end ?? total;
    if (start > end || end > total) {
      throw new InputError(`range [${start}, ${end}) is outside the file (${total} code points)`);
    }
    const text = start === 0 && end === total ? file.text : sliceCodePoints(file.text, start, end);
    const inputSha256 = sha256Hex(text);
    if (start === 0 && end === total && inputSha256 !== file.sha256) {
      throw new InputError('decoded file does not re-encode to its own bytes; refusing to report a hash');
    }
    const codePoints = end - start;
    resolved = {
      text,
      inputSha256,
      codePoints,
      file: { path: file.real, sha256: file.sha256, codePoints: total, start, end },
      summary: `Input: file ${file.real}, range [${start}, ${end}) of ${total} code points, `
        + `${codePoints} code points checked, input_sha256 ${inputSha256}, file_sha256 ${file.sha256}`
        + (start > 0 ? ' (positions below are relative to the range start)' : ''),
    };
  }

  if (args.expected_sha256 && args.expected_sha256.toLowerCase() !== resolved.inputSha256) {
    throw new InputError(
      `expected_sha256 ${args.expected_sha256.toLowerCase()} does not match input_sha256 ${resolved.inputSha256}; nothing was checked`,
    );
  }
  return resolved;
}

/** Tool result for an input that could not be resolved. */
export function inputErrorResult(e: unknown) {
  const message = e instanceof InputError ? e.message : `could not read input: ${(e as Error).message}`;
  return { content: [{ type: 'text' as const, text: `Input error: ${message}` }], isError: true };
}
