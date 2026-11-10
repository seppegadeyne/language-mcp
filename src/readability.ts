/**
 * Readability statistics (B1 proxies, not a validated B1 verdict) for Dutch
 * and US English text, plus the raw diagnostic counts used by
 * check_dutch_b1_text and check_us_english_b1_text.
 *
 * Sources for constants:
 * - Flesch-Douma (Dutch): 206.835 - 0.93 * ASL - 77 * ASW  (Douma's NL
 *   adaptation; coefficients cross-checked against textacy's
 *   flesch_reading_ease for lang="nl": base 206.835, asl 0.93, awl 77.0).
 *   Not empirically validated for Dutch; report as an indication.
 * - Flesch Reading Ease (English, Flesch 1948):
 *   206.835 - 1.015 * ASL - 84.6 * ASW.
 * - Flesch-Kincaid Grade Level (Kincaid et al. 1975):
 *   0.39 * ASL + 11.8 * ASW - 15.59.
 * - ARI (Smith & Senter 1967): 4.71 * chars/word + 0.5 * words/sentence - 21.43.
 *   Language-neutral mechanism, English-validated grade levels.
 * - LIX (Björnsson 1968): words/sentences + 100 * (words > 6 letters) / words.
 *   Swedish scale: <25 children's books, 25-30 simple, 30-40 normal,
 *   40-50 business, 50-60 specialist, >60 very difficult. Mechanism is
 *   language-neutral but the scale is NOT validated for Dutch — Dutch
 *   compounds inflate the long-word count, so report as an indication only.
 * - Brouwer Leesindex A (Brouwer 1963/1974, Dutch Flesch re-calibration):
 *   195 - (2/3) * syllables-per-100-words - 2 * avg-sentence-length.
 *   Equivalent per-word form: 195 - 66.667 * ASW - 2 * ASL. Sentence length
 *   weighs ~2x heavier than in Flesch-Douma (0.93), so it flags long
 *   sentences more aggressively. Not empirically re-validated recently.
 * - Kandel & Moles (1958), French adaptation of Flesch Reading Ease:
 *   207 - 1.015 * ASL - 73.6 * ASW. Syllables are counted by
 *   src/syllables-fr.ts (mute final e not counted).
 * ASL = average sentence length in words; ASW = average syllables per word.
 */

import { countSyllables } from './syllables.js';
import { countSyllablesEn } from './syllables-en.js';
import { countSyllablesFr } from './syllables-fr.js';
import type { Sentence, ProseLang } from './prose.js';

export interface ReadabilityStats {
  lang: ProseLang;
  fleschDouma: number | null; // Dutch only
  fleschReadingEase: number | null; // English only
  fleschKincaidGrade: number | null; // English only
  kandelMoles: number | null; // French only
  lix: number | null; // Läsbarhetsindex (Dutch tool only)
  brouwer: number | null; // Brouwer Leesindex A (Dutch only)
  ari: number | null;
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  avgSentenceLength: number;
  longSentences: number; // > warn threshold (words)
  veryLongSentences: number; // > error threshold (words)
  longWordSyllables: number; // syllable count from which a word is "long"
  longWordShare: number; // share of long words, 0..1
  paraCount: number;
  longParas: number; // > threshold words
}

export interface ReadabilityThresholds {
  maxSentenceWords?: number; // flag above this many words
  warnSentenceWords?: number; // warn above this many words
  maxParaWords?: number; // default 150 (editorial checklist 01-PARAGRAPH)
  minWords?: number; // minimum sample for formulas, default 50
}

/**
 * Per-language defaults. Dutch: IPLO Schrijfwijzer (15-20 words). English:
 * GOV.UK caps sentences at 25 words; plainlanguage.gov advises an average
 * of 20 words or fewer. English words are shorter on average than Dutch
 * ones (fewer compounds), so the same idea takes more words.
 */
export const READABILITY_DEFAULTS: Record<ProseLang, Required<ReadabilityThresholds>> = {
  nl: { maxSentenceWords: 20, warnSentenceWords: 15, maxParaWords: 150, minWords: 50 },
  en: { maxSentenceWords: 25, warnSentenceWords: 20, maxParaWords: 150, minWords: 50 },
  // French: same plain-language limits as English (no French-specific consensus).
  fr: { maxSentenceWords: 25, warnSentenceWords: 20, maxParaWords: 150, minWords: 50 },
};

// Long-word threshold: Dutch compounds make >=4 syllables the useful cut;
// English uses >=3 syllables ("complex words", as in the Gunning fog index).
export const LONG_WORD_SYLLABLES: Record<ProseLang, number> = { nl: 4, en: 3, fr: 4 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeReadability(
  sentences: Sentence[],
  paraWordCounts: number[],
  opts: ReadabilityThresholds = {},
  lang: ProseLang = 'nl'
): ReadabilityStats {
  // Drop explicitly-undefined options: spreading { key: undefined } over the
  // defaults would clobber them (callers pass through optional tool params).
  const defined = Object.fromEntries(
    Object.entries(opts).filter(([, v]) => v !== undefined)
  ) as ReadabilityThresholds;
  const t = { ...READABILITY_DEFAULTS[lang], ...defined };
  const syl = lang === 'en' ? countSyllablesEn : lang === 'fr' ? countSyllablesFr : countSyllables;
  const longAt = LONG_WORD_SYLLABLES[lang];

  const wordCount = sentences.reduce((n, s) => n + s.words.length, 0);
  const sentenceCount = sentences.length;
  let syllables = 0;
  let charCount = 0;
  let longWords = 0;
  let longLetterWords = 0;
  for (const s of sentences) {
    for (const w of s.words) {
      const n = syl(w.clean);
      syllables += n;
      charCount += w.clean.length;
      if (n >= longAt) longWords++;
      if (w.clean.length > 6) longLetterWords++;
    }
  }
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  const longSentences = sentences.filter((s) => s.words.length > t.warnSentenceWords && s.words.length <= t.maxSentenceWords).length;
  const veryLongSentences = sentences.filter((s) => s.words.length > t.maxSentenceWords).length;

  let fleschDouma: number | null = null;
  let fleschReadingEase: number | null = null;
  let fleschKincaidGrade: number | null = null;
  let kandelMoles: number | null = null;
  let ari: number | null = null;
  let lix: number | null = null;
  let brouwer: number | null = null;
  if (wordCount >= t.minWords && sentenceCount >= 3) {
    const asl = wordCount / sentenceCount;
    const asw = syllables / wordCount;
    if (lang === 'nl') {
      fleschDouma = round1(206.835 - 0.93 * asl - 77 * asw);
    } else if (lang === 'fr') {
      kandelMoles = round1(207 - 1.015 * asl - 73.6 * asw);
    } else {
      fleschReadingEase = round1(206.835 - 1.015 * asl - 84.6 * asw);
      fleschKincaidGrade = round1(0.39 * asl + 11.8 * asw - 15.59);
    }
    ari = round1(4.71 * (charCount / wordCount) + 0.5 * asl - 21.43);
    if (lang === 'nl') {
      // LIX: long words counted as > 6 letters (letters, not syllables).
      lix = round1(asl + (100 * longLetterWords) / wordCount);
      // Brouwer Leesindex A: 195 - (2/3) * (syllables per 100 words) - 2 * ASL.
      brouwer = round1(195 - (2 / 3) * (100 * asw) - 2 * asl);
    }
  }

  return {
    lang,
    fleschDouma,
    fleschReadingEase,
    fleschKincaidGrade,
    kandelMoles,
    lix,
    brouwer,
    ari,
    wordCount,
    sentenceCount,
    syllableCount: syllables,
    avgSentenceLength: round1(avgSentenceLength),
    longSentences,
    veryLongSentences,
    longWordSyllables: longAt,
    longWordShare: wordCount > 0 ? Math.round((longWords / wordCount) * 1000) / 1000 : 0,
    paraCount: paraWordCounts.length,
    longParas: paraWordCounts.filter((c) => c > t.maxParaWords).length,
  };
}

export type B1Band = 'B1' | 'easier than B1' | 'harder than B1' | 'much harder than B1';

/**
 * Band of a 0-100 reading-ease score (higher = easier). The label names the
 * text, not the score: a score above 70 reads easier than B1. `min` is the
 * tool parameter for the lower edge; `hardMargin` points below it the text
 * counts as much harder.
 */
function readingEaseBand(score: number, min: number, hardMargin: number): B1Band {
  if (score < min) return score >= min - hardMargin ? 'harder than B1' : 'much harder than B1';
  // With a minimum above 70 there is no upper edge: meeting the target is B1.
  return score > 70 && min < 70 ? 'easier than B1' : 'B1';
}

/** Target range for the report line: "60-70", or "75 or higher" when min is above the band. */
export function bandTarget(min: number): string {
  return min < 70 ? `${min}-70` : `${min} or higher`;
}

/** Practical B1 band for Flesch-Douma: ~60-70; below 45 (min - 15) is much harder. */
export function fleschDoumaBand(score: number, min = 60): B1Band {
  return readingEaseBand(score, min, 15);
}

/**
 * Bands for English Flesch Reading Ease (also used for Kandel & Moles, whose
 * scale is the same 0-100 range with the same interpretation table), following Flesch's own table:
 * 60-70 "standard / plain English" (about US grade 8-9) is the practical
 * B1 zone; 70+ is easier; 50-60 "fairly difficult"; below 50 "difficult".
 * The minimum is a tool parameter (default 60).
 */
export function fleschReadingEaseBand(score: number, min = 60): B1Band {
  return readingEaseBand(score, min, 10);
}
