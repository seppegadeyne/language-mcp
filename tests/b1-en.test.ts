import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllablesEn } from '../src/syllables-en.js';
import { analyzeProse } from '../src/prose.js';
import { computeReadability, fleschReadingEaseBand } from '../src/readability.js';
import { findB1HitsEn, findNominalizationsEn, analyzeAddressEn } from '../src/b1rules-en.js';
import { detectPassivesEn, isPastParticipleEn } from '../src/passive-en.js';
import { hunspellMorph } from '../src/passive.js';

describe('English syllables', () => {
  it('matches CMU Pronouncing Dictionary counts for common words', () => {
    // Reference counts from cmudict; the heuristic agrees on ~94% of the
    // 10,000 most common US English words, these are anchored cases.
    const cases: Record<string, number> = {
      the: 1, make: 1, makes: 1, table: 2, tables: 2, simple: 2, boxes: 2,
      pages: 2, liked: 1, wanted: 2, needed: 2, being: 2, idea: 3, area: 3,
      radio: 3, video: 3, client: 2, player: 2, fire: 2, hour: 2, quick: 1,
      league: 1, statement: 2, useful: 2, something: 2, likely: 2, yes: 1,
      young: 1, application: 4, information: 4, readability: 5, everyone: 3,
      create: 2, people: 2, decision: 3,
    };
    const wrong = Object.entries(cases)
      .filter(([w, n]) => countSyllablesEn(w) !== n)
      .map(([w, n]) => `${w}: got ${countSyllablesEn(w)}, expected ${n}`);
    assert.deepEqual(wrong, []);
  });

  it('documents a known miss: silent internal vowels', () => {
    // "business" is 2 syllables (BIZ-ness); vowel-group counting gives 3.
    // Such misses average out over running prose (bias about -1.3%).
    assert.equal(countSyllablesEn('business'), 3);
  });

  it('counts vowel-less acronyms as one syllable', () => {
    assert.equal(countSyllablesEn('html'), 1);
    assert.equal(countSyllablesEn('pdf'), 1);
  });
});

describe('English prose splitting', () => {
  it('keeps English abbreviations inside one sentence', () => {
    const text = 'Mr. Smith met Dr. Jones at 9 a.m. on Jan. 5, e.g. for lunch. Then they left.';
    const { sentences } = analyzeProse(text, 'en');
    assert.equal(sentences.length, 2);
    assert.ok(sentences[0].text.includes('lunch'));
  });

  it('ends a sentence on "no." because "no" is not treated as an abbreviation', () => {
    const { sentences } = analyzeProse('The answer is no. We tried again.', 'en');
    assert.equal(sentences.length, 2);
  });

  it('splits after a closing curly quote', () => {
    const { sentences } = analyzeProse('She said “Stop.” Then she left the room.', 'en');
    assert.equal(sentences.length, 2);
  });
});

describe('English readability', () => {
  const plain =
    'You can apply online. Fill in the form before the deadline. We check every application within two weeks. If we need more information, we email you. You pay the fee when you apply. We decide within a month and tell you why. Call us on weekdays between 9 and 5. Our team is happy to help you.';
  const dense =
    'In order to facilitate the processing of applications, it is essential that applicants utilize the online portal prior to the deadline. Applications that are submitted after the deadline will not be considered by the committee. The implementation of the new procedure was approved by the board in March. Due to the fact that the system is undergoing maintenance, additional delays may be experienced by customers.';

  it('computes Flesch Reading Ease and Flesch-Kincaid for English', () => {
    const a = computeReadability(analyzeProse(plain, 'en').sentences, [55], {}, 'en');
    const b = computeReadability(analyzeProse(dense, 'en').sentences, [70], {}, 'en');
    assert.ok(a.fleschReadingEase !== null && b.fleschReadingEase !== null);
    assert.equal(a.fleschDouma, null, 'no Dutch formula on English text');
    assert.ok(a.fleschReadingEase! > 70, `plain text should be easy, got ${a.fleschReadingEase}`);
    assert.ok(b.fleschReadingEase! < 50, `dense text should be hard, got ${b.fleschReadingEase}`);
    assert.ok(b.fleschKincaidGrade! > a.fleschKincaidGrade!);
    assert.equal(a.longWordSyllables, 3);
  });

  it('uses the English sentence-length defaults (warn >20, flag >25)', () => {
    const s22 = 'One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo.';
    const stats = computeReadability(analyzeProse(s22, 'en').sentences, [22], {
      maxSentenceWords: undefined,
      warnSentenceWords: undefined,
    }, 'en');
    assert.equal(stats.longSentences, 1);
    assert.equal(stats.veryLongSentences, 0);
  });

  it('bands Flesch Reading Ease scores with a configurable minimum', () => {
    assert.equal(fleschReadingEaseBand(65), 'b1');
    assert.equal(fleschReadingEaseBand(80), 'above-b1');
    assert.equal(fleschReadingEaseBand(55), 'below-b1');
    assert.equal(fleschReadingEaseBand(40), 'hard');
    assert.equal(fleschReadingEaseBand(55, 50), 'b1');
  });
});

describe('English plain-language rules', () => {
  it('flags jargon, wordy phrases, and hidden verbs with plain alternatives', () => {
    const hits = findB1HitsEn(
      'In order to facilitate this, we will make a decision prior to launch and utilize the new tool.'
    );
    const byWord = new Map(hits.map((h) => [h.matched.toLowerCase(), h]));
    assert.equal(byWord.get('in order to')?.category, 'wordy');
    assert.equal(byWord.get('in order to')?.plain, 'to');
    assert.equal(byWord.get('facilitate')?.category, 'jargon');
    assert.equal(byWord.get('make a decision')?.category, 'hidden-verb');
    assert.equal(byWord.get('make a decision')?.plain, 'decide');
    assert.equal(byWord.get('prior to')?.plain, 'before');
    assert.equal(byWord.get('utilize')?.plain, 'use');
  });

  it('reports positions into the original text', () => {
    const text = 'We often utilize it.';
    const hit = findB1HitsEn(text).find((h) => h.matched === 'utilize')!;
    assert.equal(text.slice(hit.index, hit.index + 7), 'utilize');
  });

  it('flags filler words and idioms', () => {
    const hits = findB1HitsEn('Basically, we should touch base and pick the low-hanging fruit.');
    const cats = hits.map((h) => h.category);
    assert.ok(cats.includes('filler'));
    assert.ok(cats.filter((c) => c === 'idiom').length >= 2);
  });

  it('does not flag plain copy', () => {
    const hits = findB1HitsEn('You can apply online. We check every application within two weeks.');
    assert.deepEqual(hits, []);
  });

  it('does not report jargon nested inside a hidden-verb phrase twice', () => {
    const hits = findB1HitsEn('Our staff provide assistance every day.');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].category, 'hidden-verb');
  });

  it('measures nominalization density and skips everyday nouns', () => {
    const rep = findNominalizationsEn('The implementation and evaluation of the documentation took time at the station.', 12);
    const words = rep.top.map((t) => t.word);
    assert.ok(words.includes('implementation'));
    assert.ok(!words.includes('station'));
    assert.equal(rep.total, 3);
  });

  it('reports third-person references to the reader', () => {
    const rep = analyzeAddressEn('Users must log in. The customer receives an email.');
    assert.equal(rep.youCount, 0);
    assert.equal(rep.readerRefs, 2);
    const direct = analyzeAddressEn("You log in, and you'll get an email.");
    assert.equal(direct.readerRefs, 0);
    assert.equal(direct.youCount, 2);
  });
});

describe('English passive voice', () => {
  it('recognizes regular and irregular participles via hunspell -m', async () => {
    const morph = await hunspellMorph(['created', 'stopped', 'reviewed', 'hundred', 'red', 'need'], 'en_US');
    assert.ok(isPastParticipleEn('created', morph.get('created')));
    assert.ok(isPastParticipleEn('stopped', morph.get('stopped')));
    assert.ok(isPastParticipleEn('reviewed', morph.get('reviewed')));
    assert.ok(isPastParticipleEn('written', undefined));
    assert.equal(isPastParticipleEn('hundred', morph.get('hundred')), false);
    assert.equal(isPastParticipleEn('red', morph.get('red')), false);
  });

  it('skips hyphenated words so the -m block count stays aligned', async () => {
    const morph = await hunspellMorph(['data-driven', 'created'], 'en_US');
    assert.equal(morph.has('data-driven'), false);
    assert.ok(morph.get('created')?.flags.has('D'));
  });

  it('detects be- and get-passives with a by agent', async () => {
    const text = 'The report was written by our team. The files get deleted every night. Your data is never sold.';
    const hits = await detectPassivesEn(analyzeProse(text, 'en').sentences);
    assert.equal(hits.length, 3);
    assert.equal(hits[0].participle, 'written');
    assert.equal(hits[0].withBy, true);
    assert.equal(hits[1].kind, 'get-passive');
    assert.equal(hits[2].participle, 'sold');
  });

  it('handles pronoun contractions but not possessives', async () => {
    const hits = await detectPassivesEn(analyzeProse("It's built on open data. The company's tools help.", 'en').sentences);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].aux, "It's");
  });

  it('does not flag active sentences or "used to"', async () => {
    const text = 'We send the letter tomorrow. She is used to long hours. The answer is red.';
    const hits = await detectPassivesEn(analyzeProse(text, 'en').sentences);
    assert.equal(hits.length, 0);
  });

  it('marks adjectival participles as low confidence', async () => {
    const hits = await detectPassivesEn(analyzeProse('The office is located downtown.', 'en').sentences);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].confidence, 'low');
  });
});
