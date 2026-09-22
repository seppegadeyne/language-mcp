import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hunspellWords } from '../src/hunspell.js';
import { findBritticisms } from '../src/britticisms.js';

describe('hunspell en_US wrapper', () => {
  it('marks correct US words as correct', async () => {
    const r = await hunspellWords(['color', 'center', 'organize', 'analyze', 'favorite'], 'en_US');
    for (const w of ['color', 'center', 'organize', 'analyze', 'favorite']) {
      assert.equal(r.get(w)?.correct, true, w);
    }
  });

  it('flags British spellings as unknown', async () => {
    const r = await hunspellWords(['colour', 'centre', 'organise', 'programme', 'enrolment'], 'en_US');
    for (const w of ['colour', 'centre', 'organise', 'programme', 'enrolment']) {
      assert.equal(r.get(w)?.correct, false, w);
    }
  });

  it('accepts real typos detection', async () => {
    const r = await hunspellWords(['recieve', 'seperate'], 'en_US');
    assert.equal(r.get('recieve')?.correct, false);
    assert.equal(r.get('seperate')?.correct, false);
  });
});

describe('britticism detector', () => {
  it('flags the straffesites guideline vocabulary', () => {
    const hits = findBritticisms(
      'We build bespoke webshops for sole traders, improving findability. Add to basket to check out.'
    );
    const matched = hits.map((h) => h.matched.toLowerCase());
    assert.ok(matched.includes('bespoke'));
    assert.ok(matched.includes('webshops'));
    assert.ok(matched.includes('sole traders'));
    assert.ok(matched.includes('findability'));
    assert.ok(matched.includes('add to basket'));
  });

  it('flags grammar words that hunspell accepts', () => {
    const hits = findBritticisms('Whilst moving towards the center, we organized everything.');
    const matched = hits.map((h) => h.matched.toLowerCase());
    assert.ok(matched.includes('whilst'), 'whilst should be flagged');
    assert.ok(matched.includes('towards'), 'towards should be flagged');
  });

  it('does not flag clean US English', () => {
    const hits = findBritticisms(
      'We build custom online stores for self-employed professionals, improving search visibility. Add to cart to check out.'
    );
    assert.equal(hits.length, 0);
  });

  it('flags common British spellings with correct US replacement', () => {
    const hits = findBritticisms('The colours of our favourite behaviour catalogue were marvellous.');
    const map = new Map(hits.map((h) => [h.matched.toLowerCase(), h.american]));
    assert.equal(map.get('colours'), 'color' + 's');
    assert.equal(map.get('favourite'), 'favorite');
    assert.equal(map.get('behaviour'), 'behavior');
    assert.equal(map.get('catalogue'), 'catalog');
    assert.equal(map.get('marvellous'), 'marvelous');
  });

  it('is case-insensitive and counts repeats', () => {
    const hits = findBritticisms('Whilst we waited. Whilst we worked.');
    const whilst = hits.find((h) => h.matched.toLowerCase() === 'whilst');
    assert.ok(whilst);
  });

  it('does not false-positive on US words containing British substrings', () => {
    const hits = findBritticisms('The historian analyzed the center of the organization.');
    assert.equal(hits.length, 0);
  });
});
