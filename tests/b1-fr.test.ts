// Unit tests for the French B1 building blocks: syllable counter, Kandel &
// Moles formula, French prose splitting, address form, and passive proxy.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllablesFr } from '../src/syllables-fr.js';
import { analyzeProse, type Sentence, type WordToken } from '../src/prose.js';
import { computeReadability } from '../src/readability.js';
import { analyzeVoiceFr } from '../src/voice-fr.js';
import { detectPassivesFr } from '../src/passive-fr.js';

describe('French syllables', () => {
  it('agrees with hand-checked counts (standard spoken prose, mute final e not counted)', () => {
    // Hand-checked against the pronunciation of each word. The measured rate
    // on Lexique 3.83 comes from tests/eval/syllables-fr-lexique.ts (see
    // docs/french.md); this list anchors the rules behind that rate.
    const cases: Record<string, number> = {
      le: 1, la: 1, de: 1, que: 1, qui: 1, est: 1, pour: 1, nous: 1, vous: 1, ils: 1,
      dans: 1, 'très': 1, bien: 1, tout: 1, 'où': 1, aux: 1, point: 1, norme: 1, vie: 1,
      ligne: 1, corps: 1, haut: 1, eau: 1, beau: 1, chaud: 1, deux: 1, 'cœur': 1, 'œuf': 1,
      loi: 1, mois: 1, oui: 1, nuit: 1, huit: 1, faire: 1, livre: 1, table: 1,
      avec: 2, bonjour: 2, ancrage: 2, conformes: 2, maison: 2, travail: 2, chantier: 2,
      hauteur: 2, harnais: 2, longe: 1, longes: 1, 'réseau': 2,
      'sécurité': 4, antichute: 3, installons: 3, installation: 4, national: 3,
      "aujourd'hui": 3, 'aujourd’hui': 3, 'peut-être': 2, 'garde-corps': 2, 'avez-vous': 3,
      accessible: 3, inspection: 3, 'contrôle': 2, formation: 3, 'hôtel': 2, 'théâtre': 2,
      'poète': 2, 'réunion': 3, 'créateur': 3, 'idée': 2, 'année': 2, 'été': 2, 'créée': 2,
      'oublié': 3, entreprise: 3,
      parlent: 1, installent: 2, 'étaient': 2, viennent: 1, vient: 1, crient: 1, 'étudient': 3,
      sont: 1, moment: 2, comment: 2, argent: 2, agent: 2, souvent: 2, 'présent': 2,
      accident: 3, aiment: 1,
      aimer: 2, voyage: 2, payer: 2, essayer: 3, quatre: 1, quand: 1, question: 2,
      longue: 1, guerre: 1, guide: 1, mangeons: 2, nageoire: 2, yeux: 1, continue: 3,
      continuent: 3, 'Noël': 2, 'naïf': 2, 'maïs': 2,
      "l'ancrage": 2, "qu'il": 1, "d'un": 1, "j'ai": 1, "c'est": 1, "n'importe": 2,
      "jusqu'à": 2, "lorsqu'il": 2, 'arc-en-ciel': 3,
      // i/u/ou glide before an accented vowel; hiatus after an obstruent + l/r cluster.
      'société': 3, 'certifié': 3, 'vérifié': 3, 'première': 2, 'pièce': 1, 'tué': 1, 'joué': 1,
      client: 2, clients: 2, ouvrier: 3, 'février': 3, crier: 2, 'publié': 3, 'bibliothèque': 4,
      cruel: 2, influence: 3, bruit: 1, pluie: 1, fruit: 1, brouillard: 2, 'prière': 2,
      pays: 2, paysage: 3, 'août': 1, alcool: 2, 'coopération': 5, 'conséquent': 3,
      'fréquent': 2, accent: 2, dorment: 1, puissent: 1,
      oubliera: 3, 'gruyère': 2, zoo: 2, 'employé': 3,
    };
    const wrong = Object.entries(cases)
      .filter(([w, n]) => countSyllablesFr(w) !== n)
      .map(([w, n]) => `${w}: got ${countSyllablesFr(w)}, expected ${n}`);
    assert.deepEqual(wrong, []);
  });

  it('documents known misses (schwa variation, fixed expressions, verb -ment)', () => {
    // médecin is [med.sɛ̃] (2): a dropped schwa inside a word is still counted.
    assert.equal(countSyllablesFr('médecin'), 3);
    // est-ce is [ɛs] (1); each hyphen part with a vowel letter counts at least 1.
    assert.equal(countSyllablesFr('est-ce'), 2);
    // Verb -ment endings outside the closed list read as nouns: "ils calment".
    assert.equal(countSyllablesFr('calment'), 2);
  });

  it('counts vowel-less tokens as one syllable', () => {
    assert.equal(countSyllablesFr('HTML'), 1);
    assert.equal(countSyllablesFr('pdf'), 1);
  });
});

function sentence(words: string[]): Sentence {
  let pos = 0;
  const tokens: WordToken[] = words.map((w) => {
    const t = { raw: w, clean: w.toLowerCase(), start: pos, end: pos + w.length };
    pos += w.length + 1;
    return t;
  });
  return { text: words.join(' '), start: 0, end: pos, words: tokens };
}

describe('Kandel & Moles readability', () => {
  it('matches a hand-computed value: 207 - 1.015 * ASL - 73.6 * ASW', () => {
    // 10 sentences of 6 monosyllabic words: ASL 6, ASW 1.
    // 207 - 1.015 * 6 - 73.6 * 1 = 127.31 -> 127.3.
    const cat = ['Le', 'chat', 'dort', 'sur', 'le', 'lit'];
    const stats = computeReadability(Array.from({ length: 10 }, () => sentence(cat)), [60], {}, 'fr');
    assert.equal(stats.kandelMoles, 127.3);
    assert.equal(stats.fleschReadingEase, null);
    assert.equal(stats.fleschDouma, null);
    assert.equal(stats.wordCount, 60);
    assert.equal(stats.sentenceCount, 10);
  });

  it('matches a second hand-computed value with mixed syllable counts', () => {
    // 5 x "Le chat dort sur le lit" (6 syllables) + 5 x "Nous installons une
    // ligne de vie" (1+3+1+1+1+1 = 8 syllables): 60 words, 70 syllables.
    // ASL 6, ASW 70/60: 207 - 6.09 - 73.6 * 70/60 = 115.0433 -> 115.0.
    const a = ['Le', 'chat', 'dort', 'sur', 'le', 'lit'];
    const b = ['Nous', 'installons', 'une', 'ligne', 'de', 'vie'];
    const sentences = [...Array(5).fill(a), ...Array(5).fill(b)].map(sentence);
    const stats = computeReadability(sentences, [60], {}, 'fr');
    assert.equal(stats.syllableCount, 70);
    assert.equal(stats.kandelMoles, 115);
  });

  it('suppresses the formula below 50 words or 3 sentences', () => {
    const stats = computeReadability([sentence(['Le', 'chat', 'dort'])], [3], {}, 'fr');
    assert.equal(stats.kandelMoles, null);
  });

  it('uses 20/25 words as default sentence limits and honors explicit-undefined options', () => {
    const long = sentence(Array(22).fill('chat'));
    const veryLong = sentence(Array(27).fill('chat'));
    const stats = computeReadability([long, veryLong], [49], { maxSentenceWords: undefined, warnSentenceWords: undefined }, 'fr');
    assert.equal(stats.longSentences, 1);
    assert.equal(stats.veryLongSentences, 1);
  });
});

describe('French prose splitting', () => {
  it('keeps French abbreviations and initials inside one sentence', () => {
    const text = 'M. Dupont et Mme Martin visitent le site, cf. la page 4, tél. au bureau. Ensuite, ils partent.';
    const { sentences } = analyzeProse(text, 'fr');
    assert.equal(sentences.length, 2);
    assert.ok(sentences[0].text.includes('bureau'));
  });

  it('splits on ? and ! after a non-breaking space and keeps offsets exact', () => {
    const text = 'Avez-vous besoin d\u00a0aide\u00a0? Oui\u00a0! Merci.';
    const { sentences } = analyzeProse(text, 'fr');
    assert.equal(sentences.length, 3);
    for (const s of sentences) assert.equal(text.slice(s.start, s.end).trim(), s.text);
  });

  it('closes a sentence after a closing guillemet', () => {
    const { sentences } = analyzeProse('Il a dit « Merci. » Puis il est parti.', 'fr');
    assert.equal(sentences.length, 2);
  });

  it('counts one-letter words: a, à, y', () => {
    const { sentences } = analyzeProse('Il y a un ami à Paris.', 'fr');
    assert.equal(sentences[0].words.length, 7);
  });

  it('counts an elided clitic and a hyphenated word as one word each', () => {
    const { sentences } = analyzeProse("L'ancrage garde-corps peut-être sûr.", 'fr');
    assert.equal(sentences[0].words.length, 4);
  });
});

describe('French address form (tu / vous)', () => {
  it('flags tu forms with vous expected, at exact offsets', () => {
    const text = 'Contactez-nous. Tu peux appeler, toi, avec ton téléphone et ta carte.';
    const r = analyzeVoiceFr(text, 'vous');
    assert.deepEqual(r.hits.map((h) => h.word), ['tu', 'toi', 'ton', 'ta']);
    for (const h of r.hits) assert.equal(text.slice(h.index, h.index + h.word.length).toLowerCase(), h.word);
    assert.equal(r.tuCount, 4);
    assert.equal(r.vousCount, 0);
  });

  it('does not flag vous copy', () => {
    const r = analyzeVoiceFr('Vous recevez votre devis et vos documents, vous-même.', 'vous');
    assert.equal(r.tuCount, 0);
    assert.equal(r.vousCount, 4);
  });

  it('detects inversion, elision, and enclitic forms', () => {
    const r = analyzeVoiceFr("Peux-tu venir ? T'as vu ça ? Va-t'en. Dis-toi que oui. J'te l'ai dit.", 'vous');
    assert.deepEqual(r.hits.map((h) => h.word), ['tu', "t'", "t'", 'toi', 'te']);
  });

  it("treats 'ton' after a determiner as the noun tone", () => {
    const r = analyzeVoiceFr('Le ton est amical, sur un ton calme, avec ton équipe.', 'vous');
    assert.deepEqual(r.hits.map((h) => h.word), ['ton']);
    assert.equal(r.hits[0].index, 'Le ton est amical, sur un ton calme, avec '.length);
  });

  it("flags tien forms only after an article, and 'te'/'ta' only as whole lower- or mixed-case words", () => {
    const r = analyzeVoiceFr('Le tien est prêt, qu\'il tienne bon, une solution TE et TA, tête, métal, pâte.', 'vous');
    assert.deepEqual(r.hits.map((h) => h.word), ['tien']);
  });

  it('ignores guillemet quotations and counts them separately', () => {
    const r = analyzeVoiceFr('Un client dit : « Tu as sauvé mon chantier, merci à toi. » Vous êtes rapides.', 'vous');
    assert.equal(r.tuCount, 0);
    assert.equal(r.quotedIgnored, 2);
    assert.equal(r.vousCount, 1);
  });

  it('ignores curly and straight double quotations on one line', () => {
    const r = analyzeVoiceFr('“Tu as bien fait”, dit-il. "Merci à toi." Vous êtes rapides.', 'vous');
    assert.equal(r.tuCount, 0);
    assert.equal(r.quotedIgnored, 2);
  });

  it('does not read an inch mark as an opening quote', () => {
    const r = analyzeVoiceFr('Le panneau fait 24" de large. Tu peux le monter. Il fait 12" de haut.', 'vous');
    assert.equal(r.tuCount, 1);
    assert.equal(r.quotedIgnored, 0);
  });

  it('keeps a quoted word as context for the next word', () => {
    // "ton" after the quoted determiner is the noun; no tu form is quoted.
    const r = analyzeVoiceFr('Voici « le » ton parfait. « Un » ton calme.', 'vous');
    assert.equal(r.tuCount, 0);
    assert.equal(r.quotedIgnored, 0);
  });

  it("skips 'tu' as the participle of se taire, but keeps inversion", () => {
    assert.equal(analyzeVoiceFr("Il s'est tu. Elles se sont tues.", 'vous').tuCount, 0);
    assert.equal(analyzeVoiceFr('Où es-tu ?', 'vous').tuCount, 1);
  });

  it('ignores URLs, emails, and code', () => {
    const r = analyzeVoiceFr('Voir https://exemple.fr/tu/ta ou `tu` et ton@exemple.fr.', 'vous');
    assert.equal(r.tuCount, 0);
  });

  it('is symmetric for voice tu', () => {
    const r = analyzeVoiceFr('Tu reçois ton devis. Vous pouvez nous appeler.', 'tu');
    assert.equal(r.vousCount, 1);
    assert.equal(r.tuCount, 2);
    assert.equal(r.vousFirstIndex, 'Tu reçois ton devis. '.length);
  });
});

describe('French passive proxy', () => {
  const detect = async (text: string) => detectPassivesFr(analyzeProse(text, 'fr').sentences);

  it('finds être + participle with a par agent', async () => {
    const hits = await detect("Les points d'ancrage sont installés par nos techniciens.");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].aux, 'sont');
    assert.equal(hits[0].participle, 'installés');
    assert.equal(hits[0].withPar, true);
    assert.equal(hits[0].confidence, 'high');
  });

  it('finds avoir été + participle, negation, inversion, and irregular participles', async () => {
    const hits = await detect(
      'Les lignes de vie ont été contrôlées. Cette solution n\'est pas toujours utilisée. Les clients sont-ils informés ? Le rapport est écrit.',
    );
    assert.deepEqual(hits.map((h) => `${h.aux}|${h.participle}`), [
      'ont été|contrôlées', "n'est|utilisée", 'sont-ils|informés', 'est|écrit',
    ]);
    assert.ok(hits.every((h) => h.confidence === 'high'));
  });

  it('marks state-like and -ir/-re participles as low confidence', async () => {
    const hits = await detect("L'entreprise est située à Gand. Ce produit est vendu.");
    assert.deepEqual(hits.map((h) => `${h.participle}:${h.confidence}`), ['située:low', 'vendu:high']);
  });

  it('finds "a été" + participle (the one-letter auxiliary counts as a word)', async () => {
    const hits = await detect('Le rapport a été envoyé hier. La porte a été ouverte par le gardien.');
    assert.deepEqual(hits.map((h) => `${h.aux}|${h.participle}|${h.withPar}`), ['a été|envoyé|false', 'a été|ouverte|true']);
  });

  it('does not read frequent non-participles or finite verb forms as participles', async () => {
    const hits = await detect(
      'Ce produit est plus sûr. Le client est lui aussi content. Il est puis il part. Miss Dupont est miss France. Je suis, je crois, ravi.',
    );
    assert.deepEqual(hits.map((h) => h.participle), []);
  });

  it('marks emotional and state participles as low confidence', async () => {
    const hits = await detect('Je suis désolé. La salle est occupée. Le prix est élevé.');
    assert.deepEqual(hits.map((h) => `${h.participle}:${h.confidence}`), ['désolé:low', 'occupée:low', 'élevé:low']);
    const jobs = await detect('Il est député. Elle est salariée chez nous.');
    assert.ok(jobs.every((h) => h.confidence === 'low'));
  });

  it('does not flag être-compound tenses, reflexives, c\'est, or active sentences', async () => {
    const hits = await detect(
      "Il est arrivé hier. Elle est partie. Nous sommes venus. Elle s'est blessée. C'est fini. Nous installons des lignes de vie. L'été est chaud. C'est un été sec.",
    );
    assert.deepEqual(hits, []);
  });
});
