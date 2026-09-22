import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Hunspell pipe (-a / ispell protocol) wrapper for Dutch spell checking.
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

export async function hunspellWords(words: string[], lang: 'nl' | 'en_US' = 'nl'): Promise<Map<string, HunspellResult>> {
  const results = new Map<string, HunspellResult>();
  if (words.length === 0) return results;

  const unique = [...new Set(words)];
  const input = unique.join('\n') + '\n';

  return await new Promise<Map<string, HunspellResult>>((resolve, reject) => {
    const proc = spawn('hunspell', ['-d', resolveDict(lang), '-a'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('hunspell timed out after 20s'));
    }, 20_000);

    proc.stdout.on('data', (d: Buffer) => (out += d.toString()));
    proc.stderr.on('data', (d: Buffer) => (out += d.toString()));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && out.trim() === '') {
        reject(new Error(`hunspell exited with ${code}`));
        return;
      }
      const rawLines = out
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => !l.startsWith('@(#)'));

      // Group into per-word blocks separated by empty lines: a compound word
      // (hyphen, em dash, ...) yields one response line per part, so a plain
      // 1:1 line zip misaligns on the first compound.
      const blocks: string[][] = [];
      let current: string[] = [];
      for (const line of rawLines) {
        if (line.length === 0) {
          if (current.length > 0) {
            blocks.push(current);
            current = [];
          }
        } else {
          current.push(line);
        }
      }
      if (current.length > 0) blocks.push(current);

      // Zip: k-th response block belongs to k-th input word.
      if (blocks.length !== unique.length) {
        reject(
          new Error(
            `hunspell response count mismatch: ${blocks.length} blocks for ${unique.length} words`
          )
        );
        return;
      }
      for (let i = 0; i < unique.length; i++) {
        const word = unique[i];
        const block = blocks[i];
        const suggestions: string[] = [];
        let correct = true;
        for (const line of block) {
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
      resolve(results);
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function resolveDict(lang: 'nl' | 'en_US'): string {
  const candidates = [
    path.join(__dirname, '..', 'assets', lang),
    path.join(process.cwd(), 'assets', lang),
  ];
  if (lang === 'nl') candidates.push('/usr/share/hunspell/nl_NL', 'nl_NL');
  else candidates.push('/usr/share/hunspell/en_US', 'en_US');
  for (const c of candidates) {
    if (fs.existsSync(c + '.dic')) return c;
  }
  return lang;
}
