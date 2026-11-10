# AGENTS.md

Guidelines for AI agents (Hermes, etc.) working in this repository.

## Core architecture (do not change without a reason)

- **Spell-check engine: C hunspell binary, NOT pure JavaScript (nspell).**
  We invoke the `hunspell` C binary through the `-a`/ispell pipe
  (`src/hunspell.ts`) for Dutch, US English, and French checks. This is a deliberate
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

- `check_<language>_text` → check the spelling of a complete text (`dutch`, `us_english`, or `french`).
- `validate_<language>_word` → check a single word: yes/no plus suggestions.
- `get_dutch_word_details` → detailed lemma data from woordenlijst.org (network access).
- Naming convention: verb + language + object. Do not omit the verb prefix
  (for example, `dutch_word_details` is obsolete and has been renamed).
- Use consistent language identifiers: `dutch`, `us_english`, and `french`.

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

## Shared B1 conventions (all languages)

- Prose word counts include one-letter words (`u`, `a`, `I`, `à`, `y`); only
  the spelling tokenizer (`src/tokenize.ts`) skips them. A dotted abbreviation
  (`o.a.`, `e.g.`) is one word. `hunspellMorph` accepts letter-only words:
  hunspell prints no block for a symbol, which fails the whole batch.
- Band labels name the text, not the score: `easier than B1`, `B1`,
  `harder than B1`, `much harder than B1`. The minimum parameters
  (`flesch_douma_min`, `flesch_min`, `kandel_moles_min`) move the band edge,
  not only the label.
- Run `npx tsx tests/eval/b1-amsterdam.ts` before and after a change to the
  Dutch B1 layer and report the separation numbers (`docs/b1-eval.md`).

## Dutch contextual spelling layer (since v0.6.0)

- `src/dutch-spelling.ts` adds selected compound, hyphen, and calendar rules
  to `check_dutch_text`; C Hunspell remains the word-check engine.
- Use closed, source-backed patterns, not arbitrary dictionary-based joins.
  Add both incorrect examples and accepted alternatives as regression tests.
  Exclude ambiguous finite verbs (`offerte aanvraag`, `menu uitdraai`) and
  double objects (`klanten service`), not only infinitives. Test typography,
  quotation variants, malformed markup, and Unicode-aware word boundaries.
- Every finding needs a stable rule ID, an original English explanation,
  original UTF-16 start/end offsets, confidence, and precise source metadata.
- `protected_terms` has one contract in the three spelling tools
  (`spellTokens` in `src/server.ts`): words fully inside an occurrence are not
  reported, and the count of skipped words is. It is not a general whitelist.
- Calendar homographs require explicit time cues. Preserve marked titles,
  quoted text, and caller-supplied case-sensitive `protected_terms`. Do not
  claim universal proper-name recognition or general grammar checking.
- Mask protected spans with length-preserving barriers, not whitespace that
  lets a match bridge hidden code or markup. Keep B1 behavior independent.
- Sources, reuse terms, exceptions, and limits: `docs/dutch-spelling.md`.

## File input and provenance (since v0.9.0)

- `src/source.ts` resolves `text` or `path` (+ `start`/`end` code-point range,
  `expected_sha256`) for the four check tools; `withInput` in `src/server.ts`
  adds the `Input:` provenance line after each report header.
- Hash the exact UTF-8 bytes and never normalize (BOM, newlines): callers
  compare `input_sha256` with `sha256sum` and with coverage manifests.
- Ranges are Unicode code points; finding positions stay UTF-16 offsets into
  the checked text. Do not mix the two units.
- `LANGUAGE_MCP_ROOTS` optionally restricts readable folders. Keep the file
  limit, binary and UTF-8 refusals; add a test for every new input rule.

## French layer (since v0.10.0)

- `check_french_text`, `check_french_b1_text`, `validate_french_word`; details,
  limits, and licenses in `docs/french.md`.
- Dictionary: Dicollecte/Grammalecte v7.7 "toutes variantes" (MPL 2.0), bundled as
  `assets/fr.dic`/`fr.aff` with `assets/fr-SOURCE.txt` provenance. A missing
  dictionary gives a clear `French dictionary not found` error from the spelling
  tools, and the B1 tool skips only its passive section.
- Readability is Kandel & Moles (1958), not Flesch-Douma or Flesch. Syllables
  come from `src/syllables-fr.ts` (heuristic; mute final e not counted),
  measured against Lexique 3.83 with `tests/eval/syllables-fr-lexique.ts`
  (Lexique is CC BY-SA and not bundled). Re-measure before changing its rules
  and keep the accuracy statement in `docs/french.md` honest.
- The fr morphology (`-m`) has no single participle tag; `src/passive-fr.ts`
  combines `st:` stems with a closed list. Precision first: skip être-compound
  participles and reflexives rather than guess.
- The default address form is `vous` (website copy). The tu/vous detector
  (`src/voice-fr.ts`) matches pronouns and possessives only.

## Development practices

- TypeScript, Node 18+. Tests: `npx tsx --test tests/*.test.ts` (node:test + assert).
- Build: `npx tsc -p tsconfig.json` → `dist/cli.js`.
- Read CONSTRAINTS.md before writing code. Never weaken it to make a change pass; tightening is fine.
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
- The server currently supports Dutch, US English, and French. Describe
  additional languages as extensions that require dictionaries, rules, and
  tools, not as languages already supported.

## Dependencies and runtime

- The `hunspell` executable and dictionaries (Dutch, US English, and French) must be
  available. Dictionaries are bundled in `assets/`, with system dictionaries
  as fallbacks. This is an intentional runtime dependency (see ADR 001).
