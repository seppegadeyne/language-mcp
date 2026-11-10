/**
 * US English britticism detector.
 *
 * hunspell en_US catches some British spellings (colour, centre, programme)
 * but happily accepts others (whilst, towards, bespoke, sole trader).
 * This layer flags British spellings, vocabulary and constructions that a
 * US English content guideline forbids, with the US replacement.
 *
 * Sources: SCOWL/hunspell behavior + the Straffe Sites US English contract
 * (tests/english-us-content-contract.test.mjs categories).
 */

export interface Britticism {
  british: string;
  american: string;
  note?: string;
}

// Word-boundary, case-insensitive; \b handles most, plurals via (?:s|es)? where useful.
// Precision first: a word that is also ordinary US English in another sense
// (lift, queue, crisp, brackets, biscuits, forwards, hire staff, brought up)
// is left out or narrowed to an unambiguous phrase.
const RULES: Array<{ re: RegExp; us: string; note?: string }> = [
  // Spelling
  { re: /\bcolour(s|ed|ing|ful|less)?\b/gi, us: 'color$1' },
  { re: /\bcentre(d|s)?\b/gi, us: 'center$1' },
  { re: /\borganis(e|ed|es|ing|ation|ations|ational)\b/gi, us: 'organiz$1' },
  // Not "analyses": that is also the US plural of analysis.
  { re: /\banalys(e|ed|ing)\b/gi, us: 'analyz$1' },
  { re: /\bfavourite(s)?\b/gi, us: 'favorite$1' },
  { re: /\benrolment(s)?\b/gi, us: 'enrollment$1' },
  { re: /\bprogramme(s)?\b/gi, us: 'program$1' },
  { re: /\bfulfil(s|ment|ments)?\b/gi, us: 'fulfill$1', note: 'US spells it with a double l' },
  { re: /\blicence(s)?\b/gi, us: 'license$1', note: 'US uses license for both noun and verb' },
  { re: /\bpractis(e|ed|es|ing)\b/gi, us: 'practic$1', note: 'verb: practice in US' },
  { re: /\btravelled\b/gi, us: 'traveled' },
  { re: /\blabelled\b/gi, us: 'labeled' },
  { re: /\bmodelling\b/gi, us: 'modeling' },
  { re: /\bcancelled\b/gi, us: 'canceled' },
  { re: /\bmarvellous\b/gi, us: 'marvelous' },
  { re: /\bbehaviour(s|al|ally)?\b/gi, us: 'behavior$1' },
  { re: /\bneighbour(s|hood|ing)?\b/gi, us: 'neighbor$1' },
  { re: /\blabour(s|ed|ing)?\b/gi, us: 'labor$1' },
  { re: /\bhumour(ous)?\b/gi, us: 'humor$1' },
  { re: /\bdefence(s)?\b/gi, us: 'defense$1' },
  { re: /\boffence(s)?\b/gi, us: 'offense$1' },
  { re: /\bmetre(s)?\b/gi, us: 'meter$1' },
  { re: /\bcatalogue(s)?\b/gi, us: 'catalog$1' },
  { re: /\bcatalogued\b/gi, us: 'cataloged' },
  { re: /\bcataloguing\b/gi, us: 'cataloging' },
  // Only the computing term: "dialogue" is the usual US spelling for conversation.
  { re: /\bdialogue box(es)?\b/gi, us: 'dialog box$1' },
  { re: /\bjudgement(s)?\b/gi, us: 'judgment$1' },
  { re: /\bkerb\b/gi, us: 'curb' },
  { re: /\btyre(s)?\b/gi, us: 'tire$1' },
  { re: /\baeroplane(s)?\b/gi, us: 'airplane$1' },
  { re: /\bmanoeuvre(s)?\b/gi, us: 'maneuver$1' },
  { re: /\bmanoeuvred\b/gi, us: 'maneuvered' },
  { re: /\bmanoeuvring\b/gi, us: 'maneuvering' },
  { re: /\bplough(s|ed|ing)?\b/gi, us: 'plow$1' },
  { re: /\bsceptic(al|s|ism)?\b/gi, us: 'skeptic$1' },
  { re: /\bstorey\b/gi, us: 'story' },
  { re: /\bstoreys\b/gi, us: 'stories' },

  // Grammar / function words
  { re: /\bwhilst\b/gi, us: 'while', note: 'whilst is almost unused in US English' },
  { re: /\bamongst\b/gi, us: 'among' },
  { re: /\btowards\b/gi, us: 'toward', note: 'US strongly prefers toward (no s)' },
  { re: /\bafterwards\b/gi, us: 'afterward' },
  { re: /\bbackwards\b/gi, us: 'backward', note: 'direction adverbs drop the s in US usage' },

  // Vocabulary
  { re: /\bwebshop(s)?\b/gi, us: 'online store$1', note: 'webshop is not US vocabulary' },
  { re: /\bsole trader(s)?\b/gi, us: 'self-employed professional$1', note: 'straffesites guideline' },
  { re: /\bbespoke\b/gi, us: 'custom', note: 'straffesites guideline' },
  { re: /\bfindability\b/gi, us: 'search visibility', note: 'straffesites guideline' },
  { re: /\bshopping basket\b/gi, us: 'shopping cart', note: 'straffesites guideline' },
  { re: /\b(add|added|adding) to basket\b/gi, us: '$1 to cart', note: 'straffesites guideline' },
  { re: /\bflat(s)? (?:to|for) rent\b/gi, us: 'apartment$1 for rent' },
  { re: /\bfortnight\b/gi, us: 'two weeks' },
  { re: /\bautumn\b/gi, us: 'fall' },
  { re: /\bmobile phone(s)?\b/gi, us: 'cell phone$1' },
  { re: /\btrainers\b(?=.{0,10}(shoe|wear))/gi, us: 'sneakers' },
  { re: /\bhigh street\b/gi, us: 'main street' },
  { re: /\bpost code(s)?\b/gi, us: 'ZIP code$1' },
  { re: /\bpostcode(s)?\b/gi, us: 'ZIP code$1' },
  { re: /\bCV\b/g, us: 'resume', note: 'CV means something narrower in the US' },
  { re: /\bholiday(s)?\b(?=.{0,25}\b(?:book|package))/gi, us: 'vacation$1' },
  { re: /\bgaol(s)?\b/gi, us: 'jail$1' },
  { re: /\baubergine(s)?\b/gi, us: 'eggplant$1' },
  { re: /\bcourgette(s)?\b/gi, us: 'zucchini$1' },
  { re: /\bprawns?\b/gi, us: 'shrimp' },
  { re: /\bmaize\b/gi, us: 'corn' },
  { re: /\bmaths\b/gi, us: 'math' },
  { re: /\btimetable(s)?\b/gi, us: 'schedule$1' },
  { re: /\bnappy\b/gi, us: 'diaper' },
  { re: /\bnappies\b/gi, us: 'diapers' },
  { re: /\bjumper(s)?\b(?! cables?\b)/gi, us: 'sweater$1' },
  { re: /\btrousers?\b/gi, us: 'pants' },
  { re: /\bwaistcoat(s)?\b/gi, us: 'vest$1' },
  { re: /\bboot of (?:the|my|your|a) car\b/gi, us: 'trunk of the car' },
  { re: /\bwindscreen(s)?\b/gi, us: 'windshield$1' },
  { re: /\bnumber plate(s)?\b/gi, us: 'license plate$1' },
  { re: /\bpetrol\b/gi, us: 'gas' },
  { re: /\bcar park(s)?\b/gi, us: 'parking lot$1' },
  { re: /\bcar parking\b/gi, us: 'parking' },
  { re: /\bmotorway(s)?\b/gi, us: 'highway$1' },
  { re: /\b(car|bike|van) hire\b/gi, us: '$1 rental' },
  { re: /\bflatmate(s)?\b/gi, us: 'roommate$1' },
  { re: /\bbarrister(s)?\b/gi, us: 'attorney$1' },
  { re: /\bsolicitor(s)?\b/gi, us: 'lawyer$1' },
  { re: /\bpostman\b/gi, us: 'mail carrier' },
  { re: /\bdummy\b(?=.{0,8}baby)/gi, us: 'pacifier' },
  { re: /\btelly\b/gi, us: 'TV' },
  { re: /\btellies\b/gi, us: 'TVs' },
  // Not "came to a full stop": that idiom is US English too.
  { re: /(?<!\ba )\bfull stop\b/gi, us: 'period' },
  { re: /\binverted commas\b/gi, us: 'quotation marks' },
  { re: /\bround brackets\b/gi, us: 'parentheses' },
  { re: /\banticlockwise\b/gi, us: 'counterclockwise' },
];

export interface BritticismHit {
  index: number;
  matched: string;
  american: string;
  note?: string;
}

/** `skip` drops matches inside caller-protected spans before they are counted. */
export function findBritticisms(text: string, skip?: (start: number, end: number) => boolean): BritticismHit[] {
  const hits: BritticismHit[] = [];
  const seen = new Map<string, BritticismHit & { count: number }>();
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const matched = m[0];
      if (skip?.(m.index, m.index + matched.length)) continue;
      let us = rule.us;
      // Substitute $1 with the captured suffix when present
      if (m[1] !== undefined && us.includes('$1')) us = us.replace('$1', m[1]);
      else us = us.replace('$1', '');
      const key = `${matched.toLowerCase()}→${us.toLowerCase()}`;
      const existing = seen.get(key);
      if (existing) {
        existing.count++;
      } else {
        const hit: BritticismHit & { count: number } = {
          index: m.index,
          matched,
          american: us,
          note: rule.note,
          count: 1,
        };
        seen.set(key, hit);
        hits.push(hit);
      }
      if (re.lastIndex === m.index) re.lastIndex++; // safety against zero-length
    }
  }
  return hits;
}
