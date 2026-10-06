# Dutch Zipf word-frequency table (OpenSubtitles2018)

`nl-zipf.tsv` maps the top 50,000 Dutch word forms to Zipf frequencies,
derived from `content/2018/nl/nl_50k.txt` of
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(word + count pairs from OpenSubtitles2018).

Zipf = log10(count / totalTokens × 1e9), with totalTokens = 258,103,024 over
the 50k list. Examples: `ik` 7.589, `bekend` 5.008, `vanzelfsprekend` 3.753.

## License

Content license: **CC BY-SA 4.0** (per the FrequencyWords README; code there
is MIT). This derived table inherits CC BY-SA 4.0: attribution + share-alike
for the data file. The server code around it stays MIT; this file is a
separately licensed data asset, same pattern as the bundled hunspell
dictionaries.

## Known bias

OpenSubtitles is spoken language: informal/colloquial vocabulary scores
higher, formal and officialese words score lower than in balanced corpora.
For a "difficult word" signal this is partly useful (officialese gets
flagged) but it adds noise on formal technical vocabulary. The tool output
states this bias explicitly.

## Regeneration

    curl -sL -o nl_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/nl/nl_50k.txt
    # then zipf = log10(count / sum(counts) * 1e9) per word

The table is a static snapshot (2018 corpus); it is not refreshed
automatically.
