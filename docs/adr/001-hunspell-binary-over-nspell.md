# ADR 001 — Spellchecking: C-hunspell binary in plaats van pure-JS (nspell)

Status: Besloten (2026-09-22)

## Achtergrond

De MCP-server roept de `hunspell` C-binary aan via de `-a` (ispell) pipe
(`src/hunspell.ts`) voor de NL- en en_US-spellingchecks. Een alternatief zou
zijn om over te stappen op een pure-JS implementatie (bijv. `nspell@2.x`) zodat
de server geen externe binary vereist en ook op een minimale/containers/remote
omgeving draait.

## Besluit

We houden de C-hunspell binary en gaan **niet** over op nspell.

## Redenering

- **Pariteitsrisico bij compound/gesepareerde woorden.** De huidige wrapper
  leunt op de `-a`-pipe die hyphen-woorden, em-dashes en vergelijkbare
  scheidings tekens per deel controleert (één responsregel per deel). nspell
  heeft geen equivalent van die pipe: die splitting- en samenvoeglogic zou
  zelf nagebouwd moeten worden. Fout doen levert false-positives op hyphen-
  woorden ("data-driven", "real-time") op — een direct kwaliteitsverlies op
  precies het niveau dat de server goed moet doen.
- **Prestaties.** De C-binary is per woord sneller en wordt in één
  batch-spawn aangeroepen. nspell is per woord in-process JS; verwaarloosbaar
  voor blog-tekst/e-mail, maar meetbaar bij langere documenten.
- **Suggestiegedrag.** Zelfde dictionary en algoritme, maar de exacte
  rangvolgorde en het aantal teruggegeven suggesties kan licht afwijken.
  De huidige code kapt op 8; bij een switch zou de set/pariteit moeten
  worden geverifieerd.
- **Wat nícht verandert.** `britticisms.ts` is een statische lijst, geen
  hunspell-afhankelijk, dus de US/UK-detector blijft identiek bij beide
  opties. Het verschil zit dus puur in de kern-spelling en compound-afhandeling.
- **Afweging.** Het enige concrete voordeel van nspell is het wegvallen van
  de binary-afhankelijkheid op targets die die niet hebben. Maar de kosten
  (na-bouwen van compound-splitting, pariteits- en performance-testen, risico
  op false-positives) wegen zwaarder dan het voordeel, terwijl een omgeving
  zónder hunspell op Aorus geen actueel use-case is.

## Consequenties

- `hunspell` blijft een vereiste runtime (PATH of systeemlocatie) en remains
  zo; documentatie en installatie blijven dat benoemen.
- Mochten we in de toekomst toch naar een target zonder C-hunspell moeten
  draaien (bijv. een volledig gesloten hosting-omgeving), dan opnieuw
  evalueren op basis van een A/B-pariteitest (dezelfde woordlijst: correct/
  suggest + top-8 vergelijken), niet op aannames.
