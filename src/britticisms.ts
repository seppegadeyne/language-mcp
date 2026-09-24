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
const RULES: Array<{ re: RegExp; us: string; note?: string }> = [
  // Spelling
  { re: /\bcolour(s|ed|ing|ful|less)?\b/gi, us: 'color$1' },
  { re: /\bcentre(d|s)?\b/gi, us: 'center$1' },
  { re: /\borganis(e|ed|es|ing|ation|ations|ational)\b/gi, us: 'organiz$1' },
  { re: /\banalys(e|ed|es|ing)\b/gi, us: 'analyz$1' },
  { re: /\bfavourite(s)?\b/gi, us: 'favorite$1' },
  { re: /\benrolment(s)?\b/gi, us: 'enrollment$1' },
  { re: /\bprogramme(s)?\b/gi, us: 'program$1' },
  { re: /\bfulfil(l?ed|l?ing|ment|ments)?\b/gi, us: 'fulfill$1', note: 'US doubles the final l before suffixes' },
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
  { re: /\bcentre(d|s)?\b/gi, us: 'center$1' },
  { re: /\bcatalogue(s|d)?\b/gi, us: 'catalog$1' },
  { re: /\bdialogue(s)?\b/gi, us: 'dialog$1', note: 'dialog is preferred in computing contexts' },
  { re: /\bjudgement(s)?\b/gi, us: 'judgment$1' },
  { re: /\bkerb\b/gi, us: 'curb' },
  { re: /\btyre(s)?\b/gi, us: 'tire$1' },
  { re: /\baeroplane(s)?\b/gi, us: 'airplane$1' },
  { re: /\bmanoeuvre(s|d|ing)?\b/gi, us: 'maneuver$1' },
  { re: /\bplough(s|ed|ing)?\b/gi, us: 'plow$1' },
  { re: /\bsceptic(al|s|ism)?\b/gi, us: 'skeptic$1' },
  { re: /\bstorey(s)?\b/gi, us: 'story$1' },

  // Grammar / function words
  { re: /\bwhilst\b/gi, us: 'while', note: 'whilst is almost unused in US English' },
  { re: /\bamongst\b/gi, us: 'among' },
  { re: /\btowards\b/gi, us: 'toward', note: 'US strongly prefers toward (no s)' },
  { re: /\bafterwards\b/gi, us: 'afterward' },
  { re: /\bbackwards\b/gi, us: 'backward', note: 'direction adverbs drop the s in US usage' },
  { re: /\bforwards\b/gi, us: 'forward' },
  { re: /\bgot\b(?= time)/gi, us: 'gotten', note: 'US uses gotten as past participle of get in most senses' },

  // Vocabulary
  { re: /\bwebshop(s)?\b/gi, us: 'online store$1', note: 'webshop is not US vocabulary' },
  { re: /\bsole trader(s)?\b/gi, us: 'self-employed professional$1', note: 'straffesites guideline' },
  { re: /\bbespoke\b/gi, us: 'custom', note: 'straffesites guideline' },
  { re: /\bfindability\b/gi, us: 'search visibility', note: 'straffesites guideline' },
  { re: /\bshopping basket\b/gi, us: 'shopping cart', note: 'straffesites guideline' },
  { re: /\badd(ed)? to basket\b/gi, us: 'add to cart', note: 'straffesites guideline' },
  { re: /\blift(s)?\b/gi, us: 'elevator$1', note: 'only when meaning elevator' },
  { re: /\bflat(s)?\b(?=.{0,15}(apartment|rent|building))/gi, us: 'apartment$1' },
  { re: /\bfortnight\b/gi, us: 'two weeks' },
  { re: /\bautumn\b/gi, us: 'fall' },
  { re: /\bmobile phones?\b/gi, us: 'cell phone$1' },
  { re: /\btrainers\b(?=.{0,10}(shoe|wear))/gi, us: 'sneakers' },
  { re: /\bhigh street\b/gi, us: 'main street' },
  { re: /\bpost\b(?=.{0,10}(code|al))/gi, us: 'mail' },
  { re: /\bpostcode(s)?\b/gi, us: 'ZIP code$1' },
  { re: /\bCV\b/g, us: 'resume', note: 'CV means something narrower in the US' },
  { re: /\bholiday(s)?\b(?=.{0,25}(book|package|season))/gi, us: 'vacation$1' },
  { re: /\bcaretaker\b/gi, us: 'janitor' },
  { re: /\bqueue(d|s|ing)?\b/gi, us: 'line$1', note: 'as a noun: people waiting' },
  { re: /\bgaol(s)?\b/gi, us: 'jail$1' },
  { re: /\bbiscuits?\b/gi, us: 'cookies', note: 'food context' },
  { re: /\bcrisps?\b/gi, us: 'chips' },
  { re: /\bchips\b(?=.{0,10}fish)/gi, us: 'fries' },
  { re: /\baubergine(s)?\b/gi, us: 'eggplant$1' },
  { re: /\bcourgette(s)?\b/gi, us: 'zucchini$1' },
  { re: /\bcoriander\b/gi, us: 'cilantro' },
  { re: /\bprawns?\b/gi, us: 'shrimp' },
  { re: /\bmaize\b/gi, us: 'corn' },
  { re: /\bmaths\b/gi, us: 'math' },
  { re: /\btimetable(s)?\b/gi, us: 'schedule$1' },
  { re: /\bnappy(ies)?\b/gi, us: 'diaper$1' },
  { re: /\bjumper(s)?\b/gi, us: 'sweater$1' },
  { re: /\btrousers?\b/gi, us: 'pants' },
  { re: /\bwaistcoat(s)?\b/gi, us: 'vest$1' },
  { re: /\bboot\b(?=.{0,15}(car|trunk))/gi, us: 'trunk' },
  { re: /\bwindscreen(s)?\b/gi, us: 'windshield$1' },
  { re: /\bnumber plate(s)?\b/gi, us: 'license plate$1' },
  { re: /\bpetrol\b/gi, us: 'gas' },
  { re: /\bcar park(s|ing)?\b/gi, us: 'parking lot$1' },
  { re: /\bmotorway(s)?\b/gi, us: 'highway$1' },
  { re: /\bsaloon\b/gi, us: 'sedan' },
  { re: /\bhire(d)?\b(?=.{0,10}(car|bike|staff))/gi, us: 'rent$1' },
  { re: /\bflatmate(s)?\b/gi, us: 'roommate$1' },
  { re: /\bbarrister(s)?\b/gi, us: 'attorney$1' },
  { re: /\bsolicitor(s)?\b/gi, us: 'lawyer$1' },
  { re: /\bpostman\b/gi, us: 'mail carrier' },
  { re: /\bdummy\b(?=.{0,8}baby)/gi, us: 'pacifier' },
  { re: /\btellies?\b/gi, us: 'TVs' },
  { re: /\bfull stop\b/gi, us: 'period' },
  { re: /\binverted commas\b/gi, us: 'quotation marks' },
  { re: /\bbrackets\b/gi, us: 'parentheses', note: 'round brackets in US English' },
  { re: /\banticlockwise\b/gi, us: 'counterclockwise' },
  { re: /\bbrought\b(?=.{0,15}(up|down))/gi, us: 'raised' },
];

export interface BritticismHit {
  index: number;
  matched: string;
  american: string;
  note?: string;
}

export function findBritticisms(text: string): BritticismHit[] {
  const hits: BritticismHit[] = [];
  const seen = new Map<string, BritticismHit & { count: number }>();
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const matched = m[0];
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
