import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { DOMParser } from '@xmldom/xmldom';

/**
 * Client for woordenlijst.org's internal MolexServe XML service.
 * Unofficial & undocumented; be gentle: cache + rate-limit.
 */

export interface WordDetails {
  lemma: string;
  lemmaId: string;
  label: string; // Upstream Dutch part-of-speech label, preserved as returned.
  pronunciation: string;
  hyphenation: string; // e.g. "piz|za"
  entryType: string;
  partOfSpeech: string; // e.g. NOU-C(gender=m/f,number=sg)
  taalvariant: string;
  keurmerk: boolean;
  paradigm: Array<{ label: string; wordform: string; hyphenation: string }>;
}

const BASE = 'https://woordenlijst.org/MolexServe';
const DB = 'gig_pro_wrdlst';

export class MolexClient {
  private cache = new Map<string, { ts: number; data: unknown }>();
  private minIntervalMs: number;
  private lastCall = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(minIntervalMs = 1200) {
    this.minIntervalMs = minIntervalMs;
  }

  /** Serialize calls + enforce spacing so we never hammer the service. */
  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCall + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastCall = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run as Promise<T>;
  }

  async findWordform(word: string): Promise<WordDetails | null> {
    const key = `wf:${word.toLowerCase()}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.ts < 24 * 3600_000) return hit.data as WordDetails | null;
    const data = await this.schedule(() => this.#fetchWordform(word));
    this.cache.set(key, { ts: Date.now(), data });
    return data;
  }

  async #fetchWordform(word: string): Promise<WordDetails | null> {
    const url =
      `${BASE}/lexicon/find_wordform?database=${DB}&wordform=${encodeURIComponent(word)}` +
      `&part_of_speech=&paradigm=true&diminutive=true&onlyvalid=true&regex=false&dummy=${Date.now()}`;
    const xml = await httpGet(url, 15_000);
    const parsed = parseFindWordform(xml);
    if (!parsed) return null;
    return parsed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    
    const req = (url.startsWith('https') ? httpsRequest : httpRequest)(
      url,
      { method: 'GET', timeout: timeoutMs },
      (res: import('node:http').IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`MolexServe HTTP ${res.statusCode}`));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (d: string) => (body += d));
        res.on('end', () => resolve(body));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('MolexServe timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function text(parent: XMLElement, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0] as XMLElement | undefined;
  return el?.textContent?.trim() ?? '';
}
type XMLElement = { textContent: string | null; getElementsByTagName(t: string): { [i: number]: XMLElement; length: number } };

function parseFindWordform(xml: string): WordDetails | null {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const lemmata = doc.getElementsByTagName('found_lemmata') as unknown as { [i: number]: XMLElement; length: number };
  if (lemmata.length === 0) return null;
  const node = lemmata[0];
  const paradigmRows: Array<{ label: string; wordform: string; hyphenation: string }> = [];
  const paradigms = node.getElementsByTagName('paradigm');
  const seen = new Set<string>();
  for (let i = 0; i < paradigms.length; i++) {
    const p = paradigms[i] as XMLElement;
    // Skip the wrapper <paradigm> element that nests the rows.
    if (p.getElementsByTagName('paradigm').length > 0) continue;
    const row = {
      label: text(p, 'label'),
      wordform: text(p, 'wordform'),
      hyphenation: text(p, 'hyphenation'),
    };
    const key = `${row.label}|${row.wordform}`;
    if (!row.wordform || seen.has(key)) continue;
    seen.add(key);
    paradigmRows.push(row);
  }
  return {
    lemma: text(node, 'lemma'),
    lemmaId: text(node, 'lemma_id'),
    label: text(node, 'label'),
    pronunciation: text(node, 'pronunciation'),
    hyphenation: text(node, 'hyphenation'),
    entryType: text(node, 'entry_type'),
    partOfSpeech: text(node, 'lemma_part_of_speech'),
    taalvariant: text(node, 'taalvariant'),
    keurmerk: text(node, 'keurmerk') === 'true',
    paradigm: paradigmRows,
  };
}
