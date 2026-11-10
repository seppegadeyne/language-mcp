# French checks

`check_french_text`, `check_french_b1_text`, and `validate_french_word` add French
to the server (since v0.10.0). They follow the same conventions as the Dutch and
US English tools: local only, deterministic, no network, same output shape
(counts, flagged items, positions as UTF-16 offsets into the checked text), and
the `Input:` provenance line with `input_sha256`.

## Dictionary

- Source: Dicollecte / Grammalecte French dictionaries v7.7 (Olivier R.),
  variant "toutes variantes", from the official release archive
  `https://grammalecte.net/download/fr/dic/hunspell-french-dictionaries-v7.7.zip`,
  downloaded 2026-11-10. License: MPL 2.0.
- "Toutes variantes" accepts both the traditional spellings and the 1990 reform
  spellings. A project that fixes one system can swap `assets/fr.dic` and
  `assets/fr.aff` for the "classique" or "reforme1990" files from the same archive.
- Hashes, the cross-check against the LibreOffice copy, and the license files:
  `assets/fr-SOURCE.txt`, `assets/fr-README.txt`, `assets/fr-LICENSE-MPL-2.0.txt`.
- The dictionary is resolved like the others: bundled `assets/fr` first, then system
  `fr_FR` paths. Without any French dictionary, `check_french_text` and
  `validate_french_word` return an error that starts with `French dictionary not found`;
  `check_french_b1_text` skips only its passive-voice section and says so.

## `check_french_text`

Parameters: `text` or `path` (+ `start`, `end`, `expected_sha256`), optional
`context`, optional `protected_terms` (case-sensitive names; horizontal whitespace
may vary; every word inside a match is skipped and the skipped count is reported).

- Spelling only (hunspell `-a`). It does not check agreement, conjugation, or the
  choice between two valid words (a/à, ou/où, et/est).
- Elisions are accepted with a straight or a typographic apostrophe (`l'ancrage`,
  `d’un`, `qu'il`, `aujourd’hui`, `jusqu'à`, `lorsqu'on`, `puisqu’il`). The dictionary
  decides whether an elision is valid, so an invalid one is still flagged. An elided
  acronym or code (`l'ADN`, `d'IA`, `l'EN795`) is not a word and is skipped.
- Hyphenated words are checked per part (`garde-corps`, `peut-être`, `avez-vous`).
  Non-breaking spaces (U+00A0, U+202F) before `; : ? !` are not part of any word, so
  they cause no flags and shift no positions.
- All-caps tokens of up to five letters (acronyms such as HWV, EN) are skipped, like in
  the other languages. Brand names that are not acronyms (Skylotec) are reported:
  pass them in `protected_terms`.
- Spelling stops after 20,000 words with `INCOMPLETE:` and an error result.
- hunspell runs with a forced UTF-8 locale when the client environment has none.

## `check_french_b1_text`

Deterministic B1 proxies, not a validated B1 verdict. Parameters: `text` or `path`
(+ range and hash), `context`, `max_sentence_words` (default 25), `warn_sentence_words`
(default 20), `max_para_words` (default 150), `kandel_moles_min` (default 60), and
`voice` (`vous` default, or `tu`).

- **Readability:** Kandel & Moles (1958), the French adaptation of Flesch Reading
  Ease: `207 - 1.015 * (words / sentences) - 73.6 * (syllables / words)`. Suppressed
  below 50 words or 3 sentences (short-text guard). The B1 band 60-70 reuses Flesch's
  interpretation table; it is a practical convention, not a validated French B1 norm.
  An elided clitic counts with its word (`l'ancrage` = 1 word), a hyphenated word is
  one word.
- **Sentence length:** warn above 20 and flag above 25 words (plain-language
  conventions, shared with the English tool; there is no French-specific consensus).
  The longest flagged sentences are listed with positions.
- **Passive voice:** être + past participle, precision first (see below).
- **Address form:** `vous` expected by default. Reports `tu`, `toi`, `te`, `t'`, `ton`,
  `ta`, `tes`, and `tien`/`tienne`/`tiennes`/`tiens` (after an article), including
  inversion and enclitic forms (`peux-tu`, `dis-toi`, `va-t'en`). With `voice: tu` it
  reports `vous`, `votre`, `vos`, `vôtre(s)` instead. Text inside `« »` is reported
  separately and not counted.

### Syllable counter (`src/syllables-fr.ts`)

Counts the syllables of standard spoken prose: a final mute `e`/`-es` is not counted
(`table` = 1, `sécurité` = 4), a mute `e` inside a word is (`entreprise` = 3), and a
verb `-ent` ending is mute (`parlent`, `étaient`). The rules and their limits are
documented in the module header. `tests/b1-fr.test.ts` anchors about 120 hand-checked
words and documents known misses on purpose.

Honest accuracy statement: the heuristic agrees with all words on that hand-checked
list, but the list was written and tuned together with the rules, so it demonstrates
behavior and not a measured rate on running text. No pronunciation lexicon was
available offline to measure an independent rate. Known error classes:

- "-ent" words: nouns, adjectives, and adverbs outside the closed list are read as verbs
  with a mute ending; `-ment` verbs outside a short list are read as nouns.
- `i` + vowel is one glide nucleus (`client` counts 1, spoken 2).
- Schwa variation in the middle of a word (`samedi` counts 3, often spoken 2).
- Fixed expressions such as `est-ce` (counts 2, spoken 1).

These errors average out over running prose for a readability score, but they make
the score an estimate. Do not compare the Kandel & Moles value to a score from another
tool that counts syllables differently.

### Passive proxy (`src/passive-fr.ts`)

The Dicollecte `-m` morphology has no single past-participle tag. The proxy detects an
être form (including `n'est`, `qu'il est`, inversion `sont-ils`, and `été` after an
avoir form) followed within three bridge words by a participle:

- regular `-é/-ée/-és/-ées` participles whose analysis has a stem in `-er` (high
  confidence);
- a closed list of common irregular participles with their feminine and plural forms
  (`fait`, `mis`, `pris`, `écrit`, `ouvert`, `construit`, `conçu`, ...; high);
- other `-i/-u/-is/-us` participles of `-ir`, `-re`, `-oir` verbs (low, because they
  overlap with adjectives and nouns).

State-like participles (`situé`, `basé`, `conçu`, `destiné`, `équipé`, ...) are low
confidence. Participles of verbs that take être in compound tenses (`arrivé`, `parti`,
`venu`, `né`, ...), reflexive `s'est ...`, and `c'est ...` are skipped. A `par` agent
within six words is noted. Not detected: pronominal passives (`se fait`), long
interrupted constructions, and passives on other auxiliaries. Every hit is a review
flag.

### Address-form detector (`src/voice-fr.ts`)

Only pronouns and possessives are detected: a tu imperative without a pronoun
(`Contacte-nous`) is invisible. False-positive risks, all reviewed by hand:

- `tu` is also the past participle of `se taire` (`il s'est tu`);
- `ton` is a noun after a determiner (`le ton`, `un ton calme`): those are skipped,
  but other noun uses (`ton` in a list) can still be flagged;
- `ta`, `te`, `ton`, `tes` appear in non-French fragments (Latin `Te Deum`, Italian,
  product codes); all-caps `TE` and `TA` are skipped;
- `tiens` is also the imperative of `tenir`; it is only reported after an article
  (`les tiens`).

## Not covered

No grammar checking, no French typography rules (spacing before `; : ? !`, guillemet
spacing), no jargon, wordy-phrase, or nominalization layers, and no word-frequency
layer. Those would be separate extensions with their own sources.
