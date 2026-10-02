/**
 * B1 simplicity rules for Dutch: officialese jargon, vague buzzwords, filler
 * words, idioms, nominalization suffixes, and u/je voice consistency.
 * Rule-based layer in the same spirit as src/britticisms.ts (word-boundary
 * matching with plain-language suggestions and positions), positioned as
 * B1 proxies, not a validated B1 verdict.
 *
 * Sources:
 * - CommunicatieRijk "Taalniveau B1" guideline word table (Rijksoverheid).
 * - IPLO Schrijfwijzer toepasbare regels (B1 writing tips).
 * - Editorial checklist 01-NATURAL examples for Dutch web copy: vague
 *   adjectives and container terms (essentieel, cruciaal, veelzijdig,
 *   toepassing, oplossing, functionaliteit, innovatief, krachtig).
 *   These are review hints, not a blind banned-word list.
 */

export interface B1Rule {
  re: RegExp;
  plain: string;
  note?: string;
}

// ---------------------------------------------------------------------------
// Jargon: officialese words and phrases with plain alternatives.
// ---------------------------------------------------------------------------
const JARGON_RULES: B1Rule[] = [
  { re: /\bbetreffende\b/gi, plain: 'over, bij' },
  { re: /\bcreë?eren\b|\bcreatie\b/gi, plain: 'maken, ontwerpen' },
  { re: /\bverstrekken\b|\bverstrekking\b/gi, plain: 'geven, versturen', note: 'keep "verstrekken" for official documents' },
  { re: /\bthans\b/gi, plain: 'nu' },
  { re: /\bvoornoemd\w*\b/gi, plain: 'dit, deze' },
  { re: /\bovereenkomstig\b/gi, plain: 'volgens' },
  { re: /\bconform\b/gi, plain: 'volgens' },
  { re: /\bderhalve\b/gi, plain: 'daarom' },
  { re: /\bevenwel\b/gi, plain: 'maar' },
  { re: /\bimmers\b/gi, plain: 'want' },
  { re: /\bvoorts\b/gi, plain: 'verder' },
  { re: /\bnopens\b/gi, plain: 'over' },
  { re: /\bwegens\b/gi, plain: 'vanwege' },
  { re: /\bnagenoeg\b/gi, plain: 'bijna' },
  { re: /\bgenoegzaam\b/gi, plain: 'voldoende' },
  { re: /\bvooralsnog\b/gi, plain: 'nu nog' },
  { re: /\balsnog\b/gi, plain: 'toch nog' },
  { re: /\bper saldo\b/gi, plain: 'uiteindelijk' },
  { re: /\bin het kader van\b/gi, plain: 'voor, bij' },
  { re: /\bmet betrekking tot\b/gi, plain: 'over' },
  { re: /\bten aanzien van\b/gi, plain: 'over' },
  { re: /\bten behoeve van\b/gi, plain: 'voor' },
  { re: /\bdoor middel van\b/gi, plain: 'met' },
  { re: /\bals gevolg van\b/gi, plain: 'door' },
  { re: /\bgelet op\b/gi, plain: 'vanwege' },
  { re: /\bin geval van\b/gi, plain: 'bij' },
  { re: /\bop dit moment\b/gi, plain: 'nu' },
  { re: /\bmet name\b/gi, plain: 'vooral' },
  { re: /\btot stand brengen\b/gi, plain: 'maken' },
  { re: /\bin gang zetten\b/gi, plain: 'starten' },
  { re: /\bter beschikking stellen aan\b/gi, plain: 'geven aan' },
  { re: /\bter beschikking staan aan\b/gi, plain: 'beschikbaar zijn voor' },
  { re: /\bbesluitvorming\w*\b/gi, plain: 'beslissen, keuze' },
  { re: /\bplanvorming\b/gi, plain: 'plannen' },
  { re: /\bimplementatie\b/gi, plain: 'uitvoering, uitrollen' },
  { re: /\brealiseren\b|\brealisatie\b/gi, plain: 'bereiken, maken' },
  { re: /\binitiëren\b/gi, plain: 'beginnen, starten' },
  { re: /\bfaciliteren\b|\bfacilitering\b/gi, plain: 'mogelijk maken, helpen' },
  { re: /\bconcretiseren\b/gi, plain: 'concreet maken' },
  { re: /\bprioriteit\b/gi, plain: 'voorrang', note: 'common in web copy; judge in context' },
  { re: /\brelevant\w*\b/gi, plain: 'belangrijk, passend' },
  { re: /\bessentieel\b/gi, plain: 'nodig, belangrijk' },
  { re: /\bcruciaal\b/gi, plain: 'belangrijk' },
  { re: /\bfundamenteel\b/gi, plain: 'basis-, belangrijk' },
  { re: /\binnovatief\b|\binnovatieve\b|\binnovatie\b/gi, plain: 'nieuw, vernieuwend' },
  { re: /\bveelzijdig\w*\b/gi, plain: 'uiteenlopend, voor veel doeleinden' },
  { re: /\bkrachtig\b/gi, plain: 'sterk' },
  { re: /\btransparant\w*\b/gi, plain: 'open, duidelijk' },
  { re: /\bintegraal\b/gi, plain: 'compleet, helemaal' },
  { re: /\bexpliciet\b/gi, plain: 'duidelijk' },
  { re: /\bimpliciet\b/gi, plain: 'niet gezegd maar wel bedoeld' },
  { re: /\btoereikend\w*\b/gi, plain: 'genoeg' },
  { re: /\bfunctionaliteit\w*\b/gi, plain: 'functie, wat het doet' },
  { re: /\btoegevoegde waarde\b/gi, plain: 'meerwaarde, nut' },
  { re: /\bsynergie\b|\bsynergetisch\b/gi, plain: 'samen sterk' },
  { re: /\bvalidatie\b|\bvalideren\b/gi, plain: 'controle, controleren' },
  { re: /\bgehandicapten\b/gi, plain: 'mensen met een handicap' },
  { re: /\bslechtzienden\b/gi, plain: 'mensen die slecht zien' },
];

// ---------------------------------------------------------------------------
// Filler words and hedges that usually add nothing.
// ---------------------------------------------------------------------------
const FILLER_RULES: B1Rule[] = [
  { re: /\bwellicht\b/gi, plain: 'misschien' },
  { re: /\baldus\b/gi, plain: 'zo' },
  { re: /\been en ander\b/gi, plain: 'dit' },
  { re: /\bbij dezen\b/gi, plain: 'hierbij' },
  { re: /\bbij voorbaat dank\b/gi, plain: 'alvast bedankt' },
  { re: /\bals het ware\b/gi, plain: '(weglaten)' },
  { re: /\bzogenaamd\w*\b/gi, plain: 'zogenaamd', note: 'usually removable; judge in context' },
];

// ---------------------------------------------------------------------------
// Idioms: avoid in B1 writing, especially for NT2 readers.
// ---------------------------------------------------------------------------
const IDIOM_RULES: B1Rule[] = [
  { re: /\bvan de hak op de tak\b/gi, plain: 'van onderwerp wisselen' },
  { re: /\bonder de loep (?:nemen|genomen|gebracht)\b/gi, plain: 'goed bekijken' },
  { re: /\blaten meewegen\b/gi, plain: 'meetellen' },
  { re: /\bdoor de bomen het bos niet meer zien\b/gi, plain: 'het overzicht kwijtraken' },
  { re: /\bde kat uit de boom kijken\b/gi, plain: 'afwachten' },
  { re: /\been slag om de arm\b/gi, plain: 'niet definitief' },
  { re: /\bde boot afhouden\b/gi, plain: 'niet meedoen' },
  { re: /\bter tafel brengen\b/gi, plain: 'bespreken' },
  { re: /\bvoor spek en bonen meedoen\b/gi, plain: 'meedoen zonder invloed' },
  { re: /\bgeen blad voor de mond nemen\b/gi, plain: 'openlijk spreken' },
  { re: /\bhoge ogen gooien\b/gi, plain: 'goed ontvangen worden' },
  { re: /\bmet de paplepel ingegoten\b/gi, plain: 'van jongs af aan geleerd' },
  { re: /\bop de lange baan schuiven\b/gi, plain: 'uitstellen' },
  { re: /\bde rode loper uitrollen\b/gi, plain: 'warm verwelkomen' },
  { re: /\been tandje bijzetten\b/gi, plain: 'harder werken' },
  { re: /\bin het zonnetje zetten\b/gi, plain: 'extra aandacht geven' },
];

// ---------------------------------------------------------------------------
// Nominalization suffixes (density diagnostic, not per-word verdicts).
// ---------------------------------------------------------------------------
const NOMINALIZATION_RE = /\b[A-Za-z\u00C0-\u024F-]*(?:tie|ing|heid|iteit|nis|schap|isme)\b/gi;

// Words ending in these suffixes that are ordinary, not style problems.
const NOMINALIZATION_ALLOW = new Set([
  'koning', 'koningen', 'omgeving', 'vooruitgang', 'nedergang', 'opgang',
  'aankomst', 'meidagen', 'wandeling', 'training', 'warning', 'handling',
  'kennismaking', 'vergadering', 'verhuur', 'inventing',
]);

// ---------------------------------------------------------------------------
// Voice consistency: Dutch web default is je/jij (configurable to u).
// ---------------------------------------------------------------------------
const U_FORMS = /\b(u|uw|ue)\b/g;
const JE_FORMS = /\b(je|jij|jouw|jullie|jullie\u2019s)\b/gi;

export interface B1Hit {
  index: number;
  matched: string;
  plain: string;
  category: 'jargon' | 'filler' | 'idiom';
  note?: string;
}

export interface VoiceReport {
  expected: 'je' | 'u';
  uCount: number;
  jeCount: number;
  uFirstIndex: number | null;
  jeFirstIndex: number | null;
  mixed: boolean;
}

export interface NominalizationReport {
  total: number;
  words: number;
  per100: number;
  top: Array<{ word: string; count: number; firstIndex: number }>;
}

export function findB1Hits(text: string): B1Hit[] {
  const hits: B1Hit[] = [];
  const layers: Array<{ rules: B1Rule[]; category: B1Hit['category'] }> = [
    { rules: JARGON_RULES, category: 'jargon' },
    { rules: FILLER_RULES, category: 'filler' },
    { rules: IDIOM_RULES, category: 'idiom' },
  ];
  for (const layer of layers) {
    for (const rule of layer.rules) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        hits.push({
          index: m.index,
          matched: m[0],
          plain: rule.plain,
          category: layer.category,
          note: rule.note,
        });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
  }
  hits.sort((a, b) => a.index - b.index);
  return hits;
}

export function findNominalizations(text: string, wordCount: number): NominalizationReport {
  const re = new RegExp(NOMINALIZATION_RE.source, NOMINALIZATION_RE.flags);
  const seen = new Map<string, { count: number; firstIndex: number }>();
  let m: RegExpExecArray | null;
  let total = 0;
  while ((m = re.exec(text)) !== null) {
    const word = m[0].toLowerCase();
    if (NOMINALIZATION_ALLOW.has(word)) continue;
    if (word.length < 6) continue;
    const entry = seen.get(word) ?? { count: 0, firstIndex: m.index };
    entry.count++;
    seen.set(word, entry);
    total++;
    if (re.lastIndex === m.index) re.lastIndex++;
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

export function analyzeVoice(text: string, expected: 'je' | 'u' = 'je'): VoiceReport {
  let uCount = 0;
  let uFirstIndex: number | null = null;
  let m: RegExpExecArray | null;
  const uRe = new RegExp(U_FORMS.source, 'g');
  while ((m = uRe.exec(text)) !== null) {
    // Skip "u" inside all-caps acronyms is not needed (\b handles); but avoid
    // matching the Dutch word "u" in quotations is out of scope here.
    uCount++;
    if (uFirstIndex === null) uFirstIndex = m.index;
  }
  let jeCount = 0;
  let jeFirstIndex: number | null = null;
  const jeRe = new RegExp(JE_FORMS.source, 'gi');
  while ((m = jeRe.exec(text)) !== null) {
    jeCount++;
    if (jeFirstIndex === null) jeFirstIndex = m.index;
  }
  const mixed = uCount > 0 && jeCount > 0;
  return { expected, uCount, jeCount, uFirstIndex, jeFirstIndex, mixed };
}
