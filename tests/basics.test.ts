import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hunspellWords } from '../src/hunspell.js';
import { extractWords } from '../src/tokenize.js';

describe('hunspell wrapper', () => {
  it('marks correct Dutch words as correct', async () => {
    const r = await hunspellWords(['pizza', 'woordenschat', 'organisatie']);
    assert.equal(r.get('pizza')?.correct, true);
    assert.equal(r.get('woordenschat')?.correct, true);
    assert.equal(r.get('organisatie')?.correct, true);
  });

  it('flags typos with suggestions', async () => {
    const r = await hunspellWords(['pizze', 'apenapen']);
    assert.equal(r.get('pizze')?.correct, false);
    assert.ok((r.get('pizze')?.suggestions ?? []).includes('pizza'));
    assert.equal(r.get('apenapen')?.correct, false);
  });

  it('handles flexies (inflections) via stemming', async () => {
    const r = await hunspellWords(['pizzaatjes', 'hardloopsters']);
    assert.equal(r.get('pizzaatjes')?.correct, true);
    assert.equal(r.get('hardloopsters')?.correct, true);
  });

  it('returns one result per unique word in order', async () => {
    const r = await hunspellWords(['boom', 'pizze', 'boom']);
    assert.equal(r.size, 2);
  });
});

describe('tokenizer', () => {
  it('extracts words and skips punctuation, numbers, URLs, emails', () => {
    const t = extractWords(
      'Beste mevrouw, mijn naam is Jan (https://example.com, jan@example.com). Ik heb 15 jaar ervaring.'
    );
    const words = t.map((x) => x.clean);
    assert.ok(words.includes('Beste'));
    assert.ok(words.includes('Jan'));
    assert.ok(!words.some((w) => w.includes('@')));
    assert.ok(!words.some((w) => /^https/.test(w)));
    assert.ok(!words.some((w) => /^\d/.test(w)));
  });

  it('keeps hyphenated and apostrophe words', () => {
    const t = extractWords("de 's morgens-gedachte en een koloniale stijl: co-creatie");
    const words = t.map((x) => x.clean);
    assert.ok(words.includes('co-creatie'));
    assert.ok(words.some((w) => w.startsWith("'") || w.includes('s')));
  });

  it('skips ALL-CAPS acronyms', () => {
    const t = extractWords('Wij ontwikkelen met HTML, CSS en JavaScript voor KMO-bedrijven.');
    const words = t.map((x) => x.clean);
    assert.ok(!words.includes('HTML'));
    assert.ok(!words.includes('KMO'));
    assert.ok(words.includes('KMO-bedrijven'));
  });
});
