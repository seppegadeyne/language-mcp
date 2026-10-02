/**
 * Prose structure extraction: paragraphs, sentences, and word tokens with
 * offsets into the ORIGINAL text.
 *
 * Design rules (mirroring the iPengAI protected-node pattern):
 * - code blocks, inline code, URLs, and emails are stripped before analysis
 *   (same protections as src/tokenize.ts, but offset-preserving where
 *   possible: strippables are replaced by spaces of equal length so that
 *   sentence and word offsets stay valid against the source text);
 * - abbreviation protection replaces dots inside known Dutch or English
 *   abbreviations with a placeholder byte before splitting, then restores them;
 * - every sentence/word reports start/end offsets in the original input so
 *   findings can be traced back exactly (never guess positions).
 */

import { BARE_DOMAIN_RE } from './tokenize.js';

export interface Sentence {
  text: string;
  start: number; // offset in original text
  end: number;
  words: WordToken[];
}

export interface WordToken {
  raw: string;
  clean: string; // lowercase, punctuation stripped
  start: number;
  end: number;
}

export interface Paragraph {
  start: number;
  end: number;
  text: string;
}

export type ProseLang = 'nl' | 'en';

const WORD_RE = /[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*/g;

// Abbreviations whose dot must not end a sentence (lowercase, no final dot).
const ABBREVIATIONS: Record<ProseLang, string[]> = {
  nl: [
    'bv', 'dr', 'mr', 'mw', 'prof', 'ir', 'ing', 'arts', 'jr', 'sr', 'st',
    'etc', 'z', 'nr', 'pag', 'afb', 'tel', 'evt', 'nl', 'bel', 'bijv', 'ca',
    'i.v.m', 'a.s', 'o.a', 'o.i.d', 'm.a.w', 'v.z.w', 'e.a', 'm.b.v', 'd.m.v',
    't.h.n', 'incl', 'excl', 'max', 'min', 'tgt', 'med', 'uk',
  ],
  en: [
    'mr', 'mrs', 'ms', 'dr', 'prof', 'jr', 'sr', 'st', 'mt', 'vs', 'etc',
    'e.g', 'i.e', 'a.m', 'p.m', 'u.s', 'u.s.a', 'u.k', 'inc', 'ltd', 'corp',
    'approx', 'dept', 'fig', 'jan', 'feb', 'apr', 'jul', 'aug', 'sep', 'sept',
    'oct', 'nov', 'dec', 'max', 'min', 'incl', 'excl', 'ca', 'ft', 'lb', 'oz',
    // Not listed on purpose: "no", "co", "est", "mar", "jun": those are also
    // ordinary words that can end a sentence ("The answer is no.").
  ],
};

const DOT = '\x00'; // placeholder, same length as '.', offsets preserved

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace code/URL/email spans with spaces of equal length. */
export function stripNonProse(text: string): string {
  let t = text;
  const blanks = (m: string) => ' '.repeat(m.length);
  t = t.replace(/```[\s\S]*?```/g, blanks);
  t = t.replace(/`[^`\n]*`/g, blanks);
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, blanks);
  t = t.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi, blanks);
  // Bare domain names without a protocol (Verhuurwinkel.nl), optionally with
  // a path; length-preserving like the other strips. Same pattern as the
  // spelling tokenizer, so both layers agree on what is prose.
  t = t.replace(new RegExp(BARE_DOMAIN_RE.source, 'gi'), blanks);
  return t;
}

/** Protect dots that belong to abbreviations, so they do not split sentences. */
export function protectAbbreviations(text: string, lang: ProseLang = 'nl'): string {
  let t = text;
  for (const ab of ABBREVIATIONS[lang]) {
    // " etc." / "(o.a." — abbreviation followed by a dot, not at a real end.
    // Escape inner dots: unescaped, "i.v.m" would also match "ixvym".
    const re = new RegExp(`(^|[\\s(\u00a0[])(${escapeRe(ab)})\\.`, 'gi');
    t = t.replace(re, (_m, p1: string, p2: string) => `${p1}${p2.replace(/\./g, DOT)}${DOT}`);
  }
  // Single capital initials: "J. Jansen" — letter + dot + space + capital.
  t = t.replace(/(^|[\s(\u00a0[])([A-Z])\.(?=\s+[A-Z])/g, (_m, p1: string, p2: string) => `${p1}${p2}${DOT}`);
  // Ordinals and decimals: "3.5", "art. 5"? keep art.; decimals:
  t = t.replace(/(\d)\.(\d)/g, `$1${DOT}$2`);
  return t;
}

export function splitParagraphs(text: string): Paragraph[] {
  const paras: Paragraph[] = [];
  const re = /[^\n]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].trim().length > 0) {
      paras.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  return paras;
}

/**
 * Split into sentences on ., !, ?, … followed by a boundary. Runs on
 * abbreviation-protected text; returned offsets map back to the original
 * input because every transformation so far is length-preserving.
 */
export function splitSentences(protectedText: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  // Closing quotes/brackets may follow the terminator: straight, curly
  // (US style: “Stop.” Then...), and guillemets.
  const re = /[^.!?…\n]+(?:[.!?…]+["'»”’)\]]*(?=\s|$)|(?=\n)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(protectedText)) !== null) {
    const raw = m[0];
    if (raw.trim().length === 0) {
      if (re.lastIndex === m.index) re.lastIndex++;
      continue;
    }
    out.push({ text: raw.trim(), start: m.index, end: m.index + raw.length });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return out;
}

/** Word tokens with offsets inside a sentence (or any text snippet). */
export function wordTokens(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    let clean = m[0].replace(/['’-]+$/, '');
    clean = clean.replace(/^['’]+/, '');
    if (clean.length < 2) continue;
    tokens.push({ raw: m[0], clean: clean.toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/**
 * Join soft line wraps: a newline inside a sentence (hard-wrapped Markdown,
 * copy from a PDF) is not a sentence or paragraph boundary. A newline counts
 * as soft when the line before it does not end in sentence punctuation or a
 * colon and the next line continues in lowercase. Headings, list items, and
 * blank-line paragraph breaks keep their newline. Length-preserving
 * (newline becomes a space), so offsets stay valid.
 */
export function joinSoftWraps(text: string): string {
  return text.replace(/([^\s.!?…:;])([ \t]*)\n(?=[ \t]*[a-z\u00DF-\u00FF])/g, (_m, p1: string, sp: string) => `${p1}${sp} `);
}

/** Full pipeline: paragraphs + sentences (with words) on stripped text. */
export function analyzeProse(
  text: string,
  lang: ProseLang = 'nl'
): { sentences: Sentence[]; paragraphs: Paragraph[] } {
  const stripped = joinSoftWraps(stripNonProse(text));
  const protectedText = protectAbbreviations(stripped, lang);
  const sentences: Sentence[] = splitSentences(protectedText).map((s) => {
    const sentText = s.text.replace(new RegExp(DOT, 'g'), '.');
    // Offsets: DOT has the same length as '.', so s.start/s.end are valid
    // for both protected and original text; slice from the stripped text to
    // keep the visible wording (restore dots for reporting).
    return {
      text: sentText,
      start: s.start,
      end: s.end,
      words: wordTokens(stripped.slice(s.start, s.end).replace(new RegExp(DOT, 'g'), '.')),
    };
  });
  return { sentences, paragraphs: splitParagraphs(stripped) };
}
