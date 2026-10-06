# Selected Dutch spelling rules

Since version 0.6.0, `check_dutch_text` combines the existing OpenTaal/Hunspell
word check with a small, offline rule layer. It does not rewrite text, replace
Hunspell, check general grammar, or assess B1 readability.

## Rule catalog

Each finding includes a stable rule ID, matched text, a suggested replacement,
start and exclusive end offsets in the original JavaScript string (UTF-16 code
units), an explanation, confidence, and the source page, section, and review date.
Confidence is an editorial label, not a measured probability. Always review a
finding in context.

| Rule ID | Selected examples | Confidence | Source |
| --- | --- | --- | --- |
| `nl-compound-spacing` | `keuken tafel` → `keukentafel`, `contact formulier` → `contactformulier`, `contact gegevens` → `contactgegevens`, `privacy beleid` → `privacybeleid` | High | [Compound rules, rule 2](https://www.vlaanderen.be/team-taaladvies/spellingregels/aaneenschrijven/aaneenschrijven-01-hoofdregels-los-of-aaneen-koppelteken-of-trema) |
| `nl-vowel-collision-hyphen` | `auto ongeluk` → `auto-ongeluk`, `ski instructeur` → `ski-instructeur` | High | [Vowel collisions, rule 1](https://www.vlaanderen.be/team-taaladvies/spellingregels/aaneenschrijven/aaneenschrijven-02-klinkerbotsing-koppelteken-of-trema) |
| `nl-initialism-hyphen` | `btw nummer` → `btw-nummer`, `pc netwerk` → `pc-netwerk`, `tv programma` → `tv-programma`, `AI tool` → `AI-tool`, `IT afdeling` → `IT-afdeling`, `kmo bedrijf` → `kmo-bedrijf` | High | [Initialisms, rule 1](https://www.vlaanderen.be/team-taaladvies/spellingregels/aaneenschrijven/aaneenschrijven-09-combinaties-met-initiaalwoorden-letterwoorden-en-verkortingen) |
| `nl-number-letter-hyphen` | `3D printer` → `3D-printer`, `A4 formaat` → `A4-formaat`, `mp3 speler` → `mp3-speler`, `4G abonnement` → `4G-abonnement` | High | [Digits and letters, rule 1](https://www.vlaanderen.be/team-taaladvies/spellingregels/aaneenschrijven/aaneenschrijven-08-combinaties-met-cijfers-letters-en-symbolen) |
| `nl-calendar-lowercase` | `op Maandag` → `op maandag`, `in Januari` → `in januari`, `12 Mei` → `12 mei` | Medium | [Days and months, rule 1](https://www.vlaanderen.be/team-taaladvies/spellingregels/hoofdletters/hoofdletters-09-namen-van-dagen-feestdagen-periodes-en-historische-gebeurtenissen) |

The compound rules use a closed list of 22 forms, including selected plurals.
They do not infer new pairs from dictionary membership or apply general plural
rules. Examples of incorrect spacing are our applications of the source rules,
not necessarily verbatim examples published by Team Taaladvies.

## Protected text and proper names

The new rule layer excludes fenced and inline code, URLs, email addresses,
Markdown headings, HTML headings, code, titles, citations, quotations and emphasis,
HTML tags, link destinations, quoted text, and text marked with Markdown emphasis. Internal capitals in a
selected spaced compound are treated conservatively as a possible name or title.
Excluded spans remain barriers: a match cannot bridge hidden code or markup.

Calendar checks require a nearby explicit time cue, such as `op`, `volgende`,
`in`, or a day number. Sentence-initial calendar words and ambiguous uses such as
`Mei belt`, `werken bij Maandag`, and internal capitalized cues such as
`Elke Maandag` are left alone. All-caps typography is also preserved. Named
holidays are not part of this rule. Names and titles cannot be recognized perfectly from unmarked text.

For a known name or unmarked title, pass `protected_terms`:

```json
{
  "text": "We lezen Afspraak op Maandag. We gebruiken een 3D printer.",
  "protected_terms": ["Afspraak op Maandag"]
}
```

Terms are case-sensitive literal strings, matched at word boundaries; horizontal
whitespace may vary (spaces, tabs, or nonbreaking spaces). They are not regular
expressions. The tool accepts up to 100 terms, each between
1 and 200 characters. Protection affects only the new rule layer; it does not
whitelist words in the separate Hunspell dictionary check.

The rule layer checks the supplied text, while the existing dictionary tokenizer
checks up to 2,000 words. Compound matches allow horizontal whitespace, including
nonbreaking spaces, but do not cross line breaks. The text masking is a
conservative safeguard, not a full Markdown, HTML, or syntax parser. For MDX,
extract the actual prose before calling the tool.

## Accepted variants and regression tests

These source-backed exceptions must remain accepted by the rule layer:

- `rode kool` and `rodekool`; `half uur` and `halfuur`; `bruin brood` and
  `bruinbrood`; `fijn stof` and `fijnstof`.
- Optional clarity hyphens, such as `skiuitrusting` and `ski-uitrusting`,
  `proactief` and `pro-actief`.
- Meaning-dependent alternatives, such as `te veel` and `het teveel`,
  `ten slotte` and `tenslotte`, or `veel gebruikte kleren` and `veelgebruikte kleren`.
- Numeral and measurement exceptions: `vitamine C`, `formule 1`, `100 euro`,
  `100 eurobiljet`, `24 uurseconomie`, `50 meterbad`, and `120km-weg`.
- Verb phrases such as `een offerte aanvragen`, `als ik een offerte aanvraag`,
  and `zodra ik het menu uitdraai`, and double objects such as `onze klanten service
  bieden`. The ambiguous pairs `offerte aanvraag`, `menu uitdraai`, and
  `klanten service` are deliberately excluded, including when a particular
  occurrence would be a misspelled noun.

See [word groups and compounds](https://www.vlaanderen.be/team-taaladvies/spellingregels/aaneenschrijven/aaneenschrijven-15-woordgroep-of-samenstelling)
and the source pages in the catalog. Tests cover both the pure rule function and
real MCP calls through the source server. They also check repeated findings,
Unicode boundaries, emoji before a finding, protected spans, source metadata,
and ordinary spelling suggestions alongside the new findings.

No contextual verb-spelling rules are included. In particular, the tool does
not yet distinguish `Hij word`, `Ik word`, `Word je`, and `Wordt je vader`.

## Attribution and reuse

Rule sources: Team Taaladvies, Vlaamse overheid. Reviewed October 6, 2026.
Our implementation and short English explanations are original. The source
information is not represented as part of our MIT code license.

The [Vlaanderen.be disclaimer](https://www.vlaanderen.be/over-vlaanderenbe/disclaimer)
permits reuse of the information without further conditions under article II.55,
first paragraph, of the Bestuursdecreet. It also retains intellectual property
rights and disclaims fitness for other purposes. This is not a public-domain or
Creative Commons declaration and does not automatically cover external sources,
photographs, or linked dictionaries. Keep source attribution and review dates
when adding or changing rules.
