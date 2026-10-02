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

  it('handles inflections via stemming', async () => {
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

  it('skips bare domain names like Verhuurwinkel.nl', () => {
    const t = extractWords('Je reserveert via Verhuurwinkel.nl of example.com/beamers vandaag.');
    const words = t.map((x) => x.clean);
    assert.ok(!words.includes('nl'));
    assert.ok(!words.includes('com'));
    assert.ok(!words.some((w) => w.includes('Verhuurwinkel')));
    assert.ok(words.includes('reserveert'));
    assert.ok(words.includes('vandaag'));
  });

  it('reports each token at its own offset, not the first substring match', () => {
    // indexOf('red') would point inside "hundred"; offsets must be exact.
    const text = 'A hundred red cars, and the red one.';
    const reds = extractWords(text).filter((t) => t.clean === 'red');
    assert.equal(reds.length, 2);
    for (const r of reds) assert.equal(text.slice(r.index, r.index + 3), 'red');
    assert.notEqual(reds[0].index, text.indexOf('red'));
  });

  it('keeps offsets valid after stripped URLs and domains', () => {
    const text = 'Zie https://example.com/x en Verhuurwinkel.nl voor pizze.';
    const tok = extractWords(text).find((t) => t.clean === 'pizze')!;
    assert.equal(text.slice(tok.index, tok.index + 5), 'pizze');
  });

  it('does not treat "word.common" as a domain name', () => {
    const words = extractWords('This is uncommon.common sense').map((t) => t.clean);
    assert.ok(words.includes('common'));
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
