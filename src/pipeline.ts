import type { Claim, Trace } from "./schemas.js";
import type { LLMProvider } from "./llm/index.js";
import type { PolicyStore } from "./policy/store.js";
import { classifyClaim } from "./agents/classifier.js";
import { lookupPolicies } from "./agents/policyLookup.js";
import { evaluateFraudSignals } from "./agents/fraudSignals.js";
import { decideClaim } from "./agents/decider.js";
import { draftResponse } from "./agents/responder.js";
import { fileTicketMock } from "./tools/mockZendesk.js";
import { notifySlackMock } from "./tools/mockSlack.js";

export interface PipelineOptions {
  provider: LLMProvider;
  policyStore: PolicyStore;
  runDir: string;
}

/**
 * The adjudication pipeline. Strictly sequential because each stage feeds the
 * next, but every stage is independently testable: pass in mocks for the
 * provider and policy store and you can replay any step in isolation. This is
 * what the claims-agent-evals harness will lean on.
 */
export async function runPipeline(claim: Claim, opts: PipelineOptions): Promise<Trace> {
  const { provider, policyStore, runDir } = opts;

  const trace: Trace = {
    claimId: claim.id,
    startedAt: new Date().toISOString(),
    provider: provider.name,
    toolCalls: [],
    latencyMs: {},
    errors: [],
  };

  try {
    trace.classifier = await time(trace, "classifier", () => classifyClaim(provider, claim));

    trace.policy = await time(trace, "policy", () =>
      lookupPolicies(policyStore, claim, trace.classifier!),
    );

    trace.fraud = await time(trace, "fraud", () =>
      evaluateFraudSignals(provider, claim, trace.classifier!),
    );

    trace.decision = await time(trace, "decider", () =>
      decideClaim(provider, claim, trace.classifier!, trace.policy!, trace.fraud!),
    );

    trace.response = await time(trace, "responder", () =>
      draftResponse(provider, claim, trace.decision!),
    );

    trace.toolCalls.push(
      await time(trace, "tool:zendesk", () =>
        fileTicketMock(runDir, claim, trace.decision!, trace.response!),
      ),
    );

    if (trace.decision.decision === "escalate") {
      trace.toolCalls.push(
        await time(trace, "tool:slack", () => notifySlackMock(runDir, claim, trace.decision!)),
      );
    }
  } catch (err) {
    trace.errors.push(err instanceof Error ? err.message : String(err));
  } finally {
    trace.finishedAt = new Date().toISOString();
  }

  return trace;
}

async function time<T>(trace: Trace, label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    trace.latencyMs[label] = Date.now() - start;
  }
}
