// Evaluation harness: run check_dutch_b1_text over the Amsterdam complex–simple
// corpus and report per-proxy separation (flag rate on complex minus flag rate
// on simple sentences). See docs/b1-eval.md. Not part of the npm test suite.
//
// Usage: npx tsx tests/eval/b1-amsterdam.ts [--out baseline.json]
//
// The tool output is plain text grouped by section (no machine rule IDs yet),
// so this harness classifies flags by section:
//   Readability:        Flesch-Douma value, words/sentences, long-word share
//   Passive voice:      one "- \"...\"" line per detected passive
//   Jargon/filler/idiom: one "- \"word\" → alt" line per hit
//   Nominalization:     density per 100 words
//   Voice consistency:  OK or issue line
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const csvPath = path.join(root, "assets/eval/amsterdam-complex-simple/complex-simple-v1-anonymized.csv");

// Minimal CSV reader for this corpus shape (header + quoted fields with commas/newlines).
function parseCsv(text: string): Array<{ complex: string; simple: string }> {
  const rows: Array<{ complex: string; simple: string }> = [];
  const lines = text.split(/\r?\n/);
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false;
  const pushField = () => { fields.push(field); field = ""; };
  for (const line of lines) {
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inQuotes) {
        if (ch === '"') {
          if (line[c + 1] === '"') { field += '"'; c++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') { inQuotes = true; started = true; }
      else if (ch === ",") pushField();
      else { field += ch; started = true; }
    }
    if (inQuotes) { field += "\n"; continue; }
    if (started) {
      pushField();
      if (fields.length >= 3 && fields[0] !== "Document ID") {
        rows.push({ complex: fields[1], simple: fields[2] });
      }
      fields = []; started = false;
    }
  }
  return rows;
}

interface SideStats {
  words: number; sentences: number; pairs: number;
  fdSum: number; fdCount: number; fdBelow60: number;
  sentWarn: number; sentFlag: number;
  longWordPctSum: number;
  passiveHits: number; passivePairs: number;
  jargonHits: number; jargonPairs: number;
  nomDensitySum: number; nomHigh: number; // nomHigh: density > 6 per 100 words
  voiceIssues: number;
  rareHits: number; rarePairs: number; rarePctSum: number;
  lixCount: number; lixSum: number; brouwerCount: number; brouwerSum: number;
}

function emptyStats(): SideStats {
  return {
    words: 0, sentences: 0, pairs: 0,
    fdSum: 0, fdCount: 0, fdBelow60: 0,
    sentWarn: 0, sentFlag: 0,
    longWordPctSum:  0,
    passiveHits: 0, passivePairs: 0,
    jargonHits: 0, jargonPairs: 0,
    nomDensitySum: 0, nomHigh: 0,
    voiceIssues: 0,
    rareHits: 0, rarePairs: 0, rarePctSum: 0,
    lixCount: 0, lixSum: 0, brouwerCount: 0, brouwerSum: 0,
  };
}

function classify(body: string, s: SideStats): void {
  s.pairs++;
  let section = "";
  let passiveHits = 0;
  let jargonHits = 0;
  let rareHits = 0;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (/^Readability:\s*$/.test(line)) { section = "read"; continue; }
    if (/^Passive voice/.test(line)) { section = "passive"; continue; }
    if (/^Jargon and vague wording/.test(line)) { section = "jargon"; continue; }
    if (/^Word frequency \(Zipf/.test(line)) { section = "rare"; continue; }
    if (/^Nominalization density:/.test(line)) {
      section = "nom";
      const m = /density:\s*(-?[\d.]+)\s+per 100/.exec(line);
      if (m) { const v = parseFloat(m[1]); s.nomDensitySum += v; if (v > 6) s.nomHigh++; }
      continue;
    }
    if (/^Voice consistency:/.test(line)) {
      section = "voice";
      if (!/OK/.test(line)) s.voiceIssues++;
      continue;
    }
    if (section === "read") {
      let m = /^-\s*Flesch-Douma:\s*(-?\d+(?:\.\d+)?)/.exec(line);
      if (m) { const v = parseFloat(m[1]); s.fdSum += v; s.fdCount++; if (v < 60) s.fdBelow60++; continue; }
      m = /^-\s*LIX:\s*(-?\d+(?:\.\d+)?)/.exec(line);
      if (m) { s.lixCount++; s.lixSum += parseFloat(m[1]); continue; }
      m = /^-\s*Brouwer Leesindex:\s*(-?\d+(?:\.\d+)?)/.exec(line);
      if (m) { s.brouwerCount++; s.brouwerSum += parseFloat(m[1]); continue; }
      m = /^-\s*Words:\s*(\d+),\s*sentences:\s*(\d+)/.exec(line);
      if (m) { s.words += parseInt(m[1], 10); s.sentences += parseInt(m[2], 10); continue; }
      m = /^-\s*Sentences over \d+ words:\s*(\d+)\s*\((\d+) over \d+\)/.exec(line);
      if (m) { if (parseInt(m[1], 10) > 0) s.sentWarn++; if (parseInt(m[2], 10) > 0) s.sentFlag++; continue; }
      m = /^-\s*Long words \(>=4 syllables\):\s*(\d+)/.exec(line);
      if (m) { s.longWordPctSum += parseInt(m[1], 10); continue; }
    }
    if (section === "passive" && /^-\s*"/.test(line)) passiveHits++;
    if (section === "jargon" && /^-\s*"/.test(line)) jargonHits++;
    if (section === "rare") {
      if (/^-\s*"/.test(line)) rareHits++;
      const m = /^-\s*Rare words:\s*(\d+)\s*\((\d+)% of known words;/.exec(line);
      if (m) { s.rarePctSum += parseInt(m[2], 10); if (parseInt(m[1], 10) > 0) s.rarePairs++; }
    }
  }
  s.passiveHits += passiveHits; if (passiveHits > 0) s.passivePairs++;
  s.jargonHits += jargonHits; if (jargonHits > 0) s.jargonPairs++;
  s.rareHits += rareHits;
}

function rates(s: SideStats) {
  const n = s.pairs || 1;
  return {
    avg_words_per_sentence_pair: +(s.words / n).toFixed(1),
    avg_sentences: +(s.sentences / n).toFixed(2),
    flesch_douma_coverage: +(s.fdCount / n).toFixed(4),
    avg_flesch_douma_when_available: s.fdCount ? +(s.fdSum / s.fdCount).toFixed(1) : null,
    share_fd_below_60: +(s.fdBelow60 / n).toFixed(4),
    share_sentence_over_15: +(s.sentWarn / n).toFixed(4),
    share_sentence_over_20: +(s.sentFlag / n).toFixed(4),
    avg_long_word_pct: +(s.longWordPctSum / n).toFixed(1),
    share_with_passive: +(s.passivePairs / n).toFixed(4),
    passive_hits_per_pair: +(s.passiveHits / n).toFixed(3),
    share_with_jargon: +(s.jargonPairs / n).toFixed(4),
    jargon_hits_per_pair: +(s.jargonHits / n).toFixed(3),
    avg_nominalization_density: +(s.nomDensitySum / n).toFixed(2),
    share_nominalization_over_6: +(s.nomHigh / n).toFixed(4),
    share_voice_issue: +(s.voiceIssues / n).toFixed(4),
    share_with_rare_word: +(s.rarePairs / n).toFixed(4),
    rare_word_hits_per_pair: +(s.rareHits / n).toFixed(3),
    avg_rare_word_pct: +(s.rarePctSum / n).toFixed(2),
    lix_coverage: +(s.lixCount / n).toFixed(4),
    avg_lix_when_available: s.lixCount ? +(s.lixSum / s.lixCount).toFixed(1) : null,
    brouwer_coverage: +(s.brouwerCount / n).toFixed(4),
    avg_brouwer_when_available: s.brouwerCount ? +(s.brouwerSum / s.brouwerCount).toFixed(1) : null,
  };
}

async function main() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  const pairs = parseCsv(readFileSync(csvPath, "utf8")).filter(p => p.complex && p.simple);
  const client = new Client({ name: "b1-amsterdam-eval", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "src/cli.ts"],
    cwd: root,
    stderr: "pipe",
  }));

  const sides = { complex: emptyStats(), simple: emptyStats() };
  try {
    for (const side of ["complex", "simple"] as const) {
      for (const p of pairs) {
        const result = await client.callTool({ name: "check_dutch_b1_text", arguments: { text: p[side] } });
        const body = (result.content as Array<{ type: string; text?: string }>)
          .filter(i => i.type === "text").map(i => i.text).join("\n");
        classify(body, sides[side]);
      }
    }
  } finally {
    await client.close();
  }

  const rc = rates(sides.complex);
  const rs = rates(sides.simple);
  const separation: Record<string, number | null> = {};
  for (const k of Object.keys(rc)) {
    const a = rc[k as keyof typeof rc], b = rs[k as keyof typeof rs];
    separation[k] = (typeof a === "number" && typeof b === "number") ? +(a - b).toFixed(4) : null;
  }
  const report = {
    generated_at: new Date().toISOString(),
    corpus: "amsterdam-complex-simple v1 (1311 pairs, EUPL-1.2)",
    pairs: pairs.length,
    complex: rc,
    simple: rs,
    separation_complex_minus_simple: separation,
  };
  if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

void main();
