/**
 * Dutch Zipf word-frequency lookups for the B1 layer.
 *
 * Data: assets/frequency/nl-zipf.tsv — top 50k Dutch word forms with Zipf
 * frequencies derived from hermitdave/FrequencyWords nl_50k.txt
 * (OpenSubtitles2018; content CC BY-SA 4.0). See that directory's README for
 * provenance, license, and the spoken-language bias caveat.
 *
 * The table is parsed once per process (lazy singleton). Lookup candidates
 * mirror src/hunspell.ts: the install-relative path first, then the current
 * working directory (so a checkout can be run via dist/ from anywhere).
 *
 * A missing file degrades gracefully: the table stays empty, lookups return
 * null, and `frequencyTableAvailable()` lets the server report that the
 * rare-word layer was skipped instead of failing the whole B1 check
 * (regression: a missing nl-zipf.tsv used to fail check_dutch_b1_text with
 * ENOENT — see straffesites-moonshot #183).
 *
 * Unknown words return null and are never treated as rare: Dutch compounds
 * and proper names dominate the unknown set, so flagging them would destroy
 * precision.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let table: Map<string, number> | null = null;
let tableAvailable = false;

function loadTable(): Map<string, number> {
  if (table) return table;
  const candidates = [
    join(__dirname, '..', 'assets', 'frequency', 'nl-zipf.tsv'),
    join(process.cwd(), 'assets', 'frequency', 'nl-zipf.tsv'),
  ];
  const map = new Map<string, number>();
  for (const file of candidates) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const tab = line.indexOf('\t');
        if (tab <= 0) continue;
        const zipf = Number.parseFloat(line.slice(tab + 1));
        if (Number.isFinite(zipf)) map.set(line.slice(0, tab), zipf);
      }
      tableAvailable = true;
      break;
    } catch {
      // try the next candidate; a missing table degrades the rare-word
      // layer but must never fail the whole B1 check
    }
  }
  table = map;
  return map;
}

/** True when a frequency table was found and parsed. */
export function frequencyTableAvailable(): boolean {
  loadTable();
  return tableAvailable;
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
