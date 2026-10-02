/**
 * English passive voice detection: hunspell -m morphology batch (en_US) +
 * irregular participle list + auxiliary window. Offline and deterministic,
 * same binary and bundled assets as src/hunspell.ts (ADR 001 pattern).
 *
 * Verified protocol (hunspell 1.7.4, assets/en_US):
 * - Regular -ed forms carry the affix flag D: "created  st:create fl:D",
 *   "reviewed  fl:A st:view fl:D". The en_US affix file has no ts: tags.
 * - Irregular participles and lexicalized -ed words are bare lemmas without
 *   flags: "written  st:written", "built  st:built", "stopped  st:stopped".
 *   Irregular forms therefore come from a closed list below.
 * - Some non-verbs also get fl:D through a false affix split ("red  st:re
 *   fl:D", "bed  st:b fl:D"); a stop list and a minimum length filter them.
 * - Hyphenated words split into one block per part, so callers pass only
 *   hyphen-free words (hunspellMorph skips the rest).
 *
 * Detection heuristic per sentence:
 *   be-form (am/is/are/was/were/be/been/being) or get-form + participle,
 *   with only adverbs, negation, or further auxiliaries in between
 *   ("was not yet fully tested", "has been being built"). A "by" agent
 *   within the next few tokens is reported. Participles that usually act as
 *   adjectives after "be" (interested, located, based) are low confidence.
 *   Hits are review flags, not verdicts.
 */

import type { Sentence } from './prose.js';
import { hunspellMorph, type MorphInfo } from './passive.js';

export interface PassiveHitEn {
  index: number; // sentence start offset in original text
  sentenceText: string;
  aux: string;
  participle: string;
  withBy: boolean;
  kind: 'be-passive' | 'get-passive';
  confidence: 'high' | 'low';
}

const BE_AUX = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"]);
const GET_AUX = new Set(['get', 'gets', 'got', 'gotten', 'getting']);

// Tokens allowed between the auxiliary and the participle.
const BRIDGE = new Set([
  'not', 'never', 'also', 'already', 'always', 'often', 'still', 'just', 'yet',
  'all', 'both', 'each', 'usually', 'then', 'now', 'only', 'even', 'ever',
  'soon', 'currently', 'automatically', 'regularly', 'rarely', 'seldom',
  'sometimes', 'typically', 'generally', 'easily', 'quickly', 'fully',
  'being', 'been', 'be',
]);
const BRIDGE_MAX = 3;
const BY_WINDOW = 6;

// Irregular past participles (closed list; regular -ed forms come from
// hunspell fl:D or the -ed bare-lemma check).
const IRREGULAR_PARTICIPLES = new Set([
  'arisen', 'awoken', 'beaten', 'become', 'begun', 'bent', 'bet', 'bitten',
  'bled', 'blown', 'broken', 'bred', 'brought', 'broadcast', 'built', 'burnt',
  'bought', 'caught', 'chosen', 'come', 'cost', 'cut', 'dealt', 'done',
  'drawn', 'dreamt', 'driven', 'drunk', 'eaten', 'fallen', 'fed', 'felt',
  'fought', 'found', 'fled', 'flown', 'forbidden', 'forecast', 'forgotten',
  'forgiven', 'frozen', 'given', 'gone', 'ground', 'grown', 'hung', 'heard',
  'hidden', 'hit', 'held', 'hurt', 'kept', 'known', 'laid', 'led', 'learnt',
  'left', 'lent', 'let', 'lain', 'lit', 'lost', 'made', 'meant', 'met',
  'mistaken', 'misunderstood', 'overcome', 'overlooked', 'overridden',
  'overseen', 'overtaken', 'overthrown', 'paid', 'proven', 'put', 'quit',
  'read', 'rebuilt', 'redone', 'rewritten', 'ridden', 'rung', 'risen', 'run',
  'said', 'seen', 'sought', 'sold', 'sent', 'set', 'sewn', 'shaken', 'shed',
  'shone', 'shot', 'shown', 'shrunk', 'shut', 'sung', 'sunk', 'slain', 'slid',
  'slung', 'sown', 'spoken', 'sped', 'spent', 'spilt', 'spun', 'split',
  'spread', 'sprung', 'stolen', 'stuck', 'stung', 'struck', 'strung',
  'sworn', 'swept', 'swollen', 'swum', 'swung', 'taken', 'taught', 'torn',
  'told', 'thought', 'thrown', 'thrust', 'trodden', 'understood', 'undergone',
  'undertaken', 'undone', 'upheld', 'upset', 'withdrawn', 'withheld', 'woken',
  'worn', 'won', 'wound', 'written', 'wrung',
]);

// Words ending in -ed that are not participles (or are never passive).
const NOT_PARTICIPLE = new Set([
  'bed', 'red', 'fed', 'led', 'shed', 'wed', 'need', 'needed', 'seed', 'feed',
  'speed', 'deed', 'weed', 'reed', 'breed', 'greed', 'heed', 'bleed',
  'indeed', 'proceed', 'succeed', 'exceed', 'hundred', 'kindred', 'sacred',
  'naked', 'wicked', 'rugged', 'ragged', 'jagged', 'crooked', 'beloved',
  'learned', 'aged', 'blessed', 'dogged', 'hatred', 'shred', 'sled', 'bred',
  'embed', 'infrared', 'unmatched', 'unprecedented',
]);

// Participles that after "be" usually describe a state (adjectival
// passive): flag with low confidence.
const ADJECTIVAL = new Set([
  'interested', 'excited', 'tired', 'bored', 'worried', 'concerned',
  'pleased', 'satisfied', 'surprised', 'disappointed', 'married', 'located',
  'based', 'situated', 'involved', 'related', 'designed', 'qualified',
  'experienced', 'dedicated', 'committed', 'prepared', 'supposed', 'done',
  'gone', 'closed', 'finished', 'focused', 'limited', 'required', 'included',
  'scheduled', 'expected', 'allowed', 'known', 'aimed', 'automated',
  'connected', 'crowded', 'detailed', 'established', 'licensed', 'certified',
]);

/** Past-participle candidate check for English (review flag, not verdict). */
export function isPastParticipleEn(word: string, info: MorphInfo | undefined): boolean {
  const w = word.toLowerCase();
  if (NOT_PARTICIPLE.has(w)) return false;
  if (IRREGULAR_PARTICIPLES.has(w)) return true;
  if (!w.endsWith('ed') || w.length < 4) return false;
  if (!info) return false;
  // Regular -ed form via affix flag D (created, reviewed, reapplied).
  if (info.flags.has('D')) return true;
  // Lexicalized -ed lemma (stopped, planned, embedded) or prefixed form
  // (unused -> un st:used): accept when a stem itself ends in -ed.
  if (info.ownSt) return true;
  return info.stems.some((s) => s.endsWith('ed') && s.length >= 4 && !NOT_PARTICIPLE.has(s));
}

/** Detect passive constructions sentence by sentence. */
export async function detectPassivesEn(sentences: Sentence[]): Promise<PassiveHitEn[]> {
  const candidates: string[] = [];
  for (const s of sentences) {
    for (const w of s.words) if (w.clean.endsWith('ed')) candidates.push(w.clean);
  }
  const morph = await hunspellMorph(candidates, 'en_US');
  const hits: PassiveHitEn[] = [];

  for (const s of sentences) {
    const words = s.words;
    for (let i = 0; i < words.length; i++) {
      const w = normalizeApostrophe(words[i].clean);
      const isBe = BE_AUX.has(w) || isContractedBe(words[i].raw);
      const isGet = GET_AUX.has(w);
      if (!isBe && !isGet) continue;

      let participle: string | null = null;
      let pIndex = -1;
      let bridged = 0;
      for (let j = i + 1; j < words.length; j++) {
        const next = words[j].clean;
        // "is used to" / "got used to" means "accustomed to": not passive.
        const usedTo = next === 'used' && words[j + 1]?.clean === 'to';
        if (!usedTo && isPastParticipleEn(next, morph.get(next))) {
          participle = words[j].raw;
          pIndex = j;
          break;
        }
        const isBridge = BRIDGE.has(next) || BE_AUX.has(next) || (/ly$/.test(next) && next.length > 4);
        if (!isBridge || ++bridged > BRIDGE_MAX) break;
      }
      if (participle === null) continue;

      const after = words.slice(pIndex + 1, pIndex + 1 + BY_WINDOW);
      const withBy = after.some((x) => x.clean === 'by');
      const pLower = participle.toLowerCase();
      hits.push({
        index: s.start,
        sentenceText: s.text,
        aux: words[i].raw,
        participle,
        withBy,
        kind: isGet ? 'get-passive' : 'be-passive',
        confidence: ADJECTIVAL.has(pLower) && !withBy ? 'low' : 'high',
      });
      i = pIndex; // skip past the participle to avoid double flags
    }
  }
  return hits;
}

function normalizeApostrophe(w: string): string {
  return w.replace(/’/g, "'");
}

// "It's built", "they're made": only pronoun contractions, so possessives
// ("the company's tools") are not treated as auxiliaries.
function isContractedBe(raw: string): boolean {
  return /^(?:it|he|she|that|there|what|who|this|they|we|you)['’](?:s|re)$/i.test(raw);
}
