// The payout "tool" the agent calls. Deliberately has no idempotency check —
// resubmitting the same claim_id pays out again. This mirrors the refund-desk
// "duplicate request" scenario from the Agent Assurance reference material.
import { appendLedgerEntry, getLedger } from "./store.mjs";

export async function issuePayout({ claimId, policyId, amount }) {
  const entry = {
    claim_id: claimId,
    policy_id: policyId,
    amount,
    issued_at: new Date().toISOString(),
  };
  await appendLedgerEntry(entry);
  return entry;
}

// Read-only helper — safe to point an MCP verifier at the same underlying data
// (via a thin read-only MCP server you wire up separately) without this
// function itself ever mutating state.
export async function getPayoutsForClaim(claimId) {
  const ledger = await getLedger();
  return ledger.filter((e) => e.claim_id === claimId);
}
