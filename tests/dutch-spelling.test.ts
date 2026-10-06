import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findDutchSpellingIssues } from '../src/dutch-spelling.js';

// Incorrect counterparts are derived from Team Taaladvies's rules. Accepted
// variants and exceptions come from the pages recorded in docs/dutch-spelling.md.
const PAIRS = [
  ['keuken tafel', 'keukentafel', 'nl-compound-spacing'],
  ['keuken tafels', 'keukentafels', 'nl-compound-spacing'],
  ['contact formulier', 'contactformulier', 'nl-compound-spacing'],
  ['contact formulieren', 'contactformulieren', 'nl-compound-spacing'],
  ['contact gegevens', 'contactgegevens', 'nl-compound-spacing'],
  ['privacy beleid', 'privacybeleid', 'nl-compound-spacing'],
  ['auto ongeluk', 'auto-ongeluk', 'nl-vowel-collision-hyphen'],
  ['auto ongelukken', 'auto-ongelukken', 'nl-vowel-collision-hyphen'],
  ['ski instructeur', 'ski-instructeur', 'nl-vowel-collision-hyphen'],
  ['btw nummer', 'btw-nummer', 'nl-initialism-hyphen'],
  ['btw nummers', 'btw-nummers', 'nl-initialism-hyphen'],
  ['pc netwerk', 'pc-netwerk', 'nl-initialism-hyphen'],
  ['tv programma', 'tv-programma', 'nl-initialism-hyphen'],
  ['AI tool', 'AI-tool', 'nl-initialism-hyphen'],
  ['AI tools', 'AI-tools', 'nl-initialism-hyphen'],
  ['IT afdeling', 'IT-afdeling', 'nl-initialism-hyphen'],
  ['kmo bedrijf', 'kmo-bedrijf', 'nl-initialism-hyphen'],
  ['3D printer', '3D-printer', 'nl-number-letter-hyphen'],
  ['3D printers', '3D-printers', 'nl-number-letter-hyphen'],
  ['A4 formaat', 'A4-formaat', 'nl-number-letter-hyphen'],
  ['mp3 speler', 'mp3-speler', 'nl-number-letter-hyphen'],
  ['4G abonnement', '4G-abonnement', 'nl-number-letter-hyphen'],
];

describe('selected Dutch compound and hyphen rules', () => {
  for (const [wrong, correct, ruleId] of PAIRS) {
    it(`suggests the selected spelling for ${wrong}`, () => {
      const text = `We bespreken het ${wrong} vandaag.`;
      const hits = findDutchSpellingIssues(text);
      assert.equal(hits.length, 1);
      assert.equal(hits[0].matched, wrong);
      assert.equal(hits[0].suggestion, correct);
      assert.equal(hits[0].ruleId, ruleId);
      assert.equal(text.slice(hits[0].index, hits[0].end), wrong);
    });
  }

  it('leaves every selected correct spelling alone', () => {
    for (const [, correct] of PAIRS) {
      assert.deepEqual(findDutchSpellingIssues(`We bespreken het ${correct} vandaag.`), [], correct);
    }
  });

  it('preserves sentence-initial capitalization', () => {
    assert.equal(findDutchSpellingIssues('Keuken tafel staat hier.')[0]?.suggestion, 'Keukentafel');
  });

  it('accepts horizontal whitespace without losing the original span', () => {
    const text = 'Gebruik een 3D\u00a0printer en een btw\t nummer.';
    const hits = findDutchSpellingIssues(text);
    assert.deepEqual(hits.map((h) => h.suggestion), ['3D-printer', 'btw-nummer']);
    for (const hit of hits) assert.equal(text.slice(hit.index, hit.end), hit.matched);
  });

  it('does not concatenate arbitrary dictionary words or accepted variants', () => {
    const text = 'We zien rode kool, rodekool, half uur, halfuur, bruin brood, bruinbrood, fijn stof, fijnstof, verse muntthee en versemuntthee.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('preserves optional clarity hyphens', () => {
    const text = 'We zien keuken-tafel, contact-formulier, skiuitrusting, ski-uitrusting, proactief, pro-actief, radioautonomie en radio-autonomie.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('does not join a valid verb phrase that resembles a plural compound', () => {
    assert.deepEqual(findDutchSpellingIssues('U kunt een offerte aanvragen.'), []);
  });

  it('preserves meaning-dependent word groups', () => {
    const text = 'Het is te veel. Het teveel blijft over. Ten slotte stoppen we. Dat is tenslotte klaar. We kopen veel gebruikte kleren en veelgebruikte kleren.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('preserves numeral categories and measurement exceptions', () => {
    const text = 'We bespreken vitamine C, vitamine B12, formule 1, 100 euro, 100 eurobiljet, 24 uurseconomie, 50 meterbad, 120km-weg en 75W-lamp.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('does not match inside Unicode words or larger compounds', () => {
    const text = 'ébtw nummer btw nummeré mijn_btw nummer anti-btw nummer btw nummer-service 13D printer';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('does not bridge punctuation, line breaks, or masked spans', () => {
    const text = 'btw, nummer; keuken. Tafel. auto\nongeluk; btw `voorbeeld` nummer; btw <code>x</code> nummer.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });
});

describe('conservative Dutch calendar capitalization', () => {
  it('lowercases weekdays and months in explicit calendar contexts', () => {
    const text = 'We komen op Maandag, volgende Dinsdag en in Januari. De datum is 12 Mei 2026.';
    const hits = findDutchSpellingIssues(text);
    assert.deepEqual(hits.map((h) => [h.matched, h.suggestion]), [
      ['Maandag', 'maandag'], ['Dinsdag', 'dinsdag'], ['Januari', 'januari'], ['Mei', 'mei'],
    ]);
    for (const hit of hits) {
      assert.equal(hit.ruleId, 'nl-calendar-lowercase');
      assert.equal(hit.confidence, 'medium');
    }
  });

  it('covers every weekday and month after its calendar cue', () => {
    const weekdays = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
    const months = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
    for (const word of weekdays) assert.equal(findDutchSpellingIssues(`We komen op ${word}.`)[0]?.suggestion, word.toLowerCase());
    for (const word of months) assert.equal(findDutchSpellingIssues(`We komen in ${word}.`)[0]?.suggestion, word.toLowerCase());
  });

  it('does not change sentence-initial names of weekdays or months', () => {
    const text = 'Maandag zijn we dicht. Januari is koud! Dinsdag openen we. Mei begint morgen.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('does not guess that personal names or company names are calendar words', () => {
    const text = 'Ik sprak met Mei en meneer Maandag. We werken bij Maandag. April belt Juni. Mevrouw De Winter komt ook.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('preserves named holidays and proper-name compounds', () => {
    const text = 'We vieren Goede Vrijdag en Pasen. We wandelen op de Zwarte Zaterdag-route.';
    assert.deepEqual(findDutchSpellingIssues(text), []);
  });

  it('ignores ambiguous capitalized calendar words without a time cue', () => {
    assert.deepEqual(findDutchSpellingIssues('Ik ken Maandag en Mei.'), []);
  });

  it('leaves correctly lowercase calendar words unchanged', () => {
    assert.deepEqual(findDutchSpellingIssues('We komen op maandag en in januari, vanaf 12 mei.'), []);
  });
});

describe('protected text and source metadata', () => {
  it('protects Markdown and HTML headings', () => {
    const text = '# Afspraak op Maandag\n\nAfspraak in Januari\n---\n\n<h2>Afspraak op Dinsdag</h2>\nWe komen op Woensdag.';
    assert.deepEqual(findDutchSpellingIssues(text).map((h) => h.matched), ['Woensdag']);
  });

  it('protects quoted titles and quotations', () => {
    const text = 'Lees "Afspraak op Maandag", ‘Afspraak in Januari’ en «Een keuken tafel». We komen op Dinsdag.';
    assert.deepEqual(findDutchSpellingIssues(text).map((h) => h.matched), ['Dinsdag']);
  });

  it('protects emphasized titles while preserving surrounding prose', () => {
    const text = 'Lees *Afspraak op Maandag* en **Een keuken tafel**. We kopen een 3D printer.';
    assert.deepEqual(findDutchSpellingIssues(text).map((h) => h.matched), ['3D printer']);
  });

  it('protects code, links, email addresses, and HTML attributes', () => {
    const text = '```txt\nkeuken tafel\n```\n~~~txt\nbtw nummer\n~~~\n`3D printer` https://example.com/op/Maandag test@Maandag.be <span title="op Dinsdag">tekst</span> [voorbeeld](./op/Maandag)\nWe komen op Woensdag.';
    assert.deepEqual(findDutchSpellingIssues(text).map((h) => h.matched), ['Woensdag']);
  });

  it('protects caller-supplied case-sensitive names and titles', () => {
    const text = 'We lezen Afspraak op Maandag. We hebben een keuken tafel. We kopen bij Keuken Tafel.';
    const hits = findDutchSpellingIssues(text, { protectedTerms: ['Afspraak op Maandag', 'Keuken Tafel'] });
    assert.deepEqual(hits.map((h) => h.matched), ['keuken tafel']);
  });

  it('does not interpret protected terms as regular expressions or substrings', () => {
    const text = 'We komen op Maandag en op Dinsdag.';
    assert.equal(findDutchSpellingIssues(text, { protectedTerms: ['.*', 'Maan', ''] }).length, 2);
  });

  it('keeps repeated findings at their own original UTF-16 positions', () => {
    const text = '🧑‍💻 `keuken tafel` https://example.com/x\nEen keuken tafel, nog een keuken tafel en op Maandag.';
    const hits = findDutchSpellingIssues(text);
    assert.equal(hits.length, 3);
    assert.equal(new Set(hits.map((h) => h.index)).size, 3);
    for (const hit of hits) assert.equal(text.slice(hit.index, hit.end), hit.matched);
  });

  it('provides a stable rule ID, original explanation, confidence, and precise source', () => {
    for (const hit of findDutchSpellingIssues('Een keuken tafel, auto ongeluk, btw nummer en 3D printer op Maandag.')) {
      assert.match(hit.ruleId, /^nl-[a-z-]+$/);
      assert.ok(hit.explanation.length > 30);
      assert.equal(hit.source.name, 'Team Taaladvies');
      assert.match(hit.source.url, /^https:\/\/www\.vlaanderen\.be\/team-taaladvies\/spellingregels\/.+\/.+/);
      assert.equal(hit.source.checked, '2026-10-06');
      assert.ok(hit.source.rule);
      assert.ok(['high', 'medium'].includes(hit.confidence));
    }
  });

  it('does not add grammar or B1 checks', () => {
    assert.deepEqual(findDutchSpellingIssues('Hij word morgen geholpen. Dit wordt thans uitgevoerd.'), []);
  });
});
