# Dutch synonym table (Open Dutch WordNet)

`nl-synonyms.tsv` maps 31,199 Dutch lemmas to their Open Dutch WordNet
synonyms: `word<TAB>syn1,syn2,...`, ordered by the number of synsets the word
shares with each synonym (most shared first). It is a derived work from
[Open Dutch WordNet](https://github.com/cltl/OpenDutchWordnet) release 1.4
(`odwn_orbn_gwg-LMF_1.4.xml.gz`, 135,653 synsets / 99,349 lemmata).

## License

CC BY-SA 4.0 (see LICENSE in this directory). This derived table inherits the
license of its source; the server code around it stays MIT. The data asset is
kept separate, the same pattern as the bundled hunspell dictionaries, the
Amsterdam EUPL evaluation corpus, and the Zipf frequency table.

## Required citation

When using this data, cite:

> Postma, M., Van Miltenburg, E., Segers, R., Schoen, A., & Vossen, P. (2016,
> January). Open Dutch WordNet. In Proceedings of the 8th Global WordNet
> Conference (GWC) (pp. 302-310).

## How it was built

One-time extraction (not part of the npm build): parse the Wordnet-LMF XML,
group lemmata per synset (`<Sense synset="eng-30-...">`), and emit each lemma
with the union of its co-lemmata. Multi-word candidates are kept in the table
but are naturally dropped at runtime because the Zipf frequency table only
contains single word forms.

## Runtime use

`src/synonyms.ts` lazily loads this table and combines it with the Zipf
frequency table: a synonym is only suggested when it is strictly more frequent
than the flagged rare word. Suggestions are review hints next to the flagged
word, never automatic replacements — synonyms are sense-based (polysemy), and
the tool does not know which sense a text intends.
