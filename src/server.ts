import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { hunspellWords } from './hunspell.js';
import { MolexClient } from './molex.js';
import { extractWords } from './tokenize.js';
import { findBritticisms } from './britticisms.js';
import { analyzeProse, wordTokens } from './prose.js';
import { computeReadability, fleschDoumaBand } from './readability.js';
import { findB1Hits, findNominalizations, analyzeVoice } from './b1rules.js';
import { detectPassives } from './passive.js';

const molex = new MolexClient();

const server = new McpServer(
  { name: 'language-mcp', version: '0.4.0' },
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
            first_index: text.indexOf(tokens[i].word),
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
  'Spell-check Dutch text locally (OpenTaal/hunspell). Returns unknown words with suggestions and positions. Use for CVs, cover letters, blog articles, any Dutch prose.',
  {
    text: z.string().describe('The Dutch text to check'),
    context: z.string().optional().describe('Optional label, e.g. "cover letter Acme"'),
  },
  async ({ text }) => {
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
          first_index: text.indexOf(tokens[i].word),
        };
        entry.count++;
        seen.set(tokens[i].clean, entry);
      }
    }
    for (const [word, e] of seen) {
      flagged.push({ word, suggestions: e.suggestions, count: e.count, first_index: e.first_index });
    }
    flagged.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));

    const totalWords = tokens.length;
    const uniqueFlagged = flagged.length;
    const lines: string[] = [
      `Dutch spell check (OpenTaal dictionary, local)`,
      `${totalWords} words checked, ${uniqueFlagged} unknown words.`,
    ];
    if (flagged.length === 0) {
      lines.push('OK: no unknown words found.');
    } else {
      lines.push('Potential spelling errors (suggestions = closest corrections):');
      for (const f of flagged) {
        const sug = f.suggestions.length ? f.suggestions.join(', ') : '(none)';
        const cnt = f.count > 1 ? ` [${f.count}x]` : '';
        lines.push(`- ${f.word}${cnt} → ${sug} (position ${f.first_index})`);
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
  'Check Dutch text for B1-level simplicity proxies: readability (Flesch-Douma, ARI), sentence and paragraph length, passive voice (hunspell morphology), officialese jargon with plain replacements, filler words, idioms, nominalization density, and je/u voice consistency. These are deterministic proxies, not a validated B1 verdict. Local (hunspell + OpenTaal); no network. Use together with check_dutch_text (spelling) for complete language review.',
  {
    text: z.string().describe('The Dutch text to check'),
    context: z.string().optional().describe('Optional label, e.g. "webpage about page"'),
    max_sentence_words: z.number().int().positive().optional().describe('Flag sentences above this many words (default 20)'),
    warn_sentence_words: z.number().int().positive().optional().describe('Warn from this many words per sentence (default 15)'),
    max_para_words: z.number().int().positive().optional().describe('Flag paragraphs above this many words (default 150)'),
    flesch_douma_min: z.number().optional().describe('Minimum Flesch-Douma score for the B1 band (default 60)'),
    voice: z.enum(['je', 'u']).optional().describe('Expected address form (default je)'),
  },
  async ({ text, context, max_sentence_words, warn_sentence_words, max_para_words, flesch_douma_min, voice = 'je' }) => {
    try {
      const { sentences, paragraphs } = analyzeProse(text);
      const paraWordCounts = paragraphs.map((p) => wordTokens(p.text).length);
      const stats = computeReadability(sentences, paraWordCounts, {
        maxSentenceWords: max_sentence_words,
        warnSentenceWords: warn_sentence_words,
        maxParaWords: max_para_words,
      });
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
        lines.push(`- Flesch-Douma: n/a (sample below ${50} words / fewer than 3 sentences; formulas unstable on short samples)`);
      }
      if (stats.ari !== null) lines.push(`- ARI: ${stats.ari} (grade-level indication)`);
      lines.push(`- Words: ${stats.wordCount}, sentences: ${stats.sentenceCount}, avg ${stats.avgSentenceLength} words/sentence`);
      lines.push(`- Sentences >${stats.longSentences > 0 ? warn_sentence_words ?? 15 : 15} words: ${stats.longSentences + stats.veryLongSentences} (${stats.veryLongSentences} over ${max_sentence_words ?? 20})`);
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function plainLines(lines: string[], hits: Array<{ index: number; matched: string; plain: string }>, header: string): void {
  lines.push('');
  lines.push(header);
  for (const h of hits.slice(0, 10)) {
    lines.push(`- "${h.matched}" → ${h.plain} (position ${h.index})`);
  }
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
