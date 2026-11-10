/**
 * French syllable counting heuristic (zero dependencies, deterministic).
 *
 * Definition: phonetic syllables of standard spoken French prose, where a
 * word-final mute "e" is not pronounced (table = 1, livre = 1, vie = 1,
 * sécurité = 4) and a mute "e" inside a word is counted (entreprise = 3).
 * That is the counting convention the Kandel & Moles (1958) formula is
 * used with; it is not the metrical (poetic) count.
 *
 * Rules, applied per hyphen-separated part and per apostrophe-separated
 * sub-part (so l'ancrage = l + ancrage and peut-être = peut + être):
 * - ligatures: œ/æ read as "e" (cœur -> ceur, one "eu" nucleus);
 * - accents that only mark a digraph are merged (où, goût, aîné, traîne);
 * - silent "u" after q, and after g before e/i/y (quatre, guerre, longue);
 * - silent "e" after g before a/o/u (mangeons, nageoire);
 * - "y" between vowels is a vowel plus a glide (payer, voyage); a leading
 *   "y" before a vowel is a consonant (yeux);
 * - word-final "-es" and "-e" are mute; a verb "-ent" ending (3rd person
 *   plural: parlent, installent, étaient, étudient) is mute;
 * - one nucleus per vowel run, except that an accented vowel is always its
 *   own nucleus (créateur = cré-a-teur) and a short list of letter pairs
 *   forms a hiatus (video, area).
 *
 * Verb "-ent" versus noun/adjective/adverb "-ent" cannot be decided from
 * spelling alone. "-ment" words are treated as pronounced (nouns and adverbs
 * dominate; a small closed list covers common "-ment" verbs), "-vient" and
 * "-tient" as pronounced 3rd person singular forms, and a closed list covers
 * common "-ent" nouns and adjectives. Everything else ending in "-ent" is
 * read as a verb with a mute ending.
 *
 * Accuracy: see tests/b1-fr.test.ts. The anchored list there is hand-checked
 * and the heuristic agrees on all of it by construction; there is no
 * independent measurement against a pronunciation lexicon, and known misses
 * are documented as tests (client, gouvernement-style schwa variation,
 * i+vowel hiatus such as "violon", "est-ce"). Good enough for readability
 * statistics averaged over running prose, not for hyphenation.
 */

const VOWEL = 'aeiouyàâäéèêëîïôöùûüÿ';
const ACCENTED = 'àâäéèêëîïôöùûüÿ';

// -ent words that are NOT verb endings (nouns, adjectives, adverbs).
const NON_VERB_ENT = new Set([
  'agent', 'argent', 'client', 'patient', 'orient', 'ingrédient', 'inconvénient',
  'expédient', 'quotient', 'gradient', 'conscient', 'efficient', 'ambient',
  'accident', 'incident', 'président', 'résident', 'évident', 'prudent',
  'précédent', 'confident', 'occident', 'ardent', 'strident', 'trident',
  'urgent', 'intelligent', 'négligent', 'diligent', 'indigent', 'régent',
  'détergent', 'émergent', 'divergent', 'convergent', 'insurgent',
  'contingent', 'excellent', 'violent', 'silent', 'opulent', 'turbulent',
  'virulent', 'insolent', 'talent', 'lent', 'parent', 'apparent',
  'transparent', 'différent', 'indifférent', 'concurrent', 'récurrent',
  'référent', 'adhérent', 'cohérent', 'incohérent', 'inhérent', 'torrent',
  'permanent', 'pertinent', 'impertinent', 'éminent', 'imminent', 'continent',
  'serpent', 'innocent', 'récent', 'adolescent', 'décent', 'indécent', 'cent',
  'présent', 'absent', 'omniprésent', 'souvent', 'content', 'mécontent',
  'vent', 'dent', 'gent', 'couvent', 'fréquent', 'éloquent', 'compétent',
  'incompétent', 'patent', 'puissent', 'tangent', 'seulement',
]);

// -ment forms that are verbs (3rd person plural), not nouns or adverbs.
const VERB_MENT = new Set([
  'aiment', 'forment', 'informent', 'confirment', 'estiment', 'expriment',
  'animent', 'nomment', 'ferment', 'réclament', 'affirment', 'proclament',
  'déclament', 'blâment', 'arment', 'alarment', 'charment', 'germent',
  'transforment', 'réforment', 'conforment', 'imaginent',
]);

/** Count the syllables of one part (no hyphens, no apostrophes). */
function partSyllables(input: string): number {
  let w = input;

  w = w.replace(/œ|æ/g, 'e');
  // Accents that only mark a digraph: où, goût, aîné, traîne, jeûne.
  w = w.replace(/(?<=o)[ùû]/g, 'u').replace(/(?<=[ao])î/g, 'i').replace(/(?<=e)û/g, 'u');
  // Silent u in -gue(s)/-guë: ambiguë keeps its u.
  w = w.replace(/([gq])uë(s?)$/, '$1u$2');
  w = w.replace(/qu/g, 'q').replace(/gu(?=[eiyéèê])/g, 'g');
  // Silent e after g before a, o, u.
  w = w.replace(/ge(?=[aou])/g, 'g');
  // Leading y before a vowel is a consonant; y between vowels is vowel + glide.
  w = w.replace(/^y(?=[aeiouéèêàâîôû])/, 'j');
  w = w.replace(/([aou])y(?=[aeiou])/g, '$1ij');

  // Mute endings.
  if (w.length >= 5 && w.endsWith('ent')) {
    const isVerb =
      !NON_VERB_ENT.has(w) &&
      !/(?:vient|tient)$/.test(w) &&
      (!w.endsWith('ment') || VERB_MENT.has(w));
    if (isVerb) w = w.slice(0, -3);
  } else if (w.length > 2 && w.endsWith('es')) {
    w = w.slice(0, -2);
  } else if (w.length > 1 && w.endsWith('e')) {
    w = w.slice(0, -1);
  }

  return countNuclei(w);
}

const HIATUS = /(?<=a)(?=[ao])|(?<=o)(?=[ao])|(?<=e)(?=o)|(?<=e)(?=e)|(?<=e)(?=a(?!u))/g;

function countNuclei(w: string): number {
  let count = 0;
  for (const run of w.match(new RegExp(`[${VOWEL}]+`, 'g')) ?? []) {
    // An accented vowel is always its own nucleus; the plain letters between
    // accented vowels form glide groups, split only at a few hiatus pairs.
    let plain = '';
    for (const ch of run) {
      if (ACCENTED.includes(ch)) {
        if (plain) count += 1 + (plain.match(HIATUS)?.length ?? 0);
        plain = '';
        count++;
      } else {
        plain += ch;
      }
    }
    if (plain) count += 1 + (plain.match(HIATUS)?.length ?? 0);
  }
  return count;
}

export function countSyllablesFr(word: string): number {
  const normalized = word.toLowerCase().replace(/’/g, "'");
  let total = 0;
  for (const hyphenPart of normalized.split('-')) {
    const letters = hyphenPart.replace(/[^a-z'àâäçéèêëîïôöùûüÿœæ]/g, '');
    if (!new RegExp(`[${VOWEL}œæ]`).test(letters)) continue;
    let n = 0;
    for (const sub of letters.split("'")) n += partSyllables(sub);
    // A part with vowel letters but only mute ones (ce, je, que) is one syllable.
    total += Math.max(1, n);
  }
  return Math.max(1, total);
}
