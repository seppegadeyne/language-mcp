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

  it('detects actual typos', async () => {
    const r = await hunspellWords(['recieve', 'seperate'], 'en_US');
    assert.equal(r.get('recieve')?.correct, false);
    assert.equal(r.get('seperate')?.correct, false);
  });

  it('handles hyphenated compounds without response-block misalignment', async () => {
    // hunspell -a returns one response line per hyphen-separated part, so a
    // plain 1:1 line zip used to throw "response count mismatch" here.
    const r = await hunspellWords(
      ['data-driven', 'non-overlapping', 'long-tail', 'foobared-bazqux', 'guesswork'],
      'en_US'
    );
    assert.equal(r.size, 5);
    assert.equal(r.get('data-driven')?.correct, true);
    assert.equal(r.get('non-overlapping')?.correct, true);
    assert.equal(r.get('long-tail')?.correct, true);
    assert.equal(r.get('foobared-bazqux')?.correct, false);
    assert.ok((r.get('foobared-bazqux')?.suggestions.length ?? 0) > 0);
    assert.equal(r.get('guesswork')?.correct, true);
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

  it('builds correct US forms for fulfil, nappies, and mobile phones', () => {
    const map = new Map(findBritticisms('We fulfil and fulfils; fulfilment. Nappies, mobile phones.').map((h) => [h.matched, h.american]));
    assert.equal(map.get('fulfil'), 'fulfill');
    assert.equal(map.get('fulfils'), 'fulfills');
    assert.equal(map.get('fulfilment'), 'fulfillment');
    assert.equal(map.get('Nappies'), 'diapers');
    assert.equal(map.get('mobile phones'), 'cell phones');
    // fulfilled/fulfilling are already US spellings
    assert.deepEqual(findBritticisms('Orders fulfilled, fulfilling more.'), []);
  });

  it('leaves words alone that are ordinary US English in another sense', () => {
    const text = 'The new checkout lifts conversion. Read our blog post about local SEO. We hired staff and brought up the issue. '
      + 'Requests are queued. A crisp look, tax brackets, before the holiday season, open dialogue with clients. '
      + 'Two analyses were run. Boot from an SD card. A flat roof on the building. It came to a full stop. Jumper cables.';
    assert.deepEqual(findBritticisms(text).map((h) => h.matched), []);
  });

  it('builds real US words for inflected and phrase forms', () => {
    const text = 'She catalogued it, manoeuvred the van into the car park, added to basket, two storeys, a flat to rent, car hire, the dialogue box, the telly.';
    assert.deepEqual(findBritticisms(text).map((h) => `${h.matched}→${h.american}`), [
      'catalogued→cataloged', 'dialogue box→dialog box', 'manoeuvred→maneuvered', 'storeys→stories', 'added to basket→added to cart',
      'flat to rent→apartment for rent', 'car park→parking lot', 'car hire→car rental', 'telly→TV',
    ]);
  });

  it('skips matches inside a protected span before counting', () => {
    const hits = findBritticisms('Whilst Labs opens whilst we wait.', (start) => start === 0);
    assert.deepEqual(hits.map((h) => h.index), [18]);
  });

  it('does not false-positive on US words containing British substrings', () => {
    const hits = findBritticisms('The historian analyzed the center of the organization.');
    assert.equal(hits.length, 0);
  });
});
