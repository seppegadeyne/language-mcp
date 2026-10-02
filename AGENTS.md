# AGENTS.md

Guidelines for AI agents (Hermes, etc.) working in this repository.

## Core architecture (do not change without a reason)

- **Spell-check engine: C hunspell binary, NOT pure JavaScript (nspell).**
  We invoke the `hunspell` C binary through the `-a`/ispell pipe
  (`src/hunspell.ts`) for Dutch and US English checks. This is a deliberate
  decision; see [ADR 001](docs/adr/001-hunspell-binary-over-nspell.md).
  The key reason: the `-a` pipe checks each part of words separated by hyphens
  or em dashes ("data-driven", "real-time"). nspell has no equivalent, so we
  would have to implement that splitting ourselves, risking false positives.
  The detector for British forms (`src/britticisms.ts`) is independent of
  either engine and must remain unchanged when switching engines.
  Do not switch to nspell unless a specific target cannot run C hunspell,
  and only after an A/B parity test (correctness and suggestions, including
  the top eight), not on assumptions.

## Tool naming (since v0.3.0)

- `check_<language>_text` → check the spelling of a complete text (`dutch` or `us_english`).
- `validate_<language>_word` → check a single word: yes/no plus suggestions.
- `get_dutch_word_details` → detailed lemma data from woordenlijst.org (network access).
- Naming convention: verb + language + object. Do not omit the verb prefix
  (for example, `dutch_word_details` is obsolete and has been renamed).
- Use consistent language identifiers: `dutch` and `us_english`.

## B1 simplicity layer (since v0.4.0)

- `check_dutch_b1_text` reports deterministic B1 proxies (readability
  Flesch-Douma/ARI, sentence and paragraph length, passive voice, officialese
  jargon, filler, idioms, nominalization density, je/u voice consistency),
  NOT a validated B1 verdict. Keep that positioning in descriptions.
- Passive detection runs a separate `hunspell -m` batch (`src/passive.ts`):
  the `-a` ispell pipe returns no morphology. OpenTaal's nl.aff uses `ts:`/
  `st:` fields (not `is:` fields), bare participles get no `ts:VBpe` tag
  (only affix-derived forms do), and separable compounds analyze as compound
  stems (`uitgevoerd` → `uit st:gevoerd`). Protocol notes are in
  `src/passive.ts` comments.
- Thresholds (sentence/paragraph length, Flesch-Douma minimum, voice) are
  tool parameters because sector conventions differ; do not hard-code new
  limits inside the modules.

## US English B1 layer (since v0.5.0)

- `check_us_english_b1_text` mirrors the Dutch tool: Flesch Reading Ease,
  Flesch-Kincaid grade, ARI, sentence/paragraph length (defaults 20/25
  words: plainlanguage.gov and GOV.UK), passive voice, jargon, wordy
  phrases, hidden verbs, filler, idioms, nominalization density, and "you"
  address. Same positioning: proxies, not a validated B1 verdict.
- Shared prose pipeline: `analyzeProse(text, 'en' | 'nl')` and
  `computeReadability(..., lang)` take a language; defaults stay Dutch.
  Per-language abbreviation lists live in `src/prose.ts`.
- `src/syllables-en.ts` is calibrated against the CMU Pronouncing
  Dictionary (~94% exact on the 10,000 most common words). Re-measure
  against cmudict before changing its rules; anchored cases are in
  `tests/b1-en.test.ts`.
- English passive detection (`src/passive-en.ts`): en_US `-m` output has
  no ts: tags; regular -ed forms carry `fl:D`, irregular participles are
  bare lemmas, so they come from a closed list. `hunspellMorph` skips
  hyphenated words because the en_US dictionary splits them into one
  block per part.
- British spellings belong in `src/britticisms.ts`, not in the English
  B1 rules (no double reporting).
- Token and rule positions are offsets into the original text; never look
  them up with `text.indexOf(word)` (it matches inside other words).

## Development practices

- TypeScript, Node 18+. Tests: `npx tsx --test tests/*.test.ts` (node:test + assert).
- Build: `npx tsc -p tsconfig.json` → `dist/cli.js`.
- Always run the build, tests, and a manual MCP smoke test (for example,
  `hermes mcp test language`) before reporting a change as complete.

## Public repository language policy

- Write all first-party documentation, comments, test descriptions, tool
  descriptions, and user-facing messages in **US English**.
- Check new or changed prose with language-mcp's `check_us_english_text` tool
  before reporting completion. Review every flag; fix actual errors and
  explain intentional exceptions rather than blindly accepting suggestions.
- Preserve identifiers, API contracts, dictionary contents, upstream license
  and attribution files, Dutch test fixtures, and British detector inputs.
  Dutch words and upstream response values are language data, not prose to translate.
- The server currently supports Dutch and US English. Describe additional
  languages as extensions that require dictionaries, rules, and tools, not
  as languages already supported.

## Dependencies and runtime

- The `hunspell` executable and dictionaries (Dutch and US English) must be
  available. Dictionaries are bundled in `assets/`, with system dictionaries
  as fallbacks. This is an intentional runtime dependency (see ADR 001).
