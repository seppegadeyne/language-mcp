/**
 * Tokenize Dutch or English text into checkable words.
 * Keeps words with hyphens (koel-vries), apostrophes ('s morgens, geëind),
 * and strips surrounding punctuation. Skips numbers, URLs, emails, code.
 *
 * All strips are length-preserving (replaced by spaces of equal length), so
 * every token carries its exact offset in the ORIGINAL text. Looking up
 * positions with text.indexOf(word) would return the first substring match,
 * which can sit inside another word.
 */

export interface Token {
  word: string; // as written in text
  clean: string; // word without trailing punctuation like 's- or sentence dot
  index: number; // offset of `word` in the original text
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
// Bare domain names without a protocol (Verhuurwinkel.nl, example.com/beamers)
// so their TLD is not flagged as an unknown word. The \b after the TLD keeps
// "this.common" from matching as "this.com". Shared with src/prose.ts.
export const BARE_DOMAIN_RE =
  /\b[\w-]+\.(?:nl|com|be|eu|org|net|info|biz|io|ai|dev|app|co|uk|de|fr|edu|gov)\b(?:\/\S*)?/gi;

const blanks = (m: string) => ' '.repeat(m.length);

export function extractWords(text: string, maxWords = 2000): Token[] {
  let t = text.replace(URL_RE, blanks).replace(EMAIL_RE, blanks).replace(BARE_DOMAIN_RE, blanks);

  // Protect code blocks and inline code from markdown-ish input.
  t = t.replace(/```[\s\S]*?```/g, blanks).replace(/`[^`\n]*`/g, blanks);

  const tokens: Token[] = [];
  for (const m of t.matchAll(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*/g)) {
    const w = m[0];
    let clean = w.replace(/['’-]+$/, ''); // trailing apostrophe/hyphen noise
    clean = clean.replace(/^['’]+/, '');
    if (clean.length < 2) continue;
    if (/^\d+$/.test(clean)) continue;
    // Skip ALL-CAPS acronyms of <=5 chars (HTML, KMO, VOF) and single letters+dot patterns
    if (/^[A-Z]{2,5}$/.test(clean)) continue;
    tokens.push({ word: w, clean, index: m.index ?? 0 });
    if (tokens.length >= maxWords) break;
  }
  return tokens;
}
