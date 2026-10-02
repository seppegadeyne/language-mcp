/**
 * Dutch passive voice detection: hunspell -m morphology batch + auxiliary
 * window, offline and deterministic, using the same binary and bundled
 * OpenTaal assets as src/hunspell.ts (ADR 001 pattern).
 *
 * Verified protocol (hunspell 1.7.4, assets/nl):
 * - `hunspell -d <dict> -m` reads one word per line on stdin and prints for
 *   each input word a BLOCK of one or more "word  st:<stem> ts:<tag>" lines,
 *   terminated by an empty line (same ispell block protocol as -a).
 * - Known words: one or more analyses (e.g. "gebruikt  st:gebruik ts:VB3").
 * - Unknown words: bare echo without morphology ("pizze").
 * - ts:VBpe marks past-participle word forms in nl.aff. Hunspell tags are
 *   context-free, so wordform ambiguity stays; hits are review flags, not
 *   verdicts.
 *
 * Detection heuristic per sentence:
 *   wordt/worden/word/werd/werden + VBpe word within 5 tokens = word-passive
 *   (high confidence); is/zijn/ben/bent/was/waren + VBpe within 3 tokens =
 *   zijn-passive (low confidence: ambiguity with perfect tense); a following
 *   "door"/"van" agent reinforces the hit.
 */

import { spawn } from 'node:child_process';
import { resolveDict } from './hunspell.js';
import { countSyllables } from './syllables.js';
import type { Sentence } from './prose.js';

export interface PassiveHit {
  index: number; // sentence start offset in original text
  sentenceText: string;
  aux: string;
  participle: string;
  withDoor: boolean;
  kind: 'word-passive' | 'zijn-passive';
  confidence: 'high' | 'low';
}

const WORD_AUX = new Set(['wordt', 'worden', 'word', 'werd', 'werden']);
const ZIJN_AUX = new Set(['is', 'zijn', 'ben', 'bent', 'was', 'waren']);
const WORD_WINDOW = 5;
const ZIJN_WINDOW = 3;

/**
 * Morphological analysis for unique words via one `hunspell -m` batch.
 * Returns a map word -> info: ts: tags, fl: affix flags, all st: stems, and
 * whether hunspell echoed the word as its own stem (bare lemma, e.g.
 * "gemaakt  st:gemaakt").
 *
 * Words that hunspell splits on BREAK characters (en_US splits
 * "data-driven" into one block per part) would break the block count, so
 * callers must pass hyphen-free words; such words are skipped here.
 */
export interface MorphInfo {
  tags: Set<string>;
  flags: Set<string>; // fl: affix flags (en_US: D = regular -ed form)
  ownSt: boolean;
  stems: string[]; // all st: stems in the analysis block
}

export async function hunspellMorph(words: string[], lang: 'nl' | 'en_US' = 'nl'): Promise<Map<string, MorphInfo>> {
  const result = new Map<string, MorphInfo>();
  const unique = [...new Set(words.filter((w) => w.length > 0 && !/[-\s]/.test(w)))];
  if (unique.length === 0) return result;
  const input = unique.join('\n') + '\n';

  return await new Promise<Map<string, MorphInfo>>((resolve, reject) => {
    const proc = spawn('hunspell', ['-d', resolveDict(lang), '-m'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('hunspell -m timed out after 20s'));
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
        reject(new Error(`hunspell -m exited with ${code}`));
        return;
      }
      const rawLines = out
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l) => !l.startsWith('@(#)'));

      // Group per-word blocks on empty separator lines (same as -a mode).
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

      if (blocks.length !== unique.length) {
        reject(
          new Error(`hunspell -m response count mismatch: ${blocks.length} blocks for ${unique.length} words`)
        );
        return;
      }
      for (let i = 0; i < unique.length; i++) {
        const word = unique[i];
        const tags = new Set<string>();
        const flags = new Set<string>();
        const stems: string[] = [];
        let ownSt = false;
        for (const line of blocks[i]) {
          const found = line.match(/ts:(\w+)/g);
          if (found) {
            for (const tag of found) tags.add(tag.slice(3));
          }
          const fl = line.match(/fl:(\w+)/g);
          if (fl) {
            for (const f of fl) flags.add(f.slice(3));
          }
          const stemMatches = line.match(/st:([^\s]+)/g);
          if (stemMatches) {
            for (const s of stemMatches) stems.push(s.slice(3));
          }
          // Bare lemma echo: "gemaakt  st:gemaakt" (no ts: tag).
          if (new RegExp(`^${escapeRe(word)}\\s+st:${escapeRe(word)}\\s*$`).test(line)) {
            ownSt = true;
          }
        }
        result.set(word, { tags, flags, ownSt, stems });
      }
      resolve(result);
    });
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Separable-prefix compound participles: hunspell -m analyzes "uitgevoerd"
// as "uit st:gevoerd fl:Ps" — the stem is a suffix of the word.
function hasCompoundParticipleStem(word: string, stem: string): boolean {
  if (stem.length < 4) return false;
  if (!word.endsWith(stem) || word === stem) return false;
  return passesParticiplePhonology(stem);
}

function passesParticiplePhonology(w: string): boolean {
  if (NOT_PARTICIPLE.has(w)) return false;
  if (countSyllables(w) < 2) return false;
  if (/[dt]$/.test(w)) return PARTICIPLE_PREFIX_DT_RE.test(w);
  if (/en$/.test(w)) return PARTICIPLE_PREFIX_EN_RE.test(w);
  return false;
}

// Participial prefixes for words ending in d/t (broad list).
const PARTICIPLE_PREFIX_DT_RE = /^(ge|ver|be|ont|her|er|uit|aan|op|onder|over)|^.{1,3}ge/;
// Strict prefixes for words ending in -en (strong verbs: verzonden, geboden).
// A broad list here would catch nouns like "morgen".
const PARTICIPLE_PREFIX_EN_RE = /^(ge|ver|be|ont|her|er)/;

// Own-lemma words that follow auxiliaries but are never participles.
const NOT_PARTICIPLE = new Set([
  'geen', 'groot', 'goed', 'geld', 'tijd', 'moment', 'stand',
  'start', 'eind', 'resultaat',
]);

/**
 * Past-participle candidate check. Three paths, all review flags:
 * 1. ts:VBpe tag (affix-derived participial/adjectival form).
 * 2. Bare own-lemma echo + Dutch participle phonology: ends in -d/-t with a
 *    participial prefix, or ends in -en with a strict ge/ver/be/ont/her/er
 *    prefix (strong verbs), at least two syllables, not a stopword.
 * 3. Compound analysis (uitgevoerd -> st:gevoerd): stem is a suffix of the
 *    word and itself passes participle phonology.
 *    (hunspell tags are context-free; copula adjectives like "hij wordt
 *    verliefd" can still slip through — hence review flags, not verdicts.)
 */
export function isPastParticiple(word: string, info: MorphInfo | undefined): boolean {
  if (!info) return false;
  if (info.tags.has('VBpe')) return true;
  const w = word.toLowerCase();
  if (info.ownSt) {
    if (passesParticiplePhonology(w)) return true;
  }
  for (const stem of info.stems) {
    if (hasCompoundParticipleStem(w, stem)) return true;
  }
  return false;
}

/** Detect passive constructions sentence by sentence. */
export async function detectPassives(sentences: Sentence[]): Promise<PassiveHit[]> {
  const allWords: string[] = [];
  for (const s of sentences) {
    for (const w of s.words) allWords.push(w.clean);
  }
  const morph = await hunspellMorph(allWords);
  const hits: PassiveHit[] = [];

  for (const s of sentences) {
    const words = s.words;
    for (let i = 0; i < words.length; i++) {
      const w = words[i].clean;
      const isWordAux = WORD_AUX.has(w);
      const isZijnAux = ZIJN_AUX.has(w);
      if (!isWordAux && !isZijnAux) continue;

      // wordt/worden passives can have long intervening material ("wordt
      // thans door de gemeente in behandeling genomen"), so scan the rest
      // of the sentence; copula adjectives do not pass participle phonology.
      // zijn-passives keep a small window (is + adjective is common).
      const win = isWordAux ? words.length - 1 : ZIJN_WINDOW;
      let participle: string | null = null;
      let pIndex = -1;
      for (let j = i + 1; j <= Math.min(i + win, words.length - 1); j++) {
        const next = words[j].clean;
        if (WORD_AUX.has(next) || ZIJN_AUX.has(next)) continue; // chained aux
        if (isPastParticiple(next, morph.get(next))) {
          participle = words[j].raw;
          pIndex = j;
          break;
        }
      }
      if (participle === null) continue;

      const rest = words.slice(i + 1, Math.min(i + win + 4, words.length));
      const withDoor = rest.some((w2) => w2.clean === 'door' || w2.clean === 'van');
      hits.push({
        index: s.start,
        sentenceText: s.text,
        aux: words[i].raw,
        participle,
        withDoor,
        kind: isWordAux ? 'word-passive' : 'zijn-passive',
        confidence: isWordAux ? 'high' : 'low',
      });
      i = pIndex; // skip past the participle to avoid double flags
    }
  }
  return hits;
}
