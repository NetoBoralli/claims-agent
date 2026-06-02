import {
  ClassifierOutputSchema,
  type Claim,
  type ClassifierOutput,
} from "../schemas.js";
import type { LLMProvider } from "../llm/index.js";
import { modelFor } from "../llm/index.js";

const SYSTEM_PROMPT = `You categorize post-purchase shipping/protection claims.

Choose exactly one category that best fits the claim:
- "lost_in_transit": tracking shows package in motion or stuck, never marked delivered.
- "delivered_not_received": tracking shows "delivered" but customer says it never arrived ("porch piracy" pattern).
- "damaged": item arrived but is broken, defective, or visibly damaged in shipment.
- "wrong_item": customer received the wrong product.
- "not_yet_due": the package is still within its normal expected delivery window — claim is premature.
- "unclear": the message and tracking together don't support any of the above with confidence.

Output ONLY a JSON object of the form:
{
  "category": "<one of the above>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<one or two sentences citing tracking status and what the customer said>"
}
Do not include any text outside the JSON.`;

export async function classifyClaim(
  provider: LLMProvider,
  claim: Claim,
): Promise<ClassifierOutput> {
  const trackingSummary = claim.tracking.length
    ? claim.tracking
        .map((t) => `- ${t.timestamp} | ${t.status}${t.location ? ` @ ${t.location}` : ""}${t.note ? ` (${t.note})` : ""}`)
        .join("\n")
    : "(no tracking events)";

  const userPrompt = `Claim ${claim.id}
Order ${claim.order.id} — ${claim.order.merchant} — $${claim.order.totalUsd.toFixed(2)}
Carrier: ${claim.order.carrier}  Tracking: ${claim.order.trackingNumber}
Placed at: ${claim.order.placedAt}
Items: ${claim.order.items.join(", ")}

Tracking events:
${trackingSummary}

Customer message:
"""
${claim.customerMessage}
"""

Attachments: ${claim.attachments.length ? claim.attachments.join(", ") : "none"}`;

  return provider.chatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    ClassifierOutputSchema,
    { model: modelFor("classifier") },
  );
}
