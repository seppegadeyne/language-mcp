// Regression for straffesites-moonshot #183: a missing nl-zipf.tsv must
// skip the word-frequency layer with a notice, never fail the whole B1 check
// with ENOENT.
//
// Simulates the issue's exact situation: a complete install (dictionaries,
// synonyms, node_modules) where ONLY assets/frequency/ is absent — what a
// checkout of pre-merge master plus a newer dist produced there.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(__dirname, '..');
const brokenInstall = mkdtempSync(path.join(tmpdir(), 'langmcp-nozipf-'));

describe('missing nl-zipf.tsv degrades gracefully (#183)', { timeout: 30000 }, () => {
  before(() => {
    // Complete install: dist + all assets EXCEPT the frequency table.
    cpSync(path.join(repo, 'dist'), path.join(brokenInstall, 'dist'), { recursive: true });
    cpSync(path.join(repo, 'assets'), path.join(brokenInstall, 'assets'), { recursive: true });
    rmSync(path.join(brokenInstall, 'assets', 'frequency'), { recursive: true, force: true });
    symlinkSync(path.join(repo, 'node_modules'), path.join(brokenInstall, 'node_modules'), 'dir');
  });
  after(() => rmSync(brokenInstall, { recursive: true, force: true }));

  it('check_dutch_b1_text succeeds with a skipped-notice instead of ENOENT', async () => {
    const client = new Client({ name: 'nozipf-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(brokenInstall, 'dist', 'cli.js')],
      cwd: brokenInstall,
      stderr: 'pipe',
    }));
    const result = await client.callTool({
      name: 'check_dutch_b1_text',
      arguments: { text: 'De gemeente heeft een onderzoek uit laten voeren naar nieuwe vormen van vervoer.' },
    });
    assert.ok(!result.isError, `tool must not fail: ${JSON.stringify(result.content)}`);
    const body = (result.content as Array<{ type: string; text?: string }>)
      .filter(i => i.type === 'text').map(i => i.text).join('\n');
    assert.match(body, /Word frequency: skipped \(assets\/frequency\/nl-zipf\.tsv not found/);
    // Every other proxy still works in this install:
    assert.match(body, /Readability:/);
    assert.match(body, /Passive voice/);
    assert.match(body, /Nominalization density/);
    assert.match(body, /Voice consistency: OK/);
    await client.close();
  });
});
