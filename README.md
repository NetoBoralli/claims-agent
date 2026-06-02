# claims-agent

A multi-agent adjudicator for post-purchase shipping / package-protection
claims. Each claim flows through five focused agents that classify, retrieve
policy, score fraud risk, decide approve/deny/escalate, and draft the
customer reply — then the pipeline files a (mock) Zendesk ticket and, on
escalate, posts to a (mock) Slack channel.

LLM backend is swappable: local **Ollama** for dev, any OpenAI-compatible API
in prod, by flipping one env var. No agent code changes.

## Why this shape

Most "agentic" demos are one prompt doing five jobs. That makes them brittle,
unaudita ble, and slow to evaluate. This repo is the opposite: each agent is a
tiny module with a focused system prompt and a `zod`-validated JSON output,
glued together by a sequential pipeline that produces a single inspectable
`Trace`.

```
src/
  llm/
    types.ts             # LLMProvider — chat() + chatJSON<T>(schema) with retry
    openaiCompatible.ts  # one impl covers Ollama, vLLM, OpenAI, OpenRouter, ...
    index.ts             # getProvider() / modelFor(agent)
  policy/
    store.ts             # BM25-lite retriever over policies/*.md
  agents/
    classifier.ts        # categorize: lost / DNR / damaged / wrong / not-yet-due / unclear
    policyLookup.ts      # retrieve policy snippets (lexical, deterministic)
    fraudSignals.ts      # hybrid: deterministic rules + LLM narrative check
    decider.ts           # approve / deny / escalate, with citations
    responder.ts         # drafts the customer email + internal note
  tools/
    mockZendesk.ts       # appends a ticket to .runs/zendesk.jsonl
    mockSlack.ts         # appends an escalation msg to .runs/slack.jsonl
  schemas.ts             # zod schemas for Claim + every agent output + Trace
  pipeline.ts            # wires the agents + records latency per stage
  render.ts              # pretty terminal trace
  index.ts               # CLI: run a sample or all samples
samples/                 # 5 fixtures: legit-lost, fraud, damaged, premature, edge
policies/                # 3 markdown policies (the RAG corpus)
```

## Setup

```bash
pnpm install
cp .env.example .env
```

### Run with Ollama (local, free)

```bash
ollama serve                       # start the server (separate terminal)
ollama pull qwen2.5:7b             # ~5GB, runs on a laptop
pnpm claim                         # runs samples/claim_001_lost_in_transit.json
pnpm claim samples/claim_002_likely_fraud.json
pnpm claim:all                     # runs all 5 fixtures sequentially
```

### Switch to a hosted API (no code changes)

Edit `.env`:

```bash
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...
```

Same command. Point `OPENAI_BASE_URL` at OpenRouter / Together / Groq to use
those instead. The `LLMProvider` interface (`src/llm/types.ts`) is the only
contract anything depends on.

### Per-agent model routing (optional)

A bigger model for the decision step, cheap models for the rest:

```bash
DECIDER_MODEL=llama3.1:8b
CLASSIFIER_MODEL=qwen2.5:7b
RESPONDER_MODEL=qwen2.5:7b
```

`modelFor("decider")` in `src/llm/index.ts` reads `DECIDER_MODEL` and falls
back to `OLLAMA_MODEL`. Same pattern works for hosted APIs.

## What a run looks like

```
▶ running CLM-001 via provider "ollama"
claim CLM-001  ·  provider ollama
─────────────────────────────────

1. classifier
  category   lost_in_transit  (confidence 0.92)
  reasoning  Tracking stopped at "Arrived at facility" 19 days ago with no
             delivery scan; customer reports non-receipt.

2. policy lookup
  package_protection.md  (rel 1.00)
    ## Lost in transit ...
  refund_thresholds.md   (rel 0.71)
    | lost_in_transit | $1,000 | last scan > 7 days ...

3. fraud signals
  risk score 0.08
    (none)

4. decision
  APPROVE  refund $129.50
  reasoning  Last carrier scan is 19 days old with no delivery — meets the
             "lost in transit" criteria in package_protection.md. Order
             subtotal $134.50 minus the $5 deductible.
  citations  package_protection.md, refund_thresholds.md

5. response drafted
  subject  Refund issued for your Lumen order
  Hi Jamie, ...

6. tool calls
  → zendesk.tickets.create  {"ticketId":"ZD-mb91zh21"}

latency: total 7421ms  (classifier=1432ms, policy=2ms, ...)
```
