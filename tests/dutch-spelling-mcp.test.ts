import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'dutch-spelling-test', version: '1.0.0' });

async function check(text: string, protectedTerms?: string[]): Promise<string> {
  const result = await client.callTool({
    name: 'check_dutch_text',
    arguments: { text, ...(protectedTerms ? { protected_terms: protectedTerms } : {}) },
  });
  assert.ok(!result.isError);
  return (result.content as Array<{ type: string; text?: string }>)
    .filter((item) => item.type === 'text').map((item) => item.text).join('\n');
}

describe('Dutch spelling rules through the real MCP server', { timeout: 30000 }, () => {
  before(async () => {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
    }));
  });
  after(async () => { await client.close(); });

  it('reports contextual spelling findings even when all words are known', async () => {
    const text = await check('We vragen uw btw nummer. Er staat een keuken tafel. Het auto ongeluk gebeurde op Maandag.');
    assert.match(text, /0 unknown words/);
    assert.match(text, /4 rule findings/);
    assert.match(text, /nl-compound-spacing/);
    assert.match(text, /nl-vowel-collision-hyphen/);
    assert.match(text, /nl-initialism-hyphen/);
    assert.match(text, /nl-calendar-lowercase/);
    assert.match(text, /Source: https:\/\/www\.vlaanderen\.be\/team-taaladvies\/spellingregels\//);
    assert.doesNotMatch(text, /OK:/);
  });

  it('keeps ordinary typo suggestions alongside the rule findings', async () => {
    const text = await check('Een onmiddelijk antwoord op het contact formulier.');
    assert.match(text, /onmiddelijk.*onmiddellijk/);
    assert.match(text, /contact formulier.*contactformulier/);
  });

  it('exposes and honors explicit proper-name protection', async () => {
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === 'check_dutch_text')!;
    assert.ok(tool.inputSchema.properties?.protected_terms);
    const text = await check('We lezen Afspraak op Maandag.', ['Afspraak op Maandag']);
    assert.match(text, /0 rule findings/);
  });

  it('accepts correct spellings and supported source exceptions', async () => {
    const text = await check('We vragen uw btw-nummer. Er staat een keukentafel. Het auto-ongeluk gebeurde op maandag. We eten rode kool en wachten een half uur.');
    assert.match(text, /0 unknown words/);
    assert.match(text, /0 rule findings/);
    assert.match(text, /OK:/);
  });
});
