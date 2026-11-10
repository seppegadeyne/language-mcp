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
 * - one nucleus per vowel run, except that an accented vowel is its own
 *   nucleus (créateur = cré-a-teur) and a short list of letter pairs forms
 *   a hiatus (video, area);
 * - i/u/ou right before an accented vowel is a glide (société = 3, tué = 1),
 *   but after an obstruent + l/r cluster i/u/ou before any vowel is its own
 *   syllable (client = 2, ouvrier = 3, cruel = 2).
 *
 * Verb "-ent" versus noun/adjective/adverb "-ent" cannot be decided from
 * spelling alone. "-ment" words are treated as pronounced (nouns and adverbs
 * dominate; a small closed list covers common "-ment" verbs), "-vient" and
 * "-tient" as pronounced 3rd person singular forms, and a closed list covers
 * common "-ent" nouns and adjectives. Everything else ending in "-ent" is
 * read as a verb with a mute ending.
 *
 * Accuracy: measured against the syllable counts of Lexique 3.83 with
 * tests/eval/syllables-fr-lexique.ts (numbers in docs/french.md); re-measure
 * before changing a rule. tests/b1-fr.test.ts anchors the rules and documents
 * known misses (schwa variation such as "médecin", "est-ce", verb "-ment").
 * Good enough for readability statistics averaged over running prose, not
 * for hyphenation.
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
  'incompétent', 'patent', 'tangent', 'seulement', 'accent', 'sergent',
  'conséquent', 'équivalent', 'ressent', 'consent', 'pressent', 'régiment',
]);

// -ment forms that are verbs (3rd person plural), not nouns or adverbs.
const VERB_MENT = new Set([
  'aiment', 'forment', 'informent', 'confirment', 'estiment', 'expriment',
  'animent', 'nomment', 'ferment', 'réclament', 'affirment', 'proclament',
  'déclament', 'blâment', 'arment', 'alarment', 'charment', 'germent',
  'transforment', 'réforment', 'conforment', 'dorment', 'endorment',
]);

/** Count the syllables of one part (no hyphens, no apostrophes). */
function partSyllables(input: string): number {
  let w = input;

  w = w.replace(/œ|æ/g, 'e');
  // pays, paysage, paysan: "ay" is two vowels here (pé-i). août: the a is silent.
  w = w.replace(/^pays/, 'péis').replace(/^ao[uû]t/, 'out');
  // "oo" is a hiatus only before p/r and in zoo- (coopérer, coordonner,
  // zoologie); elsewhere it is one vowel in an English loan (alcool, foot).
  w = w.replace(/(?<!^z)oo(?![pr])/g, 'o');
  // Mute e in the future and conditional of -ier verbs after a cluster: ou-bli-ra.
  w = w.replace(/(?<=[bcdfgkptv][lr]i)e(?=r(?:a|ai|as|ait|ais|aient|ons|ez|ont)$)/, '');
  // Accents that only mark a digraph: où, goût, aîné, traîne, jeûne.
  w = w.replace(/(?<=o)[ùû]/g, 'u').replace(/(?<=[ao])î/g, 'i').replace(/(?<=e)û/g, 'u');
  // Silent u in -gue(s)/-guë: ambiguë keeps its u.
  w = w.replace(/([gq])uë(s?)$/, '$1u$2');
  w = w.replace(/qu/g, 'q').replace(/gu(?=[eiyéèê])/g, 'g');
  // Silent e after g before a, o, u.
  w = w.replace(/ge(?=[aou])/g, 'g');
  // Leading y before a vowel is a consonant; y between vowels is vowel + glide.
  w = w.replace(/^y(?=[aeiouéèêàâîôû])/, 'j');
  w = w.replace(/([aou])y(?=[aeiouéèê])/g, '$1ij');

  // Mute endings.
  if (w.length >= 5 && w.endsWith('ent')) {
    const isVerb =
      !NON_VERB_ENT.has(input) &&
      !/(?:vient|tient)$/.test(w) &&
      (!w.endsWith('ment') || VERB_MENT.has(input));
    if (isVerb) w = w.slice(0, -3);
  } else if (w.length > 2 && w.endsWith('es')) {
    w = w.slice(0, -2);
  } else if (w.length > 1 && w.endsWith('e')) {
    w = w.slice(0, -1);
  }

  return countNuclei(w);
}

// Plain-letter pairs that form a hiatus (a-o, o-a, o-o, e-o, e-a).
const HIATUS = /(?<=a)(?=[ao])|(?<=o)(?=[ao])|(?<=e)(?=o)|(?<=e)(?=a(?!u))/g;
// After an obstruent + l/r cluster, i/u/ou before a vowel cannot glide and
// forms its own syllable: cli-ent, ou-vri-er, cru-el, prou-esse.
const CLUSTER_END = /[bcdfgkptv][lr]$/;
const CLUSTER_HIATUS = /^(?:i|u(?!i)|ou(?!i))[aeiouy]/;

function countNuclei(w: string): number {
  let count = 0;
  for (const m of w.matchAll(new RegExp(`[${VOWEL}]+`, 'g'))) {
    const afterCluster = CLUSTER_END.test(w.slice(0, m.index));
    // An accented vowel is its own nucleus; the plain letters between
    // accented vowels form glide groups, split only at a few hiatus pairs.
    let plain = '';
    let atStart = true;
    const flush = (beforeAccent: boolean) => {
      if (plain) {
        const blocked = afterCluster && atStart;
        // i/u/ou right before an accented vowel is a glide: so-cié-té, tué, joué.
        const glide = beforeAccent && !blocked && /^(?:i|u|ou)$/.test(plain);
        if (!glide) count += 1 + (plain.match(HIATUS)?.length ?? 0);
        if (blocked && CLUSTER_HIATUS.test(plain)) count++;
      }
      plain = '';
      atStart = false;
    };
    for (const ch of m[0]) {
      if (ACCENTED.includes(ch)) {
        flush(true);
        count++;
      } else {
        plain += ch;
      }
    }
    flush(false);
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
