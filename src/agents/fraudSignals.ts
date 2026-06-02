import {
  FraudOutputSchema,
  type Claim,
  type ClassifierOutput,
  type FraudOutput,
  type FraudSignal,
} from "../schemas.js";
import type { LLMProvider } from "../llm/index.js";
import { modelFor } from "../llm/index.js";

/**
 * Hybrid fraud check: deterministic rules surface the structural red flags
 * (repeat claimant, brand-new account on a high-value order, etc.), then the
 * LLM looks at the narrative for tonal/contextual signals the rules miss
 * (inconsistencies, copy-pasted templates, premature claiming).
 *
 * Output combines both — risk_score is the calibrated weight, signals is the
 * inspectable evidence list a human reviewer can audit.
 */

const SYSTEM_PROMPT = `You evaluate post-purchase shipping/protection claims for fraud risk.

You receive the claim AND a list of structural signals already detected by deterministic rules.
Your job is to add the contextual signals the rules cannot see: inconsistency between the
tracking events and the customer story, template/boilerplate language, tone, mismatched
timing, claims of damage with no attachments, etc.

Be conservative — only flag what is actually evidenced in the message and tracking.

Output ONLY a JSON object of the form:
{
  "riskScore": <number between 0 and 1>,
  "signals": [
    { "name": "<short identifier>", "weight": <0..1>, "detail": "<one-sentence why>" }
  ]
}
Include the structural signals you were given verbatim, then append any you discovered.
Do not include any text outside the JSON.`;

export async function evaluateFraudSignals(
  provider: LLMProvider,
  claim: Claim,
  classifier: ClassifierOutput,
): Promise<FraudOutput> {
  const structural = detectStructuralSignals(claim, classifier);

  const trackingSummary = claim.tracking
    .map((t) => `- ${t.timestamp} | ${t.status}${t.location ? ` @ ${t.location}` : ""}`)
    .join("\n") || "(no tracking events)";

  const userPrompt = `Claim ${claim.id}
Category (from classifier): ${classifier.category} (confidence ${classifier.confidence})
Order total: $${claim.order.totalUsd.toFixed(2)}
Customer: prior_claims_90d=${claim.customer.priorClaims90d}, account_age_days=${claim.customer.accountAgeDays}
Attachments: ${claim.attachments.length ? claim.attachments.join(", ") : "none"}

Tracking events:
${trackingSummary}

Customer message:
"""
${claim.customerMessage}
"""

Structural signals already detected:
${JSON.stringify(structural, null, 2)}`;

  return provider.chatJSON(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    FraudOutputSchema,
    { model: modelFor("fraud") },
  );
}

function detectStructuralSignals(claim: Claim, classifier: ClassifierOutput): FraudSignal[] {
  const out: FraudSignal[] = [];

  if (claim.customer.priorClaims90d >= 3) {
    out.push({
      name: "repeat_claimant",
      weight: 0.6,
      detail: `Customer filed ${claim.customer.priorClaims90d} claims in the last 90 days.`,
    });
  } else if (claim.customer.priorClaims90d > 0) {
    out.push({
      name: "prior_claims_present",
      weight: 0.25,
      detail: `Customer filed ${claim.customer.priorClaims90d} prior claim(s) in 90d.`,
    });
  }

  if (claim.customer.accountAgeDays < 30 && claim.order.totalUsd >= 200) {
    out.push({
      name: "new_account_high_value",
      weight: 0.55,
      detail: `Account is ${claim.customer.accountAgeDays}d old, order is $${claim.order.totalUsd.toFixed(2)}.`,
    });
  }

  if (
    classifier.category === "delivered_not_received" &&
    claim.tracking.some((t) => /delivered/i.test(t.status))
  ) {
    out.push({
      name: "dnr_pattern",
      weight: 0.3,
      detail: "Tracking confirms delivery; relies on customer testimony only.",
    });
  }

  if (classifier.category === "damaged" && claim.attachments.length === 0) {
    out.push({
      name: "damage_without_photos",
      weight: 0.35,
      detail: "Damage claim filed without photo evidence.",
    });
  }

  return out;
}
