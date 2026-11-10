// MCP-level tests for the French tools, run against the SOURCE server
// (src/cli.ts) through the SDK stdio client with a scrubbed environment (no
// LANG/LC_*), exactly what production clients do.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'french-test', version: '1.0.0' });
const dir = mkdtempSync(path.join(tmpdir(), 'langmcp-fr-'));

async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text?: string }>)
    .filter((i) => i.type === 'text').map((i) => i.text).join('\n');
  return { text, isError: result.isError === true };
}

const spell = (text: string, extra: Record<string, unknown> = {}) => call('check_french_text', { text, ...extra });
const b1 = (text: string, extra: Record<string, unknown> = {}) => call('check_french_b1_text', { text, ...extra });

// 10 sentences of 6 monosyllabic words: ASL 6, ASW 1 -> 207 - 6.09 - 73.6 = 127.3
const CAT = Array(10).fill('Le chat dort sur le lit.').join(' ');
// 5 x "Le chat dort sur le lit." + 5 x "Nous installons une ligne de vie." -> 115.0
const MIXED = [...Array(5).fill('Le chat dort sur le lit.'), ...Array(5).fill('Nous installons une ligne de vie.')].join(' ');

describe('French tools over MCP (scrubbed env, source server)', { timeout: 120000 }, () => {
  before(async () => {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'src/cli.ts'],
      cwd: path.resolve(__dirname, '..'),
      stderr: 'pipe',
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    }));
  });
  after(async () => {
    await client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers the three French tools with the shared check parameters', async () => {
    const tools = (await client.listTools()).tools;
    const names = tools.map((t) => t.name);
    for (const n of ['check_french_text', 'check_french_b1_text', 'validate_french_word']) assert.ok(names.includes(n), n);
    const props = (n: string) => Object.keys((tools.find((t) => t.name === n)!.inputSchema as { properties: object }).properties).sort();
    const shared = ['end', 'expected_sha256', 'path', 'start', 'text'];
    for (const p of shared) assert.ok(props('check_french_text').includes(p), p);
    assert.ok(props('check_french_text').includes('protected_terms'));
    assert.ok(props('check_french_b1_text').includes('voice'));
    assert.ok(props('check_french_b1_text').includes('warn_sentence_words'));
    assert.ok(props('check_french_b1_text').includes('max_sentence_words'));
    assert.equal(tools.find((t) => t.name === 'check_french_b1_text')!.description?.includes('not a validated B1 verdict'), true);
  });

  describe('check_french_text', () => {
    it('finds real misspellings with suggestions and exact positions', async () => {
      const text = 'La sécurté est notre priorité. Nos antichutte sont testés.';
      const r = await spell(text);
      assert.ok(!r.isError);
      assert.match(r.text, /- sécurté → sécurité(?:, [^(]*)? \(position 3\)/);
      assert.match(r.text, /- antichutte → .* \(position 35\)/);
      assert.equal(text.indexOf('sécurté'), 3);
      assert.equal(text.indexOf('antichutte'), 35);
      assert.match(r.text, /2 unknown words/);
    });

    it('reports a correct trade-vocabulary sentence without flags', async () => {
      const r = await spell("Nous installons des lignes de vie et des points d'ancrage conformes à la norme EN 795.");
      assert.ok(!r.isError);
      assert.match(r.text, /0 unknown words/);
      assert.match(r.text, /OK: no unknown words found/);
    });

    it('accepts elisions with straight and typographic apostrophes', async () => {
      const words = [
        "l'ancrage", "d'un", "qu'il", "j'ai", "n'est", "s'il", "c'est", "m'a", "t'a",
        "jusqu'à", "lorsqu'on", "puisqu'il", "quelqu'un", "aujourd'hui", "L'Ancrage",
      ];
      const text = [...words, ...words.map((w) => w.replace(/'/g, '’'))].join(' ');
      const r = await spell(text);
      assert.ok(!r.isError, r.text);
      assert.match(r.text, /0 unknown words/);
    });

    it('still flags a misspelling inside an elided word, with the typographic apostrophe intact', async () => {
      const text = 'Voici l’ancrrage et l\'ancrrage.';
      const r = await spell(text);
      assert.match(r.text, /l’ancrrage/);
      assert.match(r.text, /l'ancrrage/);
      assert.match(r.text, /2 unknown words/);
    });

    it('does not report elided acronyms such as l\'ADN or d\'IA, but still reports the word after other elisions', async () => {
      const r = await spell("Le test de l'ADN, d'IA et de l'EN795.");
      assert.match(r.text, /0 unknown words/);
    });

    it('accepts hyphenated words and both spelling systems', async () => {
      const r = await spell('Le garde-corps, peut-être avez-vous une ligne-de-vie. Un évènement ou événement, un ognon ou oignon.');
      assert.ok(!r.isError);
      assert.match(r.text, /0 unknown words/);
    });

    it('keeps positions exact with non-breaking spaces before ; : ? !', async () => {
      const text = 'Avez-vous besoin\u00a0? Peut-être\u00a0; garde-corps\u00a0: oui\u00a0! Ensuite xyzqrw arrive\u202f?';
      const r = await spell(text);
      const position = text.indexOf('xyzqrw');
      assert.match(r.text, new RegExp(`- xyzqrw → .*\\(position ${position}\\)`));
      assert.match(r.text, /1 unknown words/);
    });

    it('works with a scrubbed environment: accents are not mangled', async () => {
      const r = await spell("Nous vérifions l'été à Noël, où ça sert. Âge, hôtel, cœur, œuvre, naïf.");
      assert.ok(!r.isError);
      assert.match(r.text, /0 unknown words/);
      assert.doesNotMatch(r.text, /count mismatch/);
    });

    it('skips protected terms (case-sensitive, flexible spaces) and says so', async () => {
      const r = await spell('Skylotecz Pro\u00a0Max fait des ancragess.', { protected_terms: ['Skylotecz Pro Max'] });
      assert.match(r.text, /words skipped inside protected terms/);
      assert.match(r.text, /- ancragess/);
      assert.doesNotMatch(r.text, /- Skylotecz/);
      const unprotected = await spell('skylotecz Pro Max.', { protected_terms: ['Skylotecz Pro Max'] });
      assert.match(unprotected.text, /- skylotecz/);
    });

    it('prints context and the Input line with input_sha256', async () => {
      const text = 'Bonjour.';
      const r = await spell(text, { context: 'page test' });
      assert.match(r.text, /^French spell check/);
      assert.match(r.text, /Context: page test/);
      const sha = createHash('sha256').update(text).digest('hex');
      assert.match(r.text, new RegExp(`Input: inline text, 8 code points, input_sha256 ${sha}`));
    });

    it('reads a file with a code-point range and an expected hash (UTF-16 positions relative to the range)', async () => {
      const file = path.join(dir, 'page.md');
      const content = '😀 Bonjour sécurté.\n';
      writeFileSync(file, content);
      const sha = createHash('sha256').update(content).digest('hex');
      const whole = await call('check_french_text', { path: file, expected_sha256: sha });
      assert.ok(!whole.isError, whole.text);
      assert.match(whole.text, new RegExp(`file_sha256 ${sha}`));
      // The emoji is one code point but two UTF-16 units: sécurté starts at 11.
      assert.match(whole.text, /sécurté[^\n]*\(position 11\)/);
      const ranged = await call('check_french_text', { path: file, start: 2, end: 18 });
      assert.match(ranged.text, /range \[2, 18\)/);
      assert.match(ranged.text, /sécurté[^\n]*\(position 8\)/);
      const bad = await call('check_french_text', { path: file, expected_sha256: 'a'.repeat(64) });
      assert.equal(bad.isError, true);
    });

    it('fails closed with INCOMPLETE after the word cap', async () => {
      const r = await spell(Array(20001).fill('chat').join(' '));
      assert.equal(r.isError, true);
      assert.match(r.text, /INCOMPLETE: spelling stopped after 20000 words/);
    });
  });

  describe('validate_french_word', () => {
    it('accepts correct words with either apostrophe and rejects typos with suggestions', async () => {
      assert.match((await call('validate_french_word', { word: "aujourd'hui" })).text, /is spelled correctly/);
      assert.match((await call('validate_french_word', { word: 'aujourd’hui' })).text, /is spelled correctly/);
      const bad = await call('validate_french_word', { word: 'sécurté' });
      assert.match(bad.text, /is NOT correct\. Suggestions: sécurité/);
    });
  });

  describe('check_french_b1_text', () => {
    it('computes Kandel & Moles exactly on hand-calculated texts', async () => {
      const a = await b1(CAT);
      assert.ok(!a.isError, a.text);
      assert.match(a.text, /^French B1 plain-language check \(B1 proxies, not a validated B1 verdict\)/);
      assert.match(a.text, /- Kandel & Moles: 127\.3 \(band: easier than B1; B1 target 60-70/);
      assert.match(a.text, /- Words: 60, sentences: 10, avg 6 words\/sentence/);
      const b = await b1(MIXED);
      assert.match(b.text, /- Kandel & Moles: 115 \(band: easier than B1/);
    });

    it('honors the band minimum parameter', async () => {
      const r = await b1(MIXED, { kandel_moles_min: 40 });
      assert.match(r.text, /Kandel & Moles: 115 \(band: easier than B1; B1 target 40-70/);
    });

    it('applies the sentence limits as parameters (defaults warn 20, flag 25)', async () => {
      const def = await b1(CAT);
      assert.match(def.text, /Sentences over 20 words: 0 \(0 over 25\)/);
      const tight = await b1(CAT, { warn_sentence_words: 5, max_sentence_words: 5 });
      assert.match(tight.text, /Sentences over 5 words: 10 \(10 over 5\)/);
      assert.match(tight.text, /6 words: "Le chat dort sur le lit\." \(position 0\)/);
      const long = 'Le chat dort ' + Array(24).fill('très').join(' ') + ' bien.';
      const flagged = await b1(long);
      assert.match(flagged.text, /Sentences over 20 words: 1 \(1 over 25\)/);
    });

    it('applies the short-text guard', async () => {
      const r = await b1('Bonjour, merci pour votre visite.');
      assert.match(r.text, /Kandel & Moles: n\/a \(sample below 50 words/);
      assert.doesNotMatch(r.text, /Kandel & Moles: \d/);
    });

    it('detects passive constructions and skips être-compound tenses', async () => {
      const r = await b1("Les points d'ancrage sont installés par nos techniciens. Il est arrivé hier. Elle s'est blessée. Les lignes ont été contrôlées.");
      assert.match(r.text, /- "sont installés" \(\+ par agent\) — "Les points d'ancrage sont installés par nos techniciens\." \(position 0\)/);
      assert.match(r.text, /- "ont été contrôlées"/);
      assert.doesNotMatch(r.text, /arrivé/);
      assert.doesNotMatch(r.text, /blessée/);
    });

    it('flags tu forms when voice is vous, but not vous copy', async () => {
      const tu = await b1('Tu peux appeler et ton devis arrive vite.');
      assert.match(tu.text, /Voice consistency: tu-forms used 2x \(expected vous\), first at position 0: ton \(1x\), tu \(1x\)/);
      assert.match(tu.text, /- "tu" \(position 0\)/);
      const vous = await b1('Vous pouvez appeler et votre devis arrive vite.');
      assert.match(vous.text, /Voice consistency: OK \(expected vous; vous-forms 2x, tu-forms 0x\)/);
      assert.doesNotMatch(vous.text, /tu-forms used/);
    });

    it('defaults to vous and supports voice tu (the reverse check)', async () => {
      const r = await b1('Vous pouvez appeler.', { voice: 'tu' });
      assert.match(r.text, /Voice consistency: vous-forms used 1x \(expected tu\), first at position 0/);
      const mixed = await b1('Tu peux appeler. Vous recevez votre devis.');
      assert.match(mixed.text, /Voice consistency: MIXED \(expected vous\): tu-forms 1x at position 0 \(tu \(1x\)\), vous-forms 2x at position \d+/);
    });

    it('reports quoted tu forms separately', async () => {
      const r = await b1('Un client écrit : « Tu as sauvé mon chantier. » Vous êtes rapides.');
      assert.match(r.text, /Voice consistency: OK/);
      assert.match(r.text, /\(1 more inside quotations, not counted\)/);
    });

    it('counts one-letter words and finds "a été" + participle', async () => {
      const r = await b1('Le rapport a été envoyé à la direction. Il y a un ami à Paris.');
      assert.match(r.text, /- Words: 15, sentences: 2/);
      assert.match(r.text, /- "a été envoyé" — "Le rapport a été envoyé à la direction\."/);
    });

    it('does not read "est plus" or "est lui" as a passive', async () => {
      const r = await b1('Ce produit est plus sûr. Le client est lui aussi content. Je suis ici, puis je pars.');
      assert.match(r.text, /Passive voice[^\n]*\n- None detected\./);
    });

    it('applies protected_terms the same way in the Dutch and English spelling tools', async () => {
      const nl = await call('check_dutch_text', { text: 'Het harnas van Skylotecz Pro is sterk. Een skylotecz is dat niet.', protected_terms: ['Skylotecz Pro'] });
      assert.match(nl.text, /2 words skipped inside protected terms/);
      assert.match(nl.text, /1 unknown words/);
      assert.match(nl.text, /- skylotecz /);
      const en = await call('check_us_english_text', { text: 'We met at the Whilst Labz studio. We wait whilst it loads.', protected_terms: ['Whilst Labz'] });
      assert.match(en.text, /2 words skipped inside protected terms/);
      assert.match(en.text, /0 unknown, 1 British forms/);
      assert.match(en.text, /"whilst" → "while" \(position 42\)/);
      const plain = await call('check_us_english_text', { text: 'The color is nice.' });
      assert.doesNotMatch(plain.text, /protected/);
    });

    it('returns a clear error for an empty word', async () => {
      for (const tool of ['validate_french_word', 'validate_dutch_word', 'validate_us_english_word']) {
        for (const word of ['  ', '—', '×']) {
          const r = await call(tool, { word });
          assert.ok(r.isError);
          assert.match(r.text, /^Input error: word is empty or has no letters/);
        }
      }
    });

    it('survives a scrubbed environment with accents and NBSP before punctuation', async () => {
      const r = await b1('Où est la hôtellerie\u00a0? Très bien\u00a0! Les déjà-vus sont analysés.');
      assert.ok(!r.isError, r.text);
      assert.doesNotMatch(r.text, /count mismatch/);
    });
  });
});
