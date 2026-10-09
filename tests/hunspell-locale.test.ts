// Regression for the locale bug behind voltti issue run 2026-10-09
// ("hunspell -m response count mismatch ... NOT_ASSESSABLE"):
//
// MCP clients (Python and TypeScript SDK StdioClientTransport) launch this
// server with a sanitized environment that omits LANG and LC_*. hunspell then
// converts UTF-8 input through ANSI_X3.4-1968: accented letters are mangled,
// "wél" splits into two -m morphology blocks (breaking the block-count
// contract and failing the whole B1 check), and "België" becomes a bogus
// unknown word with garbage suggestions in -a mode.
//
// The server must force a UTF-8 locale for its hunspell children regardless
// of the inherited environment.
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { utf8SpawnEnv } from '../src/hunspell.js';

// Text containing accented words that split or mangle under a non-UTF-8
// locale: "wél" (adverb, acute accent) and "België" (diaeresis).
const ACCENT_TEXT = 'Wat een AI-agent in je klantenservice wél doet, is de eerste lijn opvangen. Onze klanten zitten in België en Nederland.';

describe('utf8SpawnEnv helper (unit)', () => {
  const saved = { ...process.env };

  it('adds LC_ALL=C.UTF-8 when the environment has no UTF-8 locale', () => {
    delete process.env.LC_ALL;
    delete process.env.LC_CTYPE;
    delete process.env.LANG;
    const env = utf8SpawnEnv();
    assert.match(env.LC_ALL ?? '', /UTF-?8/i);
  });

  it('keeps an inherited UTF-8 locale untouched', () => {
    process.env.LANG = 'en_US.UTF-8';
    const env = utf8SpawnEnv();
    assert.equal(env, process.env);
    assert.equal(env.LC_ALL, undefined);
  });

  it('overrides a non-UTF-8 inherited locale', () => {
    process.env.LANG = 'C';
    delete process.env.LC_ALL;
    const env = utf8SpawnEnv();
    assert.match(env.LC_ALL ?? '', /UTF-?8/i);
  });

  it('restores the environment', () => {
    process.env.LC_ALL = saved.LC_ALL;
    process.env.LC_CTYPE = saved.LC_CTYPE;
    process.env.LANG = saved.LANG;
    assert.equal(process.env.LANG, saved.LANG);
  });
});

describe('check_dutch_b1_text under a sanitized client environment', { timeout: 30000 }, () => {
  const client = new Client({ name: 'locale-regression-test', version: '1.0.0' });

  before(async () => {
    // Explicit env WITHOUT LANG/LC_*: exactly what SDK stdio clients pass to
    // server children by default (the production failure condition).
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    }));
  });
  after(async () => { await client.close(); });

  it('succeeds on accented text instead of a count mismatch (wél no longer splits)', async () => {
    const result = await client.callTool({
      name: 'check_dutch_b1_text',
      arguments: { text: ACCENT_TEXT },
    });
    const body = (result.content as Array<{ type: string; text?: string }>)
      .filter((i) => i.type === 'text').map((i) => i.text).join('\n');
    assert.ok(!result.isError, `tool must not fail: ${body}`);
    assert.doesNotMatch(body, /count mismatch/);
    assert.match(body, /Dutch B1 simplicity check/);
    assert.match(body, /Passive voice/);
  });

  it('spell check keeps accented words intact (no ANSI-mangled suggestions)', async () => {
    const result = await client.callTool({
      name: 'check_dutch_text',
      arguments: { text: ACCENT_TEXT },
    });
    assert.ok(!result.isError);
    const body = (result.content as Array<{ type: string; text?: string }>)
      .filter((i) => i.type === 'text').map((i) => i.text).join('\n');
    assert.doesNotMatch(body, /count mismatch/);
    // "België" is a known word under a UTF-8 locale; under ANSI it surfaced as
    // "Belgi" with garbage suggestions (Bilge, Belg, Belga).
    assert.doesNotMatch(body, /Belgi[^ë]/);
    assert.match(body, /words checked/);
  });
});
