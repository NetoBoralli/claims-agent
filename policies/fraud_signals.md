# Fraud signal reference

This document lists the known fraud patterns claims-agent watches for. The fraud
agent uses these as a guide; the decider treats `riskScore >= 0.7` as an automatic
escalate regardless of other inputs.

## Structural signals (deterministic)

- **Repeat claimant**: 3+ claims in the last 90 days. Strong signal even for low-value claims.
- **New account, high value**: account age under 30 days on an order >= $200. Often combined with delivered-not-received.
- **Delivered-not-received pattern**: tracking confirms delivery but customer denies receipt. Higher risk when no neighbor/family asked, no photo requested, and the address is a high-density apartment.
- **Damage without photos**: claim category is "damaged" but the customer attached no images. Always at least a yellow flag.
- **Mismatched timing**: customer says the package "never arrived" but tracking shows it was delivered hours ago — too fast to know.

## Narrative signals (LLM-detected)

- **Template / boilerplate language**: the customer message reads like a copy-paste from a refund-fraud guide. Look for unusually formal phrasing, generic openings, lists of policy clauses.
- **Inconsistency with tracking**: e.g. claim says "the box was crushed" but the tracking has no exception scans and the customer made no mention of damage in their first contact.
- **Pre-emptive escalation language**: customer threatens chargebacks, BBB, or legal action in the first message — strong fraud co-occurrence signal but never the *only* reason to deny.
- **Emotional inconsistency**: claim of a high-sentiment loss (wedding gift, urgent medical item) paired with extremely terse description.

## What we do NOT treat as a signal

- Foreign address or unusual name. Never. This is explicitly forbidden.
- Email domain (e.g. yopmail, mailinator) — Route handles non-mainstream domains routinely.
- A single negative-sentiment word ("disappointed", "frustrated") — most legitimate claims are emotional.

## Action thresholds

- `riskScore < 0.4`: proceed with normal decision logic.
- `0.4 <= riskScore < 0.7`: proceed but add an internal note flagging the signals; do not auto-approve above $100.
- `riskScore >= 0.7`: escalate to a human reviewer; never auto-decide.
