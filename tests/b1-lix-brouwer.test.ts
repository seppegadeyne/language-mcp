import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { computeReadability } from '../src/readability.js';
import type { Sentence } from '../src/prose.js';

const client = new Client({ name: 'b1-lix-brouwer-test', version: '1.0.0' });

// Build Sentence objects directly so every count is hand-controllable.
// WordToken shape: { raw, clean, start, end } — computeReadability only reads
// w.clean (syllables + letters).
function mkWord(clean: string, start: number): { raw: string; clean: string; start: number; end: number } {
  return { raw: clean, clean, start, end: start + clean.length };
}
function mkSentence(words: string[], start = 0): Sentence {
  let offset = start;
  const toks = words.map((w) => {
    const t = mkWord(w, offset);
    offset += w.length + 1;
    return t;
  });
  return { text: words.join(' '), start, end: offset, words: toks };
}

// Corpus for exact-value tests (all words verified: kat=1 syll, auto=2,
// vergadering=4 syllables; letters counted by hand).
//
// Case A — 3 sentences, 51 words, all monosyllabic short words (kat/hond/boek),
// 0 words > 6 letters, 51 syllables:
//   ASL = 51/3 = 17; ASW = 51/51 = 1; longLetterWords = 0
//   LIX = 17 + 100*0/51 = 17
//   Brouwer = 195 - (2/3)*(100*1) - 2*17 = 195 - 66.667 - 34 = 94.3
const wordsA: string[] = [];
for (let i = 0; i < 51; i++) wordsA.push(i % 3 === 0 ? 'kat' : i % 3 === 1 ? 'hond' : 'boek');
const caseA = [mkSentence(wordsA.slice(0, 17)), mkSentence(wordsA.slice(17, 34)), mkSentence(wordsA.slice(34, 51))];

// Case B — 3 sentences, 51 words, every word "vergadering" (10 letters, 4 syll):
//   ASL = 17; ASW = 4; longLetterWords = 51
//   LIX = 17 + 100*51/51 = 117
//   Brouwer = 195 - (2/3)*400 - 34 = 195 - 266.667 - 34 = -105.7
const wordsB: string[] = [];
for (let i = 0; i < 51; i++) wordsB.push('vergadering');
const caseB = [mkSentence(wordsB.slice(0, 17)), mkSentence(wordsB.slice(17, 34)), mkSentence(wordsB.slice(34, 51))];

describe('LIX and Brouwer Leesindex (unit, exact values)', () => {
  it('computes LIX and Brouwer for all-short monosyllabic Dutch text', () => {
    const stats = computeReadability(caseA, [], {}, 'nl');
    assert.equal(stats.wordCount, 51);
    assert.equal(stats.sentenceCount, 3);
    assert.equal(stats.lix, 17);
    assert.equal(stats.brouwer, 94.3);
  });

  it('computes LIX and Brouwer for all-long polysyllabic Dutch text', () => {
    const stats = computeReadability(caseB, [], {}, 'nl');
    assert.equal(stats.lix, 117);
    assert.equal(stats.brouwer, -105.7);
  });

  it('keeps short samples at null (short-sample guard intact)', () => {
    const one = [mkSentence(['kat', 'hond', 'boek'])];
    const stats = computeReadability(one, [], {}, 'nl');
    assert.equal(stats.lix, null);
    assert.equal(stats.brouwer, null);
    assert.equal(stats.fleschDouma, null);
  });

  it('does not compute LIX/Brouwer for English', () => {
    const en = [mkSentence(wordsA.slice(0, 17)), mkSentence(wordsA.slice(17, 34)), mkSentence(wordsA.slice(34, 51))];
    const stats = computeReadability(en, [], {}, 'en');
    assert.equal(stats.lix, null);
    assert.equal(stats.brouwer, null);
    assert.notEqual(stats.fleschReadingEase, null);
  });

  it('mixed case: 3 sentences of 17 kat/auto words (auto = 5 letters, 2 syll)', () => {
    // 51 words: 17 kat (1 syll, 3 letters), 34 auto (2 syll, 4 letters)
    // ASL = 17; syllables = 17*1 + 34*2 = 85; ASW = 85/51
    // longLetterWords = 0 (kat=3, auto=4 letters, both <= 6)
    // LIX = 17; Brouwer = 195 - (2/3)*(100*85/51) - 34 = 195 - 111.111 - 34 = 49.9
    const mixed: string[] = [];
    for (let i = 0; i < 51; i++) mixed.push(i % 3 === 2 ? 'kat' : 'auto');
    const sents = [mkSentence(mixed.slice(0, 17)), mkSentence(mixed.slice(17, 34)), mkSentence(mixed.slice(34, 51))];
    const stats = computeReadability(sents, [], {}, 'nl');
    assert.equal(stats.lix, 17);
    assert.equal(stats.brouwer, 49.9);
  });
});

describe('check_dutch_b1_text LIX/Brouwer lines via real MCP server', { timeout: 30000 }, () => {
  before(async () => {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
    }));
  });
  after(async () => { await client.close(); });

  async function checkDutch(text: string): Promise<string> {
    const result = await client.callTool({ name: 'check_dutch_b1_text', arguments: { text } });
    assert.ok(!result.isError);
    return (result.content as Array<{ type: string; text?: string }>)
      .filter(i => i.type === 'text').map(i => i.text).join('\n');
  }
  async function checkEnglish(text: string): Promise<string> {
    const result = await client.callTool({ name: 'check_us_english_b1_text', arguments: { text } });
    assert.ok(!result.isError);
    return (result.content as Array<{ type: string; text?: string }>)
      .filter(i => i.type === 'text').map(i => i.text).join('\n');
  }

  const longText = Array.from({ length: 6 }, () =>
    'De gemeente heeft een onderzoek uit laten voeren naar de behoeften en kansen voor nieuwe vormen van vervoer.'
  ).join(' ');

  it('shows LIX and Brouwer lines for a >=50-word, >=3-sentence Dutch text', async () => {
    const out = await checkDutch(longText);
    assert.match(out, /- LIX: \d+\.\d \(Swedish scale 25\/30\/40\/50\/60; not validated for Dutch/);
    assert.match(out, /- Brouwer Leesindex: -?\d+\.\d \(second Dutch Flesch variant/);
  });

  it('keeps single short sentences at n/a for both formulas', async () => {
    const out = await checkDutch('De kat zit op de mat.');
    assert.match(out, /- Flesch-Douma: n\/a/);
    assert.doesNotMatch(out, /- LIX: \d/);
    assert.doesNotMatch(out, /- Brouwer Leesindex: -?\d/);
  });

  it('does not add LIX/Brouwer to the English B1 tool', async () => {
    const enText = Array.from({ length: 6 }, () =>
      'The city conducted a study into the needs and opportunities for new forms of transport.'
    ).join(' ');
    const out = await checkEnglish(enText);
    assert.doesNotMatch(out, /LIX/);
    assert.doesNotMatch(out, /Brouwer/);
  });
});
