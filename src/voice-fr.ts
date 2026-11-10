/**
 * French address-form (tu / vous) detection for web and service copy.
 *
 * The B1 tool reports which form a text uses so an editor can keep one form
 * (default "vous", the formal form). Only pronouns and possessives are
 * detected; a verb in the tu imperative without a pronoun ("Contacte-nous")
 * is invisible to a rule layer that does not parse grammar.
 *
 * Precision rules:
 * - tu forms: tu, toi, te, t' (elision: t'as, va-t'en), ton, ta, tes, and
 *   tien/tienne/tiennes/tiens only after an article (le tien, les tiens);
 *   "te" and "ta" are accepted only as standalone words (also after a hyphen:
 *   peux-tu, dis-toi), never inside another word, and not when written in
 *   capitals (TE, TA are common acronyms).
 * - vous forms: vous, votre, vos, vôtre(s) (vous-même is covered by "vous").
 * - "ton" after a determiner (un ton, le ton, notre ton) is the noun "tone",
 *   not the possessive, and is skipped.
 * - Text inside « guillemets » is quotation (testimonials, citations) and is
 *   reported separately, not counted as the text's own address form.
 * - Code, URLs, and emails are ignored (same strips as the other B1 layers).
 *
 * Known false-positive risks: "tu" is also the past participle of "se taire"
 * (il s'est tu); "ta", "te", "ton", "tes" occur in non-French fragments
 * (Latin "Te Deum", Italian, product codes); "tiens" is also the imperative
 * of "tenir" when it follows an article-like word. Review every hit.
 */

import { stripNonProse } from './prose.js';

export type VoiceFr = 'vous' | 'tu';

export interface VoiceHitFr {
  index: number;
  word: string;
  form: VoiceFr;
}

export interface VoiceReportFr {
  expected: VoiceFr;
  tuCount: number;
  tuFirstIndex: number | null;
  tuTop: Array<{ word: string; count: number }>;
  vousCount: number;
  vousFirstIndex: number | null;
  vousTop: Array<{ word: string; count: number }>;
  /** tu/vous forms inside « » quotations, excluded from the counts above. */
  quotedIgnored: number;
  hits: VoiceHitFr[];
}

const LETTER = String.raw`\p{L}\p{M}\d_`;
const TU_RE = new RegExp(String.raw`(?<![${LETTER}])(?:(?:tu|toi|te|ton|ta|tes|tiens?|tienn(?:e|es))(?![${LETTER}])|t['’](?=\p{L}))`, 'giu');
const VOUS_RE = new RegExp(String.raw`(?<![${LETTER}])(?:vous|votre|vos|vôtres?)(?![${LETTER}])`, 'giu');

const ARTICLES_FOR_TIEN = new Set(['le', 'la', 'les', 'du', 'des', 'au', 'aux', 'un', 'une', 'ce', 'cette', 'ces']);
const DETERMINERS_BEFORE_NOUN_TON = new Set(['un', 'le', 'ce', 'du', 'au', 'quel', 'notre', 'votre', 'mon', 'son', 'leur', 'aucun', 'chaque', 'ce', 'ton']);

function previousWord(text: string, index: number): string {
  const m = /([\p{L}]+)[\s\u00a0\u202f'’-]*$/u.exec(text.slice(Math.max(0, index - 40), index));
  return m ? m[1].toLowerCase() : '';
}

function findForms(text: string, re: RegExp, form: VoiceFr): VoiceHitFr[] {
  const hits: VoiceHitFr[] = [];
  for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
    const raw = m[0];
    const lower = raw.toLowerCase().replace('’', "'");
    const index = m.index ?? 0;
    if (form === 'tu') {
      if ((lower === 'te' || lower === 'ta') && raw === raw.toUpperCase()) continue;
      const prev = previousWord(text, index);
      if (/^tien/.test(lower) && !ARTICLES_FOR_TIEN.has(prev)) continue;
      if (lower === 'ton' && DETERMINERS_BEFORE_NOUN_TON.has(prev) && prev !== 'ton') continue;
    }
    hits.push({ index, word: lower, form });
  }
  return hits;
}

function top(hits: VoiceHitFr[]): Array<{ word: string; count: number }> {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.word, (counts.get(h.word) ?? 0) + 1);
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 5);
}

export function analyzeVoiceFr(text: string, expected: VoiceFr = 'vous'): VoiceReportFr {
  const prose = stripNonProse(text);
  // Length-preserving mask of « quoted » spans, so offsets stay valid.
  const unquoted = prose.replace(/«[^»]*»/g, (m) => ' '.repeat(m.length));
  const all = [
    ...findForms(prose, TU_RE, 'tu'),
    ...findForms(prose, VOUS_RE, 'vous'),
  ];
  const own = [
    ...findForms(unquoted, TU_RE, 'tu'),
    ...findForms(unquoted, VOUS_RE, 'vous'),
  ].sort((a, b) => a.index - b.index);
  const tu = own.filter((h) => h.form === 'tu');
  const vous = own.filter((h) => h.form === 'vous');
  return {
    expected,
    tuCount: tu.length,
    tuFirstIndex: tu[0]?.index ?? null,
    tuTop: top(tu),
    vousCount: vous.length,
    vousFirstIndex: vous[0]?.index ?? null,
    vousTop: top(vous),
    quotedIgnored: all.length - own.length,
    hits: own,
  };
}
