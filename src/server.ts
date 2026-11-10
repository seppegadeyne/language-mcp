import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { dictAvailable, hunspellWords, type HunspellResult } from './hunspell.js';
import { MolexClient } from './molex.js';
import { extractWords, scanWords, MAX_SPELL_WORDS, type Token } from './tokenize.js';
import { findBritticisms } from './britticisms.js';
import { findDutchSpellingIssues } from './dutch-spelling.js';
import { analyzeProse, wordTokens } from './prose.js';
import { bandTarget, computeReadability, fleschDoumaBand, fleschReadingEaseBand } from './readability.js';
import { findB1Hits, findNominalizations, analyzeVoice } from './b1rules.js';
import { getDutchZipf, frequencyTableAvailable } from './frequency.js';
import { suggestSynonyms } from './synonyms.js';
import { findB1HitsEn, findNominalizationsEn, analyzeAddressEn } from './b1rules-en.js';
import { detectPassives } from './passive.js';
import { detectPassivesEn } from './passive-en.js';
import { detectPassivesFr } from './passive-fr.js';
import { analyzeVoiceFr } from './voice-fr.js';
import { inputErrorResult, resolveInput, sourceSchema, type SourceArgs } from './source.js';

const molex = new MolexClient();

const server = new McpServer(
  { name: 'language-mcp', version: '0.11.0' },
  { capabilities: { tools: {} } }
);

/** Shared by the three spelling tools: same contract in every language. */
const PROTECTED_TERMS_SCHEMA = z.array(z.string().min(1).max(200)).max(100).optional();

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/**
 * check_us_english_text: spell-check + britticism scan for US English text.
 */
server.tool(
  'check_us_english_text',
  'Check English text for US English compliance: typos (hunspell en_US) + British spellings/vocabulary (colour, whilst, towards, bespoke, webshop, sole trader...) with US replacements. Mark brand or product names with protected_terms. Use for EN pages, blogs, US-facing copy.',
  {
    text: z.string().optional().describe('The English text to check (or pass path)'),
    ...sourceSchema,
    protected_terms: PROTECTED_TERMS_SCHEMA.describe('Case-sensitive names or titles (up to 100; horizontal whitespace may vary). Words and British forms inside an occurrence are not reported.'),
  },
  withInput(async ({ text, protected_terms }) => {
    const { tokens, truncatedAt, protectedSkipped, isProtected } = spellTokens(text, protected_terms, 'en_US');
    const words = tokens.map((t) => t.clean);
    const results = await hunspellWords(words, 'en_US');

    const flagged = unknownWords(tokens, results);

    const britts = findBritticisms(text, isProtected);
    const britishWords = new Set(britts.map((b) => b.matched.toLowerCase()));

    const lines: string[] = [
      `US English check (hunspell en_US + britticism scan)`,
      `${tokens.length} words checked, ${flagged.length} unknown, ${britts.length} British forms.`,
    ];
    if (protectedSkipped > 0) lines.push(`${protectedSkipped} words skipped inside protected terms.`);
    if (britts.length > 0) {
      lines.push('British spellings/vocabulary to replace:');
      for (const b of britts) {
        const note = b.note ? ` — ${b.note}` : '';
        lines.push(`- "${b.matched}" → "${b.american}" (position ${b.index})${note}`);
      }
    }
    const unknownOnly = flagged.filter((f) => !britishWords.has(f.word.toLowerCase()));
    if (unknownOnly.length > 0) {
      lines.push('Unknown words (typos or proper nouns):');
      for (const f of unknownOnly) {
        const sug = f.suggestions.length ? f.suggestions.join(', ') : '(none)';
        const cnt = f.count > 1 ? ` [${f.count}x]` : '';
        lines.push(`- ${f.word}${cnt} → ${sug} (position ${f.first_index})`);
      }
    }
    if (britts.length === 0 && flagged.length === 0) {
      lines.push('OK: no typos, no British forms found.');
    }
    return spellLimitNote(lines, truncatedAt);
  })
);

/**
 * check_dutch_text: spell-check a Dutch text and return flagged words with
 * suggestions. Local (hunspell + OpenTaal); fast, no network.
 */
server.tool(
  'check_dutch_text',
  'Spell-check Dutch text locally with OpenTaal/hunspell and selected compound, hyphen, and calendar capitalization rules. Returns unknown words plus rule findings with suggestions, original positions, rule IDs, explanations, confidence, and Team Taaladvies source links. Not a grammar checker. Mark names, brands, or titles with protected_terms when needed. Use for CVs, cover letters, blog articles, any Dutch prose.',
  {
    text: z.string().optional().describe('The Dutch text to check (or pass path)'),
    ...sourceSchema,
    context: z.string().optional().describe('Optional label, e.g. "cover letter Acme"'),
    protected_terms: PROTECTED_TERMS_SCHEMA.describe('Case-sensitive names or titles (up to 100; horizontal whitespace may vary). Words inside an occurrence are not reported as unknown and the rule layer skips it. Other occurrences of the same words are still checked.'),
  },
  withInput(async ({ text, protected_terms }) => {
    const { tokens, truncatedAt, protectedSkipped } = spellTokens(text, protected_terms, 'nl');
    const words = tokens.map((t) => t.clean);
    const results = await hunspellWords(words);
    const flagged = unknownWords(tokens, results);

    const rules = findDutchSpellingIssues(text, { protectedTerms: protected_terms });
    const totalWords = tokens.length;
    const uniqueFlagged = flagged.length;
    const lines: string[] = [
      `Dutch spell check (OpenTaal dictionary, local)`,
      `${totalWords} words checked, ${uniqueFlagged} unknown words.`,
      `${rules.length} rule findings (selected patterns; review before changing text).`,
    ];
    if (protectedSkipped > 0) lines.push(`${protectedSkipped} words skipped inside protected terms.`);
    if (flagged.length === 0) {
      lines.push(rules.length === 0
        ? 'OK: no unknown words or selected rule findings found.'
        : 'No unknown words found.');
    } else {
      lines.push('Potential spelling errors (suggestions = closest corrections):');
      for (const f of flagged) {
        const sug = f.suggestions.length ? f.suggestions.join(', ') : '(none)';
        const cnt = f.count > 1 ? ` [${f.count}x]` : '';
        lines.push(`- ${f.word}${cnt} → ${sug} (position ${f.first_index})`);
      }
    }
    if (rules.length > 0) {
      lines.push('Rule-based spelling findings:');
      for (const hit of rules) {
        lines.push(`- [${hit.ruleId}] "${hit.matched}" → "${hit.suggestion}" (position ${hit.index}, end ${hit.end}; ${hit.confidence} confidence)`);
        lines.push(`  ${hit.explanation}`);
        lines.push(`  Source: ${hit.source.url} (${hit.source.name}, ${hit.source.rule}; checked ${hit.source.checked})`);
      }
    }
    return spellLimitNote(lines, truncatedAt);
  })
);

/**
 * check_dutch_b1_text: deterministic B1-simplicity proxies for Dutch text.
 * Local hunspell morphology + rule layers; same output shape as
 * check_dutch_text (flags + suggestions + positions + counts).
 */
server.tool(
  'check_dutch_b1_text',
  'Check Dutch text for B1-level simplicity proxies: readability (Flesch-Douma, ARI, LIX, Brouwer Leesindex), sentence and paragraph length, passive voice (hunspell morphology), officialese jargon with plain replacements, filler words, idioms, rare-word flags from a Zipf frequency table (OpenSubtitles2018 top 50k, spoken-language bias) with plain-synonym suggestions from Open Dutch WordNet, nominalization density, and je/u voice consistency. These are deterministic proxies, not a validated B1 verdict. Local (hunspell + OpenTaal); no network. Use together with check_dutch_text (spelling) for complete language review.',
  {
    text: z.string().optional().describe('The Dutch text to check (or pass path)'),
    ...sourceSchema,
    context: z.string().optional().describe('Optional label, e.g. "webpage about page"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 20)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 15)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    flesch_douma_min: z.number().optional().describe('Minimum Flesch-Douma score for the B1 band (default 60)'),
    voice: z.enum(['je', 'u']).optional().describe('Expected address form (default je)'),
    rare_word_zipf_max: z.number().optional().describe('Flag known words with a Zipf frequency below this value as rare/difficult (default 3). Zipf table: top 50k Dutch forms from OpenSubtitles2018 (spoken-language bias); unknown words are never flagged.'),
  },
  withInput(async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, flesch_douma_min, voice = 'je', rare_word_zipf_max }) => {
    try {
      const { sentences, paragraphs } = analyzeProse(text, 'nl');
      const paraWordCounts = paragraphs.map((p) => wordTokens(p.text).length);
      const stats = computeReadability(sentences, paraWordCounts, {
        maxSentenceWords: max_sentence_words,
        warnSentenceWords: warn_sentence_words,
        maxParaWords: max_para_words,
      }, 'nl');
      const b1hits = findB1Hits(text);
      const voiceReport = analyzeVoice(text, voice);
      const nomReport = findNominalizations(text, stats.wordCount);
      const passives = await detectPassives(sentences);

      const fdMin = flesch_douma_min ?? 60;
      const band = stats.fleschDouma !== null ? fleschDoumaBand(stats.fleschDouma, fdMin) : null;
      const jargon = b1hits.filter((h) => h.category === 'jargon');
      const fillers = b1hits.filter((h) => h.category === 'filler');
      const idioms = b1hits.filter((h) => h.category === 'idiom');

      const lines: string[] = [];
      lines.push(`Dutch B1 simplicity check (B1 proxies, not a validated B1 verdict)`);
      if (context) lines.push(`Context: ${context}`);
      lines.push('');
      lines.push(`Readability:`);
      if (stats.fleschDouma !== null) {
        lines.push(`- Flesch-Douma: ${stats.fleschDouma} (band: ${band}; B1 target ${bandTarget(fdMin)})`);
      } else {
        lines.push(`- Flesch-Douma: n/a (sample below 50 words / fewer than 3 sentences; formulas unstable on short samples)`);
      }
      if (stats.ari !== null) lines.push(`- ARI: ${stats.ari} (grade-level indication)`);
      if (stats.lix !== null) lines.push(`- LIX: ${stats.lix} (Swedish scale 25/30/40/50/60; not validated for Dutch — compounds inflate it)`);
      if (stats.brouwer !== null) lines.push(`- Brouwer Leesindex: ${stats.brouwer} (second Dutch Flesch variant; sentence length weighs 2x vs Flesch-Douma's 0.93)`);
      const warnAt = warn_sentence_words ?? 15;
      const flagAt = max_sentence_words ?? 20;
      lines.push(`- Words: ${stats.wordCount}, sentences: ${stats.sentenceCount}, avg ${stats.avgSentenceLength} words/sentence`);
      lines.push(`- Sentences over ${warnAt} words: ${stats.longSentences + stats.veryLongSentences} (${stats.veryLongSentences} over ${flagAt})`);
      lines.push(`- Long words (>=4 syllables): ${Math.round(stats.longWordShare * 100)}%`);
      lines.push(`- Paragraphs: ${stats.paraCount} (${stats.longParas} over ${max_para_words ?? 150} words)`);

      lines.push('');
      lines.push(`Passive voice (review flags, not verdicts):`);
      if (passives.length === 0) {
        lines.push(`- None detected.`);
      } else {
        for (const p of passives.slice(0, 15)) {
          const conf = p.confidence === 'low' ? ' [zijn-passive, low confidence]' : '';
          const door = p.withDoor ? ` (+ door/van agent)` : '';
          lines.push(`- "${p.aux} ${p.participle}"${door}${conf} — "${truncate(p.sentenceText, 90)}" (position ${p.index})`);
        }
        if (passives.length > 15) lines.push(`- ...and ${passives.length - 15} more`);
      }

      lines.push('');
      lines.push(`Jargon and vague wording (plain alternatives):`);
      if (jargon.length === 0) {
        lines.push(`- None found.`);
      } else {
        for (const h of jargon.slice(0, 20)) {
          lines.push(`- "${h.matched}" → ${h.plain} (position ${h.index})${h.note ? ` — ${h.note}` : ''}`);
        }
        if (jargon.length > 20) lines.push(`- ...and ${jargon.length - 20} more`);
      }

      if (fillers.length > 0) {
        lines.push('');
        lines.push(`Filler words:`);
        for (const h of fillers.slice(0, 10)) {
          lines.push(`- "${h.matched}" → ${h.plain} (position ${h.index})`);
        }
      }

      if (idioms.length > 0) {
        plainLines(lines, idioms, 'Idioms (consider plain phrasing for NT2 readers):');
      }

      // Word-frequency layer (Zipf, OpenSubtitles2018 top-50k table).
      // Known-but-rare words get flagged; unknown words are never flagged
      // (compounds and names dominate the unknown set — precision first).
      // A missing table skips the layer with a notice instead of failing
      // the whole check (regression: ENOENT crash, moonshot #183).
      const zipfMax = rare_word_zipf_max ?? 3;
      if (!frequencyTableAvailable()) {
        lines.push('');
        lines.push(`Word frequency: skipped (assets/frequency/nl-zipf.tsv not found in this install).`);
      } else {
      const seenRare = new Map<string, { zipf: number; index: number; count: number }>();
      let knownWords = 0;
      for (const tok of extractWords(text, Number.POSITIVE_INFINITY)) {
        const zipf = getDutchZipf(tok.clean);
        if (zipf === null) continue;
        knownWords++;
        if (zipf >= zipfMax) continue;
        const key = tok.clean.toLowerCase();
        const prev = seenRare.get(key);
        if (prev) prev.count++;
        else seenRare.set(key, { zipf, index: tok.index, count: 1 });
      }
      const rareList = [...seenRare.entries()].sort((a, b) => a[1].zipf - b[1].zipf);
      lines.push('');
      lines.push(`Word frequency (Zipf, OpenSubtitles2018 — spoken-language bias, top 50k table):`);
      if (rareList.length === 0) {
        lines.push(`- No rare words below Zipf ${zipfMax}.`);
      } else {
        for (const [word, info] of rareList.slice(0, 20)) {
          const syn = suggestSynonyms(word);
          const tail = syn
            ? `rare word, try: ${syn.suggestions.join(', ')}`
            : 'rare word, consider a plain alternative';
          lines.push(`- "${word}" (Zipf ${info.zipf.toFixed(1)}, ${info.count}x, position ${info.index}) — ${tail}`);
        }
        if (rareList.length > 20) lines.push(`- ...and ${rareList.length - 20} more`);
      }
      lines.push(`- Rare words: ${rareList.length} (${knownWords > 0 ? Math.round((rareList.length / knownWords) * 100) : 0}% of known words; ${knownWords} in table)`);
      lines.push(`- Synonym suggestions: Open Dutch WordNet (CC BY-SA), only shown when clearly more frequent`);
      }

      lines.push('');
      lines.push(`Nominalization density: ${nomReport.per100} per 100 words${nomReport.per100 > 8 ? ' (high — prefer verbs over nouns)' : ''}`);
      if (nomReport.top.length > 0) {
        lines.push(`  Top: ${nomReport.top.map((t) => `${t.word} (${t.count}x)`).join(', ')}`);
      }

      lines.push('');
      if (voiceReport.mixed) {
        lines.push(`Voice consistency: MIXED (expected ${voice}): u-forms ${voiceReport.uCount}x at position ${voiceReport.uFirstIndex}, je-forms ${voiceReport.jeCount}x at position ${voiceReport.jeFirstIndex} — pick one address form.`);
      } else if (voice === 'je' && voiceReport.uCount > 0) {
        lines.push(`Voice consistency: u-forms used ${voiceReport.uCount}x (expected je) at position ${voiceReport.uFirstIndex} — consider je/jij for web copy.`);
      } else if (voice === 'u' && voiceReport.jeCount > 0) {
        lines.push(`Voice consistency: je-forms used ${voiceReport.jeCount}x (expected u) at position ${voiceReport.jeFirstIndex} — consider u for formal copy.`);
      } else {
        lines.push(`Voice consistency: OK (expected ${voice}; u-forms ${voiceReport.uCount}x, je-forms ${voiceReport.jeCount}x).`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `B1 check failed: ${(e as Error).message}` }],
        isError: true,
      };
    }
  })
);

/**
 * check_us_english_b1_text: deterministic plain-language (B1) proxies for
 * US English text. Same structure and output shape as check_dutch_b1_text.
 */
server.tool(
  'check_us_english_b1_text',
  'Check US English text for B1-level plain-language proxies: readability (Flesch Reading Ease, Flesch-Kincaid grade, ARI), sentence and paragraph length, passive voice (hunspell morphology + irregular participles), formal jargon and wordy phrases with plain replacements, hidden verbs (make a decision -> decide), filler words, idioms, nominalization density, and direct "you" address. These are deterministic proxies, not a validated B1 verdict. Local (hunspell en_US); no network. Use together with check_us_english_text (spelling and British forms) for complete language review.',
  {
    text: z.string().optional().describe('The English text to check (or pass path)'),
    ...sourceSchema,
    context: z.string().optional().describe('Optional label, e.g. "pricing page"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 25, the GOV.UK limit)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 20, the plainlanguage.gov average)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    flesch_min: z.number().optional().describe('Minimum Flesch Reading Ease for the B1 band (default 60)'),
    max_grade: z.number().optional().describe('Maximum Flesch-Kincaid grade level (default 9)'),
    address: z.enum(['you', 'any']).optional().describe('Expected reader address: "you" (default) reports third-person references to the reader; "any" only counts them'),
  },
  withInput(async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, flesch_min, max_grade, address = 'you' }) => {
    try {
      const { sentences, paragraphs } = analyzeProse(text, 'en');
      const paraWordCounts = paragraphs.map((p) => wordTokens(p.text).length);
      const stats = computeReadability(sentences, paraWordCounts, {
        maxSentenceWords: max_sentence_words,
        warnSentenceWords: warn_sentence_words,
        maxParaWords: max_para_words,
      }, 'en');
      const hits = findB1HitsEn(text);
      const addressReport = analyzeAddressEn(text, address);
      const nomReport = findNominalizationsEn(text, stats.wordCount);
      const passives = await detectPassivesEn(sentences);

      const freMin = flesch_min ?? 60;
      const gradeMax = max_grade ?? 9;
      const warnAt = warn_sentence_words ?? 20;
      const flagAt = max_sentence_words ?? 25;
      const byCat = (c: string) => hits.filter((h) => h.category === c);

      const lines: string[] = [];
      lines.push(`US English B1 plain-language check (B1 proxies, not a validated B1 verdict)`);
      if (context) lines.push(`Context: ${context}`);
      lines.push('');
      lines.push(`Readability:`);
      if (stats.fleschReadingEase !== null && stats.fleschKincaidGrade !== null) {
        const band = fleschReadingEaseBand(stats.fleschReadingEase, freMin);
        lines.push(`- Flesch Reading Ease: ${stats.fleschReadingEase} (band: ${band}; B1 target ${bandTarget(freMin)})`);
        const gradeNote = stats.fleschKincaidGrade > gradeMax ? ` (above target ${gradeMax})` : ` (target ${gradeMax} or lower)`;
        lines.push(`- Flesch-Kincaid grade: ${stats.fleschKincaidGrade}${gradeNote}`);
      } else {
        lines.push(`- Flesch Reading Ease / Flesch-Kincaid: n/a (sample below 50 words / fewer than 3 sentences; formulas unstable on short samples)`);
      }
      if (stats.ari !== null) lines.push(`- ARI: ${stats.ari} (grade-level indication)`);
      lines.push(`- Words: ${stats.wordCount}, sentences: ${stats.sentenceCount}, avg ${stats.avgSentenceLength} words/sentence`);
      lines.push(`- Sentences over ${warnAt} words: ${stats.longSentences + stats.veryLongSentences} (${stats.veryLongSentences} over ${flagAt})`);
      const longest = sentences
        .filter((s) => s.words.length > flagAt)
        .sort((a, b) => b.words.length - a.words.length)
        .slice(0, 5);
      for (const s of longest) {
        lines.push(`  - ${s.words.length} words: "${truncate(s.text, 90)}" (position ${s.start})`);
      }
      lines.push(`- Complex words (>=${stats.longWordSyllables} syllables): ${Math.round(stats.longWordShare * 100)}%`);
      lines.push(`- Paragraphs: ${stats.paraCount} (${stats.longParas} over ${max_para_words ?? 150} words)`);

      lines.push('');
      lines.push(`Passive voice (review flags, not verdicts):`);
      if (passives.length === 0) {
        lines.push(`- None detected.`);
      } else {
        for (const p of passives.slice(0, 15)) {
          const conf = p.confidence === 'low' ? ' [adjectival use likely, low confidence]' : '';
          const by = p.withBy ? ` (+ by agent)` : '';
          const kind = p.kind === 'get-passive' ? ' [get-passive]' : '';
          lines.push(`- "${p.aux} ${p.participle}"${by}${kind}${conf} — "${truncate(p.sentenceText, 90)}" (position ${p.index})`);
        }
        if (passives.length > 15) lines.push(`- ...and ${passives.length - 15} more`);
      }

      lines.push('');
      lines.push(`Jargon and buzzwords (plain alternatives):`);
      const jargon = byCat('jargon');
      if (jargon.length === 0) {
        lines.push(`- None found.`);
      } else {
        for (const h of jargon.slice(0, 20)) {
          lines.push(`- "${h.matched}" → ${h.plain} (position ${h.index})${h.note ? ` — ${h.note}` : ''}`);
        }
        if (jargon.length > 20) lines.push(`- ...and ${jargon.length - 20} more`);
      }

      const wordy = byCat('wordy');
      if (wordy.length > 0) plainLines(lines, wordy, 'Wordy phrases:');
      const hidden = byCat('hidden-verb');
      if (hidden.length > 0) plainLines(lines, hidden, 'Hidden verbs (use the verb, not the noun):');
      const fillers = byCat('filler');
      if (fillers.length > 0) plainLines(lines, fillers, 'Filler words:');
      const idioms = byCat('idiom');
      if (idioms.length > 0) plainLines(lines, idioms, 'Idioms and metaphors (consider plain phrasing for second-language readers):');

      lines.push('');
      lines.push(`Nominalization density: ${nomReport.per100} per 100 words${nomReport.per100 > 6 ? ' (high — prefer verbs over nouns)' : ''}`);
      if (nomReport.top.length > 0) {
        lines.push(`  Top: ${nomReport.top.map((t) => `${t.word} (${t.count}x)`).join(', ')}`);
      }

      lines.push('');
      const refs = addressReport.readerTop.map((r) => `${r.word} (${r.count}x)`).join(', ');
      if (address === 'you' && addressReport.readerRefs > 0) {
        lines.push(`Reader address: third-person references to the reader ${addressReport.readerRefs}x (first at position ${addressReport.readerFirstIndex}): ${refs} — address the reader as "you" where they are the audience; "you" used ${addressReport.youCount}x.`);
      } else if (address === 'you' && addressReport.youCount === 0 && stats.wordCount >= 50) {
        lines.push(`Reader address: no "you" found — plain-language guidelines recommend addressing the reader directly.`);
      } else {
        lines.push(`Reader address: OK ("you" ${addressReport.youCount}x, third-person reader references ${addressReport.readerRefs}x${refs ? `: ${refs}` : ''}).`);
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `B1 check failed: ${(e as Error).message}` }],
        isError: true,
      };
    }
  })
);

const FRENCH_DICT_MISSING =
  'French dictionary not found: expected assets/fr.dic and assets/fr.aff (or a system fr_FR hunspell dictionary). French spelling is unavailable in this install.';

/**
 * Tokens for a spell check, minus protected terms. Protected terms (brand or
 * product names, case-sensitive; horizontal whitespace may vary) are skipped
 * together with every word that lies fully inside one of their occurrences,
 * the same way in every language. French only: elided acronyms and codes
 * (l'ADN, d'IA, l'EN795) are not words for the dictionary.
 */
function spellTokens(text: string, protectedTerms: string[] | undefined, lang: 'nl' | 'en_US' | 'fr') {
  const { tokens, truncatedAt } = scanWords(text);
  const spans: Array<[number, number]> = [];
  for (const term of protectedTerms ?? []) {
    const source = term.trim().split(/[ \t\u00a0\u202f]+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \\t\\u00a0\\u202f]+');
    if (!source) continue;
    for (const m of text.matchAll(new RegExp(source, 'g'))) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  const isProtected = (start: number, end: number) => spans.some(([a, b]) => start >= a && end <= b);
  let protectedSkipped = 0;
  const kept = tokens.filter((t) => {
    if (lang === 'fr' && /^(?:[cdjlmnst]|qu|jusqu|lorsqu|puisqu|quoiqu)['’]\p{Lu}[\p{Lu}\d]+$/u.test(t.clean)) return false;
    if (isProtected(t.index, t.index + t.word.length)) {
      protectedSkipped++;
      return false;
    }
    return true;
  });
  return { tokens: kept, truncatedAt, protectedSkipped, isProtected };
}

/**
 * check_french_text: spell-check for French text (hunspell + Dicollecte).
 */
server.tool(
  'check_french_text',
  'Spell-check French text locally with hunspell and the Dicollecte/Grammalecte French dictionary ("toutes variantes": both the traditional and the 1990 reform spellings are accepted). Returns unknown words with suggestions and positions. Elisions (l\'ancrage, d\'un, qu\'il, aujourd\'hui) are checked with straight and typographic apostrophes; hyphenated words and non-breaking spaces before ; : ? ! do not cause false flags. Not a grammar checker: agreement, conjugation, and the choice between valid words are not checked. Mark brand or product names with protected_terms. Use for French pages, blogs, and copy.',
  {
    text: z.string().optional().describe('The French text to check (or pass path)'),
    ...sourceSchema,
    context: z.string().optional().describe('Optional label, e.g. "page À propos"'),
    protected_terms: PROTECTED_TERMS_SCHEMA.describe('Case-sensitive names or titles whose words are not reported as unknown (up to 100; horizontal whitespace may vary).'),
  },
  withInput(async ({ text, context, protected_terms }) => {
    if (!dictAvailable('fr')) return { content: [{ type: 'text', text: FRENCH_DICT_MISSING }], isError: true };
    const { tokens, truncatedAt, protectedSkipped } = spellTokens(text, protected_terms, 'fr');
    const results = await hunspellWords(tokens.map((t) => t.clean), 'fr');
    const flagged = unknownWords(tokens, results);
    const lines: string[] = [
      `French spell check (hunspell, Dicollecte "toutes variantes" dictionary, local)`,
    ];
    if (context) lines.push(`Context: ${context}`);
    lines.push(`${tokens.length} words checked, ${flagged.length} unknown words.`);
    if (protectedSkipped > 0) lines.push(`${protectedSkipped} words skipped inside protected terms.`);
    if (flagged.length === 0) {
      lines.push('OK: no unknown words found. (Spelling only: grammar and agreement are not checked.)');
    } else {
      lines.push('Potential spelling errors (suggestions = closest corrections):');
      for (const f of flagged) {
        const sug = f.suggestions.length ? f.suggestions.join(', ') : '(none)';
        const cnt = f.count > 1 ? ` [${f.count}x]` : '';
        lines.push(`- ${f.word}${cnt} → ${sug} (position ${f.first_index})`);
      }
    }
    return spellLimitNote(lines, truncatedAt);
  })
);

/**
 * check_french_b1_text: deterministic plain-language (B1) proxies for French
 * text. Same structure and output shape as check_us_english_b1_text.
 */
server.tool(
  'check_french_b1_text',
  'Check French text for B1-level plain-language proxies: readability (Kandel & Moles 1958, the French adaptation of Flesch Reading Ease), sentence and paragraph length, passive voice (être + past participle; precision first), and address-form consistency (voice "vous" by default: reports tu/toi/te/ton/ta/tes/tien forms, or the reverse for voice "tu"). These are deterministic proxies, not a validated B1 verdict. Local (hunspell fr); no network. Use together with check_french_text (spelling) for complete language review.',
  {
    text: z.string().optional().describe('The French text to check (or pass path)'),
    ...sourceSchema,
    context: z.string().optional().describe('Optional label, e.g. "page Services"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 25)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 20)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    kandel_moles_min: z.number().optional().describe('Minimum Kandel & Moles score for the B1 band (default 60)'),
    voice: z.enum(['vous', 'tu']).optional().describe('Expected address form (default vous)'),
  },
  withInput(async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, kandel_moles_min, voice = 'vous' }) => {
    try {
      const { sentences, paragraphs } = analyzeProse(text, 'fr');
      const paraWordCounts = paragraphs.map((p) => wordTokens(p.text).length);
      const stats = computeReadability(sentences, paraWordCounts, {
        maxSentenceWords: max_sentence_words,
        warnSentenceWords: warn_sentence_words,
        maxParaWords: max_para_words,
      }, 'fr');
      const voiceReport = analyzeVoiceFr(text, voice);
      const dictOk = dictAvailable('fr');
      const passives = dictOk ? await detectPassivesFr(sentences) : [];

      const kmMin = kandel_moles_min ?? 60;
      const warnAt = warn_sentence_words ?? 20;
      const flagAt = max_sentence_words ?? 25;

      const lines: string[] = [];
      lines.push(`French B1 plain-language check (B1 proxies, not a validated B1 verdict)`);
      if (context) lines.push(`Context: ${context}`);
      lines.push('');
      lines.push(`Readability:`);
      if (stats.kandelMoles !== null) {
        const band = fleschReadingEaseBand(stats.kandelMoles, kmMin);
        lines.push(`- Kandel & Moles: ${stats.kandelMoles} (band: ${band}; B1 target ${bandTarget(kmMin)}; French adaptation of Flesch Reading Ease, not validated for B1)`);
      } else {
        lines.push(`- Kandel & Moles: n/a (sample below 50 words / fewer than 3 sentences; formulas unstable on short samples)`);
      }
      lines.push(`- Words: ${stats.wordCount}, sentences: ${stats.sentenceCount}, avg ${stats.avgSentenceLength} words/sentence (an elided clitic counts with its word: l'ancrage = 1 word)`);
      lines.push(`- Sentences over ${warnAt} words: ${stats.longSentences + stats.veryLongSentences} (${stats.veryLongSentences} over ${flagAt})`);
      const longest = sentences
        .filter((s) => s.words.length > flagAt)
        .sort((a, b) => b.words.length - a.words.length)
        .slice(0, 5);
      for (const s of longest) {
        lines.push(`  - ${s.words.length} words: "${truncate(s.text, 90)}" (position ${s.start})`);
      }
      lines.push(`- Long words (>=${stats.longWordSyllables} syllables): ${Math.round(stats.longWordShare * 100)}% (syllables are estimated; mute final e not counted)`);
      lines.push(`- Paragraphs: ${stats.paraCount} (${stats.longParas} over ${max_para_words ?? 150} words)`);

      lines.push('');
      lines.push(`Passive voice (être + past participle; review flags, not verdicts):`);
      if (!dictOk) {
        lines.push(`- skipped (French dictionary not found in this install).`);
      } else if (passives.length === 0) {
        lines.push(`- None detected.`);
      } else {
        for (const p of passives.slice(0, 15)) {
          const conf = p.confidence === 'low' ? ' [low confidence: adjectival or irregular-form use likely]' : '';
          const par = p.withPar ? ` (+ par agent)` : '';
          lines.push(`- "${p.aux} ${p.participle}"${par}${conf} — "${truncate(p.sentenceText, 90)}" (position ${p.index})`);
        }
        if (passives.length > 15) lines.push(`- ...and ${passives.length - 15} more`);
      }

      lines.push('');
      const quoted = voiceReport.quotedIgnored > 0 ? ` (${voiceReport.quotedIgnored} more inside quotations, not counted)` : '';
      const forms = (top: Array<{ word: string; count: number }>) => top.map((t) => `${t.word} (${t.count}x)`).join(', ');
      const wrong = voice === 'vous' ? 'tu' : 'vous';
      const wrongCount = voice === 'vous' ? voiceReport.tuCount : voiceReport.vousCount;
      const wrongFirst = voice === 'vous' ? voiceReport.tuFirstIndex : voiceReport.vousFirstIndex;
      const wrongTop = voice === 'vous' ? voiceReport.tuTop : voiceReport.vousTop;
      const rightCount = voice === 'vous' ? voiceReport.vousCount : voiceReport.tuCount;
      const rightFirst = voice === 'vous' ? voiceReport.vousFirstIndex : voiceReport.tuFirstIndex;
      if (wrongCount > 0 && rightCount > 0) {
        lines.push(`Voice consistency: MIXED (expected ${voice}): ${wrong}-forms ${wrongCount}x at position ${wrongFirst} (${forms(wrongTop)}), ${voice}-forms ${rightCount}x at position ${rightFirst} — pick one address form.${quoted}`);
      } else if (wrongCount > 0) {
        lines.push(`Voice consistency: ${wrong}-forms used ${wrongCount}x (expected ${voice}), first at position ${wrongFirst}: ${forms(wrongTop)} — address the reader with "${voice}".${quoted}`);
      } else {
        lines.push(`Voice consistency: OK (expected ${voice}; ${voice}-forms ${rightCount}x, ${wrong}-forms 0x).${quoted}`);
      }
      for (const h of voiceReport.hits.filter((x) => x.form === wrong).slice(0, 10)) {
        lines.push(`- "${h.word}" (position ${h.index})`);
      }
      lines.push(`  Only pronouns and possessives are detected; a tu imperative without a pronoun is not.`);

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: `B1 check failed: ${(e as Error).message}` }],
        isError: true,
      };
    }
  })
);

type CheckResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

/** validate_*_word with an empty or blank word: hunspell would answer with zero blocks. */
const EMPTY_WORD: CheckResult = { content: [{ type: 'text', text: 'Input error: word is empty or has no letters; pass a single word.' }], isError: true };

/**
 * Resolve text/path (+ range, expected hash) before a check runs, then add one
 * provenance line (input_sha256, code points, file and range) after the
 * report's header line.
 */
function withInput<A extends SourceArgs>(
  check: (args: A & { text: string }) => Promise<CheckResult>,
): (args: A) => Promise<CheckResult> {
  return async (args: A) => {
    let input;
    try {
      input = await resolveInput(args);
    } catch (e) {
      return inputErrorResult(e);
    }
    const result = await check({ ...args, text: input.text });
    const first = result.content[0];
    if (first && first.type === 'text' && !/^(?:B1 check failed|French dictionary not found)/.test(first.text)) {
      const lines = first.text.split('\n');
      lines.splice(1, 0, input.summary);
      first.text = lines.join('\n');
    }
    return result;
  };
}

/**
 * Fail closed when the spell check hit its word cap: the partial report is
 * kept, but the result is an error so no caller can count it as full coverage.
 */
function spellLimitNote(lines: string[], truncatedAt: number | null): CheckResult {
  if (truncatedAt === null) return { content: [{ type: 'text', text: lines.join('\n') }] };
  lines.splice(1, 0, `INCOMPLETE: spelling stopped after ${MAX_SPELL_WORDS} words; text from position ${truncatedAt} on was NOT spell-checked. Split the input into ranges and check each one.`);
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: true };
}

/** Unknown words from a spell check: one entry per word, most frequent first. */
function unknownWords(tokens: Token[], results: Map<string, HunspellResult>) {
  const seen = new Map<string, { word: string; suggestions: string[]; count: number; first_index: number }>();
  for (const t of tokens) {
    const r = results.get(t.clean);
    if (!r || r.correct) continue;
    const entry = seen.get(t.clean) ?? { word: t.clean, suggestions: r.suggestions, count: 0, first_index: t.index };
    entry.count++;
    seen.set(t.clean, entry);
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function plainLines(
  lines: string[],
  hits: Array<{ index: number; matched: string; plain: string; note?: string }>,
  header: string
): void {
  lines.push('');
  lines.push(header);
  for (const h of hits.slice(0, 10)) {
    lines.push(`- "${h.matched}" → ${h.plain} (position ${h.index})${h.note ? ` — ${h.note}` : ''}`);
  }
  if (hits.length > 10) lines.push(`- ...and ${hits.length - 10} more`);
}

/**
 * get_dutch_word_details: rich lemma info from woordenlijst.org (network).
 */
server.tool(
  'get_dutch_word_details',
  'Get official Dutch word details from woordenlijst.org: lemma, part of speech, pronunciation, syllabification/hyphenation, diminutive forms, paradigm. Slower (network); use for individual important words, not bulk.',
  {
    word: z.string().describe('Dutch word or wordform to look up'),
  },
  async ({ word }) => {
    try {
      const d = await molex.findWordform(word);
      if (!d) {
        return {
          content: [
            {
              type: 'text',
              text: `No lemma found for "${word}" on woordenlijst.org.`,
            },
          ],
        };
      }
      const lines: string[] = [
        `${d.lemma} — ${d.label || d.partOfSpeech}`,
        `Pronunciation: ${d.pronunciation || '-'}`,
        `Hyphenation: ${d.hyphenation || '-'}`,
        `Language variant: ${d.taalvariant || '-'}`,
        `Quality mark: ${d.keurmerk ? 'yes' : 'no'}`,
      ];
      if (d.paradigm.length > 0) {
        lines.push('Paradigm:');
        for (const p of d.paradigm.slice(0, 20)) {
          lines.push(`- ${p.label}: ${p.wordform}${p.hyphenation && p.hyphenation !== p.wordform ? ` (${p.hyphenation})` : ''}`);
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    } catch (e) {
      return {
        content: [
          {
            type: 'text',
            text: `woordenlijst.org is unavailable (${(e as Error).message}). Fall back to check_dutch_text.`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * validate_us_english_word: quick local yes/no + suggestions for one English word.
 */
server.tool(
  'validate_us_english_word',
  'Quickly check a single word locally for correct US English spelling, with suggestions. Also detect British spelling.',
  {
    word: z.string().describe('Single English word'),
  },
  async ({ word }) => {
    const clean = word.trim();
    if (!/\p{L}/u.test(clean)) return EMPTY_WORD;
    const britts = findBritticisms(clean);
    const results = await hunspellWords([clean], 'en_US');
    const r = results.get(clean);
    const parts: string[] = [];
    if (britts.length > 0) {
      parts.push(`"${clean}" is British English: use "${britts[0].american}".`);
    }
    if (r && !r.correct && britts.length === 0) {
      const sug = r.suggestions.length ? r.suggestions.join(', ') : '(no suggestions)';
      return { content: [{ type: 'text', text: `"${clean}" is NOT correct in US English. Suggestions: ${sug}` }] };
    }
    if (!r) {
      return { content: [{ type: 'text', text: `Could not check "${clean}".` }], isError: true };
    }
    if (parts.length) return { content: [{ type: 'text', text: parts.join(' ') }] };
    return { content: [{ type: 'text', text: `"${clean}" is correct US English.` }] };
  }
);

/**
 * validate_dutch_word: quick local yes/no + suggestions for one word.
 */
server.tool(
  'validate_dutch_word',
  'Quickly check a single Dutch word locally for correct spelling, with suggestions for spelling errors.',
  {
    word: z.string().describe('Single Dutch word'),
  },
  async ({ word }) => {
    const clean = word.trim();
    if (!/\p{L}/u.test(clean)) return EMPTY_WORD;
    const results = await hunspellWords([clean]);
    const r = results.get(clean);
    if (!r) {
      return { content: [{ type: 'text', text: `Could not check "${clean}".` }], isError: true };
    }
    if (r.correct) {
      return { content: [{ type: 'text', text: `"${clean}" is spelled correctly.` }] };
    }
    const sug = r.suggestions.length ? r.suggestions.join(', ') : '(no suggestions)';
    return { content: [{ type: 'text', text: `"${clean}" is NOT correct. Suggestions: ${sug}` }] };
  }
);

/**
 * validate_french_word: quick local yes/no + suggestions for one word.
 */
server.tool(
  'validate_french_word',
  'Quickly check a single French word locally for correct spelling (Dicollecte "toutes variantes", straight or typographic apostrophe), with suggestions for spelling errors.',
  {
    word: z.string().describe('Single French word'),
  },
  async ({ word }) => {
    const clean = word.trim();
    if (!/\p{L}/u.test(clean)) return EMPTY_WORD;
    if (!dictAvailable('fr')) return { content: [{ type: 'text', text: FRENCH_DICT_MISSING }], isError: true };
    const results = await hunspellWords([clean], 'fr');
    const r = results.get(clean);
    if (!r) {
      return { content: [{ type: 'text', text: `Could not check "${clean}".` }], isError: true };
    }
    if (r.correct) {
      return { content: [{ type: 'text', text: `"${clean}" is spelled correctly.` }] };
    }
    const sug = r.suggestions.length ? r.suggestions.join(', ') : '(no suggestions)';
    return { content: [{ type: 'text', text: `"${clean}" is NOT correct. Suggestions: ${sug}` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };
