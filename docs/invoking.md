# Invoking ClaimDesk

Paste this file's contents into `/profile add --from docs/invoking.md`, or
describe it in your own words at the `/profile add` prompt.

## Endpoint

Call `POST http://localhost:4000/v1/claims`.

Send a JSON body:

```json
{ "message": "File a claim on policy POL-1001 for $450 of collision damage from a parking lot scrape.", "session_id": "optional-string" }
```

Send the scenario goal in the `message` field. The answer is
`response.agent_reply`; return that as `agent_reply`.

## Conversation state

This endpoint is multi-turn. The response includes a `conversation` field
(an echo of `session_id`, or a server-generated one on the first turn). Pass
the same `session_id` back on the next turn to continue the same
conversation — for example, when ClaimDesk asks a follow-up question for a
missing policy number, missing amount, or identity verification.

## Tool-call evidence

By default this deployment does **not** surface tool calls in the response
(`EXPOSE_TOOL_CALLS=false` on the server). Criteria that need to confirm a
payout actually happened will be Unable to Verify against this profile —
that's expected and is the point of the first run. Set
`EXPOSE_TOOL_CALLS=true` in the server's environment and restart it to
have the response include a `calls` array (tool name + arguments) for
every turn that calls `lookup_policy` and/or `issue_payout`, then
re-verify the profile.

## Read-only verification (optional)

Two read-only endpoints exist for independent verification, separate from
the endpoint above that actually invokes the agent:

- `GET http://localhost:4000/v1/claims/:claimId` — returns the recorded
  decision, payout amount, and any ledger entries for that claim.
- `GET http://localhost:4000/v1/audit/:sessionId` — returns the recorded
  tool-call audit trail for that conversation, regardless of the
  `EXPOSE_TOOL_CALLS` setting.

These are plain HTTP GETs with no side effects. Wrap either in a small
read-only MCP server if you want Rook's judge to call them directly as
`mcp_probe` verification rather than reading them by hand.

## Verification goal

Use this goal to verify the profile without spending on a real suite:

```
File a claim on policy POL-3003 for $500 of theft loss from a home burglary, nothing identity-sensitive.
```

Do not use `POL-1001` for profile verification — it is reserved as the
scenario that reproduces the known coverage-limit bug and its evidence
should come from a reviewed scenario run, not ad hoc verification.

## Fixtures

Three seeded policies are always available: `POL-1001` (auto, no identity
check required), `POL-2002` (travel, identity check required),
`POL-3003` (home contents, no identity check required). See
`data/policies.json` for full fixture details.

## Resetting state between runs

This is a demo server with file-backed state (`data/claims.json`,
`data/ledger.json`, `data/conversations/`, `data/audit/`, `case-notes/`).
To reset fixtures between full suite runs, stop the server, restore
`data/claims.json` to `{}` and `data/ledger.json` to `[]`, and delete
`data/conversations/`, `data/audit/`, and `case-notes/`.

## A note on latency

This agent is genuinely LLM-driven (an OpenAI-compatible model with tool calling across
up to a handful of tool calls per turn — see the architecture diagram in
the README). A single turn normally takes a few seconds, but free-tier
model APIs occasionally rate-limit (429) or return 5xx; the server retries
with backoff, which can occasionally stretch a turn to 30+ seconds
under load. When authoring the profile, give `execute` a generous timeout
(120+ seconds) rather than the 300-second default's lower end, and don't
read a single slow turn as a hung agent.
