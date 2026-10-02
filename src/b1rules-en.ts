/**
 * Plain-language (B1 proxy) rules for US English: formal jargon, wordy
 * phrases, hidden verbs, filler words, idioms, nominalization density, and
 * direct "you" address. Rule-based layer in the same spirit as
 * src/britticisms.ts and src/b1rules.ts (word-boundary matching with plain
 * suggestions and positions); positioned as B1 proxies, not a validated B1
 * verdict.
 *
 * Sources:
 * - Federal Plain Language Guidelines (plainlanguage.gov, now archived in
 *   the GSA/plainlanguage.gov repository): "Use simple words and phrases",
 *   "Omit excess words", "Use verbs, not nouns" (hidden verbs), "Address
 *   the user", "Avoid jargon".
 * - GOV.UK A to Z style guide, "Words to avoid" (agree, deliver, facilitate,
 *   leverage, robust, streamline, going forward, in order to...).
 * Overlap with the British-form detector is avoided: British spellings
 * (utilise, organise) are reported there, not here.
 */

import type { B1Rule } from './b1rules.js';

export type B1CategoryEn = 'jargon' | 'wordy' | 'hidden-verb' | 'filler' | 'idiom';

export interface B1HitEn {
  index: number;
  matched: string;
  plain: string;
  category: B1CategoryEn;
  note?: string;
}

// ---------------------------------------------------------------------------
// Jargon: formal or bureaucratic words with plain alternatives
// (plainlanguage.gov "simple words" table + GOV.UK words to avoid).
// ---------------------------------------------------------------------------
const JARGON_RULES: B1Rule[] = [
  { re: /\butiliz(?:e|es|ed|ing|ation)\b/gi, plain: 'use' },
  { re: /\bcommenc(?:e|es|ed|ing|ement)\b/gi, plain: 'start, begin' },
  { re: /\bterminat(?:e|es|ed|ing|ion)\b/gi, plain: 'end, stop' },
  { re: /\bascertain(?:s|ed|ing)?\b/gi, plain: 'find out, learn' },
  { re: /\bendeavou?r(?:s|ed|ing)?\b/gi, plain: 'try' },
  { re: /\bfacilitat(?:e|es|ed|ing|ion)\b/gi, plain: 'help, make possible' },
  { re: /\bleverag(?:e|es|ed|ing)\b/gi, plain: 'use', note: 'fine in the financial sense' },
  { re: /\bimplement(?:s|ed|ing)?\b/gi, plain: 'carry out, set up, do' },
  { re: /\bpurchas(?:e|es|ed|ing)\b/gi, plain: 'buy' },
  { re: /\bobtain(?:s|ed|ing)?\b/gi, plain: 'get' },
  { re: /\brequir(?:e|es|ed|ing)\b/gi, plain: 'need, must', note: 'common in web copy; judge in context' },
  { re: /\bassist(?:s|ed|ing|ance)?\b/gi, plain: 'help' },
  { re: /\bdemonstrat(?:e|es|ed|ing)\b/gi, plain: 'show, prove' },
  { re: /\bindicat(?:e|es|ed|ing)\b/gi, plain: 'show, say' },
  { re: /\bnumerous\b/gi, plain: 'many' },
  { re: /\bsufficient(?:ly)?\b/gi, plain: 'enough' },
  { re: /\bapproximately\b/gi, plain: 'about' },
  { re: /\badditional\b/gi, plain: 'more, extra' },
  { re: /\bsubsequent(?:ly)?\b/gi, plain: 'later, next, after' },
  { re: /\bprior to\b/gi, plain: 'before' },
  { re: /\bpursuant to\b/gi, plain: 'under, according to' },
  { re: /\bin accordance with\b/gi, plain: 'under, following' },
  { re: /\bnotwithstanding\b/gi, plain: 'despite, even if' },
  { re: /\baforementioned\b/gi, plain: 'this, these' },
  { re: /\bherein\b|\bhereby\b|\bherewith\b|\bthereof\b|\bwhereby\b/gi, plain: '(rewrite plainly)' },
  { re: /\bhenceforth\b/gi, plain: 'from now on' },
  { re: /\bin lieu of\b/gi, plain: 'instead of' },
  { re: /\bpertaining to\b/gi, plain: 'about' },
  { re: /\bwith regard to\b|\bin regard to\b|\bwith respect to\b/gi, plain: 'about' },
  { re: /\bin relation to\b/gi, plain: 'about' },
  { re: /\bremuneration\b/gi, plain: 'pay' },
  { re: /\bexpedit(?:e|es|ed|ing)\b/gi, plain: 'speed up' },
  { re: /\bpromulgat(?:e|es|ed|ing)\b/gi, plain: 'issue, publish' },
  { re: /\boptimal\b/gi, plain: 'best' },
  { re: /\bmethodology\b/gi, plain: 'method' },
  { re: /\bfunctionality\b/gi, plain: 'feature, what it does' },
  // Vague buzzwords (GOV.UK words to avoid + common marketing filler).
  { re: /\brobust\b/gi, plain: 'strong, well tested', note: 'say what makes it strong' },
  { re: /\bstreamlin(?:e|es|ed|ing)\b/gi, plain: 'simplify' },
  { re: /\bseamless(?:ly)?\b/gi, plain: 'smooth, without breaks' },
  { re: /\bholistic\b/gi, plain: 'complete, whole' },
  { re: /\bsynerg(?:y|ies|istic)\b/gi, plain: 'working together' },
  { re: /\bempower(?:s|ed|ing|ment)?\b/gi, plain: 'let, allow, help' },
  { re: /\bcutting[- ]edge\b|\bstate[- ]of[- ]the[- ]art\b/gi, plain: 'new, modern', note: 'say what is new' },
  { re: /\bbest[- ]in[- ]class\b|\bworld[- ]class\b/gi, plain: '(show the proof instead)' },
  { re: /\binnovative\b/gi, plain: 'new', note: 'say what is new' },
  { re: /\btransformative\b|\btransformational\b/gi, plain: '(describe the change)' },
  { re: /\bcrucial\b|\bpivotal\b/gi, plain: 'important' },
  { re: /\bparamount\b/gi, plain: 'most important' },
  { re: /\bdelv(?:e|es|ed|ing) into\b/gi, plain: 'look at, explore' },
  { re: /\bstakeholders?\b/gi, plain: '(name the people)', note: 'GOV.UK: say who you mean' },
  { re: /\bgoing forward\b|\bmoving forward\b/gi, plain: 'from now on, in the future' },
];

// ---------------------------------------------------------------------------
// Wordy phrases that one or two words can replace ("Omit excess words").
// ---------------------------------------------------------------------------
const WORDY_RULES: B1Rule[] = [
  { re: /\bin order to\b/gi, plain: 'to' },
  { re: /\bin order for\b/gi, plain: 'for' },
  { re: /\bdue to the fact that\b|\bowing to the fact that\b|\bin view of the fact that\b/gi, plain: 'because' },
  { re: /\bdespite the fact that\b|\bin spite of the fact that\b/gi, plain: 'although' },
  { re: /\bat this point in time\b|\bat the present time\b|\bat this moment in time\b/gi, plain: 'now' },
  { re: /\bin the event that\b/gi, plain: 'if' },
  { re: /\bin the near future\b/gi, plain: 'soon' },
  { re: /\bfor the purpose of\b/gi, plain: 'to, for' },
  { re: /\bon a (?:daily|weekly|monthly|yearly|regular) basis\b/gi, plain: 'daily, weekly, monthly, yearly, regularly' },
  { re: /\ba (?:large|great|significant) (?:number|majority) of\b/gi, plain: 'many, most' },
  { re: /\ba number of\b/gi, plain: 'some, several' },
  { re: /\bthe majority of\b/gi, plain: 'most' },
  { re: /\bit is (?:important|essential|crucial|worth noting) (?:to note )?that\b/gi, plain: '(state the point directly)' },
  { re: /\bit should be noted that\b|\bplease note that\b/gi, plain: '(state the point directly)' },
  { re: /\bhas the ability to\b|\bis able to\b|\bare able to\b/gi, plain: 'can' },
  { re: /\bin an effort to\b/gi, plain: 'to' },
  { re: /\bwith the exception of\b/gi, plain: 'except' },
  { re: /\bin close proximity to\b/gi, plain: 'near' },
  { re: /\buntil such time as\b/gi, plain: 'until' },
  { re: /\bas a means of\b/gi, plain: 'to' },
  { re: /\bin the absence of\b/gi, plain: 'without' },
  { re: /\bin the amount of\b/gi, plain: 'for' },
  { re: /\bat all times\b/gi, plain: 'always' },
  { re: /\bthere (?:is|are|was|were) (?:a |an |many |several |some )?\w+ (?:that|who)\b/gi, plain: '(start with the subject)', note: 'weak "there is ... that" opener' },
];

// ---------------------------------------------------------------------------
// Hidden verbs: a weak verb + nominalization where one strong verb works
// (plainlanguage.gov "Use verbs, not nouns").
// ---------------------------------------------------------------------------
const LIGHT = '(?:make|makes|made|making|conduct|conducts|conducted|conducting|perform|performs|performed|performing|carry out|carries out|carried out|carrying out|undertake|undertakes|undertook|undertaken|do|does|did|done|doing)';
const GIVE = '(?:give|gives|gave|given|giving|provide|provides|provided|providing|offer|offers|offered|offering)';
const TAKE = '(?:take|takes|took|taken|taking)';
const REACH = '(?:reach|reaches|reached|reaching|come to|comes to|came to|coming to)';
const ART = '(?:an? |the |your |our |any |a final |a full )?';
const hv = (verb: string, noun: string): RegExp => new RegExp(`\\b${verb} ${ART}${noun}\\b`, 'gi');

const HIDDEN_VERB_RULES: B1Rule[] = [
  { re: hv(LIGHT, 'decisions?'), plain: 'decide' },
  { re: hv(LIGHT, 'recommendations?'), plain: 'recommend' },
  { re: hv(LIGHT, 'applications?'), plain: 'apply' },
  { re: hv(LIGHT, 'payments?'), plain: 'pay' },
  { re: hv(LIGHT, 'assumptions?'), plain: 'assume' },
  { re: hv(LIGHT, 'adjustments?'), plain: 'adjust' },
  { re: hv(LIGHT, 'improvements?'), plain: 'improve' },
  { re: hv(LIGHT, 'analys[ie]s'), plain: 'analyze' },
  { re: hv(LIGHT, 'assessments?'), plain: 'assess' },
  { re: hv(LIGHT, 'evaluations?'), plain: 'evaluate' },
  { re: hv(LIGHT, 'investigations?'), plain: 'investigate' },
  { re: hv(LIGHT, 'examinations?'), plain: 'examine' },
  { re: hv(LIGHT, 'inspections?'), plain: 'inspect' },
  { re: hv(LIGHT, 'reviews? of'), plain: 'review' },
  { re: hv(LIGHT, 'reference to'), plain: 'refer to' },
  { re: hv(LIGHT, 'preparations? for'), plain: 'prepare for' },
  { re: hv(LIGHT, 'purchases?'), plain: 'buy' },
  { re: hv(LIGHT, 'contact with'), plain: 'contact' },
  { re: hv(LIGHT, 'use of'), plain: 'use' },
  { re: hv(GIVE, 'assistance'), plain: 'help' },
  { re: hv(GIVE, 'consideration to'), plain: 'consider' },
  { re: hv(GIVE, 'explanations? (?:of|for)'), plain: 'explain' },
  { re: hv(GIVE, 'descriptions? of'), plain: 'describe' },
  { re: hv(GIVE, 'confirmation (?:of|that)'), plain: 'confirm' },
  { re: hv(GIVE, 'approval (?:for|of|to)'), plain: 'approve' },
  { re: hv(GIVE, 'notification (?:of|to)'), plain: 'notify, tell' },
  { re: hv(GIVE, 'authorization (?:for|to)'), plain: 'authorize, allow' },
  { re: hv(GIVE, 'an indication'), plain: 'indicate, show' },
  { re: hv(TAKE, 'into consideration'), plain: 'consider' },
  { re: hv(TAKE, 'action'), plain: 'act' },
  { re: hv(TAKE, 'part in'), plain: 'join, participate in' },
  { re: hv(REACH, 'agreements?'), plain: 'agree' },
  { re: hv(REACH, 'conclusions?'), plain: 'conclude' },
  { re: hv(REACH, 'decisions?'), plain: 'decide' },
  { re: /\b(?:have|has|had|hold|holds|held) (?:a |an )?(?:discussions?|meetings?) (?:about|on|with)\b/gi, plain: 'discuss, meet' },
  { re: /\b(?:is|are|was|were|be) in compliance with\b/gi, plain: 'complies with, follows' },
  { re: /\b(?:is|are|was|were|be) dependent (?:up)?on\b/gi, plain: 'depends on' },
  { re: /\b(?:is|are|was|were|be) applicable to\b/gi, plain: 'applies to' },
  { re: /\b(?:is|are|was|were|be) in agreement with\b/gi, plain: 'agrees with' },
  { re: /\b(?:is|are|was|were|be) (?:of )?(?:the )?opinion that\b/gi, plain: 'think, believe' },
  { re: /\b(?:submit|submits|submitted|submitting) (?:an? |your )?(?:application|request) for\b/gi, plain: 'apply for, ask for' },
];

// ---------------------------------------------------------------------------
// Filler words and hedges that usually add nothing.
// ---------------------------------------------------------------------------
const FILLER_RULES: B1Rule[] = [
  { re: /\bbasically\b/gi, plain: '(remove)' },
  { re: /\bessentially\b/gi, plain: '(remove)' },
  { re: /\bliterally\b/gi, plain: '(remove)' },
  { re: /\bactually\b/gi, plain: '(remove)' },
  { re: /\bobviously\b|\bclearly\b/gi, plain: '(remove)', note: 'if it is obvious, readers do not need to be told' },
  { re: /\bneedless to say\b/gi, plain: '(remove)' },
  { re: /\bas a matter of fact\b/gi, plain: 'in fact, (remove)' },
  { re: /\bfor all intents and purposes\b/gi, plain: 'in effect, (remove)' },
  { re: /\bvery (?:unique|important|essential|critical)\b/gi, plain: '(drop "very")' },
  { re: /\breally\b/gi, plain: '(remove)', note: 'judge in context' },
  { re: /\bquite\b|\brather\b|\bsomewhat\b/gi, plain: '(remove or be specific)', note: 'judge in context' },
  { re: /\bin terms of\b/gi, plain: 'for, about, in', note: 'often removable' },
  { re: /\bthe fact that\b/gi, plain: 'that, (rewrite)' },
];

// ---------------------------------------------------------------------------
// Idioms and metaphors: hard for second-language readers (GOV.UK: avoid
// metaphors; they slow down comprehension).
// ---------------------------------------------------------------------------
const IDIOM_RULES: B1Rule[] = [
  { re: /\btouch(?:es|ed|ing)? base\b/gi, plain: 'talk, contact' },
  { re: /\bcircl(?:e|es|ed|ing) back\b/gi, plain: 'return to, follow up' },
  { re: /\blow[- ]hanging fruit\b/gi, plain: 'easy wins, quick tasks' },
  { re: /\bmov(?:e|es|ed|ing) the needle\b/gi, plain: 'make a real difference' },
  { re: /\bthink(?:ing)? outside the box\b/gi, plain: 'think creatively' },
  { re: /\bat the end of the day\b/gi, plain: 'in the end, finally' },
  { re: /\ba piece of cake\b/gi, plain: 'easy' },
  { re: /\bhit(?:s|ting)? the ground running\b/gi, plain: 'start quickly' },
  { re: /\bballpark (?:figure|estimate|number)\b/gi, plain: 'rough estimate' },
  { re: /\bon the same page\b/gi, plain: 'in agreement' },
  { re: /\bbit(?:e|es|ing) the bullet\b/gi, plain: 'accept something hard' },
  { re: /\bdrop(?:s|ped|ping)? the ball\b/gi, plain: 'make a mistake' },
  { re: /\bgo(?:es|ing)? the extra mile\b|\bwent the extra mile\b/gi, plain: 'do more than expected' },
  { re: /\bthe ball is in (?:your|their|our) court\b/gi, plain: "it's your (their, our) turn to act" },
  { re: /\bcut(?:s|ting)? corners\b/gi, plain: 'skip steps' },
  { re: /\bgame[- ]changer\b/gi, plain: 'big change', note: 'say what changes' },
  { re: /\bdeep[- ]dive\b/gi, plain: 'detailed look' },
  { re: /\bboil(?:s|ing)? the ocean\b/gi, plain: 'try to do too much' },
  { re: /\bpar for the course\b/gi, plain: 'normal, expected' },
  { re: /\bget(?:s|ting)? the ball rolling\b/gi, plain: 'start' },
  { re: /\brais(?:e|es|ed|ing) the bar\b/gi, plain: 'set a higher standard' },
  { re: /\blevel playing field\b/gi, plain: 'fair conditions' },
  { re: /\bin a nutshell\b/gi, plain: 'in short' },
  { re: /\bthe bottom line\b/gi, plain: 'the main point, the result' },
  { re: /\bunder the hood\b/gi, plain: 'inside, how it works' },
  { re: /\bbells and whistles\b/gi, plain: 'extra features' },
  { re: /\bone[- ]stop[- ]shop\b/gi, plain: 'website, service', note: 'GOV.UK word to avoid' },
  { re: /\bring[- ]fenc(?:e|ed|ing)\b/gi, plain: 'separate, set aside' },
];

// ---------------------------------------------------------------------------
// Nominalization suffixes (density diagnostic, not per-word verdicts).
// ---------------------------------------------------------------------------
const NOMINALIZATION_RE = /\b[A-Za-z]+(?:tion|sion|ment|ance|ence|ity|ization|isation)s?\b/gi;

// Frequent concrete or everyday nouns with these suffixes: not style issues.
const NOMINALIZATION_ALLOW = new Set([
  'nation', 'nations', 'station', 'stations', 'question', 'questions', 'mention',
  'section', 'sections', 'option', 'options', 'portion', 'motion', 'emotion',
  'emotions', 'lotion', 'potion', 'caution', 'fiction', 'function', 'functions',
  'position', 'positions', 'vacation', 'location', 'locations', 'education',
  'population', 'tradition', 'condition', 'conditions', 'mission', 'version',
  'versions', 'session', 'sessions', 'television', 'vision', 'passion',
  'pension', 'tension', 'mansion', 'apartment', 'apartments', 'department',
  'departments', 'government', 'governments', 'moment', 'moments', 'comment',
  'comments', 'document', 'documents', 'element', 'elements', 'segment',
  'equipment', 'environment', 'instrument', 'payment', 'payments', 'garment',
  'experiment', 'apartment', 'tournament', 'statement', 'statements',
  'balance', 'distance', 'entrance', 'finance', 'insurance', 'instance',
  'audience', 'evidence', 'science', 'sentence', 'sentences', 'experience',
  'experiences', 'difference', 'differences', 'conference', 'licence',
  'license', 'fence', 'silence', 'presence', 'sequence', 'city', 'cities',
  'community', 'communities', 'university', 'activity', 'activities',
  'quality', 'security', 'privacy', 'identity', 'entity', 'facility',
  'facilities', 'opportunity', 'opportunities', 'county', 'charity', 'unity',
  'reality', 'majority', 'minority', 'authority', 'authorities', 'property',
  'variety', 'society', 'electricity', 'humanity', 'information', 'reservation',
  'reservations', 'invitation', 'celebration', 'destination', 'decoration',
  'decorations', 'installation', 'collection', 'collections', 'selection',
  'connection', 'question', 'application', 'applications', 'conversation',
  'conversations', 'presentation', 'presentations', 'organization',
  'organizations', 'quotation', 'quotations', 'notification', 'notifications',
]);

export interface NominalizationReportEn {
  total: number;
  words: number;
  per100: number;
  top: Array<{ word: string; count: number; firstIndex: number }>;
}

export interface AddressReportEn {
  expected: 'you' | 'any';
  youCount: number;
  youFirstIndex: number | null;
  readerRefs: number; // third-person references to the reader
  readerFirstIndex: number | null;
  readerTop: Array<{ word: string; count: number }>;
}

// "you" forms (direct address) and third-person references that usually
// mean the reader in web and service copy (GOV.UK, plainlanguage.gov:
// address the user as "you").
const YOU_FORMS = /\b(?:you|your|yours|yourself|yourselves|you['’](?:re|ve|ll|d))\b/gi;
const READER_REFS =
  /\b(?:the (?:user|customer|client|visitor|applicant|reader|member|participant|recipient|buyer|guest)s?|(?:users|customers|clients|visitors|applicants|readers|members|participants|recipients|buyers|guests)|one (?:must|should|can|may))\b/gi;

export function findB1HitsEn(text: string): B1HitEn[] {
  const hits: B1HitEn[] = [];
  const layers: Array<{ rules: B1Rule[]; category: B1CategoryEn }> = [
    { rules: JARGON_RULES, category: 'jargon' },
    { rules: WORDY_RULES, category: 'wordy' },
    { rules: HIDDEN_VERB_RULES, category: 'hidden-verb' },
    { rules: FILLER_RULES, category: 'filler' },
    { rules: IDIOM_RULES, category: 'idiom' },
  ];
  for (const layer of layers) {
    for (const rule of layer.rules) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        hits.push({ index: m.index, matched: m[0], plain: rule.plain, category: layer.category, note: rule.note });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }
  // A hidden-verb hit already explains the span; drop jargon hits nested
  // inside it ("provide assistance": report the phrase, not "assistance").
  const phrases = hits.filter((h) => h.category === 'hidden-verb' || h.category === 'wordy');
  const deduped = hits.filter(
    (h) =>
      !(h.category === 'jargon' || h.category === 'filler') ||
      !phrases.some((p) => h.index >= p.index && h.index + h.matched.length <= p.index + p.matched.length)
  );
  deduped.sort((a, b) => a.index - b.index);
  return deduped;
}

export function findNominalizationsEn(text: string, wordCount: number): NominalizationReportEn {
  const re = new RegExp(NOMINALIZATION_RE.source, NOMINALIZATION_RE.flags);
  const seen = new Map<string, { count: number; firstIndex: number }>();
  let m: RegExpExecArray | null;
  let total = 0;
  while ((m = re.exec(text)) !== null) {
    const word = m[0].toLowerCase();
    if (word.length < 7 || NOMINALIZATION_ALLOW.has(word)) continue;
    const entry = seen.get(word) ?? { count: 0, firstIndex: m.index };
    entry.count++;
    seen.set(word, entry);
    total++;
  }
  const top = [...seen.entries()]
    .map(([word, e]) => ({ word, ...e }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 10);
  return {
    total,
    words: wordCount,
    per100: wordCount > 0 ? Math.round((total / wordCount) * 1000) / 10 : 0,
    top,
  };
}

export function analyzeAddressEn(text: string, expected: 'you' | 'any' = 'you'): AddressReportEn {
  let youCount = 0;
  let youFirstIndex: number | null = null;
  for (const m of text.matchAll(new RegExp(YOU_FORMS.source, 'gi'))) {
    youCount++;
    if (youFirstIndex === null) youFirstIndex = m.index ?? 0;
  }
  let readerRefs = 0;
  let readerFirstIndex: number | null = null;
  const counts = new Map<string, number>();
  for (const m of text.matchAll(new RegExp(READER_REFS.source, 'gi'))) {
    readerRefs++;
    if (readerFirstIndex === null) readerFirstIndex = m.index ?? 0;
    const k = m[0].toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const readerTop = [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, 5);
  return { expected, youCount, youFirstIndex, readerRefs, readerFirstIndex, readerTop };
}
