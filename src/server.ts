import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { hunspellWords } from './hunspell.js';
import { MolexClient } from './molex.js';
import { extractWords } from './tokenize.js';
import { findBritticisms } from './britticisms.js';

const molex = new MolexClient();

const server = new McpServer(
  { name: 'nl-taal', version: '0.2.0' },
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
      `Dutch spell check (OpenTaal woordenlijst, lokaal)`,
      `${totalWords} woorden gecontroleerd, ${uniqueFlagged} twijfelwoorden.`,
    ];
    if (flagged.length === 0) {
      lines.push('OK: geen onbekende woorden gevonden.');
    } else {
      lines.push('Mogelijk foutieve woorden (suggestions = dichtstbijzijnde correcties):');
      for (const f of flagged) {
        const sug = f.suggestions.length ? f.suggestions.join(', ') : '(geen)';
        const cnt = f.count > 1 ? ` [${f.count}x]` : '';
        lines.push(`- ${f.word}${cnt} → ${sug} (positie ${f.first_index})`);
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

/**
 * dutch_word_details: rich lemma info from woordenlijst.org (network).
 */
server.tool(
  'dutch_word_details',
  'Get official Dutch word details from woordenlijst.org: lemma, woordsoort, uitspraak, syllabisering/afbreking, verkleinwoord, paradigm. Slower (network); use for individual important words, not bulk.',
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
              text: `Geen lemma gevonden voor "${word}" op woordenlijst.org.`,
            },
          ],
        };
      }
      const lines: string[] = [
        `${d.lemma} — ${d.label || d.partOfSpeech}`,
        `Uitspraak: ${d.pronunciation || '-'}`,
        `Afbreking: ${d.hyphenation || '-'}`,
        `Taalvariant: ${d.taalvariant || '-'}`,
        `Keurmerk: ${d.keurmerk ? 'ja' : 'nee'}`,
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
            text: `woordenlijst.org niet bereikbaar (${(e as Error).message}). Val terug op check_dutch_text.`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * validate_us_word: quick local yes/no + suggestions for one English word.
 */
server.tool(
  'validate_us_word',
  'Check quickly (lokaal) of één Engels woord correct gespeld is volgens US English, met suggesties. Detecteert ook Britse spelling voor losse woorden.',
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
      parts.push(`"${clean}" is British English: gebruik "${britts[0].american}".`);
    }
    if (r && !r.correct && britts.length === 0) {
      const sug = r.suggestions.length ? r.suggestions.join(', ') : '(geen suggesties)';
      return { content: [{ type: 'text', text: `"${clean}" is NIET correct in US English. Suggesties: ${sug}` }] };
    }
    if (!r) {
      return { content: [{ type: 'text', text: `Kon "${clean}" niet controleren.` }], isError: true };
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
  'Check quickly (lokaal) of één Nederlands woord correct gespeld is, met suggesties bij foute spelling.',
  {
    word: z.string().describe('Single Dutch word'),
  },
  async ({ word }) => {
    const clean = word.trim();
    const results = await hunspellWords([clean]);
    const r = results.get(clean);
    if (!r) {
      return { content: [{ type: 'text', text: `Kon "${clean}" niet controleren.` }], isError: true };
    }
    if (r.correct) {
      return { content: [{ type: 'text', text: `"${clean}" is correct gespeld.` }] };
    }
    const sug = r.suggestions.length ? r.suggestions.join(', ') : '(geen suggesties)';
    return { content: [{ type: 'text', text: `"${clean}" is NIET correct. Suggesties: ${sug}` }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { main };
