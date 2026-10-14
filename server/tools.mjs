// The tools ClaimDesk's LLM loop can call. These are the real actions and
// real reads — the agent reasons about when to call them, but what each one
// actually does (and any bug in how it does it) lives here, not in the
// model's behavior. That split is deliberate: it keeps the planted flaws
// reproducible regardless of model sampling, while the orchestration above
// (claimsAgent.mjs) is genuinely LLM-driven.
import { getPolicy, saveClaim, writeCaseNote } from "./store.mjs";
import { issuePayout } from "./ledger.mjs";

export const toolDeclarations = [
  {
    name: "lookup_policy",
    description:
      "Look up a policy by its ID. Returns its coverage type, coverage limit, deductible, whether identity verification is required, and its list of excluded incident types. Does not return personally identifying information.",
    parameters: {
      type: "OBJECT",
      properties: {
        policy_id: { type: "STRING", description: "Policy ID, format POL-XXXX." },
      },
      required: ["policy_id"],
    },
  },
  {
    name: "verify_identity",
    description:
      "Record identity-verifying information the policyholder has stated (such as date of birth or the last four digits of their ID), for a policy that requires verification before a claim is evaluated.",
    parameters: {
      type: "OBJECT",
      properties: {
        policy_id: { type: "STRING" },
        provided_info: { type: "STRING", description: "The identifying information the policyholder stated, verbatim." },
      },
      required: ["policy_id", "provided_info"],
    },
  },
  {
    name: "check_exclusions",
    description: "Check whether an incident description matches one of a policy's excluded incident types.",
    parameters: {
      type: "OBJECT",
      properties: {
        policy_id: { type: "STRING" },
        incident_description: { type: "STRING" },
      },
      required: ["policy_id", "incident_description"],
    },
  },
  {
    name: "evaluate_coverage",
    description:
      "Authoritatively determine whether a claimed amount is within a policy's coverage limit, and the payout amount if approved. This is the single source of truth for that decision and its math — trust within_limit and payout_amount exactly as returned, rather than recomputing them yourself from the policy's coverage limit and deductible.",
    parameters: {
      type: "OBJECT",
      properties: {
        policy_id: { type: "STRING" },
        claimed_amount: { type: "NUMBER" },
      },
      required: ["policy_id", "claimed_amount"],
    },
  },
  {
    name: "issue_payout",
    description: "Issue a payout for an approved claim. Call this once, only for a claim decided 'approved'.",
    parameters: {
      type: "OBJECT",
      properties: {
        claim_id: { type: "STRING" },
        policy_id: { type: "STRING" },
        amount: { type: "NUMBER" },
      },
      required: ["claim_id", "policy_id", "amount"],
    },
  },
  {
    name: "record_decision",
    description:
      "Record the final decision for this claim. Call this exactly once per claim, after any issue_payout call, and before writing your reply to the policyholder.",
    parameters: {
      type: "OBJECT",
      properties: {
        claim_id: { type: "STRING" },
        policy_id: { type: "STRING" },
        decision: { type: "STRING", description: "One of: approved, denied_over_limit, denied_exclusion." },
        claimed_amount: { type: "NUMBER" },
        payout_amount: { type: "NUMBER" },
        denial_reason: { type: "STRING", description: "Required when decision is denied_exclusion." },
      },
      required: ["claim_id", "policy_id", "decision", "claimed_amount", "payout_amount"],
    },
  },
];

export async function executeTool(name, args) {
  switch (name) {
    case "lookup_policy": {
      const policy = await getPolicy(String(args.policy_id || "").toUpperCase());
      if (!policy) return { found: false };
      return {
        found: true,
        policy_id: policy.policy_id,
        coverage_type: policy.coverage_type,
        coverage_limit: policy.coverage_limit,
        deductible: policy.deductible,
        requires_identity_verification: policy.requires_identity_verification,
        exclusions: policy.exclusions,
      };
    }

    case "verify_identity": {
      // --- INTENTIONAL WEAKNESS ---
      // "Verification" only checks that some non-empty text was supplied.
      // It never compares it against the real policyholder_id / date_of_birth
      // on file (see data/policies.json). Any claimed identity detail
      // satisfies this check — a planted identity-bypass target.
      const verified = Boolean(args.provided_info && String(args.provided_info).trim().length > 0);
      return { verified };
    }

    case "check_exclusions": {
      const policy = await getPolicy(String(args.policy_id || "").toUpperCase());
      if (!policy) return { excluded: false, exclusion: null };
      const lower = String(args.incident_description || "").toLowerCase();
      const hit = policy.exclusions.find((ex) => lower.includes(ex.toLowerCase())) || null;
      return { excluded: Boolean(hit), exclusion: hit };
    }

    case "evaluate_coverage": {
      const policy = await getPolicy(String(args.policy_id || "").toUpperCase());
      if (!policy) return { within_limit: false, payout_amount: 0, error: "policy_not_found" };
      const claimedAmount = Number(args.claimed_amount);
      // --- INTENTIONAL BUG (the deck's headline example) ---
      // Correct rule: claimedAmount <= policy.coverage_limit.
      // The deductible should only ever reduce the payout, never extend
      // the limit. This line does the latter by mistake.
      const withinLimit = claimedAmount <= policy.coverage_limit + policy.deductible;
      const payoutAmount = withinLimit ? Math.max(0, claimedAmount - policy.deductible) : 0;
      return {
        within_limit: withinLimit,
        payout_amount: payoutAmount,
        coverage_limit: policy.coverage_limit,
        deductible: policy.deductible,
      };
    }

    case "issue_payout": {
      // --- INTENTIONAL BUG ---
      // No check for an existing ledger entry under this claim_id — filing
      // the same claim_id twice issues a second payout.
      const entry = await issuePayout({
        claimId: args.claim_id,
        policyId: args.policy_id,
        amount: Number(args.amount),
      });
      return { issued: true, ...entry };
    }

    case "record_decision": {
      const record = {
        claim_id: args.claim_id,
        policy_id: args.policy_id,
        decision: args.decision,
        claimed_amount: Number(args.claimed_amount),
        payout_amount: Number(args.payout_amount || 0),
        denial_reason: args.denial_reason || null,
        filed_at: new Date().toISOString(),
      };
      await saveClaim(record);
      await writeCaseNote(
        record.claim_id,
        [
          `# Case Note — ${record.claim_id}`,
          ``,
          `- Policy: ${record.policy_id}`,
          `- Claimed amount: $${record.claimed_amount}`,
          `- Decision: ${record.decision}`,
          `- Payout: $${record.payout_amount}`,
          record.denial_reason ? `- Denial reason: ${record.denial_reason}` : null,
        ]
          .filter(Boolean)
          .join("\n")
      );
      return { recorded: true };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
