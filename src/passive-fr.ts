/**
 * French passive voice proxy: être + past participle (precision first).
 *
 * The fr hunspell dictionary (Dicollecte) marks verb forms with family flags
 * (fl:p+, fl:pB, ...) that differ per conjugation group; there is no single
 * "participe passé" tag. Verified protocol (hunspell 1.7.x, assets/fr):
 *   livrés   st:livrer fl:p+      installées  st:installer fl:p+
 *   voulu    st:vouloir fl:pB     écrit       st:écrit fl:S. / st:écrire fl:y1
 * so participles come from three sources, each reported with its confidence:
 * 1. -é/-ée/-és/-ées whose analysis has a stem in -er (regular first-group
 *    verbs): high confidence;
 * 2. a closed list of common irregular participles (fait, mis, pris, écrit,
 *    ouvert, construit, conçu, ...) with feminine and plural forms: high;
 * 3. -i/-u/-is/-us forms (and feminine/plural) whose analysis has a stem in
 *    -ir, -re, or -oir: low confidence, because these overlap with adjectives
 *    and nouns.
 * Participles that form the passé composé with être (allé, venu, arrivé,
 * parti, né, tombé, resté, ...) are skipped: "il est arrivé" is not a
 * passive. Reflexive forms (s'est ...) and c'est are skipped too.
 *
 * Detection per sentence: an être form (including n'/j'/qu' elisions and
 * inversion: est-il, sont-elles), or "été" after an avoir form, followed by
 * at most three bridge tokens (pas, jamais, déjà, adverbs in -ment, été,
 * étant) and then a participle. Frequent non-participles that share a
 * spelling with a verb form (plus, lui, tu, puis, suis) and finite endings
 * (-ais, -ai, -ois) are excluded; the lists were checked against the
 * participle tags of Lexique 3.83 (evaluation only, not bundled). A "par" agent within six tokens is reported.
 * Participles that usually describe a state (situé, basé, conçu, destiné,
 * équipé, ...) are low confidence. Known limits: pronominal passives ("se
 * fait"), passives with a stand-alone participle after a noun phrase ("a été
 * clairement et rapidement installé"), and passives built on other
 * auxiliaries are not detected. Hits are review flags, not verdicts.
 */

import type { Sentence } from './prose.js';
import { hunspellMorph, type MorphInfo } from './passive.js';

export interface PassiveHitFr {
  index: number; // sentence start offset in original text
  sentenceText: string;
  aux: string;
  participle: string;
  withPar: boolean;
  confidence: 'high' | 'low';
}

const BE_AUX = new Set([
  'suis', 'es', 'est', 'sommes', 'êtes', 'sont', 'étais', 'était', 'étions',
  'étiez', 'étaient', 'serai', 'seras', 'sera', 'serons', 'serez', 'seront',
  'serais', 'serait', 'serions', 'seriez', 'seraient', 'sois', 'soit', 'soyons',
  'soyez', 'soient', 'fus', 'fut', 'fûmes', 'furent', 'étant', 'être',
]);
const HAVE_AUX = new Set([
  'ai', 'as', 'a', 'avons', 'avez', 'ont', 'avais', 'avait', 'avions', 'aviez',
  'avaient', 'aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront', 'aurais',
  'aurait', 'aurions', 'auriez', 'auraient', 'aie', 'ait', 'ayons', 'ayez',
  'aient', 'eu', 'avoir', 'ayant',
]);
const PRONOUN_AFTER_HYPHEN = /^(?:t-)?(?:il|elle|on|ils|elles|ce|je|tu|nous|vous)$/;

const BRIDGE = new Set([
  'pas', 'plus', 'ne', 'point', 'guère', 'donc', 'ainsi', 'enfin', 'vite',
  'jamais', 'déjà', 'encore', 'toujours', 'aussi', 'bien', 'tout', 'très',
  'trop', 'souvent', 'parfois', 'ensuite', 'alors', 'ici', 'été', 'étant',
]);
const BRIDGE_MAX = 3;
const PAR_WINDOW = 6;

// Participles of verbs conjugated with être in compound tenses: not passive.
const ETRE_COMPOUND = new Set([
  'allé', 'venu', 'arrivé', 'parti', 'entré', 'sorti', 'monté', 'descendu',
  'né', 'mort', 'resté', 'tombé', 'devenu', 'revenu', 'retourné', 'rentré',
  'décédé', 'parvenu', 'intervenu', 'survenu', 'passé', 'remonté', 'redescendu',
  'retombé', 'reparti', 'ressorti', 'éclos', 'décédé', 'apparu', 'disparu',
]);

// Irregular participles (masculine singular); forms with -e, -s, -es are
// derived by candidates().
const IRREGULAR = new Set([
  'mis', 'pris', 'fait', 'dit', 'écrit', 'ouvert', 'offert', 'couvert',
  'découvert', 'souffert', 'construit', 'produit', 'conduit', 'détruit',
  'réduit', 'introduit', 'traduit', 'instruit', 'inclus', 'exclu', 'compris',
  'entrepris', 'surpris', 'appris', 'repris', 'permis', 'promis', 'soumis',
  'admis', 'transmis', 'remis', 'commis', 'omis', 'vu', 'prévu', 'pourvu',
  'reçu', 'perçu', 'conçu', 'aperçu', 'connu', 'reconnu', 'tenu', 'obtenu',
  'contenu', 'maintenu', 'retenu', 'soutenu', 'voulu', 'dû', 'su', 'lu',
  'bu', 'cru', 'vécu', 'résolu', 'joint', 'atteint', 'peint', 'éteint',
  'contraint', 'restreint', 'défait', 'refait', 'satisfait', 'interdit',
  'prédit', 'inscrit', 'décrit', 'prescrit', 'souscrit', 'transcrit',
  'acquis', 'requis', 'conquis', 'élu', 'relu', 'ému', 'assis', 'revu',
  'sous-entendu', 'entendu', 'perdu', 'rendu', 'vendu', 'attendu', 'répondu',
  'suivi', 'poursuivi', 'servi', 'rouvert', 'recouvert', 'craint', 'rejoint',
  'plaint', 'enfreint', 'feint', 'teint', 'astreint', 'cuit', 'extrait',
  'distrait', 'soustrait', 'clos',
]);

// Frequent words that the morphology also reads as a form of an -ir/-re/-oir
// verb (plus = plaire, lui = luire, tu = taire, suis = suivre): never a
// participle after être in running prose.
const NOT_PARTICIPLE = new Set([
  'plus', 'lui', 'tu', 'puis', 'suis', 'dis', 'lis', 'ris', 'vis', 'fis', 'fus',
  'pus', 'tue', 'tues', 'fous',
]);
// Finite endings (imparfait, futur, présent in -ois/-ais) are never participles.
const FINITE_ENDING = /(?:ai|ais|aie|aies|ois|oie|oies)$/;

// State-like participles after "être": adjectival use likely.
const ADJECTIVAL = new Set([
  'situé', 'basé', 'conçu', 'destiné', 'équipé', 'composé', 'constitué', 'fait',
  'prévu', 'inclus', 'compris', 'fermé', 'ouvert', 'certifié', 'agréé', 'assuré',
  'adapté', 'réservé', 'spécialisé', 'dédié', 'limité', 'connu', 'reconnu',
  'formé', 'qualifié', 'expérimenté', 'motivé', 'intéressé', 'concerné',
  'convaincu', 'satisfait', 'attendu', 'entendu', 'perdu', 'suivi', 'servi',
  'fatigué', 'désolé', 'obligé', 'occupé', 'pressé', 'enchanté', 'étonné',
  'surpris', 'déçu', 'ému', 'assis', 'passionné', 'habitué', 'marié', 'censé',
  'préoccupé', 'soulagé', 'navré', 'gêné', 'déterminé', 'engagé', 'élevé',
  'compliqué', 'approprié', 'isolé', 'varié', 'privé', 'réputé', 'détaillé',
  'distrait', 'clos', 'dû',
  // Professions and statuses after être: "il est député", "elle est salariée".
  'député', 'employé', 'retraité', 'salarié', 'associé', 'diplômé',
]);

/** Masculine-singular lookup candidates for a possibly inflected form. */
function candidates(w: string): string[] {
  // "miss" is not a plural of "mis": a form in -s takes no second s.
  return [w, w.replace(/(?<!s)s$/, ''), w.replace(/e$/, ''), w.replace(/es$/, '')];
}

export function isIrregularParticipleFr(w: string): boolean {
  return candidates(w).some((c) => IRREGULAR.has(c));
}

function isEtreCompound(w: string): boolean {
  return candidates(w).some((c) => ETRE_COMPOUND.has(c));
}

/** Candidate for the -m batch: plain letters only, participle-shaped ending. */
function isMorphCandidate(w: string): boolean {
  return w.length >= 3 && /^\p{L}+$/u.test(w) && /(?:é|ée|és|ées|i|ie|is|ies|u|ue|us|ues)$/.test(w);
}

/** Participle check; returns the confidence, or null when not a participle. */
export function participleConfidenceFr(word: string, info: MorphInfo | undefined): 'high' | 'low' | null {
  const w = word.toLowerCase();
  if (isEtreCompound(w) || NOT_PARTICIPLE.has(w)) return null;
  const adjectival = candidates(w).some((c) => ADJECTIVAL.has(c));
  if (isIrregularParticipleFr(w)) return adjectival ? 'low' : 'high';
  if (!info) return null;
  const stems = info.stems.filter((s) => s !== w);
  if (/(?:é|ée|és|ées)$/.test(w) && stems.some((s) => /er$/.test(s))) return adjectival ? 'low' : 'high';
  if (FINITE_ENDING.test(w)) return null;
  if (/(?:i|ie|is|ies|u|ue|us|ues)$/.test(w) && stems.some((s) => /(?:ir|re|oir)$/.test(s))) return 'low';
  return null;
}

function normalizeAux(raw: string): string {
  let w = raw.toLowerCase().replace(/’/g, "'");
  if (/^[sc]'/.test(w)) return ''; // reflexive (s'est) and c'est
  w = w.replace(/^(?:n|j|qu)'/, '');
  const hy = w.indexOf('-');
  if (hy > 0 && PRONOUN_AFTER_HYPHEN.test(w.slice(hy + 1))) w = w.slice(0, hy);
  return w;
}

/** Detect être + participle sentence by sentence. */
export async function detectPassivesFr(sentences: Sentence[]): Promise<PassiveHitFr[]> {
  const candidatesList: string[] = [];
  for (const s of sentences) {
    for (const w of s.words) if (isMorphCandidate(w.clean) && !isIrregularParticipleFr(w.clean)) candidatesList.push(w.clean);
  }
  const morph = await hunspellMorph(candidatesList, 'fr');
  const hits: PassiveHitFr[] = [];

  for (const s of sentences) {
    const words = s.words;
    for (let i = 0; i < words.length; i++) {
      const aux = normalizeAux(words[i].clean);
      const prev = i > 0 ? normalizeAux(words[i - 1].clean) : '';
      // "été" is the participle of être: an auxiliary only after avoir.
      const isAux = BE_AUX.has(aux) || (aux === 'été' && HAVE_AUX.has(prev));
      if (!isAux) continue;

      let participle: string | null = null;
      let pIndex = -1;
      let confidence: 'high' | 'low' = 'high';
      let bridged = 0;
      for (let j = i + 1; j < words.length; j++) {
        const next = words[j].clean;
        const conf = participleConfidenceFr(next, morph.get(next));
        if (conf !== null) {
          participle = words[j].raw;
          pIndex = j;
          confidence = conf;
          break;
        }
        const isBridge = BRIDGE.has(next) || BE_AUX.has(next) || (/ment$/.test(next) && next.length > 6);
        if (!isBridge || ++bridged > BRIDGE_MAX) break;
      }
      if (participle === null) continue;

      const after = words.slice(pIndex + 1, pIndex + 1 + PAR_WINDOW);
      hits.push({
        index: s.start,
        sentenceText: s.text,
        // "ont été contrôlées": show the avoir form that carries été.
        aux: aux === 'été' ? `${words[i - 1].raw} ${words[i].raw}` : words[i].raw,
        participle,
        withPar: after.some((x) => x.clean === 'par'),
        confidence,
      });
      i = pIndex;
    }
  }
  return hits;
}
