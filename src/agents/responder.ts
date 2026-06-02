import {
  ResponderOutputSchema,
  type Claim,
  type DecisionOutput,
  type ResponderOutput,
} from "../schemas.js";
import type { LLMProvider } from "../llm/index.js";
import { modelFor } from "../llm/index.js";

const SYSTEM_PROMPT = `You draft customer-facing replies for shipping/protection claim decisions.

Tone: warm, concise, plain English. No legalese, no "we regret to inform you".
Length: 3-6 sentences. Open with the outcome, then the reason, then next steps.

Rules:
- Never reveal internal fraud scoring or that fraud was suspected.
- For ESCALATE: do not promise an outcome. Say a human teammate will follow up within 24 hours.
- For APPROVE: state the refund amount in USD and the expected timeline (3-5 business days).
- For DENY: be respectful and explain the policy reason in one sentence.
- Always sign off as "The {{merchant}} support team".

Also write a short internalNote (1-2 sentences, present tense) summarizing the
decision and citing the rule that fired. The internal note is what shows up in
the agent's ticket queue and should be skimmable.

Output ONLY a JSON object of the form:
{
  "customerEmailSubject": "...",
  "customerEmailBody": "...",
  "internalNote": "..."
}
Do not include any text outside the JSON.`;

export async function draftResponse(
  provider: LLMProvider,
  claim: Claim,
  decision: DecisionOutput,
): Promise<ResponderOutput> {
  const userPrompt = `Merchant: ${claim.order.merchant}
Order: ${claim.order.id}
Items: ${claim.order.items.join(", ")}
Decision: ${decision.decision}
Refund: $${decision.refundUsd.toFixed(2)}
Reasoning (internal): ${decision.reasoning}
Citations: ${decision.citations.join(", ") || "(none)"}

Customer's original message:
"""
${claim.customerMessage}
"""`;

  return provider.chatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    ResponderOutputSchema,
    { model: modelFor("responder") },
  );
}
