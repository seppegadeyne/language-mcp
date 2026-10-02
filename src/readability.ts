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
 * ASL = average sentence length in words; ASW = average syllables per word.
 */

import { countSyllables } from './syllables.js';
import { countSyllablesEn } from './syllables-en.js';
import type { Sentence, ProseLang } from './prose.js';

export interface ReadabilityStats {
  lang: ProseLang;
  fleschDouma: number | null; // Dutch only
  fleschReadingEase: number | null; // English only
  fleschKincaidGrade: number | null; // English only
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
};

// Long-word threshold: Dutch compounds make >=4 syllables the useful cut;
// English uses >=3 syllables ("complex words", as in the Gunning fog index).
export const LONG_WORD_SYLLABLES: Record<ProseLang, number> = { nl: 4, en: 3 };

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
  const syl = lang === 'en' ? countSyllablesEn : countSyllables;
  const longAt = LONG_WORD_SYLLABLES[lang];

  const wordCount = sentences.reduce((n, s) => n + s.words.length, 0);
  const sentenceCount = sentences.length;
  let syllables = 0;
  let charCount = 0;
  let longWords = 0;
  for (const s of sentences) {
    for (const w of s.words) {
      const n = syl(w.clean);
      syllables += n;
      charCount += w.clean.length;
      if (n >= longAt) longWords++;
    }
  }
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  const longSentences = sentences.filter((s) => s.words.length > t.warnSentenceWords && s.words.length <= t.maxSentenceWords).length;
  const veryLongSentences = sentences.filter((s) => s.words.length > t.maxSentenceWords).length;

  let fleschDouma: number | null = null;
  let fleschReadingEase: number | null = null;
  let fleschKincaidGrade: number | null = null;
  let ari: number | null = null;
  if (wordCount >= t.minWords && sentenceCount >= 3) {
    const asl = wordCount / sentenceCount;
    const asw = syllables / wordCount;
    if (lang === 'nl') {
      fleschDouma = round1(206.835 - 0.93 * asl - 77 * asw);
    } else {
      fleschReadingEase = round1(206.835 - 1.015 * asl - 84.6 * asw);
      fleschKincaidGrade = round1(0.39 * asl + 11.8 * asw - 15.59);
    }
    ari = round1(4.71 * (charCount / wordCount) + 0.5 * asl - 21.43);
  }

  return {
    lang,
    fleschDouma,
    fleschReadingEase,
    fleschKincaidGrade,
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

/** Practical B1 band for Flesch-Douma: ~60-70. Below 60 = harder than B1. */
export function fleschDoumaBand(score: number): 'b1' | 'above-b1' | 'below-b1' | 'hard' {
  if (score >= 60 && score <= 70) return 'b1';
  if (score > 70) return 'above-b1';
  if (score >= 45) return 'below-b1';
  return 'hard';
}

/**
 * Bands for English Flesch Reading Ease, following Flesch's own table:
 * 60-70 "standard / plain English" (about US grade 8-9) is the practical
 * B1 zone; 70+ is easier; 50-60 "fairly difficult"; below 50 "difficult".
 * The minimum is a tool parameter (default 60).
 */
export function fleschReadingEaseBand(score: number, min = 60): 'b1' | 'above-b1' | 'below-b1' | 'hard' {
  if (score >= min && score <= 70) return 'b1';
  if (score > 70) return 'above-b1';
  if (score >= 50) return 'below-b1';
  return 'hard';
}
