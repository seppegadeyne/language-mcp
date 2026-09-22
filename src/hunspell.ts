import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Hunspell pipe (-a / ispell protocol) wrapper for Dutch spell checking.
 *
 * Protocol notes (verified against hunspell 1.7.3):
 * - First output line is a banner starting with `@(#)`.
 * - Each input word yields exactly ONE non-empty response line:
 *     `*`                       correct (word not repeated)
 *     `+ <stem>`                correct via affix stemming
 *     `# <word>`                unknown, no suggestions
 *     `& <word> <n> <off>: <suggestions>`  unknown with suggestions
 * - Empty separator lines appear between responses and must be dropped.
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
      const lines = out
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => l.length > 0 && !l.startsWith('@(#)'));

      // Zip: k-th non-empty response belongs to k-th input word.
      if (lines.length !== unique.length) {
        reject(
          new Error(
            `hunspell response count mismatch: ${lines.length} responses for ${unique.length} words`
          )
        );
        return;
      }
      for (let i = 0; i < unique.length; i++) {
        const word = unique[i];
        const line = lines[i];
        if (line.startsWith('*') || line.startsWith('+')) {
          results.set(word, { word, correct: true, suggestions: [] });
        } else if (line.startsWith('#')) {
          results.set(word, { word, correct: false, suggestions: [] });
        } else if (line.startsWith('&')) {
          const m = line.match(/^& (\S+) (\d+) \d+: (.*)$/);
          if (m && m[1] === word) {
            results.set(word, {
              word,
              correct: false,
              suggestions: m[3].split(', ').filter(Boolean).slice(0, 8),
            });
          } else {
            // Fall back to positional trust: word from input, suggestions from line.
            results.set(word, {
              word,
              correct: false,
              suggestions: (m?.[3] ?? '').split(', ').filter(Boolean).slice(0, 8),
            });
          }
        }
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
