import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Claim, DecisionOutput, ResponderOutput, ToolCall } from "../schemas.js";

/**
 * Stand-in for a real ticketing system (Zendesk, Intercom, Front).
 * Side effect is an append-only JSONL file so the demo shows real state change
 * without any third-party setup. In production this would call zendesk.tickets.create.
 */
export async function fileTicketMock(
  runDir: string,
  claim: Claim,
  decision: DecisionOutput,
  response: ResponderOutput,
): Promise<ToolCall> {
  const payload = {
    requesterEmail: claim.customer.email,
    subject: response.customerEmailSubject,
    body: response.customerEmailBody,
    tags: ["claims", `decision:${decision.decision}`, `merchant:${claim.order.merchant}`],
    custom: {
      claimId: claim.id,
      orderId: claim.order.id,
      refundUsd: decision.refundUsd,
      internalNote: response.internalNote,
      citations: decision.citations,
    },
  };

  const ticketId = `ZD-${Date.now().toString(36)}`;
  const record = { ticketId, createdAt: new Date().toISOString(), ...payload };

  await mkdir(runDir, { recursive: true });
  await appendFile(join(runDir, "zendesk.jsonl"), JSON.stringify(record) + "\n");

  return { tool: "zendesk.tickets.create", payload, result: { ticketId } };
}
