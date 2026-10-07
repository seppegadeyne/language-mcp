# B1 evaluation baseline (Amsterdam complex–simple corpus)

`check_dutch_b1_text` reports deterministic B1 proxies, but nothing measures
whether those proxies actually separate difficult Dutch from simple Dutch.
This document describes the evaluation baseline used to ground future B1
changes in evidence.

## Corpus

- Source: [Amsterdam-AI-Team/dutch-municipal-text-simplification](https://github.com/Amsterdam-AI-Team/dutch-municipal-text-simplification)
- File: `complex-simple-sentences/complex-simple-v1-anonymized.csv` — 1311
  automatically aligned sentence pairs (complex, simplified) from ~50 municipal
  documents rewritten by communications experts of the City of Amsterdam.
- License: EUPL-1.2 (City of Amsterdam). Bundled under
  `assets/eval/amsterdam-complex-simple/` with its own license and attribution
  file, kept separate from the MIT server code — same pattern as the bundled
  hunspell dictionaries.

## Harness

- `tests/eval/b1-amsterdam.ts` (run with `npx tsx tests/eval/b1-amsterdam.ts`):
  loads the corpus, runs `check_dutch_b1_text` over the complex and the simple
  side of every pair, and reports per-rule flag rates plus aggregate measures
  for both sides.
- Key metric per rule: **separation** = flag rate on complex sentences minus
  flag rate on simple sentences. A useful proxy flags complex text clearly
  more often than its simplified counterpart.
- Baseline output: `tests/eval/baseline-v1.json` (committed), produced on the
  exact commit recorded inside the file. Future B1 changes (word frequency,
  extra formulas, new rules) must re-run the harness and compare against this
  baseline in their PR.

## Rules of engagement

- The corpus is evaluation data, never runtime input: no corpus sentence may
  end up in rule lists or word lists.
- Automatic alignment means the pairs are noisy; treat metrics as trend
  indicators, not ground truth. Report raw numbers, do not tune thresholds to
  maximize separation on this set alone.
- Dutch sentences in the corpus are language data, not prose to translate.

## Positioning

The harness measures proxy behavior only. It does not turn the tool into a
validated B1 verdict; that positioning (documented in the tool description)
is unchanged.
