import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Locale-safe spawn environment for hunspell.
 *
 * MCP clients (Python and TypeScript SDK StdioClientTransport) launch this
 * server with a sanitized environment (PATH, HOME, ...) that omits LANG and
 * LC_*. Without a UTF-8 locale hunspell converts our UTF-8 input through
 * ANSI_X3.4-1968 ("iconv: UTF-8 -> ANSI_X3.4-1968" on stderr): accented
 * letters are mangled, "wél" splits into two `-m` morphology blocks (breaking
 * the block-count contract), and "België" turns into a bogus unknown word with
 * garbage suggestions in `-a` mode. Force a UTF-8 locale unless the inherited
 * environment already announces one.
 */
export function utf8SpawnEnv(): NodeJS.ProcessEnv {
  const current = [process.env.LC_ALL, process.env.LC_CTYPE, process.env.LANG].find((v) => v) ?? '';
  if (/UTF-?8/i.test(current)) return process.env;
  return { ...process.env, LC_ALL: 'C.UTF-8' };
}

/**
 * Hunspell pipe (-a / ispell protocol) wrapper for Dutch, US English, and French spell checking.
 *
 * Protocol notes (verified against hunspell 1.7.3):
 * - First output line is a banner starting with `@(#)`.
 * - Each input word yields a BLOCK of one or more non-empty response lines,
 *   always terminated by one empty separator line:
 *     `*`                       correct (word not repeated)
 *     `+ <stem>`                correct via affix stemming
 *     `# <word>`                unknown, no suggestions
 *     `& <word> <n> <off>: <suggestions>`  unknown with suggestions
 * - Words containing hyphens, em dashes or similar separators are checked per
 *   part and produce one response line per part ("data-driven" → two `*` lines).
 *   Blocks MUST be split on the empty separator lines; zipping single response
 *   lines 1:1 with input words breaks on the first compound word.
 */

export interface HunspellResult {
  word: string;
  correct: boolean;
  suggestions: string[];
}

export type HunspellLang = 'nl' | 'en_US' | 'fr';

/**
 * Run one hunspell batch (`-a` or `-m`) and return one response block per
 * input word, in input order. Shared by spell checks and morphology.
 */
export function hunspellBlocks(words: string[], lang: HunspellLang, mode: '-a' | '-m'): Promise<string[][]> {
  const name = mode === '-m' ? 'hunspell -m' : 'hunspell';
  return new Promise((resolve, reject) => {
    const proc = spawn('hunspell', ['-d', resolveDict(lang), mode], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: utf8SpawnEnv(),
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${name} timed out after 20s`));
    }, 20_000);

    proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
    // Kept out of `out`: a warning line on stderr would parse as a response block.
    proc.stderr.on('data', (d: Buffer) => (err += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && out.trim() === '') {
        reject(new Error(`${name} exited with ${code}${err.trim() ? `: ${err.trim()}` : ''}`));
        return;
      }
      // Group into per-word blocks separated by empty lines: a compound word
      // (hyphen, em dash, ...) yields one response line per part, so a plain
      // 1:1 line zip misaligns on the first compound.
      const blocks: string[][] = [];
      let current: string[] = [];
      for (const raw of out.split('\n')) {
        const line = raw.replace(/\r$/, '');
        if (line.startsWith('@(#)')) continue;
        if (line.length > 0) {
          current.push(line);
        } else if (current.length > 0) {
          blocks.push(current);
          current = [];
        }
      }
      if (current.length > 0) blocks.push(current);
      if (blocks.length !== words.length) {
        reject(new Error(`${name} response count mismatch: ${blocks.length} blocks for ${words.length} words`));
        return;
      }
      resolve(blocks);
    });
    // A hunspell that exits early (missing dictionary) must reject via
    // 'close', not crash the whole server with an unhandled EPIPE.
    proc.stdin.on('error', () => {});
    // '^' makes hunspell check the rest of the line as text, never as a pipe
    // command: "*word" would add a word to the dictionary and "#" would save
    // that personal dictionary to disk for every later check.
    proc.stdin.end(words.map((w) => '^' + w.replace(/[\r\n]+/g, ' ')).join('\n') + '\n');
  });
}

export async function hunspellWords(words: string[], lang: HunspellLang = 'nl'): Promise<Map<string, HunspellResult>> {
  const results = new Map<string, HunspellResult>();
  if (words.length === 0) return results;

  const unique = [...new Set(words)];
  const blocks = await hunspellBlocks(unique, lang, '-a');
  for (let i = 0; i < unique.length; i++) {
    const word = unique[i];
    const suggestions: string[] = [];
    let correct = true;
    for (const line of blocks[i]) {
      if (line.startsWith('*') || line.startsWith('+')) continue;
      correct = false;
      if (line.startsWith('&')) {
        const m = line.match(/^& (\S+) (\d+) \d+: (.*)$/);
        for (const s of (m?.[3] ?? '').split(', ')) {
          if (s && !suggestions.includes(s)) suggestions.push(s);
        }
      }
      // '#'-lines: unknown without suggestions, nothing to collect.
    }
    results.set(word, { word, correct, suggestions: suggestions.slice(0, 8) });
  }
  return results;
}

/** Candidate dictionary base paths: bundled asset first, system dictionaries as fallbacks (ADR 001). */
function dictCandidates(lang: HunspellLang): string[] {
  const candidates = [
    path.join(__dirname, '..', 'assets', lang),
    path.join(process.cwd(), 'assets', lang),
  ];
  if (lang === 'nl') candidates.push('/usr/share/hunspell/nl_NL', 'nl_NL');
  else if (lang === 'fr') {
    candidates.push('/usr/share/hunspell/fr_FR', '/usr/share/hunspell/fr', '/usr/share/myspell/fr_FR', 'fr_FR');
  } else candidates.push('/usr/share/hunspell/en_US', 'en_US');
  return candidates;
}

/** Bundled asset path first, system dictionaries as fallbacks (ADR 001). */
export function resolveDict(lang: HunspellLang): string {
  for (const c of dictCandidates(lang)) {
    if (fs.existsSync(c + '.dic')) return c;
  }
  return lang;
}

/** True when a dictionary for the language exists at a bundled or system path. */
export function dictAvailable(lang: HunspellLang): boolean {
  return dictCandidates(lang).some((c) => fs.existsSync(c + '.dic') && fs.existsSync(c + '.aff'));
}
