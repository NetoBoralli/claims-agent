import {
  DecisionOutputSchema,
  type Claim,
  type ClassifierOutput,
  type DecisionOutput,
  type FraudOutput,
  type PolicyLookupOutput,
} from "../schemas.js";
import type { LLMProvider } from "../llm/index.js";
import { modelFor } from "../llm/index.js";

/**
 * The decision agent. This is the one place where the LLM is asked to do
 * actual policy reasoning — every other agent feeds it structured context.
 *
 * Constraints are spelled out as bright lines so the model doesn't make up
 * thresholds. Anything off the bright lines defaults to "escalate".
 */
const SYSTEM_PROMPT = `You are the claims decision agent. You APPROVE, DENY, or ESCALATE a shipping/protection claim.

Inputs you will receive:
- the claim itself,
- the classifier's category and confidence,
- the relevant policy snippets (cite them by source filename),
- the fraud signal output (riskScore + named signals).

Hard rules — apply BEFORE anything else:
1. If classifier.category == "not_yet_due" → DENY with reasoning that points to the delivery window.
2. If fraud.riskScore >= 0.7 → ESCALATE to a human reviewer; do not auto-approve.
3. If classifier.confidence < 0.5 OR classifier.category == "unclear" → ESCALATE.
4. If the claim is APPROVED, set refundUsd to a value supported by the policy snippets.
   Never exceed the order total. If the policy specifies a cap or deductible, respect it.
5. Cite at least one policy snippet by its source filename when approving or denying.

Output ONLY a JSON object of the form:
{
  "decision": "approve" | "deny" | "escalate",
  "refundUsd": <number, 0 if not approving>,
  "reasoning": "<2-4 sentences. Reference the rule that fired and the policy snippet you used.>",
  "citations": ["<policy filename>", ...]
}
Do not include any text outside the JSON.`;

export async function decideClaim(
  provider: LLMProvider,
  claim: Claim,
  classifier: ClassifierOutput,
  policy: PolicyLookupOutput,
  fraud: FraudOutput,
): Promise<DecisionOutput> {
  const policyBlock = policy.snippets.length
    ? policy.snippets
        .map(
          (s, i) =>
            `[${i + 1}] source=${s.source} relevance=${s.relevance.toFixed(2)}\n${s.text}`,
        )
        .join("\n\n")
    : "(no policy snippets retrieved)";

  const userPrompt = `Claim: ${claim.id}
Order total: $${claim.order.totalUsd.toFixed(2)} (${claim.order.merchant})
Items: ${claim.order.items.join(", ")}

Classifier: ${classifier.category} (confidence ${classifier.confidence})
Reasoning: ${classifier.reasoning}

Fraud: riskScore=${fraud.riskScore}
Signals:
${fraud.signals.map((s) => `- ${s.name} (w=${s.weight}): ${s.detail}`).join("\n") || "(none)"}

Policy snippets:
${policyBlock}`;

  return provider.chatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    DecisionOutputSchema,
    { model: modelFor("decider") },
  );
}
