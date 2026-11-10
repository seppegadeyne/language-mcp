// Evaluation harness: measure src/syllables-fr.ts against the syllable counts
// (nbsyll) of Lexique 3.83. See docs/french.md. Not part of the npm test suite.
//
// Lexique is not bundled (CC BY-SA 4.0, evaluation only). Download it once:
//   curl -L -o Lexique383.tsv http://www.lexique.org/databases/Lexique383/Lexique383.tsv
// Usage: npx tsx tests/eval/syllables-fr-lexique.ts <Lexique383.tsv> [topN=10000] [misses=40]
//
// Per spelling, the reference is the syllable count of its most frequent
// entry; the weight is the summed frequency of all entries (mean of the film
// and book frequencies). Reported: exact agreement over word types, exact
// agreement weighted by frequency, and the syllable bias (predicted / actual
// syllables, weighted), which is what moves a readability score.
import { readFileSync } from 'node:fs';
import { countSyllablesFr } from '../../src/syllables-fr.js';

const [file, topArg = '10000', missArg = '40'] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npx tsx tests/eval/syllables-fr-lexique.ts <Lexique383.tsv> [topN] [misses]');
  process.exit(2);
}

const lines = readFileSync(file, 'utf8').split(/\r?\n/);
const head = lines[0].split('\t');
const col = (name: string) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`column ${name} not found: is this Lexique383.tsv?`);
  return i;
};
const iOrtho = col('ortho'), iFilms = col('freqfilms2'), iBooks = col('freqlivres'), iSyll = col('nbsyll');

const bySpelling = new Map<string, { best: number; syllables: number; weight: number }>();
for (const line of lines.slice(1)) {
  const c = line.split('\t');
  const ortho = c[iOrtho];
  if (!ortho || !/^[a-zàâäçéèêëîïôöùûüÿœæ'-]+$/.test(ortho)) continue;
  const freq = (parseFloat(c[iFilms]) + parseFloat(c[iBooks])) / 2;
  const syllables = parseInt(c[iSyll], 10);
  if (!syllables || Number.isNaN(freq)) continue;
  const e = bySpelling.get(ortho);
  if (!e) bySpelling.set(ortho, { best: freq, syllables, weight: freq });
  else {
    e.weight += freq;
    if (freq > e.best) { e.best = freq; e.syllables = syllables; }
  }
}

const top = [...bySpelling.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, Number(topArg));
let exact = 0, weight = 0, weightExact = 0, predicted = 0, actual = 0;
const misses: string[] = [];
for (const [ortho, e] of top) {
  const got = countSyllablesFr(ortho);
  if (got === e.syllables) { exact++; weightExact += e.weight; }
  else misses.push(`${ortho}: got ${got}, Lexique ${e.syllables}`);
  weight += e.weight;
  predicted += got * e.weight;
  actual += e.syllables * e.weight;
}
const pct = (n: number, digits = 1) => `${(100 * n).toFixed(digits)}%`;
console.log(`${top.length} most frequent spellings: exact ${pct(exact / top.length)} of types, `
  + `${pct(weightExact / weight, 2)} weighted by frequency, syllable bias ${pct(predicted / actual - 1, 2)}`);
if (Number(missArg) > 0) console.log(`Most frequent misses:\n- ${misses.slice(0, Number(missArg)).join('\n- ')}`);
