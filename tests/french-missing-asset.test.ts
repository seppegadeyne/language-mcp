// A missing French dictionary must give a clear error from the spelling tools
// and let the B1 tool degrade (passive layer skipped, other proxies intact),
// never crash the server or return a misleading "OK".
//
// Like tests/b1-missing-asset.test.ts, this simulates a stale install: the
// built dist plus every asset EXCEPT assets/fr.dic and assets/fr.aff.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(__dirname, '..');
const brokenInstall = mkdtempSync(path.join(tmpdir(), 'langmcp-nofr-'));
// A system fr_FR dictionary would legitimately take over as the fallback.
const systemFr = ['/usr/share/hunspell/fr_FR', '/usr/share/hunspell/fr', '/usr/share/myspell/fr_FR']
  .some((p) => existsSync(p + '.dic') && existsSync(p + '.aff'));

describe('missing French dictionary', { timeout: 60000 }, () => {
  const client = new Client({ name: 'nofr-test', version: '1.0.0' });
  before(async () => {
    cpSync(path.join(repo, 'dist'), path.join(brokenInstall, 'dist'), { recursive: true });
    cpSync(path.join(repo, 'assets'), path.join(brokenInstall, 'assets'), { recursive: true });
    rmSync(path.join(brokenInstall, 'assets', 'fr.dic'), { force: true });
    rmSync(path.join(brokenInstall, 'assets', 'fr.aff'), { force: true });
    symlinkSync(path.join(repo, 'node_modules'), path.join(brokenInstall, 'node_modules'), 'dir');
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [path.join(brokenInstall, 'dist', 'cli.js')],
      cwd: brokenInstall,
      stderr: 'pipe',
    }));
  });
  after(async () => {
    await client.close();
    rmSync(brokenInstall, { recursive: true, force: true });
  });

  const run = async (name: string, args: Record<string, unknown>) => {
    const r = await client.callTool({ name, arguments: args });
    const text = (r.content as Array<{ type: string; text?: string }>).map((i) => i.text).join('\n');
    return { text, isError: r.isError === true };
  };

  it('check_french_text and validate_french_word return a clear error', async () => {
    const spell = await run('check_french_text', { text: 'Bonjour le monde.' });
    const word = await run('validate_french_word', { word: 'bonjour' });
    if (systemFr) {
      assert.equal(spell.isError, false);
      assert.equal(word.isError, false);
    } else {
      assert.equal(spell.isError, true);
      assert.match(spell.text, /^French dictionary not found: expected assets\/fr\.dic and assets\/fr\.aff/);
      assert.doesNotMatch(spell.text, /Input:/);
      assert.equal(word.isError, true);
      assert.match(word.text, /French dictionary not found/);
    }
  });

  it('check_french_b1_text degrades: passive layer skipped, other proxies still run', async () => {
    const r = await run('check_french_b1_text', { text: 'Tu peux appeler. Bonjour.' });
    assert.equal(r.isError, false, r.text);
    assert.match(r.text, /Readability:/);
    assert.match(r.text, /Voice consistency: tu-forms used 1x/);
    if (!systemFr) assert.match(r.text, /Passive voice[^\n]*\n- skipped \(French dictionary not found/);
  });

  it('the other languages are unaffected', async () => {
    const r = await run('check_dutch_text', { text: 'Dit is een zin.' });
    assert.equal(r.isError, false);
    assert.match(r.text, /0 unknown words/);
  });
});
