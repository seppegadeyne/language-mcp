/**
 * Readability statistics for Dutch text (B1 proxies, not a validated B1
 * verdict): Flesch-Douma (NL-adapted Flesch Reading Ease), ARI, and raw
 * diagnostic counts used by check_dutch_b1_text.
 *
 * Sources for constants:
 * - Flesch-Douma: 206.835 - 0.93 * ASL - 77 * ASW  (Douma's NL adaptation;
 *   coefficients cross-checked against textacy's flesch_reading_ease for
 *   lang="nl": base 206.835, asl 0.93, awl 77.0). Not empirically validated
 *   for Dutch — report as an indication.
 * - ARI (Smith & Senter 1967): 4.71 * chars/word + 0.5 * words/sentence - 21.43.
 *   Language-neutral mechanism, English-validated grade levels.
 */

import { countSyllables } from './syllables.js';
import type { Sentence } from './prose.js';

export interface ReadabilityStats {
  fleschDouma: number | null;
  ari: number | null;
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  avgSentenceLength: number;
  longSentences: number; // > warn threshold (words)
  veryLongSentences: number; // > error threshold (words)
  longWordShare: number; // share of words with >= 4 syllables, 0..1
  paraCount: number;
  longParas: number; // > threshold words
}

export interface ReadabilityThresholds {
  maxSentenceWords?: number; // default 20 (error), warn at 15
  warnSentenceWords?: number; // default 15
  maxParaWords?: number; // default 150 (editorial checklist 01-PARAGRAPH)
  minWords?: number; // minimum sample for formulas, default 50
}

const DEFAULTS: Required<ReadabilityThresholds> = {
  maxSentenceWords: 20,
  warnSentenceWords: 15,
  maxParaWords: 150,
  minWords: 50,
};

export function computeReadability(
  sentences: Sentence[],
  paraWordCounts: number[],
  opts: ReadabilityThresholds = {}
): ReadabilityStats {
  // Drop explicitly-undefined options: spreading { key: undefined } over the
  // defaults would clobber them (callers pass through optional tool params).
  const defined = Object.fromEntries(
    Object.entries(opts).filter(([, v]) => v !== undefined)
  ) as ReadabilityThresholds;
  const t = { ...DEFAULTS, ...defined };
  const wordCount = sentences.reduce((n, s) => n + s.words.length, 0);
  const sentenceCount = sentences.length;
  const syllables = sentences.reduce(
    (n, s) => n + s.words.reduce((k, w) => k + countSyllables(w.clean), 0),
    0
  );
  const charCount = sentences.reduce(
    (n, s) => n + s.words.reduce((k, w) => k + w.clean.length, 0),
    0
  );
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  const longSentences = sentences.filter((s) => s.words.length > t.warnSentenceWords && s.words.length <= t.maxSentenceWords).length;
  const veryLongSentences = sentences.filter((s) => s.words.length > t.maxSentenceWords).length;
  const longWords = sentences.reduce(
    (n, s) => n + s.words.filter((w) => countSyllables(w.clean) >= 4).length,
    0
  );

  let fleschDouma: number | null = null;
  let ari: number | null = null;
  if (wordCount >= t.minWords && sentenceCount >= 3) {
    const asl = wordCount / sentenceCount;
    const asw = syllables / wordCount;
    fleschDouma = Math.round((206.835 - 0.93 * asl - 77 * asw) * 10) / 10;
    ari = Math.round((4.71 * (charCount / wordCount) + 0.5 * asl - 21.43) * 10) / 10;
  }

  return {
    fleschDouma,
    ari,
    wordCount,
    sentenceCount,
    syllableCount: syllables,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    longSentences,
    veryLongSentences,
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
