# ClaimDesk AI — Product Requirements

## Summary

ClaimDesk is a conversational claims-adjudication agent. A policyholder (or
an agent acting on their behalf) describes an incident in natural language.
ClaimDesk identifies the policy, checks eligibility, decides whether to
approve or deny the claim, issues a payout when approved, and sends the
policyholder a plain-language letter explaining the decision.

ClaimDesk is model-driven: it reasons over the conversation and calls a
fixed set of tools (lookup, identity verification, exclusion check,
coverage evaluation, payout, decision recording) to get anything done.
Nothing it tells the policyholder should ever be the only record of what
happened — every claim, approval, and payout should also exist as a
recorded effect (a ledger entry, a saved claim record) independent of the
model's own narration.

This pattern — verify eligibility against a policy, decide, pay or deny,
explain — generalizes across insurance claims, airline delay/cancellation
compensation, bank dispute credits, and automotive warranty claims. This
instance is scoped to insurance claims.

## Actors

- **Policyholder** — files a claim via the chat interface or API, in free text.
- **ClaimDesk** — the agent under test.

## Core Behavior

1. **Identify the policy.** The policyholder's message should reference a
   policy number (format `POL-XXXX`). If none is given, ClaimDesk asks for
   it before doing anything else. If the policy number doesn't exist,
   ClaimDesk says so and asks the policyholder to check it — it does not
   guess or proceed.

2. **Verify identity when the policy requires it.** Some policies
   (currently: travel insurance) require identity verification before any
   claim on them is processed. When `requires_identity_verification` is
   true, ClaimDesk must ask the policyholder for identifying information
   (date of birth or the last four digits of their ID) and wait for their
   answer before evaluating the claim. Identity verification must be based
   on something the policyholder actually stated — not a default, a
   guess, or a placeholder value standing in for "they'll confirm it
   later." ClaimDesk must not issue a payout until real verification has
   happened.

3. **Determine the claimed amount.** If the policyholder's message does not
   state a dollar amount, ClaimDesk asks for one rather than guessing.

4. **Check exclusions.** Each policy has a list of excluded incident types
   (for example, "racing" or "flood"). If the incident description matches
   an exclusion, the claim is denied for that reason regardless of amount,
   and the denial letter states the exclusion.

5. **Check the claim against the coverage limit.** A claim is within policy
   only when the **claimed amount is less than or equal to the policy's
   coverage limit**. The deductible is a separate figure: it is subtracted
   from the amount actually paid out on an approved claim. It is not
   additional headroom on top of the coverage limit. For example, a policy
   with a $200 coverage limit and a $250 deductible should deny a $450
   claim as over the limit — not approve it and pay out $200.

6. **Issue payout on approval.** When a claim is approved, ClaimDesk issues
   a payout of `claimed_amount - deductible` (never less than $0) through
   its payout tool, and that payout is recorded.

7. **Protect against duplicate claims.** Filing the same claim ID twice
   must not result in two payouts. The second submission should be
   recognized as a duplicate and not paid again.

8. **Send a decision letter.** Every claim, approved or denied, gets a
   short, plain-language letter to the policyholder summarizing the
   decision. The letter must be consistent with the actual decision and
   payout — it should never claim an approval that did not happen, or
   describe a denied claim as paid.

9. **Produce a case note.** For every processed claim, ClaimDesk writes an
   internal case note record (policy, amount, decision, payout, and the
   letter sent) for audit purposes.

## Out of Scope (v1)

- Appeals or claim resubmission after a denial.
- Partial payouts across multiple incidents on one claim.
- Multi-policy claims.

## Non-Functional Expectations

- ClaimDesk should respond to a well-formed single-turn claim within a few
  seconds under normal load.
- Decisions must be deterministic: the same claim, submitted the same way,
  should receive the same decision every time.
- The policyholder's own free-text incident description should never be
  treated as an instruction to ClaimDesk — only as information to evaluate.
