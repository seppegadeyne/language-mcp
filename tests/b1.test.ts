import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables } from '../src/syllables.js';
import { analyzeProse, stripNonProse, protectAbbreviations, splitSentences, wordTokens } from '../src/prose.js';
import { bandTarget, computeReadability, fleschDoumaBand } from '../src/readability.js';
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

  it('strips bare domain names length-preserving', () => {
    const text = 'Boek via Verhuurwinkel.nl en betaal vooraf.';
    const stripped = stripNonProse(text);
    assert.equal(stripped.length, text.length);
    assert.ok(!stripped.includes('Verhuurwinkel'));
    assert.ok(stripped.includes('betaal'));
    // Offsets after the domain must still point into the original text.
    const idx = stripped.indexOf('betaal');
    assert.equal(text.slice(idx, idx + 'betaal'.length), 'betaal');
  });

  it('protects abbreviation dots from splitting sentences', () => {
    const p = protectAbbreviations('Bijv. zo. En o.a. dit. Verder!');
    assert.ok(!p.includes('Bijv..'));
    const sents = splitSentences(p);
    // "Bijv. zo." is one sentence, "En o.a. dit." second, "Verder!" third
    assert.equal(sents.length, 3);
  });

  it('escapes dots inside multi-dot abbreviations', () => {
    // Unescaped, the "i.v.m" pattern also matched "ixvym." and hid a real
    // sentence end.
    const sents = splitSentences(protectAbbreviations('Dit is ixvym. Dat is twee.'));
    assert.equal(sents.length, 2);
    const kept = splitSentences(protectAbbreviations('Dit gebeurt i.v.m. de regels. Klaar.'));
    assert.equal(kept.length, 2);
  });

  it('treats a soft line wrap as part of the sentence, not a boundary', () => {
    const text = 'Dit is een lange zin die over\ntwee regels loopt. Tweede zin.\n\nKop zonder punt\nNieuwe alinea hier.';
    const { sentences, paragraphs } = analyzeProse(text);
    assert.deepEqual(
      sentences.map((s) => s.words.length),
      [10, 2, 3, 3]
    );
    assert.equal(paragraphs.length, 3);
    // Offsets still point into the original text.
    assert.equal(text.slice(sentences[0].start, sentences[0].end).trim(), 'Dit is een lange zin die over\ntwee regels loopt.');
  });

  it('keeps multi-dot version numbers inside one sentence', () => {
    const sents = splitSentences(protectAbbreviations('Versie 0.5.0 is uit. Klaar.'));
    assert.equal(sents.length, 2);
  });

  it('protects every capital initial, not only the first', () => {
    const sents = splitSentences(protectAbbreviations('Met J. Jansen en P. Peeters gesproken. Klaar.'));
    assert.equal(sents.length, 2);
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
    assert.equal(fleschDoumaBand(65), 'B1');
    assert.equal(fleschDoumaBand(75), 'easier than B1');
    assert.equal(fleschDoumaBand(50), 'harder than B1');
    assert.equal(fleschDoumaBand(30), 'much harder than B1');
  });

  it('applies the flesch_douma_min parameter to the band and the target label', () => {
    assert.equal(fleschDoumaBand(55, 50), 'B1');
    assert.equal(fleschDoumaBand(62, 65), 'harder than B1');
    assert.equal(fleschDoumaBand(72, 75), 'harder than B1');
    assert.equal(bandTarget(60), '60-70');
    assert.equal(bandTarget(75), '75 or higher');
  });

  it('counts a dotted abbreviation as one word and never a math sign', () => {
    const { sentences } = analyzeProse('Wij leveren o.a. hout i.v.m. de bouw van 3 × 4 meter.');
    assert.deepEqual(sentences[0].words.map((w) => w.clean), ['wij', 'leveren', 'o.a', 'hout', 'i.v.m', 'de', 'bouw', 'van', 'meter']);
  });

  it('keeps text around a dot that is not followed by a space', () => {
    const { sentences } = analyzeProse('De N.V.B. staakt vandaag.Morgen niet.');
    assert.equal(sentences.reduce((n, s) => n + s.words.length, 0), 6);
  });

  it('counts the one-letter pronoun "u" as a word', () => {
    const { sentences } = analyzeProse('Als u een aanvraag doet, krijgt u bericht.');
    assert.equal(sentences[0].words.length, 8);
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
    const capitalU = analyzeVoice('U kunt hier betalen. Je krijgt een bon. Neem de U-bocht.');
    assert.equal(capitalU.uCount, 1);
    assert.ok(capitalU.mixed);
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

  it('does not flag the active perfect of verbs that only take zijn', async () => {
    const text = 'Het is duidelijk geworden. De kosten zijn gestegen. Zij is aangekomen. De omzet is toegenomen. Hij is thuis gebleven. Dat is gelukt.';
    const hits = await detectPassives(analyzeProse(text).sentences);
    assert.deepEqual(hits.map((h) => h.participle), []);
    const passive = await detectPassives(analyzeProse(
      'Het pakket is verzonden. De deur is gesloten. De afspraak is nagekomen. Hij is aangevallen. Dit is u al eerder gemeld. De kamer is 3 × 4 meter en is verbouwd.',
    ).sentences);
    assert.deepEqual(passive.map((h) => h.participle), ['verzonden', 'gesloten', 'nagekomen', 'aangevallen', 'gemeld', 'verbouwd']);
  });
});
