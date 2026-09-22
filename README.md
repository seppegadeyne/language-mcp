# nl-taal-mcp

Lokale MCP-server voor Nederlandse én US-English taalcontrole, te gebruiken door AI-agents (Hermes, Claude, e.a.) die teksten schrijven: cv's, sollicitatiebrieven, blogartikelen, website-copy.

## Tools

| Tool | Bron | Netwerk | Gebruik |
|---|---|---|---|
| `check_dutch_text` | OpenTaal/hunspell (lokaal) | nee | Hele tekst spellingscontrole geven; flagged woorden + suggesties + posities |
| `validate_dutch_word` | OpenTaal/hunspell (lokaal) | nee | Enkel woord ja/nee + suggesties |
| `dutch_word_details` | woordenlijst.org (MolexServe) | ja | Lemma-details: woordsoort, uitspraak, afbreking, paradigm, verkleinwoord |
| `check_us_english_text` | hunspell en_US + britticism-scan (lokaal) | nee | EN-tekst op typefouten + Britse spelling/vocabulaire met US-vervangingen |
| `validate_us_word` | hunspell en_US + britticism-scan (lokaal) | nee | Enkel Engels woord: correct/Brits + suggesties |

De lokale tools gebruiken gebundelde woordenlijsten via hunspell: OpenTaal voor Nederlands (v2.20.23), SCOWL/LibreOffice en_US voor Amerikaans-Engels. De britticism-detector vangt wat hunspell níet markeert (`whilst`, `towards`, `bespoke`, `webshop`, `sole trader`, `findability`, ...) — inclusief de categorieën uit de Straffe Sites US-English-richtlijn — en geeft per vondst de US-vervanging mee. `dutch_word_details` raadpleegt de interne XML-service van woordenlijst.org (INT/Taalunie) — onofficieel, met cache en rate-limit (1,2 s tussen calls), dus alleen voor individuele belangrijke woorden.

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

Woordenlijst-assets:
- `assets/nl.dic` / `assets/nl.aff`: © OpenTaal — Revised BSD License en/of CC BY 3.0. Volledige bepalingen in `assets/LICENSE.txt`; bron: https://github.com/OpenTaal/opentaal-hunspell. Bij hergebruik van deze assets is bronvermelding van OpenTaal vereist.
- `assets/en_US.dic` / `assets/en_US.aff`: gebaseerd op de SCOWL-woordlijst (Kevin Atkinson, LGPL) met affix-bestand uit Geoff Kuenning's Ispell (BSD), via LibreOffice/dictionaries. Zie `assets/en_US-LICENSE.txt` en `assets/en_US-README.txt`; bron: https://github.com/LibreOffice/dictionaries/tree/master/en.

`dutch_word_details`-data: woordenlijst.org (Instituut voor de Nederlandse Taal / Taalunie), gebruikt via hun publieke webdienst zonder eigen API-overeenkomst.
