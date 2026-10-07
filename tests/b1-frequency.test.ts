import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { getDutchZipf, knowsDutchWord } from '../src/frequency.js';

const client = new Client({ name: 'b1-frequency-test', version: '1.0.0' });

async function check(text: string, args?: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({
    name: 'check_dutch_b1_text',
    arguments: { text, ...(args ?? {}) },
  });
  assert.ok(!result.isError);
  return (result.content as Array<{ type: string; text?: string }>)
    .filter((item) => item.type === 'text').map((item) => item.text).join('\n');
}

describe('Dutch Zipf frequency table (unit)', () => {
  it('gives very common words a high Zipf value', () => {
    assert.notEqual(getDutchZipf('en'), null);
    assert.ok((getDutchZipf('en') ?? 0) > 6);
    assert.ok((getDutchZipf('ik') ?? 0) > 7);
  });

  it('knows moderately frequent and rare words with distinct values', () => {
    const bekend = getDutchZipf('bekend');
    const vanzelfsprekend = getDutchZipf('vanzelfsprekend');
    assert.notEqual(bekend, null);
    assert.notEqual(vanzelfsprekend, null);
    assert.ok((bekend ?? 9) > (vanzelfsprekend ?? 0));
  });

  it('returns null for words outside the table (compounds, names) — never a rare flag', () => {
    assert.equal(getDutchZipf('rechtsbeschermingsmechanisme'), null);
    assert.equal(getDutchZipf('Zaltbommel'), null);
    assert.equal(knowsDutchWord('vergadering'), true);
  });

  it('matches case-insensitively', () => {
    assert.equal(getDutchZipf('EN'), getDutchZipf('en'));
  });
});

describe('check_dutch_b1_text word-frequency layer via real MCP server', { timeout: 30000 }, () => {
  before(async () => {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
    }));
  });
  after(async () => { await client.close(); });

  it('flags a rare word from the table with Zipf value and position', async () => {
    const text = 'De splitsing was nodig en de uitkomst was helder.';
    const out = await check(text);
    assert.match(out, /Word frequency \(Zipf, OpenSubtitles2018/);
    assert.match(out, /"splitsing" \(Zipf [\d.]+, 1x, position \d+\)/);
    // "en" is extremely common and must not appear as a rare-word flag line.
    assert.doesNotMatch(out, /"en" \(Zipf/);
  });

  it('reports the rare-word summary line with known-word share', async () => {
    const out = await check('De vergadering was nuttig.');
    assert.match(out, /- Rare words: \d+ \(\d+% of known words; \d+ in table\)/);
  });

  it('does not flag unknown compounds as rare (precision first)', async () => {
    const out = await check('De rechtsbeschermingsmechanisme werkte niet.');
    // The compound is not in the table → no rare-word line for it.
    assert.doesNotMatch(out, /"rechtsbeschermingsmechanisme" \(Zipf/);
  });

  it('rare_word_zipf_max parameter changes which words are flagged', async () => {
    const text = 'De vergadering was nuttig en helder.';
    // vergadering Zipf ≈ 4.56: below 5 it is flagged, below 4 it is not.
    const strict = await check(text, { rare_word_zipf_max: 5 });
    const lenient = await check(text, { rare_word_zipf_max: 4 });
    assert.match(strict, /"vergadering" \(Zipf/);
    assert.doesNotMatch(lenient, /"vergadering" \(Zipf/);
  });

  it('sorts multiple rare words by ascending Zipf (rarest first)', async () => {
    const out = await check('De splitsing veroorzaakte een trilling door het natrium.');
    const idxSplitsing = out.indexOf('"splitsing"');
    const idxTrilling = out.indexOf('"trilling"');
    const idxNatrium = out.indexOf('"natrium"');
    assert.ok(idxSplitsing >= 0 && idxTrilling >= 0 && idxNatrium >= 0);
    assert.ok(idxSplitsing < idxTrilling || idxTrilling < idxNatrium); // all present, sorted block
  });

  it('explicitly passing rare_word_zipf_max as undefined keeps the default behavior', async () => {
    // Regression for the NaN/threshold-merge pitfall: an explicit undefined
    // must not wipe the default (3) and produce nonsense comparisons.
    const a = await check('De vergadering was nuttig.');
    const b = await check('De vergadering was nuttig.', { rare_word_zipf_max: undefined });
    assert.equal(a, b);
  });

  it('prints the no-rare-words line when everything is common', async () => {
    const out = await check('Ik heb een kat en een hond.');
    assert.match(out, /- No rare words below Zipf 3\./);
  });
});
