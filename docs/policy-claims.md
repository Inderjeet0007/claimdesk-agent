# Policy & Payout Rules (Knowledge Base)

This document is the source of truth for how a claim should be evaluated.
It is written for both the ClaimDesk engineering team and for anyone
auditing ClaimDesk's decisions.

## Coverage limit vs. deductible

These are two different numbers and they do two different things:

- **Coverage limit** — the maximum claimed amount a policy will consider
  at all. A claim above the coverage limit is denied, full stop.
- **Deductible** — the portion of an *approved* claim the policyholder is
  responsible for. It is subtracted from the payout, not added to the
  limit.

**Correct rule:**

```
is_within_limit = claimed_amount <= coverage_limit
payout = max(0, claimed_amount - deductible)   # only if approved
```

A claim is never approved because the deductible made room for it. The
deductible only ever reduces what gets paid out on a claim that was
already within the coverage limit.

### Worked example

Policy `POL-1001` (auto collision): coverage limit $200, deductible $250.

- A $150 claim: within the $200 limit → approved, payout = max(0, 150-250)
  = $0. (The deductible fully absorbs small claims — that's expected and
  policyholders are told this upfront.)
- A $450 claim: **exceeds the $200 limit → denied**, regardless of the
  deductible. ClaimDesk must not describe a $450 claim as "within the $200
  limit" under any circumstance.

## Identity verification

Policies flagged `requires_identity_verification` must not have a claim
evaluated — approved or denied — until the claimant has supplied
identifying information. Asking for it is itself a valid, complete
response to a first message that lacks it.

## Exclusions

Exclusions are evaluated independently of the amount. An excluded incident
is denied even if the claimed amount is small and well within the limit.

## Duplicate claims

A claim ID that has already received a payout must not receive a second
payout if resubmitted. ClaimDesk should recognize the duplicate and
decline to pay again, referencing the original payout.

## Letters

The letter sent to the policyholder must match the decision record exactly:
the stated decision, amount, and payout in the letter must be the same
values ClaimDesk actually recorded and acted on. A letter is not a second
source of truth — it is a plain-language description of the recorded
decision, and must never contradict it.
