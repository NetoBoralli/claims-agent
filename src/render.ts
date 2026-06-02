import type { Trace } from "./schemas.js";

/** ANSI-coloured terminal rendering. Zero deps — keeps the CLI tiny. */

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

export function renderTrace(trace: Trace): string {
  const out: string[] = [];
  const head = `claim ${trace.claimId}  ·  provider ${trace.provider}`;
  out.push(c.bold(head));
  out.push(c.dim("─".repeat(head.length)));

  if (trace.classifier) {
    out.push(section("1. classifier", c.cyan));
    out.push(`  category   ${c.bold(trace.classifier.category)}  (confidence ${trace.classifier.confidence})`);
    out.push(`  reasoning  ${trace.classifier.reasoning}`);
  }

  if (trace.policy) {
    out.push(section("2. policy lookup", c.cyan));
    if (trace.policy.snippets.length === 0) {
      out.push(c.dim("  (no relevant snippets)"));
    } else {
      for (const s of trace.policy.snippets) {
        out.push(`  ${c.magenta(s.source)}  ${c.dim(`(rel ${s.relevance.toFixed(2)})`)}`);
        out.push(indent(s.text, "    "));
      }
    }
  }

  if (trace.fraud) {
    out.push(section("3. fraud signals", c.cyan));
    const riskColor =
      trace.fraud.riskScore >= 0.7 ? c.red : trace.fraud.riskScore >= 0.4 ? c.yellow : c.green;
    out.push(`  risk score ${riskColor(trace.fraud.riskScore.toFixed(2))}`);
    for (const s of trace.fraud.signals) {
      out.push(`    · ${c.bold(s.name)} (w=${s.weight}) — ${s.detail}`);
    }
  }

  if (trace.decision) {
    out.push(section("4. decision", c.cyan));
    const decColor =
      trace.decision.decision === "approve"
        ? c.green
        : trace.decision.decision === "deny"
          ? c.red
          : c.yellow;
    out.push(`  ${decColor(c.bold(trace.decision.decision.toUpperCase()))}  refund $${trace.decision.refundUsd.toFixed(2)}`);
    out.push(`  reasoning  ${trace.decision.reasoning}`);
    if (trace.decision.citations.length) {
      out.push(`  citations  ${trace.decision.citations.map((c) => c).join(", ")}`);
    }
  }

  if (trace.response) {
    out.push(section("5. response drafted", c.cyan));
    out.push(`  subject  ${c.bold(trace.response.customerEmailSubject)}`);
    out.push(indent(trace.response.customerEmailBody, "  "));
    out.push(c.dim("  internal note:"));
    out.push(c.dim(indent(trace.response.internalNote, "    ")));
  }

  if (trace.toolCalls.length) {
    out.push(section("6. tool calls", c.cyan));
    for (const t of trace.toolCalls) {
      const result = JSON.stringify(t.result);
      out.push(`  → ${c.bold(t.tool)}  ${c.dim(result)}`);
    }
  }

  if (trace.errors.length) {
    out.push(section("errors", c.red));
    for (const e of trace.errors) out.push(`  ${c.red(e)}`);
  }

  out.push("");
  out.push(c.dim(`latency: ${formatLatency(trace.latencyMs)}`));

  return out.join("\n");
}

function section(label: string, color: (s: string) => string): string {
  return `\n${color(label)}`;
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((l) => prefix + l)
    .join("\n");
}

function formatLatency(ms: Record<string, number>): string {
  const total = Object.values(ms).reduce((a, b) => a + b, 0);
  const parts = Object.entries(ms).map(([k, v]) => `${k}=${v}ms`);
  return `total ${total}ms  (${parts.join(", ")})`;
}
