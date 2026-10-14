# ClaimDesk Agent

A reference claims-adjudication agent built to be tested by **Agent
Assurance (Rook)**. It's a real, LLM-driven agent — the model reads each
message, decides which tools to call (look up a policy, check exclusions,
evaluate coverage, issue a payout, record the decision), and writes the
reply to the policyholder itself. It's a demo target, not a product: it
has a working chat UI for a live audience to watch, and a small set of
deliberately planted flaws underneath so a first `rook run` produces a
real mix of **Pass**, **Fail**, and **Unable to Verify** — instead of a
trivial 100% or 0%.

The pattern (policy limits, deductibles, exclusions, payouts, duplicate
protection) is intentionally generic across verticals — insurance claims,
airline compensation, bank disputes, auto warranty claims all follow the
same shape. Swap `docs/policy-claims.md` and `data/policies.json` and the
same engine demos a different industry.

## Architecture

```
policyholder message
      │
      ▼
POST /v1/claims  ──────────────────────────────┐
      │                                          │  (Rook's HTTP profile
      ▼                                          │   calls this exact
LLM (OpenAI-style tool calling)                  │   same endpoint)
      │                                          │
      ├── lookup_policy        ──┐               │
      ├── verify_identity        │  real tools,   │
      ├── check_exclusions       │  real effects  │
      ├── evaluate_coverage    ──┤  (server/      │
      ├── issue_payout           │  tools.mjs)    │
      └── record_decision      ──┘               │
      │                                          │
      ▼                                          │
reply to policyholder  ◄─────────────────────────┘
```

The model genuinely decides when it has enough information, when to ask a
follow-up question, and what to tell the policyholder — there's no regex
parser standing in for reasoning. The planted bugs live in the **tools**
(`server/tools.mjs`), not in the model's behavior, so they reproduce
deterministically for a demo regardless of how the model phrases things
around them.

## Run it

```bash
cd claimdesk-demo
npm install
cp .env.example .env
# edit .env and set LLM_API_KEY (free Groq key: https://console.groq.com/keys)
npm start
```

Open `http://localhost:4000` for the chat UI. The UI and Rook hit the
exact same endpoint (`POST /v1/claims`) — there is no separate backend for
the demo audience versus the one under test.

**If your network requires an HTTP(S) proxy** (common in a locked-down
sandbox or corporate network — if `curl` works but requests from Node
hang indefinitely), start the server with:

```bash
NODE_OPTIONS="--use-env-proxy" npm start
```

This makes Node's built-in `fetch` honor `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`,
which it does not do by default. Most laptops don't need this at all.

**Choosing a model provider.** Set `LLM_PROVIDER` to `groq` (default),
`cerebras`, `openrouter`, or `custom` (any OpenAI-compatible URL). All have
free tiers without a credit card. If one is slow or rate-limited on the day
of a demo, switch providers by changing two env vars — no code changes.
Free tiers have no SLA, so test your exact key ~15 minutes before
presenting. The client retries 429/5xx responses with backoff
(`server/llm.mjs`), honoring `Retry-After`.

To change the tool-call-visibility toggle used in the "watch the assurance
gap close" moment of the demo:

```bash
EXPOSE_TOOL_CALLS=true npm start
```

## Point Rook at it

From this directory, in a separate terminal:

```bash
rook
/explore .
/agent
/generate --total 20 --class functional,adversarial
/profile add staging --from docs/invoking.md
/profile test staging --goal "File a claim on policy POL-3003 for $500 of theft loss from a home burglary, nothing identity-sensitive."
/profile use staging
/sync
/run --concurrency 1
/report
```

See `docs/invoking.md` for the full profile-authoring material and
`PRD.md` / `docs/policy-claims.md` for what Rook will treat as the
intended (correct) behavior to discover and generate scenarios against.
Because this agent can take a while per turn under free-tier load,
consider a generous `execute` timeout when authoring the profile.

## What's actually wrong with it

Deliberately — see the comments in `server/tools.mjs` (where all five
tools live) and the `/v1/claims/:claimId` handler in `server/index.mjs`. A
short answer key for presenters, kept **outside** this directory (so it
isn't something Rook's `/explore .` reads directly), lives in the sibling
`claimdesk-demo-presenter-notes/` folder — including a bonus flaw we
found live while testing, not originally planned.

## Layout

```
claimdesk-agent/
├── PRD.md                  # intended behavior — what Rook treats as spec
├── docs/
│   ├── policy-claims.md    # knowledge base: the correct limit/deductible rule
│   └── invoking.md         # profile-authoring material for /profile add
├── server/
│   ├── index.mjs           # Express app + routes
│   ├── claimsAgent.mjs      # the LLM tool-calling loop (orchestration)
│   ├── tools.mjs            # the tools the agent can call (planted bugs live here)
│   ├── llm.mjs              # provider-agnostic OpenAI-compatible client w/ retry
│   ├── ledger.mjs           # payout ledger
│   └── store.mjs            # file-backed mock DB (policies, claims, conversations, audit)
├── public/                 # chat UI (index.html, app.js, styles.css)
├── data/                   # seed policies + mutable state (claims, ledger, conversations, audit)
└── case-notes/             # written per-claim as evidence artifacts (created at runtime)
```
