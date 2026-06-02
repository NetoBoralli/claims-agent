import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Claim, DecisionOutput, ToolCall } from "../schemas.js";

/**
 * Stand-in for posting to a Slack channel. Only fires on ESCALATE — that's
 * the path that needs human eyes. Auto-approved/denied claims silently route
 * through the ticket queue.
 */
export async function notifySlackMock(
  runDir: string,
  claim: Claim,
  decision: DecisionOutput,
): Promise<ToolCall> {
  const channel = "#claims-escalations";
  const text =
    `:rotating_light: Escalation needed — claim *${claim.id}* ` +
    `(order ${claim.order.id}, $${claim.order.totalUsd.toFixed(2)})\n` +
    `Reason: ${decision.reasoning}`;

  const payload = {
    channel,
    text,
    blocks: [
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Claim:*\n${claim.id}` },
          { type: "mrkdwn", text: `*Customer:*\n${claim.customer.email}` },
          { type: "mrkdwn", text: `*Order total:*\n$${claim.order.totalUsd.toFixed(2)}` },
          { type: "mrkdwn", text: `*Merchant:*\n${claim.order.merchant}` },
        ],
      },
    ],
  };

  const ts = (Date.now() / 1000).toFixed(6);
  const record = { ts, ...payload };

  await mkdir(runDir, { recursive: true });
  await appendFile(join(runDir, "slack.jsonl"), JSON.stringify(record) + "\n");

  return { tool: "slack.chat.postMessage", payload, result: { ts, channel } };
}
