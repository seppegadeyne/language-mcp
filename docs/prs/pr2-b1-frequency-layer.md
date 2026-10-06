# PR 2 agent brief — B1 word-frequency layer (Zipf rare-word flags)

You are implementing PR 2 of a three-PR stack. PR 1 (b1-eval-baseline) added
the evaluation harness and baseline; this PR builds the word-frequency layer
on top. Branch from `b1-eval-baseline` (or master once PR 1 merged). Read
AGENTS.md first. Work through this brief top to bottom.

## Context

language-mcp is a local, deterministic TypeScript/Node stdio MCP server
(C hunspell binary + rule layers; no Python, no network, no LLM calls).
`check_dutch_b1_text` reports B1 proxies. The evaluation baseline
(tests/eval/baseline-v1.json) shows current proxies miss word difficulty
entirely: the long-word share separates at −0.1pp. Research (LiNT line) says
word frequency is the strongest readability predictor for Dutch. This PR adds
a deterministic Zipf-frequency layer.

## Data source (license-cleared)

- **hermitdave/FrequencyWords** `content/2018/nl/nl_50k.txt` — top 50k Dutch
  word forms with counts from OpenSubtitles2018.
  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt
- License: code MIT, **content CC BY-SA 4.0** (README verified). The derived
  Zipf TSV is a derivative → the asset file carries CC BY-SA with attribution;
  server code stays MIT. Same separate-asset pattern as the hunspell
  dictionaries and the Amsterdam EUPL corpus.
- Known bias (document it): OpenSubtitles is spoken language — formal/
  officialese words score lower than in balanced corpora. For a B1 "difficult
  word" detector that bias is partly useful (jargon-adjacent) but adds noise
  on formal technical vocabulary. State this in the README and tool output
  section header.
- Do NOT use SUBTLEX-NL or DLP2 OSF downloads directly (CC BY-NC-SA —
  forbidden). wordfreq data is the alternative if OpenSubtitles bias proves
  problematic (CC BY-SA 4.0, NOTICE obligations, larger).

## Implementation

1. `assets/frequency/nl-zipf.tsv` — generated TSV: `word<TAB>zipf` for the
   top 50k forms. Zipf = log10(count / totalTokens * 1e9). Bundle with
   `assets/frequency/README.md` (source URL, license CC BY-SA 4.0, generation
   formula, bias caveat) and the CC BY-SA 4.0 license text.
2. `src/frequency.ts` — lazy singleton loader + lookup:
   - `getDutchZipf(word: string): number | null` (lowercase exact match).
   - Word not in list → null. Do NOT flag unknown words as rare: Dutch
     compounds and names dominate the unknown set; precision first.
3. Wire into `check_dutch_b1_text` (src/server.ts):
   - New optional tool parameter `rare_word_zipf_max` (number, default 3).
   - New output section `Word frequency (Zipf, OpenSubtitles2018 — spoken-language bias):`
     listing flagged words in the jargon style: `- "woord" (Zipf 2.4, position N)`
     with UTF-16 offsets from the existing tokenizer (never `text.indexOf`).
   - Summary line: `Rare words: N (X% of words)` — feeds the harness.
   - Skip words inside protected terms and code/URL spans the tokenizer
     already strips.
4. Tests `tests/b1-frequency.test.ts`:
   - Unit: a very common word (e.g. "en") has high Zipf; a known-but-rare
     word below threshold flags; an absent compound returns null (no flag).
   - MCP-level: section appears via real client call; `rare_word_zipf_max`
     changes which words appear; explicit-undefined parameter keeps the
     default (regression per the NaN-merge pitfall in AGENTS.md/skill).
   - Sabotage run: without the frequency lookup wired, tests fail.

## Acceptance criteria

- [ ] `npx tsc -p tsconfig.json` clean; full suite green.
- [ ] New tests fail without the frequency module (proven, then restored).
- [ ] Harness re-run: `npx tsx tests/eval/b1-amsterdam.ts --out /tmp/v2.json`;
      include a short separation comparison in the PR body — the new
      rare-word rate should separate complex > simple (spoken-language bias
      caveat noted). No regression on existing metrics.
- [ ] `hermes mcp test language` connects with unchanged tool count (7).
- [ ] New prose (README section, tool description, output text) in US
      English, checked with check_us_english_text; flags reviewed, Dutch
      fixtures preserved as-is.
- [ ] No network access at runtime; list parsed once per process.

## Out of scope

- Compound splitting by frequency of parts (later candidate; needs its own
  precision analysis).
- ODWN synonym suggestions ranked by frequency (PR-stack follow-up).
- English frequency layer.

## Verification commands

    npx tsc -p tsconfig.json && npx tsx --test tests/*.test.ts
    npx tsx tests/eval/b1-amsterdam.ts --out /tmp/v2.json
    hermes mcp test language
