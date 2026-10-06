# PR 3 agent brief — LIX + Brouwer Leesindex as extra Dutch readability proxies

You are implementing PR 3 of a three-PR stack. PR 1 added the evaluation
baseline; PR 2 added the Zipf word-frequency layer. This PR adds two extra
readability formulas to the Dutch B1 tool with zero new dependencies.
Branch from `b1-frequency` (or master once PR 2 merged). Read AGENTS.md first.

## Context

`check_dutch_b1_text` currently reports Flesch-Douma + ARI. The evaluation
baseline (tests/eval/baseline-v1.json) shows Flesch-Douma never fires on
single sentences (intentional short-sample guard: formulas are unstable under
50 words / <3 sentences). Adding two more formulas gives triangulation and a
second Dutch-calibrated signal — Brouwer weights sentence length 2× heavier
than Douma's 0.93, so it flags long sentences more aggressively.

## Formulas (exact coefficients, verified against primary/secondary sources)

- **LIX** (Björnsson 1968):
  `LIX = words/sentences + 100 × (words longer than 6 letters) / words`
  Swedish interpretation scale: <25 children's books, 25–30 simple texts,
  30–40 normal text, 40–50 business information, 50–60 specialist texts,
  >60 very difficult. NOT validated for Dutch — Dutch compounds inflate the
  long-word count, so treat the scale as indicative only and say so in the
  output line and docs.
- **Brouwer Leesindex A** (Brouwer 1963/1974, Dutch Flesch re-calibration):
  `A = 195 − (2/3)·WL − 2·ZL` where WL = syllables per 100 words and ZL =
  average sentence length in words. Equivalent form with per-word syllables:
  `195 − 66.667·ASW − 2·ASL`. Same inputs as Flesch-Douma.

Both formulas are mathematical methods (not copyrightable); cite the sources
in code comments like the existing Flesch-Douma comment block does.

## Implementation

1. `src/readability.ts`:
   - Extend `ReadabilityStats` with `lix: number | null` and
     `brouwer: number | null` (Dutch only, null otherwise).
   - Count words longer than 6 letters in the existing word loop
     (`w.clean.length > 6`).
   - Compute both inside the existing `wordCount >= minWords && sentenceCount
     >= 3` guard — same short-sample protection as the other formulas. Do NOT
     weaken the guard; the baseline documents 0% formula coverage on single
     sentences and that is intentional design.
2. `src/server.ts` (check_dutch_b1_text output, after the ARI line):
   - `- LIX: 46.4 (Swedish scale 25/30/40/50/60; not validated for Dutch — compounds inflate it)`
   - `- Brouwer Leesindex: 61.2 (second Dutch Flesch variant; sentence length weighs 2x vs Flesch-Douma's 0.93)`
   - n/a variant mirroring the Flesch-Douma n/a line when the guard blocks.
3. Tests `tests/b1-lix-brouwer.test.ts`:
   - Unit: construct Sentence arrays directly (the interface is simple:
     `{ words: WordToken[] }`) with known counts — e.g. 3 sentences, 51 words,
     k words >6 letters — and assert exact LIX/Brouwer values computed by
     hand from those counts. Include one case with all-short words and one
     with many long words.
   - Syllable-dependent Brouwer: use words with known syllable counts (the NL
     syllable counter is deterministic; pick monosyllabic words like "kat",
     "hond" for exact control).
   - MCP-level: a ≥3-sentence, ≥50-word Dutch text shows both lines; a
     single short sentence shows n/a for both.
   - English tool unchanged: check_us_english_b1_text must NOT show LIX/
     Brouwer lines.
4. Harness: extend `tests/eval/b1-amsterdam.ts` with `lix`/`brouwer` coverage
   metrics (share of pairs where the formulas fired) — like
   `flesch_douma_coverage`. Expect ~0 on this corpus (single sentences);
   the value is documenting the limitation, not the number itself.

## Acceptance criteria

- [ ] `npx tsc -p tsconfig.json` clean; full suite green.
- [ ] Unit tests assert exact hand-computed formula values (not just presence).
- [ ] MCP tests cover both the fires and n/a paths; English tool untouched.
- [ ] Re-run harness; PR body reports LIX/Brouwer coverage and confirms no
      regression on the other metrics.
- [ ] `hermes mcp test language`: 7 tools, connected.
- [ ] New prose US English, checked with check_us_english_text.
- [ ] Tool description updated to mention the two extra formulas.

## Out of scope

- WSTF / Coleman-Liau (overlap with ARI; the wiki research marks them low
  priority).
- Per-sentence LIX variants.
- Changing thresholds or the short-sample guard.

## Verification commands

    npx tsc -p tsconfig.json && npx tsx --test tests/*.test.ts
    npx tsx tests/eval/b1-amsterdam.ts --out /tmp/v3.json
    hermes mcp test language
