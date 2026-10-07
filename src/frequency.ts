/**
 * Dutch Zipf word-frequency lookups for the B1 layer.
 *
 * Data: assets/frequency/nl-zipf.tsv — top 50k Dutch word forms with Zipf
 * frequencies derived from hermitdave/FrequencyWords nl_50k.txt
 * (OpenSubtitles2018; content CC BY-SA 4.0). See that directory's README for
 * provenance, license, and the spoken-language bias caveat.
 *
 * The table is parsed once per process (lazy singleton). Unknown words
 * return null and are never treated as rare: Dutch compounds and proper
 * names dominate the unknown set, so flagging them would destroy precision.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let table: Map<string, number> | null = null;

function loadTable(): Map<string, number> {
  if (table) return table;
  const file = join(__dirname, '..', 'assets', 'frequency', 'nl-zipf.tsv');
  const map = new Map<string, number>();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab <= 0) continue;
    const zipf = Number.parseFloat(line.slice(tab + 1));
    if (Number.isFinite(zipf)) map.set(line.slice(0, tab), zipf);
  }
  table = map;
  return map;
}

/** Zipf frequency of a Dutch word form, or null when not in the top-50k table. */
export function getDutchZipf(word: string): number | null {
  const v = loadTable().get(word.toLowerCase());
  return v === undefined ? null : v;
}

/** True when the table knows the word at all (used by tests). */
export function knowsDutchWord(word: string): boolean {
  return loadTable().has(word.toLowerCase());
}
