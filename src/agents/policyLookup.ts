import type { Claim, ClassifierOutput, PolicyLookupOutput } from "../schemas.js";
import type { PolicyStore } from "../policy/store.js";

/**
 * Retrieve the policy snippets the decider will cite.
 *
 * Pure retrieval — no LLM call. Query is built from the classifier's category
 * plus salient claim signals (carrier, value tier, "delivered" status). For
 * larger corpora a second LLM pass would rerank the top-k; left as a TODO.
 */
export async function lookupPolicies(
  store: PolicyStore,
  claim: Claim,
  classifier: ClassifierOutput,
): Promise<PolicyLookupOutput> {
  const query = buildQuery(claim, classifier);
  const hits = store.search(query, 4);
  const max = hits[0]?.score ?? 1;

  return {
    snippets: hits.map((h) => ({
      source: h.source,
      text: h.text,
      relevance: max > 0 ? h.score / max : 0,
    })),
  };
}

function buildQuery(claim: Claim, classifier: ClassifierOutput): string {
  const valueTier =
    claim.order.totalUsd >= 500 ? "high value" : claim.order.totalUsd >= 100 ? "mid value" : "low value";
  const recentDelivered = claim.tracking.some((t) => /delivered/i.test(t.status));
  return [
    classifier.category.replace(/_/g, " "),
    valueTier,
    claim.order.carrier,
    recentDelivered ? "delivered status" : "",
    claim.customer.priorClaims90d > 0 ? "repeat claimant" : "",
    claim.attachments.length ? "with photo evidence" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
