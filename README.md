# language-mcp

A local MCP server for Dutch and US English language checks, built for AI agents
(Hermes, Claude, and others) that write resumes, cover letters, blog articles,
and website copy.

**Currently supported: Dutch and US English.** Additional languages can be
implemented by adding dictionaries, language-specific rules, and MCP tools;
they are not supported automatically by selecting an arbitrary language.

## Tools

| Tool | Source | Network | Purpose |
|---|---|---|---|
| `check_us_english_text` | hunspell en_US + British form detection (local) | No | Check text for typos and British spelling or vocabulary, with US replacements |
| `check_us_english_b1_text` | hunspell en_US `-m` + rule layers (local) | No | B1 plain-language proxies: readability (Flesch Reading Ease, Flesch-Kincaid, ARI), sentence/paragraph length, passive voice, jargon, wordy phrases, hidden verbs, filler, idioms, nominalization density, "you" address |
| `validate_us_english_word` | hunspell en_US + British form detection (local) | No | Check a single English word for correct US English spelling and suggest replacements |
| `check_dutch_text` | OpenTaal/hunspell (local) | No | Check a complete text and return flagged words, suggestions, and positions |
| `check_dutch_b1_text` | OpenTaal/hunspell `-m` + rule layers (local) | No | B1 simplicity proxies: readability (Flesch-Douma, ARI), sentence/paragraph length, passive voice, officialese jargon, filler, idioms, nominalization density, je/u voice |
| `validate_dutch_word` | OpenTaal/hunspell (local) | No | Check a single Dutch word locally for correct spelling, with suggestions |
| `get_dutch_word_details` | woordenlijst.org (MolexServe) | Yes | Retrieve lemma details: part of speech, pronunciation, hyphenation, paradigm, and diminutive forms |

The local tools use bundled hunspell dictionaries: OpenTaal for Dutch (v2.20.23)
and SCOWL/LibreOffice en_US for US English. The detector for British forms
catches terms that hunspell does not flag (`whilst`, `towards`, `bespoke`,
`webshop`, `sole trader`, `findability`, etc.), including categories from the
Straffe Sites US English guidelines, and provides a US replacement for each match.

`get_dutch_word_details` queries the internal XML service at woordenlijst.org
(INT/Taalunie). This unofficial integration uses caching and rate limiting
(1.2 seconds between calls); use it only for individual important words.
Tool descriptions and status messages are in US English; Dutch words and
upstream dictionary labels retain their original language.

## B1 simplicity checks

Both B1 tools report deterministic proxies with the same structure: a
readability block, passive voice, rule hits with plain alternatives and
positions in the source text, nominalization density, and a reader-address
check. Thresholds are tool parameters because conventions differ by sector.

### Dutch

`check_dutch_b1_text` reports deterministic B1 proxies, not a validated B1
verdict: "B1" applied to texts is an editorial convention (Rijksoverheid
guideline: write new material at B1, aiming for A2), not an empirically
validated text norm. What the tool measures:

- Readability: Flesch-Douma reading ease (NL-adapted Flesch; practical B1
  band ~60-70) and ARI as a second, language-neutral indication. Formulas
  are suppressed below 50 words / 3 sentences (short-sample guard).
- Sentence and paragraph length against configurable thresholds (defaults:
  warn >15, flag >20 words per sentence; 150 words per paragraph, matching
  common editorial guidelines).
- Passive voice: `hunspell -m` morphology batch plus an auxiliary window
  (wordt/worden/werd + past participle = high confidence; is/zijn + past
  participle = low-confidence zijn-passive; "door" agent noted). These are
  review flags: context-free morphology cannot tell a genuine passive from
  a copula construction, so editors judge each hit.
- Officialese jargon with plain alternatives (betreffende → over, thans →
  nu, in het kader van → voor...), filler words, and idioms to avoid for
  NT2 readers, each with the match position in the source text.
- Nominalization density (-ing/-tie/-heid/-iteit words per 100 words) and
  je/u voice consistency (default je, configurable to u).

All checks are local and offline: the same bundled OpenTaal assets and
hunspell binary as the spelling tools, plus pure TypeScript rule layers in
the spirit of the British-form detector.

### US English

`check_us_english_b1_text` applies the same approach to US English, with
English formulas, thresholds, and rule sources:

- Readability: Flesch Reading Ease (practical B1 band 60-70, "plain
  English" in Flesch's table), Flesch-Kincaid grade level (default target
  9 or lower), and ARI. A zero-dependency syllable counter agrees with the
  CMU Pronouncing Dictionary on about 94% of the 10,000 most common US
  English words. The same short-sample guard applies.
- Sentence and paragraph length: defaults warn above 20 and flag above 25
  words per sentence (plainlanguage.gov average and the GOV.UK limit), and
  the longest flagged sentences are listed with positions.
- Passive voice: `hunspell -m` with the bundled en_US dictionary marks
  regular -ed forms (affix flag D); a closed list covers irregular
  participles (written, built, sold). Detects be-passives, get-passives,
  and pronoun contractions ("it's built"), notes a "by" agent, skips "used
  to", and marks adjectival uses ("is located") as low confidence.
- Formal jargon and buzzwords (utilize → use, prior to → before, robust,
  leverage), wordy phrases (in order to → to, due to the fact that →
  because), hidden verbs (make a decision → decide, provide assistance →
  help), filler words, and idioms, based on the Federal Plain Language
  Guidelines and the GOV.UK "words to avoid" list. British spellings stay
  in `check_us_english_text`.
- Nominalization density (-tion/-sion/-ment/-ance/-ence/-ity per 100
  words, everyday nouns excluded) and reader address: third-person
  references to the reader ("users", "the customer") are reported when the
  expected address is "you" (default).

## Example: check US English copy

Call `check_us_english_text` with:

```json
{
  "text": "We build custom online stores with colorful designs and clear navigation."
}
```

The tool reports the number of words checked, unknown words, and British forms.
It provides suggestions and positions for flagged words. Review suggestions in
context: proper names and technical terms may be valid even when flagged.
For plain-language checks on the same copy, call `check_us_english_b1_text`
with the same text. For Dutch copy, use `check_dutch_text` and
`check_dutch_b1_text` instead.

## Installation

Requirements: Node 20+ and `hunspell` on PATH (`pacman -S hunspell`).

```bash
npm install
npm run build   # Compile TypeScript into dist/
```

## Tests

```bash
npm test        # Run node:test through tsx
```

## Hermes configuration (stdio)

```yaml
mcp_servers:
  language:
    command: node
    args: [/absolute/path/to/language-mcp/dist/cli.js]
    connect_timeout: 60
    enabled: true
    timeout: 120
```

## License and attribution

Code: MIT.

Dictionary assets:
- `assets/nl.dic` / `assets/nl.aff`: © OpenTaal — Revised BSD License and/or CC BY 3.0. Full terms are in `assets/LICENSE.txt`; source: https://github.com/OpenTaal/opentaal-hunspell. Reusing these assets requires attribution to OpenTaal.
- `assets/en_US.dic` / `assets/en_US.aff`: based on the SCOWL word list (Kevin Atkinson, LGPL), with an affix file from Geoff Kuenning's Ispell (BSD), distributed through LibreOffice/dictionaries. See `assets/en_US-LICENSE.txt` and `assets/en_US-README.txt`; source: https://github.com/LibreOffice/dictionaries/tree/master/en.

`get_dutch_word_details` data: woordenlijst.org (Instituut voor de Nederlandse
Taal / Taalunie), accessed through its public web service without a separate
API agreement.
