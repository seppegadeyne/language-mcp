import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  MAX_FILE_BYTES, codePointLength, resolveInput, sha256Hex, sliceCodePoints,
} from '../src/source';
import { MAX_SPELL_WORDS, scanWords } from '../src/tokenize';

const dir = mkdtempSync(path.join(os.tmpdir(), 'language-mcp-source-'));
const DUTCH = 'Wij bouwen een keuken tafel.\n\nDe app leest foto\'s uit en zet ze om naar gegevens.\n';
const dutchFile = path.join(dir, 'tekst.md');
writeFileSync(dutchFile, DUTCH, 'utf8');
const emojiFile = path.join(dir, 'emoji.txt');
writeFileSync(emojiFile, 'a😀b café', 'utf8');
const binFile = path.join(dir, 'bin.dat');
writeFileSync(binFile, Buffer.from([0x61, 0x00, 0x62]));
const latin1File = path.join(dir, 'latin1.txt');
writeFileSync(latin1File, Buffer.from([0x63, 0x61, 0x66, 0xe9]));

const bomFile = path.join(dir, 'bom-crlf.txt');
writeFileSync(bomFile, '\ufeffEen huis.\r\nTwee huizen.\r\n', 'utf8');
const bigFile = path.join(dir, 'big.txt');
writeFileSync(bigFile, 'a'.repeat(MAX_FILE_BYTES + 1));
const rootDir = path.join(dir, 'root');
mkdirSync(rootDir);
writeFileSync(path.join(rootDir, 'in.txt'), 'binnen', 'utf8');
symlinkSync(dutchFile, path.join(rootDir, 'escape.md'));
symlinkSync(rootDir, path.join(dir, 'root-link'));

const fileSha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

after(() => rmSync(dir, { recursive: true, force: true }));

describe('source resolution', () => {
  it('counts and slices Unicode code points, not UTF-16 units', () => {
    assert.equal(codePointLength('a😀b'), 3);
    assert.equal(sliceCodePoints('a😀b café', 1, 3), '😀b');
    assert.equal(sliceCodePoints('a😀b café', 4, 8), 'café');
    assert.equal(sliceCodePoints('a😀b café', 8, 8), '');
    assert.throws(() => sliceCodePoints('a😀b', 2, 4), /outside the text/);
  });

  it('reads a whole file and reports the file hash as input_sha256', async () => {
    const r = await resolveInput({ path: dutchFile });
    assert.equal(r.text, DUTCH);
    assert.equal(r.inputSha256, fileSha(dutchFile));
    assert.equal(r.file?.sha256, fileSha(dutchFile));
    assert.equal(r.codePoints, codePointLength(DUTCH));
  });

  it('checks a half-open code-point range and hashes exactly that slice', async () => {
    const r = await resolveInput({ path: emojiFile, start: 1, end: 3 });
    assert.equal(r.text, '😀b');
    assert.equal(r.inputSha256, sha256Hex('😀b'));
    assert.equal(r.codePoints, 2);
    assert.match(r.summary, /range \[1, 3\) of 8 code points/);
    assert.match(r.summary, /relative to the range start/);
  });

  it('hashes inline text the same way', async () => {
    const r = await resolveInput({ text: DUTCH });
    assert.equal(r.inputSha256, fileSha(dutchFile));
  });

  it('enforces expected_sha256 on text and path', async () => {
    await resolveInput({ path: dutchFile, expected_sha256: fileSha(dutchFile).toUpperCase() });
    await assert.rejects(resolveInput({ path: dutchFile, expected_sha256: '0'.repeat(64) }), /does not match/);
    await assert.rejects(resolveInput({ text: 'x', expected_sha256: '0'.repeat(64) }), /nothing was checked/);
  });

  it('refuses ambiguous, relative, missing, binary, non-UTF-8 and out-of-range input', async () => {
    await assert.rejects(resolveInput({}), /exactly one of text or path/);
    await assert.rejects(resolveInput({ text: 'a', path: dutchFile }), /exactly one/);
    await assert.rejects(resolveInput({ text: 'a', start: 1 }), /only apply to path/);
    await assert.rejects(resolveInput({ path: 'tekst.md' }), /must be absolute/);
    await assert.rejects(resolveInput({ path: path.join(dir, 'nope.md') }), /not found/);
    await assert.rejects(resolveInput({ path: dir }), /not a regular file/);
    await assert.rejects(resolveInput({ path: binFile }), /binary/);
    await assert.rejects(resolveInput({ path: latin1File }), /not valid UTF-8/);
    await assert.rejects(resolveInput({ path: emojiFile, start: 5, end: 9 + 1 }), /outside the file/);
    await assert.rejects(resolveInput({ path: emojiFile, start: 4, end: 2 }), /outside the file/);
  });

  it('keeps a BOM and CRLF in the text and the hash', async () => {
    const r = await resolveInput({ path: bomFile });
    assert.ok(r.text.startsWith('\ufeff') && r.text.includes('\r\n'));
    assert.equal(r.inputSha256, fileSha(bomFile));
  });

  it('refuses files over the size limit', async () => {
    await assert.rejects(resolveInput({ path: bigFile }), /larger than/);
  });

  it('caps spell scans explicitly instead of silently', () => {
    const words = Array.from({ length: MAX_SPELL_WORDS + 5 }, () => 'huis').join(' ');
    const scan = scanWords(words);
    assert.equal(scan.tokens.length, MAX_SPELL_WORDS);
    assert.equal(scan.truncatedAt, MAX_SPELL_WORDS * 5);
    assert.equal(scanWords('een huis').truncatedAt, null);
  });

  it('resolves symlinks on both sides of LANGUAGE_MCP_ROOTS and fails closed when empty', async () => {
    const previous = process.env.LANGUAGE_MCP_ROOTS;
    try {
      process.env.LANGUAGE_MCP_ROOTS = path.join(dir, 'root-link');
      await resolveInput({ path: path.join(rootDir, 'in.txt') });
      await assert.rejects(resolveInput({ path: path.join(rootDir, 'escape.md') }), /outside the folders allowed/);
      process.env.LANGUAGE_MCP_ROOTS = ' : ';
      await assert.rejects(resolveInput({ path: dutchFile }), /names no folder/);
    } finally {
      if (previous === undefined) delete process.env.LANGUAGE_MCP_ROOTS;
      else process.env.LANGUAGE_MCP_ROOTS = previous;
    }
  });

  it('limits paths to LANGUAGE_MCP_ROOTS when it is set', async () => {
    const previous = process.env.LANGUAGE_MCP_ROOTS;
    try {
      process.env.LANGUAGE_MCP_ROOTS = path.join(os.tmpdir(), 'no-such-root-for-language-mcp');
      await assert.rejects(resolveInput({ path: dutchFile }), /outside the folders allowed/);
      process.env.LANGUAGE_MCP_ROOTS = dir;
      await resolveInput({ path: dutchFile });
    } finally {
      if (previous === undefined) delete process.env.LANGUAGE_MCP_ROOTS;
      else process.env.LANGUAGE_MCP_ROOTS = previous;
    }
  });
});

describe('path input through the real MCP server', { timeout: 30000 }, () => {
  const client = new Client({ name: 'source-test', version: '1.0.0' });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text?: string }>)
      .filter((item) => item.type === 'text').map((item) => item.text).join('\n');
    return { text, isError: Boolean(result.isError) };
  };

  before(async () => {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
    }));
  });
  after(async () => { await client.close(); });

  it('gives the same findings for path and text, plus provenance', async () => {
    const byText = await call('check_dutch_text', { text: DUTCH });
    const byPath = await call('check_dutch_text', { path: dutchFile });
    assert.ok(!byPath.isError);
    assert.match(byPath.text, new RegExp(`input_sha256 ${fileSha(dutchFile)}`));
    assert.match(byPath.text, /nl-compound-spacing/);
    const strip = (t: string) => t.split('\n').filter((l) => !l.startsWith('Input: ')).join('\n');
    assert.equal(strip(byPath.text), strip(byText.text));
    assert.match(byText.text, /Input: inline text/);
  });

  it('runs all four check tools from a path', async () => {
    for (const name of ['check_dutch_b1_text', 'check_us_english_text', 'check_us_english_b1_text']) {
      const r = await call(name, { path: dutchFile });
      assert.ok(!r.isError, name);
      assert.match(r.text, /input_sha256 [0-9a-f]{64}/, name);
    }
  });

  it('returns a tool error and checks nothing on a hash mismatch', async () => {
    const r = await call('check_dutch_b1_text', { path: dutchFile, expected_sha256: 'f'.repeat(64) });
    assert.ok(r.isError);
    assert.match(r.text, /Input error: expected_sha256 .* does not match/);
    assert.doesNotMatch(r.text, /Readability/);
  });

  it('marks a spell check that hit the word cap as an incomplete error', async () => {
    const words = Array.from({ length: MAX_SPELL_WORDS + 1 }, () => 'huis').join(' ');
    for (const name of ['check_dutch_text', 'check_us_english_text']) {
      const r = await call(name, { text: words });
      assert.ok(r.isError, name);
      assert.match(r.text, /INCOMPLETE: spelling stopped after 20000 words; text from position 100000 on/, name);
      assert.match(r.text, /input_sha256/, name);
    }
  });

  it('advertises path, range and expected_sha256 and keeps text optional', async () => {
    const tools = await client.listTools();
    for (const name of ['check_dutch_text', 'check_dutch_b1_text', 'check_us_english_text', 'check_us_english_b1_text']) {
      const schema = tools.tools.find((t) => t.name === name)!.inputSchema as {
        properties: Record<string, unknown>; required?: string[];
      };
      for (const key of ['text', 'path', 'start', 'end', 'expected_sha256']) assert.ok(key in schema.properties, `${name}.${key}`);
      assert.ok(!(schema.required ?? []).includes('text'), name);
    }
  });
});
