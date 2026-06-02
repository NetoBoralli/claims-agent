import { z } from "zod";

/**
 * All cross-agent types live here. Each agent emits a zod-validated object so
 * the pipeline can log, cite, and replay decisions deterministically. The
 * `Trace` is what the CLI renders and what the evals harness asserts on.
 */

// ---------- Input: the claim ----------

export const TrackingEventSchema = z.object({
  timestamp: z.string(),
  status: z.string(),
  location: z.string().optional(),
  note: z.string().optional(),
});
export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  priorClaims90d: z.number().int().min(0).default(0),
  accountAgeDays: z.number().int().min(0).default(365),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  merchant: z.string(),
  totalUsd: z.number().nonnegative(),
  items: z.array(z.string()),
  placedAt: z.string(),
  carrier: z.string(),
  trackingNumber: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  order: OrderSchema,
  customer: CustomerSchema,
  tracking: z.array(TrackingEventSchema).default([]),
  customerMessage: z.string(),
  attachments: z.array(z.string()).default([]),
});
export type Claim = z.infer<typeof ClaimSchema>;

// ---------- Agent outputs ----------

export const ClaimCategory = z.enum([
  "lost_in_transit",
  "delivered_not_received",
  "damaged",
  "wrong_item",
  "not_yet_due",
  "unclear",
]);
export type ClaimCategory = z.infer<typeof ClaimCategory>;

export const ClassifierOutputSchema = z.object({
  category: ClaimCategory,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type ClassifierOutput = z.infer<typeof ClassifierOutputSchema>;

export const PolicySnippetSchema = z.object({
  source: z.string(),
  text: z.string(),
  relevance: z.number().min(0).max(1),
});
export type PolicySnippet = z.infer<typeof PolicySnippetSchema>;

export const PolicyLookupOutputSchema = z.object({
  snippets: z.array(PolicySnippetSchema),
});
export type PolicyLookupOutput = z.infer<typeof PolicyLookupOutputSchema>;

export const FraudSignalSchema = z.object({
  name: z.string(),
  weight: z.number().min(0).max(1),
  detail: z.string(),
});
export type FraudSignal = z.infer<typeof FraudSignalSchema>;

export const FraudOutputSchema = z.object({
  riskScore: z.number().min(0).max(1),
  signals: z.array(FraudSignalSchema),
});
export type FraudOutput = z.infer<typeof FraudOutputSchema>;

export const DecisionType = z.enum(["approve", "deny", "escalate"]);
export type DecisionType = z.infer<typeof DecisionType>;

export const DecisionOutputSchema = z.object({
  decision: DecisionType,
  refundUsd: z.number().min(0).default(0),
  reasoning: z.string(),
  citations: z.array(z.string()).default([]),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;

export const ResponderOutputSchema = z.object({
  customerEmailSubject: z.string(),
  customerEmailBody: z.string(),
  internalNote: z.string(),
});
export type ResponderOutput = z.infer<typeof ResponderOutputSchema>;

// ---------- Tool calls + Trace ----------

export interface ToolCall {
  tool: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface Trace {
  claimId: string;
  startedAt: string;
  finishedAt?: string;
  provider: string;
  classifier?: ClassifierOutput;
  policy?: PolicyLookupOutput;
  fraud?: FraudOutput;
  decision?: DecisionOutput;
  response?: ResponderOutput;
  toolCalls: ToolCall[];
  latencyMs: Record<string, number>;
  errors: string[];
}
