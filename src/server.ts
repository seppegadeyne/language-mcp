import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { hunspellWords } from './hunspell.js';
import { MolexClient } from './molex.js';
import { extractWords } from './tokenize.js';
import { findBritticisms } from './britticisms.js';
import { findDutchSpellingIssues } from './dutch-spelling.js';
import { analyzeProse, wordTokens } from './prose.js';
import { computeReadability, fleschDoumaBand, fleschReadingEaseBand } from './readability.js';
import { findB1Hits, findNominalizations, analyzeVoice } from './b1rules.js';
import { getDutchZipf } from './frequency.js';
import { findB1HitsEn, findNominalizationsEn, analyzeAddressEn } from './b1rules-en.js';
import { detectPassives } from './passive.js';
import { detectPassivesEn } from './passive-en.js';

const molex = new MolexClient();

const server = new McpServer(
  { name: 'language-mcp', version: '0.6.0' },
  { capabilities: { tools: {} } }
);

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
  'Check English text for US English compliance: typos (hunspell en_US) + British spellings/vocabulary (colour, whilst, towards, bespoke, webshop, sole trader...) with US replacements. Use for EN pages, blogs, US-facing copy.',
  {
    text: z.string().describe('The English text to check'),
  },
  async ({ text }) => {
    const tokens = extractWords(text);
    const words = tokens.map((t) => t.clean);
    const results = await hunspellWords(words, 'en_US');

    const seen = new Map<string, { suggestions: string[]; count: number; first_index: number }>();
    for (let i = 0; i < tokens.length; i++) {
      const r = results.get(tokens[i].clean);
      if (r && !r.correct) {
        const entry =
          seen.get(tokens[i].clean) ?? {
            suggestions: r.suggestions,
            count: 0,
            first_index: tokens[i].index,
          };
        entry.count++;
        seen.set(tokens[i].clean, entry);
      }
    }
    const flagged = [...seen.entries()]
      .map(([word, e]) => ({ word, ...e }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

    const britts = findBritticisms(text);
    const britishWords = new Set(britts.map((b) => b.matched.toLowerCase()));

    const lines: string[] = [
      `US English check (hunspell en_US + britticism scan)`,
      `${tokens.length} words checked, ${flagged.length} unknown, ${britts.length} British forms.`,
    ];
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
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

/**
 * check_dutch_text: spell-check a Dutch text and return flagged words with
 * suggestions. Local (hunspell + OpenTaal); fast, no network.
 */
server.tool(
  'check_dutch_text',
  'Spell-check Dutch text locally with OpenTaal/hunspell and selected compound, hyphen, and calendar capitalization rules. Returns unknown words plus rule findings with suggestions, original positions, rule IDs, explanations, confidence, and Team Taaladvies source links. Not a grammar checker. Mark names or titles with protected_terms when needed. Use for CVs, cover letters, blog articles, any Dutch prose.',
  {
    text: z.string().describe('The Dutch text to check'),
    context: z.string().optional().describe('Optional label, e.g. "cover letter Acme"'),
    protected_terms: z.array(z.string().min(1).max(200)).max(100).optional().describe('Case-sensitive names or titles to exclude from the rule layer (up to 100; horizontal whitespace may vary). Does not whitelist dictionary words.'),
  },
  async ({ text, protected_terms }) => {
    const tokens = extractWords(text);
    const words = tokens.map((t) => t.clean);
    const results = await hunspellWords(words);
    const flagged: Array<{
      word: string;
      suggestions: string[];
      count: number;
      first_index: number;
    }> = [];

    const seen = new Map<string, { suggestions: string[]; count: number; first_index: number }>();
    for (let i = 0; i < tokens.length; i++) {
      const r = results.get(tokens[i].clean);
      if (r && !r.correct) {
        const entry = seen.get(tokens[i].clean) ?? {
          suggestions: r.suggestions,
          count: 0,
          first_index: tokens[i].index,
        };
        entry.count++;
        seen.set(tokens[i].clean, entry);
      }
    }
    for (const [word, e] of seen) {
      flagged.push({ word, suggestions: e.suggestions, count: e.count, first_index: e.first_index });
    }
    flagged.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

    const rules = findDutchSpellingIssues(text, { protectedTerms: protected_terms });
    const totalWords = tokens.length;
    const uniqueFlagged = flagged.length;
    const lines: string[] = [
      `Dutch spell check (OpenTaal dictionary, local)`,
      `${totalWords} words checked, ${uniqueFlagged} unknown words.`,
      `${rules.length} rule findings (selected patterns; review before changing text).`,
    ];
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
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

/**
 * check_dutch_b1_text: deterministic B1-simplicity proxies for Dutch text.
 * Local hunspell morphology + rule layers; same output shape as
 * check_dutch_text (flags + suggestions + positions + counts).
 */
server.tool(
  'check_dutch_b1_text',
  'Check Dutch text for B1-level simplicity proxies: readability (Flesch-Douma, ARI, LIX, Brouwer Leesindex), sentence and paragraph length, passive voice (hunspell morphology), officialese jargon with plain replacements, filler words, idioms, rare-word flags from a Zipf frequency table (OpenSubtitles2018 top 50k, spoken-language bias), nominalization density, and je/u voice consistency. These are deterministic proxies, not a validated B1 verdict. Local (hunspell + OpenTaal); no network. Use together with check_dutch_text (spelling) for complete language review.',
  {
    text: z.string().describe('The Dutch text to check'),
    context: z.string().optional().describe('Optional label, e.g. "webpage about page"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 20)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 15)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    flesch_douma_min: z.number().optional().describe('Minimum Flesch-Douma score for the B1 band (default 60)'),
    voice: z.enum(['je', 'u']).optional().describe('Expected address form (default je)'),
    rare_word_zipf_max: z.number().optional().describe('Flag known words with a Zipf frequency below this value as rare/difficult (default 3). Zipf table: top 50k Dutch forms from OpenSubtitles2018 (spoken-language bias); unknown words are never flagged.'),
  },
  async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, flesch_douma_min, voice = 'je', rare_word_zipf_max }) => {
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

      const band = stats.fleschDouma !== null ? fleschDoumaBand(stats.fleschDouma) : null;
      const fdMin = flesch_douma_min ?? 60;
      const jargon = b1hits.filter((h) => h.category === 'jargon');
      const fillers = b1hits.filter((h) => h.category === 'filler');
      const idioms = b1hits.filter((h) => h.category === 'idiom');

      const lines: string[] = [];
      lines.push(`Dutch B1 simplicity check (B1 proxies, not a validated B1 verdict)`);
      if (context) lines.push(`Context: ${context}`);
      lines.push('');
      lines.push(`Readability:`);
      if (stats.fleschDouma !== null) {
        lines.push(`- Flesch-Douma: ${stats.fleschDouma} (band: ${band}; B1 target ${fdMin}-70)`);
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
      const zipfMax = rare_word_zipf_max ?? 3;
      const seenRare = new Map<string, { zipf: number; index: number; count: number }>();
      let knownWords = 0;
      for (const tok of extractWords(text)) {
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
          lines.push(`- "${word}" (Zipf ${info.zipf.toFixed(1)}, ${info.count}x, position ${info.index}) — rare word, consider a plain alternative`);
        }
        if (rareList.length > 20) lines.push(`- ...and ${rareList.length - 20} more`);
      }
      lines.push(`- Rare words: ${rareList.length} (${knownWords > 0 ? Math.round((rareList.length / knownWords) * 100) : 0}% of known words; ${knownWords} in table)`);

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
  }
);

/**
 * check_us_english_b1_text: deterministic plain-language (B1) proxies for
 * US English text. Same structure and output shape as check_dutch_b1_text.
 */
server.tool(
  'check_us_english_b1_text',
  'Check US English text for B1-level plain-language proxies: readability (Flesch Reading Ease, Flesch-Kincaid grade, ARI), sentence and paragraph length, passive voice (hunspell morphology + irregular participles), formal jargon and wordy phrases with plain replacements, hidden verbs (make a decision -> decide), filler words, idioms, nominalization density, and direct "you" address. These are deterministic proxies, not a validated B1 verdict. Local (hunspell en_US); no network. Use together with check_us_english_text (spelling and British forms) for complete language review.',
  {
    text: z.string().describe('The English text to check'),
    context: z.string().optional().describe('Optional label, e.g. "pricing page"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 25, the GOV.UK limit)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 20, the plainlanguage.gov average)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    flesch_min: z.number().optional().describe('Minimum Flesch Reading Ease for the B1 band (default 60)'),
    max_grade: z.number().optional().describe('Maximum Flesch-Kincaid grade level (default 9)'),
    address: z.enum(['you', 'any']).optional().describe('Expected reader address: "you" (default) reports third-person references to the reader; "any" only counts them'),
  },
  async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, flesch_min, max_grade, address = 'you' }) => {
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
        lines.push(`- Flesch Reading Ease: ${stats.fleschReadingEase} (band: ${band}; B1 target ${freMin}-70)`);
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
  }
);

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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };
