# Refund thresholds & escalation matrix

## Auto-decide envelope

The agent may auto-approve or auto-deny within these envelopes only. Anything
outside is an automatic escalate.

| Category                    | Auto-approve up to | Conditions                                              |
|-----------------------------|--------------------|---------------------------------------------------------|
| lost_in_transit             | $1,000             | last scan > 7 days, no delivery scan, low fraud risk    |
| delivered_not_received      | $200               | zero prior 90d claims, account age > 30 days            |
| delivered_not_received      | $200 – $500        | requires attached evidence (photo/affidavit)            |
| damaged                     | item value         | photos attached, < 2 prior damage claims in 90 days     |
| wrong_item                  | n/a                | always escalate to merchant queue                       |
| not_yet_due                 | n/a                | always deny with delivery-window note                   |
| unclear                     | n/a                | always escalate                                         |

## Deductible & floors

- A $5 deductible applies to every approved refund.
- Refunds under $10 net are issued as store credit, not original payment method.

## Time-to-decision SLAs

- Auto decisions: returned in under 5 minutes (target p95).
- Escalations: human reviewer responds within 24 hours.
- The customer always sees an immediate acknowledgement email, even on escalate.

## When the agent should refuse to decide

Even within the envelope, the agent escalates if:

- The customer message references injury, allergic reaction, or any safety issue.
- The order contains regulated items (alcohol, supplements, firearms-adjacent).
- The merchant has flagged the order for "manual review" in its order metadata.
- Two or more independent fraud signals are present, regardless of riskScore.
