# Constraints

Last reviewed: 2026-11-07

## Floor (always enforced)
- No new suppression comments (`@ts-ignore`, `@ts-expect-error` without reason, `eslint-disable`, `biome-ignore`, `# noqa`, `phpcs:ignore`).
- No stubs or silent failures (`throw new Error("Not implemented")`, empty `catch {}`, bare `except:`).
- No skipped or deleted tests without a reason in the commit message.
- No secrets in source; never commit `.env` or credentials.
- This file is not weakened to make a change pass; tightening is fine.

## Enforced with numbers
| Dimension | Rule | Checked by | Runs at |
|---|---|---|---|
| Types | 0 errors | `npx tsc -p tsconfig.json --noEmit` | every change |
| Tests | all pass, 0 skipped | `npm test` | every change |
| Build | passes | `npm run build` | every change |

## Measured, not yet enforced (ratchets)
| Metric | Today | Direction | Command |
|---|---|---|---|
| Suppressions | 0 | must not grow | `git grep -nE "@ts-ignore|@ts-expect-error|eslint-disable|biome-ignore|# noqa|# type: ignore|phpcs:ignore" -- ':!node_modules' ':!vendor' ':!dist' ':!*.min.js' ':!package-lock.json' | wc -l` |
| Skipped tests | 0 | must not grow | `git grep -nE "\.skip\(|\bxit\(|@pytest\.mark\.skip" -- ':!node_modules' ':!dist' | wc -l` |
| Tests passing | 187 | must not fall | `npm test | grep -E '^ℹ pass'` |

## Exceptions
| ID | Rule | Path | Reason | Expires |
|---|---|---|---|---|
