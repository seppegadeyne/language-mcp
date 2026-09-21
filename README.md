# nl-taal-mcp

Lokale MCP-server voor Nederlandse taalcontrole, te gebruiken door AI-agents (Hermes, Claude, e.a.) die Nederlandse teksten schrijven: cv's, sollicitatiebrieven, blogartikelen, website-copy.

## Tools

| Tool | Bron | Netwerk | Gebruik |
|---|---|---|---|
| `check_dutch_text` | OpenTaal/hunspell (lokaal) | nee | Hele tekst spellingscontrole geven; flagged woorden + suggesties + posities |
| `validate_dutch_word` | OpenTaal/hunspell (lokaal) | nee | Enkel woord ja/nee + suggesties |
| `dutch_word_details` | woordenlijst.org (MolexServe) | ja | Lemma-details: woordsoort, uitspraak, afbreking, paradigm, verkleinwoord |

De lokale tools gebruiken de OpenTaal-woordenlijst (v2.20.23, gebundeld in `assets/`) via hunspell. `dutch_word_details` raadpleegt de interne XML-service van woordenlijst.org (INT/Taalunie) — onofficieel, met cache en rate-limit (1,2 s tussen calls), dus alleen voor individuele belangrijke woorden.

## Installatie

Vereist: Node 20+, `hunspell` op PATH (`pacman -S hunspell`).

```bash
npm install
npm run build   # tsc → dist/
```

## Tests

```bash
npm test        # node:test via tsx
```

## Hermes-config (stdio)

```yaml
mcp_servers:
  nl_taal:
    command: node
    args: [/absoluut/pad/naar/nl-taal-mcp/dist/cli.js]
    connect_timeout: 60
    enabled: true
    timeout: 120
```

## Licentie & bronvermelding

Code: MIT.

Woordenlijst-assets (`assets/nl.dic`, `assets/nl.aff`): © OpenTaal — Revised BSD License en/of CC BY 3.0. Volledige bepalingen in `assets/LICENSE.txt`; bron: https://github.com/OpenTaal/opentaal-hunspell. Bij hergebruik van deze assets is bronvermelding van OpenTaal vereist.

`dutch_word_details`-data: woordenlijst.org (Instituut voor de Nederlandse Taal / Taalunie), gebruikt via hun publieke webdienst zonder eigen API-overeenkomst.
