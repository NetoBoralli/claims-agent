import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

/**
 * BM25-lite retriever over a tiny markdown policy corpus.
 *
 * For three policy files, lexical scoring beats embeddings on both latency
 * and clarity. Each hit returns its source filename so the decider can
 * cite by name — an interviewer sees *which* clause justified the call.
 *
 * Swap for pgvector/Pinecone later by replacing this file; the public
 * surface is just `loadPolicyStore` and `PolicyStore.search`.
 */

const TOKEN = /[A-Za-z][A-Za-z0-9_-]+/g;

interface Doc {
  source: string;
  text: string;
  tokens: string[];
}

export class PolicyStore {
  private readonly docs: Doc[];
  private readonly docFreq: Map<string, number>;

  constructor(docs: Doc[]) {
    this.docs = docs;
    this.docFreq = new Map();
    for (const doc of docs) {
      const seen = new Set<string>();
      for (const t of doc.tokens) {
        if (seen.has(t)) continue;
        seen.add(t);
        this.docFreq.set(t, (this.docFreq.get(t) ?? 0) + 1);
      }
    }
  }

  search(query: string, k = 4): { source: string; text: string; score: number }[] {
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    const n = Math.max(this.docs.length, 1);
    const results: { source: string; text: string; score: number }[] = [];

    for (const doc of this.docs) {
      const dTf = countTokens(doc.tokens);
      let score = 0;
      for (const term of new Set(qTokens)) {
        const df = this.docFreq.get(term) ?? 0;
        if (df === 0) continue;
        const idf = Math.log((n + 1) / (df + 0.5));
        const qf = qTokens.filter((t) => t === term).length;
        const tf = dTf.get(term) ?? 0;
        score += qf * tf * idf;
      }
      if (score > 0) {
        const norm = Math.sqrt(
          Array.from(dTf.values()).reduce((s, c) => s + c * c, 0),
        ) || 1;
        results.push({ source: doc.source, text: doc.text, score: score / norm });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }
}

export async function loadPolicyStore(dir: string): Promise<PolicyStore> {
  const entries = await readdir(dir);
  const docs: Doc[] = [];
  for (const entry of entries.sort()) {
    if (extname(entry) !== ".md") continue;
    const text = await readFile(join(dir, entry), "utf8");
    for (const chunk of chunkParagraphs(text, 4)) {
      docs.push({ source: entry, text: chunk, tokens: tokenize(chunk) });
    }
  }
  return new PolicyStore(docs);
}

function chunkParagraphs(text: string, perChunk: number): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < paras.length; i += perChunk) {
    chunks.push(paras.slice(i, i + perChunk).join("\n\n"));
  }
  return chunks;
}

function tokenize(text: string): string[] {
  return Array.from(text.matchAll(TOKEN), (m) => m[0].toLowerCase());
}

function countTokens(tokens: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tokens) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}
