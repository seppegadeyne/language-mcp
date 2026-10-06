import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { findDutchSpellingIssues } from '../src/dutch-spelling.js';

function matches(text: string, protectedTerms: string[] = []): string[] {
  const hits = findDutchSpellingIssues(text, { protectedTerms });
  for (const hit of hits) assert.equal(text.slice(hit.index, hit.end), hit.matched);
  return hits.map((h) => h.matched);
}

describe('Dutch spelling review regressions', () => {
  it('does not join finite separable verbs or double-object constructions', () => {
    for (const text of [
      'Als ik een offerte aanvraag, krijg ik dan snel antwoord?',
      'Wat gebeurt er nadat ik een offerte aanvraag?',
      'Zodra ik het menu uitdraai, hang ik het op.',
      'Wij bieden onze klanten service op maat.',
      'U kunt een offerte aanvragen.',
    ]) assert.deepEqual(matches(text), [], text);
  });

  it('leaves all-caps typography alone', () => {
    assert.deepEqual(matches('WE ZIJN OP MAANDAG GESLOTEN. VANAF 1 SEPTEMBER OOK OP ZATERDAG OPEN.'), []);
  });

  it('does not treat internal capitalized names as calendar cues', () => {
    for (const text of ['Ik sprak met Elke Maandag.', 'de film Elke Zondag Weer',
      'de roman Tot Maandag van Jan', 'Gesloten Op Maandag']) {
      assert.deepEqual(matches(text), [], text);
    }
  });

  it('still recognizes sentence-initial and list-initial calendar cues', () => {
    for (const text of ['Tot Maandag!', 'Op Maandag openen we.', 'Het gaat door. Elke Maandag open.',
      '- Elke Maandag open', '1. Elke Maandag open', '> Elke Maandag open']) {
      assert.deepEqual(matches(text), ['Maandag'], text);
    }
  });

  it('protects Dutch quotation mark variants', () => {
    for (const [open, close] of [['„', '”'], ['”', '”'], ['‹', '›'], ['‚', '’']]) {
      assert.deepEqual(matches(`Lees ${open}Afspraak op Maandag${close} en kom op Dinsdag.`), ['Dinsdag']);
    }
  });

  it('does not mistake abbreviated articles and possessive apostrophes for quotations', () => {
    for (const text of ['‘s morgens op Maandag staan hier auto’s.', "'s morgens op Maandag staan hier auto's."]) {
      assert.deepEqual(matches(text), ['Maandag']);
    }
  });

  it('does not mistake comparisons or arrows for HTML tags', () => {
    const text = 'Kost < 100 euro.\nEr staat een keuken tafel.\nWe komen op Maandag.\nKlik -> verder.';
    assert.deepEqual(matches(text), ['keuken tafel', 'Maandag']);
  });

  it('handles repeated less-than signs without quadratic tag scanning', () => {
    const text = '< '.repeat(40000) + 'keuken tafel';
    const start = performance.now();
    assert.deepEqual(matches(text), ['keuken tafel']);
    assert.ok(performance.now() - start < 2000, 'An 80 KB input should not block the event loop for seconds');
  });

  it('does not treat a same-line backtick span as an unclosed fence', () => {
    const text = '```npm test``` draait alle tests.\nEr staat een keuken tafel.\nWe komen op Maandag.';
    assert.deepEqual(matches(text), ['keuken tafel', 'Maandag']);
  });

  it('protects indented and blockquote fences', () => {
    for (const prefix of ['    ', '> ', '> > ']) {
      const text = `${prefix}\x60\x60\x60txt\n${prefix}keuken tafel op Maandag\n${prefix}\x60\x60\x60\nWe komen op Dinsdag.`;
      assert.deepEqual(matches(text), ['Dinsdag']);
    }
  });

  it('keeps an unclosed fence protected to the end of the input', () => {
    assert.deepEqual(matches('We komen op Dinsdag.\n```txt\nkeuken tafel op Maandag'), ['Dinsdag']);
  });

  it('matches protected terms across horizontal whitespace variants', () => {
    for (const gap of ['\u00a0', '  ', '\t']) {
      const text = `We lezen Afspraak${gap}op${gap}Maandag. We komen op Dinsdag.`;
      assert.deepEqual(matches(text, ['Afspraak op Maandag']), ['Dinsdag']);
    }
  });

  it('protects HTML titles, citations, quotations, and emphasis', () => {
    for (const tag of ['title', 'cite', 'q', 'em', 'i']) {
      assert.deepEqual(matches(`Lees <${tag}>Afspraak op Maandag</${tag}> en kom op Dinsdag.`), ['Dinsdag']);
    }
  });

  it('does not mistake identifier underscores or multiplication for emphasis', () => {
    assert.deepEqual(matches('snake_case op Maandag andere_naam'), ['Maandag']);
    assert.deepEqual(matches('2*3 keuken tafel 4*5'), ['keuken tafel']);
  });

  it('recognizes a day number with a leading zero', () => {
    assert.deepEqual(matches('We komen op 01 Mei.'), ['Mei']);
  });
});
