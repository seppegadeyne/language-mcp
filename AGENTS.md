# AGENTS.md

Richtlijnen voor AI-agents (Hermes, etc.) die in dit repo werken.

## Architectuur-kern (niet zonder reden wijzigen)

- **Spell-check engine: C-hunspell binary, NIET pure-JS (nspell).**
  We rouwen de `hunspell` C-binary in via de `-a`/ispell pipe (`src/hunspell.ts`)
  voor de NL- en en_US-checks. Dit is een bewust besluit — zie
  [ADR 001](docs/adr/001-hunspell-binary-over-nspell.md).
  Kernreden: de `-a`-pipe controleert hyphen-/em-dash-gescheiden woorden per deel
  ("data-driven", "real-time"); nspell heeft geen equivalent en die splitting zou
  zelf nagebouwd moeten worden (risico op false-positives). De britticisms-detector
  (`src/britticisms.ts`) is onafhankelijk van beide en verandert nooit.
  Geen ombouw naar nspell, behalve bij een concrete target die geen C-hunspell kan
  draaien — en dan alleen na een A/B-pariteitest (correct/suggest + top-8), niet
  op aannames.

## Tool-naming (sinds v0.3.0)

- `check_<taal>_text`  → blok/spelling van een hele tekst (nl = `dutch`, en = `us_english`)
- `validate_<taal>_word` → éént woord ja/nee + suggesties
- `get_dutch_word_details` → rijke lemma-data via woordenlijst.org (netwerk)
- Naamconventie: werkwoord + taal + object. Geen uitnemende namen zonder het
  werkwoord-prefix (bv. `dutch_word_details` is verouderd en hernoemd).
- Consistente taal-identifiers: `dutch` en `us_english`.

## Ontwikkel-praktijk

- TypeScript, Node 18+. Tests: `npx tsx --test tests/*.test.ts` (node:test + assert).
- Build: `npx tsc -p tsconfig.json` → `dist/cli.js`.
- Voer altijd build + tests + een handmatige tool-snap (bijv. `hermes mcp test language`)
  af vóór je een wijziging als "klaar" meldt.

## Dependencies / runtime

- `hunspell` + dictionaries (nl, en_US) worden verondersteld aanwezig via `assets/`
  of systeem. Dit is een opzettelijke runtime-afhankelijkheid (zie ADR 001 bovenaan).
