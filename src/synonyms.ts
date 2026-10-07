/**
 * Dutch synonym suggestions for rare words, from Open Dutch WordNet.
 *
 * Data: assets/synonyms/nl-synonyms.tsv (31,199 lemmas, CC BY-SA 4.0,
 * derived from Open Dutch WordNet 1.4 — cite Postma et al. 2016; see that
 * directory's README). Combined with the Zipf frequency table: a synonym is
 * only suggested when it is meaningfully more frequent than the flagged
 * word, so we never propose one rare word in place of another.
 *
 * Parsed once per process (lazy singleton). Suggestions are review hints,
 * never automatic replacements: ODWN synonyms are sense-based and the tool
 * does not resolve which sense a text intends.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDutchZipf } from './frequency.js';

let table: Map<string, string[]> | null = null;

function loadTable(): Map<string, string[]> {
  if (table) return table;
  const candidates = [
    join(__dirname, '..', 'assets', 'synonyms', 'nl-synonyms.tsv'),
    join(process.cwd(), 'assets', 'synonyms', 'nl-synonyms.tsv'),
  ];
  let file: string | null = null;
  for (const c of candidates) {
    try {
      readFileSync(c);
      file = c;
      break;
    } catch {
      // try next
    }
  }
  const map = new Map<string, string[]>();
  if (file) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const tab = line.indexOf('\t');
      if (tab <= 0) continue;
      map.set(line.slice(0, tab), line.slice(tab + 1).split(','));
    }
  }
  table = map;
  return map;
}

export interface SynonymSuggestion {
  word: string;
  zipf: number;
  suggestions: string[]; // max 3, each strictly more frequent than `word`
}

/** Get frequent-enough synonyms for a word, or null when none qualify. */
export function suggestSynonyms(word: string, max = 3, minZipfGain = 0.5): SynonymSuggestion | null {
  const key = word.toLowerCase();
  const raw = loadTable().get(key);
  if (!raw || raw.length === 0) return null;
  const wordZipf = getDutchZipf(key);
  if (wordZipf === null) return null; // unknown frequency: no safe comparison
  const out: string[] = [];
  for (const syn of raw) {
    if (out.length >= max) break;
    if (syn === key || syn.includes(' ') || syn.includes('-')) continue;
    const synZipf = getDutchZipf(syn);
    if (synZipf === null) continue; // not a known common form
    if (synZipf - wordZipf < minZipfGain) continue; // not clearly simpler
    out.push(syn);
  }
  if (out.length === 0) return null;
  return { word: key, zipf: wordZipf, suggestions: out };
}
