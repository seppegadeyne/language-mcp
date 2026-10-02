/**
 * English syllable counting heuristic (zero dependencies, deterministic).
 *
 * Counts vowel groups (a, e, i, o, u, y) after normalizing spelling:
 * - "qu"/"gu" + vowel: the u is a consonant glide (quick, league);
 * - silent "e" before common suffixes and compound tails (statement,
 *   useful, something, homepage, likely);
 * - final silent "e" (make), except consonant + "le" (simple, table);
 * - "-es" is silent after most consonants (makes) but forms its own syllable
 *   after sibilants (boxes, pages, uses, wishes);
 * - "-ed" is silent except after t/d (liked vs. wanted, needed);
 * - leading "y" is a consonant (yes, young).
 * Corrections add a syllable for hiatus patterns that one vowel group hides
 * (being, idea, radio, client, player) and for "-ire"/"our" r-glides
 * (fire, hour).
 *
 * Measured against the CMU Pronouncing Dictionary on the 10,000 most common
 * US English words (see tests/b1-en.test.ts for anchored cases). Good enough
 * for readability statistics (Flesch Reading Ease, Flesch-Kincaid), not for
 * hyphenation.
 */

// Vowel pairs that are usually two syllables (hiatus) ...
const HIATUS_RE = /(?:ia|io|iu|ua|uo|eo|ie(?=n[ct])|(?<!^e)[aeiou]y(?:[aou]|e(?![ds]?$))|ea(?=te|tion))/g;
// ... and the contexts in which those same letters form one syllable.
const NOT_HIATUS_RE = /(?:[cgstx]i[aou]|[cgstx]ie(?=n)|[ln]io(?=n)|peo|geo(?=r)|eou|ieu|uou|uay)/g;

const SILENT_E_TAIL =
  /([aeiouy][^aeiouy]{1,2})e(ly|ful|fully|ment|ments|ness|less|ty|ties|some|thing|things|one|ones|times|where|page|pages|line|lines|fore|way|ways|work|works)$/;

export function countSyllablesEn(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1;
  // Words without vowels are acronyms or symbols (HTML, PDF): count as 1.
  if (!/[aeiouy]/.test(w)) return 1;

  w = w.replace(/qu(?=[aeiouy])/g, 'q').replace(/gu(?=[aeiy])/g, 'g');
  w = w.replace(SILENT_E_TAIL, '$1$2');

  let extra = 0;
  // Vowel + -ing is a separate syllable: being, going, seeing.
  if (/[aeiouy]ings?$/.test(w)) extra++;
  // Final -ea after a consonant: idea, area (ideas, areas).
  if (/[^aeiou]eas?$/.test(w)) extra++;
  // fire, hire, require(d), hour(s), our: the r-glide adds a syllable.
  if (/[^aeiou]ire[sd]?$|^h?ours?$/.test(w)) extra++;
  const hiatus = w.match(HIATUS_RE)?.length ?? 0;
  const merged = w.match(NOT_HIATUS_RE)?.length ?? 0;
  extra += Math.max(0, hiatus - merged);

  // Silent endings.
  if (/[^aeiouyl]l(?:es|ed)$/.test(w)) {
    w = w.slice(0, -1); // tables, handled: keep the consonant + le syllable
  } else if (/(?:[sxz]|ch|sh|[cg])es$/.test(w)) {
    // boxes, pages, uses, wishes: -es is pronounced.
  } else if (/[^aeiouy]es$/.test(w) || /[aeiouy][^aeiouy]es$/.test(w)) {
    w = w.slice(0, -2);
  } else if (w.length > 3 && /[^td]ed$/.test(w)) {
    w = w.slice(0, -2);
  } else if (/[^aeiouyl]le$/.test(w)) {
    // simple, table: the final -le is a syllable.
  } else if (w.length >= 3 && /[^aeiouy]e$/.test(w) && !/^(?:any)?one$/.test(w)) {
    w = w.slice(0, -1);
  }
  w = w.replace(/^y(?=[aeiou])/, '');

  const groups = w.match(/[aeiouy]+/g)?.length ?? 0;
  return Math.max(1, groups + extra);
}
