# language-mcp

A local MCP server for Dutch and US English language checks, built for AI agents
(Hermes, Claude, and others) that write resumes, cover letters, blog articles,
and website copy.

**Currently supported: Dutch and US English.** Additional languages can be
implemented by adding dictionaries, language-specific rules, and MCP tools;
they are not supported automatically by selecting an arbitrary language.

## Tools

| Tool | Source | Network | Purpose |
|---|---|---|---|
| `check_us_english_text` | hunspell en_US + British form detection (local) | No | Check text for typos and British spelling or vocabulary, with US replacements |
| `validate_us_english_word` | hunspell en_US + British form detection (local) | No | Check a single English word for correct US spelling and suggest replacements |
| `check_dutch_text` | OpenTaal/hunspell (local) | No | Check a complete text and return flagged words, suggestions, and positions |
| `validate_dutch_word` | OpenTaal/hunspell (local) | No | Check a single Dutch word and return suggestions |
| `get_dutch_word_details` | woordenlijst.org (MolexServe) | Yes | Retrieve lemma details: part of speech, pronunciation, hyphenation, paradigm, and diminutive forms |

The local tools use bundled hunspell dictionaries: OpenTaal for Dutch (v2.20.23)
and SCOWL/LibreOffice en_US for US English. The detector for British forms
catches terms that hunspell does not flag (`whilst`, `towards`, `bespoke`,
`webshop`, `sole trader`, `findability`, etc.), including categories from the
Straffe Sites US English guidelines, and provides a US replacement for each match.

`get_dutch_word_details` queries the internal XML service at woordenlijst.org
(INT/Taalunie). This unofficial integration uses caching and rate limiting
(1.2 seconds between calls); use it only for individual important words.
Tool descriptions and status messages are in US English; Dutch words and
upstream dictionary labels retain their original language.

## Example: check US English copy

Call `check_us_english_text` with:

```json
{
  "text": "We build custom online stores with colorful designs and clear navigation."
}
```

The tool reports the number of words checked, unknown words, and British forms.
It provides suggestions and positions for flagged words. Review suggestions in
context: proper names and technical terms may be valid even when flagged.
For Dutch copy, use `check_dutch_text` instead.

## Installation

Requirements: Node 20+ and `hunspell` on PATH (`pacman -S hunspell`).

```bash
npm install
npm run build   # Compile TypeScript into dist/
```

## Tests

```bash
npm test        # Run node:test through tsx
```

## Hermes configuration (stdio)

```yaml
mcp_servers:
  language:
    command: node
    args: [/absolute/path/to/language-mcp/dist/cli.js]
    connect_timeout: 60
    enabled: true
    timeout: 120
```

## License and attribution

Code: MIT.

Dictionary assets:
- `assets/nl.dic` / `assets/nl.aff`: © OpenTaal — Revised BSD License and/or CC BY 3.0. Full terms are in `assets/LICENSE.txt`; source: https://github.com/OpenTaal/opentaal-hunspell. Reusing these assets requires attribution to OpenTaal.
- `assets/en_US.dic` / `assets/en_US.aff`: based on the SCOWL word list (Kevin Atkinson, LGPL), with an affix file from Geoff Kuenning's Ispell (BSD), distributed through LibreOffice/dictionaries. See `assets/en_US-LICENSE.txt` and `assets/en_US-README.txt`; source: https://github.com/LibreOffice/dictionaries/tree/master/en.

`get_dutch_word_details` data: woordenlijst.org (Instituut voor de Nederlandse
Taal / Taalunie), accessed through its public web service without a separate
API agreement.
