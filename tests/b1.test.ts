import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables } from '../src/syllables.js';
import { analyzeProse, stripNonProse, protectAbbreviations, splitSentences, wordTokens } from '../src/prose.js';
import { computeReadability, fleschDoumaBand } from '../src/readability.js';
import { findB1Hits, findNominalizations, analyzeVoice } from '../src/b1rules.js';
import { detectPassives, hunspellMorph, isPastParticiple } from '../src/passive.js';

describe('syllables', () => {
  it('counts basic Dutch words correctly', () => {
    assert.equal(countSyllables('kat'), 1);
    assert.equal(countSyllables('boom'), 1);
    assert.equal(countSyllables('water'), 2);
    assert.equal(countSyllables('boek'), 1);
    assert.equal(countSyllables('lezen'), 2);
    assert.equal(countSyllables('moeite'), 2);
  });
});

describe('prose', () => {
  it('strips code and URLs length-preserving', () => {
    const text = 'Zie https://example.com/x voor `code` en meer uitleg.';
    const stripped = stripNonProse(text);
    assert.equal(stripped.length, text.length);
    assert.ok(!stripped.includes('https'));
    assert.ok(!stripped.includes('code`'));
    assert.ok(stripped.includes('uitleg'));
  });

  it('protects abbreviation dots from splitting sentences', () => {
    const p = protectAbbreviations('Bijv. zo. En o.a. dit. Verder!');
    assert.ok(!p.includes('Bijv..'));
    const sents = splitSentences(p);
    // "Bijv. zo." is one sentence, "En o.a. dit." second, "Verder!" third
    assert.equal(sents.length, 3);
  });

  it('splits sentences and keeps offsets into the original text', () => {
    const text = 'Dit is zin één. Dit is zin twee!';
    const { sentences } = analyzeProse(text);
    assert.equal(sentences.length, 2);
    assert.equal(text.slice(sentences[0].start, sentences[0].end).trim(), 'Dit is zin één.');
    assert.equal(text.slice(sentences[1].start, sentences[1].end).trim(), 'Dit is zin twee!');
  });

  it('tokenizes words with offsets', () => {
    const toks = wordTokens('De kat zit, op de mat.');
    const words = toks.map((t) => t.raw);
    assert.ok(words.includes('kat'));
    assert.ok(words.includes('mat'));
    assert.ok(!words.includes('zit,'));
    const kat = toks.find((t) => t.raw === 'kat')!;
    assert.equal('De kat'.indexOf('kat'), kat.start);
  });

  it('skips code blocks in full prose analysis', () => {
    const text = 'Eerst dit. ```js\nconst x = 1;\n``` Dan dat.';
    const { sentences } = analyzeProse(text);
    const texts = sentences.map((s) => s.text);
    assert.ok(!texts.some((t) => t.includes('const')));
    assert.ok(texts.some((t) => t.includes('Dan dat')));
  });
});

describe('readability', () => {
  it('computes Flesch-Douma for a long enough sample', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Dit is een korte testzin over het weer van vandaag nummer ${i}.`).join(' ');
    const { sentences } = analyzeProse(text);
    const stats = computeReadability(sentences, [30]);
    assert.ok(stats.fleschDouma !== null);
    assert.ok(stats.fleschDouma! > 40 && stats.fleschDouma! < 90);
    assert.ok(stats.ari !== null);
  });

  it('returns null formulas for short samples', () => {
    const text = 'Twee woorden.';
    const { sentences } = analyzeProse(text);
    const stats = computeReadability(sentences, [2]);
    assert.equal(stats.fleschDouma, null);
    assert.equal(stats.ari, null);
  });

  it('bands Flesch-Douma scores', () => {
    assert.equal(fleschDoumaBand(65), 'b1');
    assert.equal(fleschDoumaBand(75), 'above-b1');
    assert.equal(fleschDoumaBand(50), 'below-b1');
    assert.equal(fleschDoumaBand(30), 'hard');
  });

  it('counts long sentences and paragraphs with custom thresholds', () => {
    const text = 'Een erg lange zin met veel woorden erin die de drempel overschrijdt voor zeker weten vandaag nu wel. Kort. Kort. Kort.';
    const { sentences } = analyzeProse(text);
    const stats = computeReadability(sentences, [20], { maxSentenceWords: 15, warnSentenceWords: 10 });
    assert.ok(stats.veryLongSentences >= 1);
    const stats2 = computeReadability(sentences, [200], { maxParaWords: 150 });
    assert.equal(stats2.longParas, 1);
  });

  it('keeps default thresholds when optional options are explicitly undefined', () => {
    const text = 'De implementatie van de regeling betreffende de vergoeding wordt vervolgens door de afdeling uitgevoerd, wat betekent dat u als klant langer moet wachten op een beslissing dan u wellicht zou verwachten op basis van de eerder door ons gedane toezeggingen.';
    const { sentences } = analyzeProse(text);
    const stats = computeReadability(sentences, [40], {
      maxSentenceWords: undefined,
      warnSentenceWords: undefined,
      maxParaWords: undefined,
    });
    // Defaults: warn >15, flag >20. The 38-word sentence must be flagged.
    assert.equal(stats.veryLongSentences, 1);
    assert.equal(stats.longSentences + stats.veryLongSentences, 1);
  });
});

describe('b1 rules', () => {
  it('flags officialese jargon with plain alternatives', () => {
    const hits = findB1Hits('Het rapport betreffende de vergadering wordt thans opgesteld.');
    const matched = hits.map((h) => h.matched.toLowerCase());
    assert.ok(matched.includes('betreffende'));
    assert.ok(matched.includes('thans'));
    const thans = hits.find((h) => h.matched.toLowerCase() === 'thans')!;
    assert.equal(thans.plain, 'nu');
  });

  it('flags filler words and idioms', () => {
    const hits = findB1Hits('Wellicht wordt dit een en ander onder de loep genomen.');
    const cats = hits.map((h) => h.category);
    assert.ok(cats.includes('filler'));
    assert.ok(cats.includes('idiom'));
  });

  it('flags nominalization density', () => {
    const rep = findNominalizations('De implementatie van de regeling en de uitvoering van de organisatie kosten tijd.', 16);
    assert.ok(rep.total >= 2);
    assert.ok(rep.per100 > 0);
  });

  it('reports voice consistency (default je)', () => {
    const mixed = analyzeVoice('Je kunt dit doen, maar u moet zich aanmelden.');
    assert.ok(mixed.mixed);
    assert.ok(mixed.uCount >= 1);
    assert.ok(mixed.jeCount >= 1);
    const jeOnly = analyzeVoice('Je kunt dit doen als je wilt.');
    assert.equal(jeOnly.mixed, false);
  });
});

describe('passive voice', () => {
  it('hunspellMorph identifies participles via VBpe tag or bare lemma', async () => {
    const morph = await hunspellMorph(['gemaakt', 'verstuurd', 'gemaakte', 'pizze', 'morgen', 'tijd']);
    assert.ok(isPastParticiple('gemaakt', morph.get('gemaakt')));
    assert.ok(isPastParticiple('verstuurd', morph.get('verstuurd')));
    assert.ok(isPastParticiple('gemaakte', morph.get('gemaakte')));
    assert.equal(isPastParticiple('pizze', morph.get('pizze')), false);
    assert.equal(isPastParticiple('morgen', morph.get('morgen')), false);
    assert.equal(isPastParticiple('tijd', morph.get('tijd')), false);
  });

  it('detects wordt + participle as word-passive', async () => {
    const text = 'De brief wordt morgen verzonden naar de klant.';
    const { sentences } = analyzeProse(text);
    const hits = await detectPassives(sentences);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, 'word-passive');
    assert.equal(hits[0].confidence, 'high');
    assert.equal(hits[0].participle.toLowerCase(), 'verzonden');
  });

  it('does not flag active sentences', async () => {
    const text = 'Wij sturen de brief morgen naar de klant toe.';
    const { sentences } = analyzeProse(text);
    const hits = await detectPassives(sentences);
    assert.equal(hits.length, 0);
  });

  it('marks zijn-passive as low confidence', async () => {
    const text = 'De fout is gemaakt door de leverancier van het product.';
    const { sentences } = analyzeProse(text);
    const hits = await detectPassives(sentences);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, 'zijn-passive');
    assert.equal(hits[0].confidence, 'low');
  });
});
