/**
 * Tokenize Dutch text into checkable words.
 * Keeps words with hyphens (koel-vries), apostrophes ('s morgens, geëind),
 * and strips surrounding punctuation. Skips numbers, URLs, emails, code.
 */

export interface Token {
  word: string; // as written in text
  clean: string; // word without trailing punctuation like 's- or sentence dot
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;

export function extractWords(text: string, maxWords = 2000): Token[] {
  let t = text.replace(URL_RE, ' ').replace(EMAIL_RE, ' ');

  // Protect code blocks and inline code from markdown-ish input.
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');

  const raw = t.match(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*/g) ?? [];
  const tokens: Token[] = [];
  for (const w of raw) {
    let clean = w.replace(/['’-]+$/, ''); // trailing apostrophe/hyphen noise
    clean = clean.replace(/^['’]+/, '');
    if (clean.length < 2) continue;
    if (/^\d+$/.test(clean)) continue;
    // Skip ALL-CAPS acronyms of <=5 chars (HTML, KMO, VOF) and single letters+dot patterns
    if (/^[A-Z]{2,5}$/.test(clean)) continue;
    tokens.push({ word: w, clean });
    if (tokens.length >= maxWords) break;
  }
  return tokens;
}
