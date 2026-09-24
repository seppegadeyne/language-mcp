# ADR 001 — Spell checking: C hunspell binary instead of pure JavaScript (nspell)

Status: Accepted (2026-09-22)

## Background

The MCP server invokes the `hunspell` C binary through the `-a` (ispell) pipe
(`src/hunspell.ts`) for Dutch and US English spelling checks. An alternative
would be a pure JavaScript implementation (for example, `nspell@2.x`), removing
the external binary requirement so the server could run in minimal environments,
containers, or remote environments without that binary.

## Decision

Keep the C hunspell binary. Do **not** switch to nspell.

## Rationale

- **Parity risks for compound words and words with separators.** The current
  wrapper relies on the `-a` pipe to check each part of words containing
  hyphens, em dashes, or similar separators, with one response line per part.
  nspell has no equivalent pipe: we would have to implement the splitting and
  result aggregation ourselves. Mistakes would cause false positives for
  hyphenated words ("data-driven", "real-time"), directly reducing quality in
  an area the server must handle well.
- **Performance.** The C binary is faster per word and is invoked once per
  batch. nspell runs JavaScript in the same process for each word; the
  difference is negligible for blog posts and email but measurable for longer
  documents.
- **Suggestion behavior.** The dictionary and algorithm are the same, but the
  exact order and number of suggestions may differ slightly. The current code
  limits suggestions to eight; a switch would require checking suggestion
  parity.
- **What does not change.** `britticisms.ts` contains static rules and does not
  depend on hunspell. US/UK detection remains identical with either option.
  The difference lies only in core spelling checks and compound handling.
- **Trade-off.** The only concrete benefit of nspell is removing the binary
  dependency on targets that lack it. The costs (implementing compound
  splitting, parity and performance tests, and the risk of false positives)
  outweigh that benefit. Running without hunspell on Aorus is not a current
  use case.

## Consequences

- `hunspell` remains a runtime requirement (on PATH or in a system location).
  Documentation and installation instructions must continue to state this.
- If a future target cannot run C hunspell (for example, a fully restricted
  hosting environment), reevaluate using an A/B parity test with the same
  word list: compare correctness and suggestions, including the top eight.
  Do not rely on assumptions.
