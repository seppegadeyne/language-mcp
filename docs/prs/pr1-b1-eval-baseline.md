# PR 1 agent brief — B1 evaluation baseline

You are implementing PR 1 of a three-PR stack that grounds and then extends
the Dutch B1 proxies in language-mcp. This PR is self-contained and must land
first; PR 2 (word-frequency layer) and PR 3 (LIX + Brouwer formulas) build on
it. Work through this brief top to bottom.

## Context

language-mcp is a local, deterministic TypeScript/Node stdio MCP server for
language checks (C hunspell binary + rule layers; no Python, no network, no
LLM calls — see AGENTS.md and docs/adr/001). `check_dutch_b1_text` reports
B1 *proxies* (Flesch-Douma, ARI, sentence/paragraph length, passive voice via
hunspell -m morphology, officialese jargon, filler, idioms, nominalization
density, je/u voice). Nothing currently measures whether those proxies
actually separate difficult Dutch from simple Dutch. This PR adds that
measurement so PR 2/3 changes can be judged against evidence.

## What this PR contains

1. `assets/eval/amsterdam-complex-simple/` — the City of Amsterdam
   complex–simple corpus (1311 automatically aligned sentence pairs, EUPL-1.2)
   with LICENSE + attribution README, bundled for offline evaluation only.
2. `docs/b1-eval.md` — the evaluation protocol: corpus provenance, harness
   usage, the separation metric (flag rate on complex minus flag rate on
   simple), and rules of engagement (eval data is never runtime input; pairs
   are noisy; report raw numbers).
3. `tests/eval/b1-amsterdam.ts` — the harness: connects a real MCP Client via
   StdioClientTransport to `src/cli.ts` (same pattern as the existing
   tests/*.test.ts), runs `check_dutch_b1_text` over both sides of every pair,
   classifies the plain-text output by section (readability / passive /
   jargon / nominalization / voice), and reports per-proxy rates plus
   `separation_complex_minus_simple`. `--out <file>` writes the JSON report.
4. `tests/eval/baseline-v1.json` — the committed baseline produced on this
   branch, with `generated_at`, corpus id, pair count, per-side rates, and the
   separation table. Future B1 PRs must re-run the harness and compare.

## Acceptance criteria

- [ ] The harness runs green end-to-end: `npx tsx tests/eval/b1-amsterdam.ts`
      exits 0 and prints the report; `--out` writes valid JSON.
- [ ] `baseline-v1.json` is committed and its numbers match a fresh run (same
      commit, deterministic tool output).
- [ ] No changes to `src/` whatsoever: this PR adds measurement only.
- [ ] Full existing suite still passes: `npx tsc -p tsconfig.json` and
      `npx tsx --test tests/*.test.ts`.
- [ ] Corpus CSV is byte-identical to upstream (spot-check first/last rows).
- [ ] `docs/b1-eval.md` and asset README are US English (repo language
      policy); corpus Dutch is language data, not prose to translate.
- [ ] README-licensing section mentions the EUPL-1.2 evaluation corpus.

## Key references

- Existing MCP-client test pattern: `tests/dutch-spelling-mcp.test.ts`.
- Short-sample guard: Flesch-Douma reports n/a under 50 words / <3 sentences —
  that is why the report carries `flesch_douma_coverage`. Do not "fix" this;
  it is intentional design (formulas are unstable on short samples).
- Output shape of check_dutch_b1_text: plain text grouped by sections; the
  harness classifies by section headers, not by rule IDs (there are none yet).

## Out of scope

- Any new rule, formula, threshold, or tool-parameter change (PR 2/3).
- Machine-readable rule IDs in the output (separate follow-up if desired).
- Using the corpus at runtime or in the npm test suite (it stays an
  evaluation-only asset).

## Verification commands

    npx tsc -p tsconfig.json
    npx tsx --test tests/*.test.ts
    npx tsx tests/eval/b1-amsterdam.ts --out /tmp/check.json
    diff <(jq -S 'del(.generated_at)' /tmp/check.json) <(jq -S 'del(.generated_at)' tests/eval/baseline-v1.json) && echo MATCH


## Commit style

Conventional commits, e.g. `test(b1): add Amsterdam complex–simple evaluation
baseline`. Keep the corpus commit separate from the harness commit if the
diff gets large.

## After landing

PR 2 (b1 frequency layer) re-runs this harness and must show the separation
table improving or staying neutral on `share_with_jargon`-adjacent metrics;
PR 3 (formulas) reports both formulas' separation in the same shape.
