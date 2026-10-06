import { BARE_DOMAIN_RE } from './tokenize.js';

/** Selected spelling rules, not a grammar checker or an automatic rewrite. */
export interface DutchSpellingIssue {
  ruleId: string;
  matched: string;
  suggestion: string;
  index: number;
  end: number;
  explanation: string;
  confidence: 'high' | 'medium';
  source: {
    name: string;
    url: string;
    rule: string;
    checked: string;
  };
}

export interface DutchSpellingOptions {
  /** Case-sensitive names or titles; horizontal whitespace may vary. */
  protectedTerms?: string[];
}

type Rule = Pick<DutchSpellingIssue, 'ruleId' | 'explanation' | 'confidence' | 'source'>;
const BASE = 'https://www.vlaanderen.be/team-taaladvies/spellingregels/';

function rule(ruleId: string, page: string, section: string, explanation: string, confidence: Rule['confidence'] = 'high'): Rule {
  return {
    ruleId, explanation, confidence,
    source: { name: 'Team Taaladvies', url: BASE + page, rule: section, checked: '2026-10-06' },
  };
}

const COMPOUND = rule(
  'nl-compound-spacing',
  'aaneenschrijven/aaneenschrijven-01-hoofdregels-los-of-aaneen-koppelteken-of-trema',
  'Rule 2',
  'Write this selected Dutch compound as one word. An optional clarity hyphen is also allowed.',
);
const VOWEL = rule(
  'nl-vowel-collision-hyphen',
  'aaneenschrijven/aaneenschrijven-02-klinkerbotsing-koppelteken-of-trema',
  'Rule 1',
  'Join the parts of this compound with a hyphen to prevent a vowel collision.',
);
const INITIALISM = rule(
  'nl-initialism-hyphen',
  'aaneenschrijven/aaneenschrijven-09-combinaties-met-initiaalwoorden-letterwoorden-en-verkortingen',
  'Rule 1',
  'Use a hyphen to join this initialism, pronounced letter by letter, to the other part of the compound.',
);
const NUMERAL = rule(
  'nl-number-letter-hyphen',
  'aaneenschrijven/aaneenschrijven-08-combinaties-met-cijfers-letters-en-symbolen',
  'Rule 1',
  'Use a hyphen in this selected compound with a combination of digits and letters.',
);
const CALENDAR = rule(
  'nl-calendar-lowercase',
  'hoofdletters/hoofdletters-09-namen-van-dagen-feestdagen-periodes-en-historische-gebeurtenissen',
  'Rule 1',
  'Weekdays and months are lowercase in ordinary Dutch prose. This calendar context suggests a time reference; preserve a proper name or title.',
  'medium',
);

// Deliberately closed pairs: dictionary membership alone does not distinguish
// a compound from an accepted word group. Exclude ambiguous verb forms
// ("offerte aanvraag", "menu uitdraai") and double objects ("klanten service").
const PAIRS: Array<[string, string, Rule]> = [
  ['keuken tafel', 'keukentafel', COMPOUND],
  ['keuken tafels', 'keukentafels', COMPOUND],
  ['contact formulier', 'contactformulier', COMPOUND],
  ['contact formulieren', 'contactformulieren', COMPOUND],
  ['contact gegevens', 'contactgegevens', COMPOUND],
  ['privacy beleid', 'privacybeleid', COMPOUND],
  ['auto ongeluk', 'auto-ongeluk', VOWEL],
  ['auto ongelukken', 'auto-ongelukken', VOWEL],
  ['ski instructeur', 'ski-instructeur', VOWEL],
  ['btw nummer', 'btw-nummer', INITIALISM],
  ['btw nummers', 'btw-nummers', INITIALISM],
  ['pc netwerk', 'pc-netwerk', INITIALISM],
  ['tv programma', 'tv-programma', INITIALISM],
  ['AI tool', 'AI-tool', INITIALISM],
  ['AI tools', 'AI-tools', INITIALISM],
  ['IT afdeling', 'IT-afdeling', INITIALISM],
  ['kmo bedrijf', 'kmo-bedrijf', INITIALISM],
  ['3D printer', '3D-printer', NUMERAL],
  ['3D printers', '3D-printers', NUMERAL],
  ['A4 formaat', 'A4-formaat', NUMERAL],
  ['mp3 speler', 'mp3-speler', NUMERAL],
  ['4G abonnement', '4G-abonnement', NUMERAL],
];

// Unicode-aware boundaries also exclude fragments of identifiers and compounds.
const WORD_EDGE = "[\\p{L}\\p{N}\\p{M}_'’\\-]";
const SPACE = '[ \\t\\u00a0]+';
const WEEKDAYS = 'maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag';
const MONTHS = 'januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december';

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bounded(pattern: string, flags = 'gu'): RegExp {
  return new RegExp(`(?<!${WORD_EDGE})(?:${pattern})(?!${WORD_EDGE})`, flags);
}

// NULs, not spaces: a rule must not join words across hidden code or markup.
// Replacing UTF-16 code units (without /u) preserves the offsets used by JS.
function mask(text: string): string {
  return text.replace(/[^\r\n]/g, '\0');
}

function protectText(text: string, terms: string[]): string {
  // Process fences line by line, including unclosed fences, before inline code.
  let fence: { char: string; length: number } | undefined;
  let t = text.replace(/[^\n]*(?:\n|$)/g, (line) => {
    const marker = line.match(/^[ \t]*(?:>[ \t]?)*(`{3,}(?=[^`]*$)|~{3,})/);
    if (fence) {
      const closing = new RegExp(`^[ \\t]*(?:>[ \\t]?)*${fence.char}{${fence.length},}[ \\t\\r\\n]*$`);
      if (closing.test(line)) fence = undefined;
      return mask(line);
    }
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return mask(line);
    }
    return line;
  });
  t = t.replace(/(`+)[^`\n]*?\1/g, mask);
  t = t.replace(/<!--[^]*?(?:-->|$)/g, mask);
  t = t.replace(/<(h[1-6]|pre|code|script|style|title|cite|q|em|i)\b[^>]*>[^]*?<\/\1\s*>/gi, mask);
  t = t.replace(/<[A-Za-z!/?][^<>]*>/g, mask);
  t = t.replace(/^ {0,3}#{1,6}(?:[ \t]+|$)[^\n]*/gm, mask);
  t = t.replace(/^[^\n]+\r?\n {0,3}(?:={3,}|-{3,})[ \t]*\r?$/gm, mask);
  t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, mask);
  t = t.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, mask);
  t = t.replace(new RegExp(BARE_DOMAIN_RE.source, 'gi'), mask);
  // Preserve link labels as prose, but never check destinations or titles.
  t = t.replace(/\]\([^\n)]*\)/g, mask);
  t = t.replace(/^ {0,3}\[[^\]\n]+\]:[^\n]*/gm, mask);
  // Marked titles and quotations are conservatively excluded, not rewritten.
  t = t.replace(/"[^"\n]*"|“[^”\n]*”|„[^”“\n]*[”“]|”[^”\n]*”|«[^»\n]*»|‹[^›\n]*›/g, mask);
  t = t.replace(/(?<![\p{L}\p{N}])[‘‚](?![stn][ \t\u00a0])[^’‘\n]*’(?![\p{L}\p{N}])/gu, mask);
  t = t.replace(/(?<![\p{L}\p{N}])'(?![stn][ \t\u00a0])[^'\n]+'(?![\p{L}\p{N}])/gu, mask);
  t = t.replace(/(?<![\p{L}\p{N}_*])(\*{1,2}|_{1,2})(?=\S)[^\n]*?\S\1(?![\p{L}\p{N}_*])/gu, mask);
  for (const term of terms) {
    const words = term.trim().split(/[ \t\u00a0]+/);
    if (words[0]) t = t.replace(bounded(words.map(escapeRe).join(SPACE)), mask);
  }
  return t;
}

/** Return review findings without modifying the caller's source text. */
export function findDutchSpellingIssues(text: string, options: DutchSpellingOptions = {}): DutchSpellingIssue[] {
  const t = protectText(text, options.protectedTerms ?? []);
  const hits: DutchSpellingIssue[] = [];
  for (const [wrong, correct, definition] of PAIRS) {
    const re = bounded(wrong.split(' ').map(escapeRe).join(SPACE), 'giu');
    for (const m of t.matchAll(re)) {
      const parts = m[0].split(/[ \t\u00a0]+/);
      // Internal capitals may identify a business or title ("Keuken Tafel").
      if (parts.slice(1).some((part) => /\p{Lu}/u.test(part))) continue;
      const suggestion = parts[0] + correct.slice(parts[0].length);
      hits.push({ ...definition, matched: text.slice(m.index, m.index + m[0].length),
        suggestion, index: m.index, end: m.index + m[0].length });
    }
  }

  const calendarRe = bounded(`${WEEKDAYS}|${MONTHS}`, 'giu');
  const weekdayRe = new RegExp(`^(?:${WEEKDAYS})$`, 'i');
  for (const m of t.matchAll(calendarRe)) {
    if (!/^\p{Lu}\p{Ll}+$/u.test(m[0])) continue;
    const before = t.slice(Math.max(0, m.index - 60), m.index);
    // No broad proper-name recognition: only explicit date/time cues qualify.
    // Thus "Mei belt" and "werken bij Maandag" are left alone by default.
    const cue = weekdayRe.test(m[0])
      ? '(?:op|vanaf|tot|sinds|elke|iedere|volgende|vorige|komende|aanstaande|afgelopen|deze)'
      : '(?:in|vanaf|tot|sinds|volgende|vorige|komende|aanstaande|afgelopen|deze|(?:0?[1-9]|[12][0-9]|3[01]))';
    const cueMatch = new RegExp(`(?<!${WORD_EDGE})(${cue})${SPACE}$`, 'iu').exec(before);
    if (!cueMatch) continue;
    if (/\p{Lu}/u.test(cueMatch[1])) {
      const prefix = t.slice(0, m.index - before.length + cueMatch.index);
      // An internal capital may belong to a name ("Elke Maandag") or title.
      if (!/(?:^|[.!?\n])[ \t\u00a0]*(?:[-*+>|][ \t]*|\d+[.)][ \t]*)?$/.test(prefix)) continue;
    }
    hits.push({ ...CALENDAR, matched: m[0], suggestion: m[0].toLowerCase(),
      index: m.index, end: m.index + m[0].length });
  }
  return hits.sort((a, b) => a.index - b.index || a.ruleId.localeCompare(b.ruleId));
}
