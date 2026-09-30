NEW — PRD
Version: 1.0
Status: Canonical MVP Specification
Target: Tameion Agents Hackathon — Canteen × Circle × Arc
Primary fit: Autonomous Business Operator
Deployment model: Fully serverless / no VPS


======================================================================
0. EXECUTIVE SUMMARY
======================================================================

NEW is an autonomous SaaS renewal agent.

It answers one business question:

    Does this subscription deserve another dollar?

Before a SaaS subscription renews, three independent AI roles inspect it
from different business perspectives:

- Operations — does the business still need it?
- Finance — is the cost justified?
- Auditor — is there waste, unused capacity, or suspicious billing?

A fourth Controller Agent receives their evidence and makes the final
business decision:

- KEEP
- DOWNGRADE
- CANCEL
- NEEDS_REVIEW

For approved renewals or downgrades, a Circle Agent Wallet funds an
onchain NEW contract on Arc in USDC.

The vendor receives the USDC only after the agreed renewal terms are
verified.

The core product loop is:

    SUBSCRIPTION DUE
          ↓
    OPERATIONS ─┐
    FINANCE ────┼── parallel review
    AUDITOR ────┘
          ↓
    CONTROLLER AGENT
          ↓
    KEEP / DOWNGRADE / CANCEL
          ↓
    CIRCLE AGENT WALLET
          ↓
    NEW.sol
          ↓
    VENDOR FULFILLS TERMS
          ↓
    VERIFY
          ↓
    USDC RELEASED ON ARC

Short pitch:

    Stop paying for software nobody uses.

Product line:

    AI agents review every SaaS renewal.
    Approved renewals settle in USDC only after delivery is verified.


======================================================================
0.1 THE PROBLEM NEW SOLVES
======================================================================

NEW solves one concrete business problem:

    Companies keep paying recurring SaaS bills even when the software is
    underused, oversized, duplicated, or no longer worth its current plan.

The failure happens because the information needed to make a good renewal
decision is fragmented:

    Operations knows whether the tool is actually needed.
    Finance knows whether the spend is justified.
    Audit/billing data shows whether money is being wasted.

In a normal small company, nobody combines those signals before the
automatic renewal executes.

Typical example:

    Figma Professional
    8 seats
    96 USDC / month

    Real usage:
    3 active seats

Without NEW:

    auto-renew
    → pay 96 USDC again
    → 5 unused seats remain
    → waste continues every month

With NEW:

    Operations checks business dependency
    Finance checks cost/value
    Auditor checks unused seats and billing waste
    Controller makes one final action

    KEEP / DOWNGRADE / CANCEL / NEEDS_REVIEW

If DOWNGRADE is selected:

    8 seats → 3 seats
    new cost = 36 USDC
    monthly saving = 60 USDC

Then NEW does not immediately trust the vendor.

The approved amount is locked onchain and only released after the agreed
subscription state is verified.

Therefore NEW solves TWO linked failures:

1. BAD RENEWAL DECISIONS

   Recurring software renews without a complete business review.

2. PAYMENT BEFORE VERIFIED DELIVERY

   An approval or invoice does not prove that the vendor actually applied
   the agreed plan, seat count, or renewal state.

NEW combines agent reasoning with conditional settlement:

    AI DECIDES WHAT SHOULD HAPPEN

    CIRCLE CONTROLS WHETHER THE WALLET MAY SPEND

    NEW.sol CONTROLS WHETHER THE VENDOR HAS EARNED THE MONEY

    ARC PROVES THE FINAL SETTLEMENT

The MVP intentionally does not solve generic procurement, treasury,
accounts payable, payroll, or every kind of recurring expense.

It solves SaaS renewal waste only.


======================================================================
1. PROBLEM
======================================================================

Small businesses accumulate recurring SaaS expenses.

Common failure modes:

- unused seats continue renewing;
- duplicate tools solve the same problem;
- usage has fallen but the plan never changes;
- annual or monthly renewal happens before anyone reviews it;
- finance knows the cost but not operational dependency;
- operations knows the dependency but not financial impact;
- nobody performs a complete review before payment.

The result is recurring spend that persists because cancellation and
downgrade decisions require coordination.

The current alternatives are weak.

Manual review does not scale and is often performed too late.

Auto-renewal requires no economic judgment.

A single generic AI agent creates one reasoning path and one failure
domain.

NEW separates the decision into independent business roles,
then lets a Controller Agent make the final decision from their evidence.

The product does not claim that multiple agents automatically make a
decision correct.

The value is:

    separation of responsibility, context, authority, and audit evidence.


======================================================================
2. PRODUCT THESIS
======================================================================

Different business functions should inspect the same expense differently.

Operations should not primarily optimize cash.

Finance should not decide whether a tool is technically critical.

Auditor should not optimize convenience.

Each role receives only the context relevant to its responsibility.

The Controller receives all reports and makes the final economic judgment.

Therefore:

    ONE UNDERLYING MODEL
            +
    DIFFERENT ROLES
            +
    DIFFERENT PRIVATE CONTEXT
            +
    DIFFERENT RESPONSIBILITIES
            +
    PERSISTED MEMORY
            =
    MULTI-AGENT BUSINESS DECISION

This combines two useful agent patterns:

- Mesa-style functional roles and responsibility boundaries;
- MiroFish-style identity, private state, and evolving memory.

It deliberately avoids large multi-agent simulation.


======================================================================
3. PRODUCT INVARIANT
======================================================================

    AGENTS REASON
    CONTROLLER DECIDES
    WALLET AUTHORIZES
    NEW.sol ENFORCES DELIVERY
    ARC SETTLES

These responsibilities must not be blurred.

The AI owns business judgment.

Circle Agent Wallet owns generic wallet authority and transaction
execution.

NEW.sol owns application-specific conditional settlement.

Arc owns final settlement evidence.


======================================================================
4. RELATIONSHIP TO METRON
======================================================================

NEW is a separate product.

METRON is a financial runtime where an external autonomous agent owns
reasoning and business decisions while METRON provides financial context,
controls, execution, settlement, and audit.

NEW instead owns one vertical business problem:

    SaaS renewal decisions.

Do not import into NEW:

- METRON MCP runtime;
- TaskVault;
- provider switching engine;
- vendor obligation system;
- generic business-capital runtime;
- general-purpose financial tools;
- generic agent wallet abstraction exposed to external agents.

NEW should remain a small standalone product.


======================================================================
5. TARGET USER
======================================================================

Primary MVP user:

Small startup, agency, freelancer business, or online company with
recurring software subscriptions.

Ideal initial profile:

    5–50 software subscriptions
    1–20 team members
    monthly SaaS spend
    no dedicated procurement department

Hackathon traction can come from a real small company or the builder's
own operating software expenses.

Synthetic subscriptions may be included for demo clarity but must not
be represented as real traction.


======================================================================
6. THE 3-SECOND PRODUCT EXPERIENCE
======================================================================

The homepage must communicate the product without requiring architecture
knowledge.

Primary demo card:

    FIGMA PROFESSIONAL

    Current plan
    8 seats · 96 USDC/month

    Usage
    3 / 8 seats active


    OPERATIONS
    KEEP
    Used by design workflow

    FINANCE
    DOWNGRADE
    62% capacity unused

    AUDITOR
    DOWNGRADE
    5 unused paid seats


    FINAL DECISION
    DOWNGRADE 8 → 3

    NEW COST
    36 USDC

    SAVINGS
    60 USDC / MONTH

    ✓ 36 USDC IN ESCROW ON ARC

The visitor should understand:

1. subscription costs money;
2. several AI business roles reviewed it;
3. AI decided to reduce the plan;
4. money moved onchain;
5. vendor only gets paid after fulfillment.

No blockchain terminology is required before this screen.


======================================================================
7. AGENT MODEL
======================================================================

MVP uses four logical agents.

They MAY all use the same underlying LLM.

Multiple providers are not required.


----------------------------------------------------------------------
7.1 Operations Agent
----------------------------------------------------------------------

Goal:

Determine whether the subscription is operationally necessary.

Receives:

    subscription
    active users
    recent usage
    workflow dependency
    service incidents
    previous operations decisions

Does not receive:

    full company cash balance unless necessary.

Output:

{
  "verdict": "KEEP",
  "reason_codes": ["ACTIVE_DEPENDENCY"],
  "summary": "Used by the design workflow every working day.",
  "evidence_refs": ["usage_001", "dependency_004"]
}


----------------------------------------------------------------------
7.2 Finance Agent
----------------------------------------------------------------------

Goal:

Determine whether the expense is economically justified.

Receives:

    renewal price
    current plan
    alternative plan price
    seat utilization
    monthly software spend
    budget context
    previous renewal cost

Output example:

{
  "verdict": "DOWNGRADE",
  "reason_codes": ["LOW_UTILIZATION", "AVOIDABLE_COST"],
  "summary": "Only three of eight paid seats are active.",
  "evidence_refs": ["invoice_021", "usage_001"]
}


----------------------------------------------------------------------
7.3 Auditor Agent
----------------------------------------------------------------------

Goal:

Identify waste, billing anomalies, duplication, or unsupported charges.

Receives:

    invoice
    historical invoice
    seat count
    utilization
    known software catalog
    prior anomalies

Output example:

{
  "verdict": "DOWNGRADE",
  "reason_codes": ["UNUSED_SEATS"],
  "summary": "Five purchased seats show no verified recent usage.",
  "evidence_refs": ["invoice_021", "seat_audit_006"]
}


----------------------------------------------------------------------
7.4 Controller Agent
----------------------------------------------------------------------

Goal:

Make the final business decision.

Receives:

    subscription snapshot
    Operations report
    Finance report
    Auditor report
    previous renewal outcome
    allowed business actions

Output schema:

{
  "action": "DOWNGRADE",
  "target_plan": "professional-3-seat",
  "target_seats": 3,
  "amount_usdc": "36.00",
  "rationale": "...",
  "supporting_evidence_refs": [
    "usage_001",
    "invoice_021",
    "seat_audit_006"
  ]
}

Allowed actions:

    KEEP
    DOWNGRADE
    CANCEL
    NEEDS_REVIEW

The Controller must not directly access wallet credentials.


======================================================================
8. AGENT FRAMEWORK
======================================================================

Use:

    Mastra

Mastra is responsible for:

- defining agents;
- role instructions;
- tool definitions;
- structured output;
- model-provider abstraction;
- tracing during development.

Do NOT use Mastra Workflow as the primary durable state machine.

Cloudflare Workflows owns application orchestration.

This avoids having two workflow engines.

Architecture:

    Mastra
    =
    agent intelligence


    Cloudflare Workflows
    =
    durable business process


======================================================================
9. AGENT PROMPT STRUCTURE
======================================================================

Store roles separately:

    src/agents/
      operations.ts
      finance.ts
      auditor.ts
      controller.ts

    src/prompts/
      operations.md
      finance.md
      auditor.md
      controller.md

Each prompt defines:

    ROLE
    OBJECTIVE
    VISIBLE DATA
    FORBIDDEN ASSUMPTIONS
    OUTPUT SCHEMA

Do not create:

- CEO agent;
- planning agent;
- HR agent;
- QA agent;
- debate moderator;
- generic company agent.

Four agents is the maximum MVP scope.


======================================================================
10. AGENT MEMORY
======================================================================

Do not add vector databases or GraphRAG.

MVP memory is relational.

Each subscription keeps:

    last decisions
    previous price
    previous seat count
    previous utilization
    previous final action
    previous outcome

The next assessment receives a bounded history.

Example:

    Previous renewal

    Seats:
    8

    Active:
    6

    Decision:
    KEEP


    Current renewal

    Seats:
    8

    Active:
    3

This creates evolving behavior without a simulation engine.

Cloudflare D1 is the canonical application database.


======================================================================
11. SERVERLESS ARCHITECTURE
======================================================================

Canonical MVP architecture:

                    ┌───────────────────┐
                    │      VERCEL       │
                    │                   │
                    │ Next.js frontend  │
                    └─────────┬─────────┘
                              │ HTTPS
                              ▼
                    ┌───────────────────┐
                    │ CLOUDFLARE WORKER │
                    │                   │
                    │ Hono API          │
                    │ auth              │
                    │ validation        │
                    │ workflow trigger  │
                    └──────┬─────┬──────┘
                           │     │
                      D1   │     │ Workflow
                           │     ▼
                           │  ┌────────────────────┐
                           │  │ CF WORKFLOWS       │
                           │  │                    │
                           │  │ evidence snapshot  │
                           │  │ 3 agents parallel  │
                           │  │ controller         │
                           │  │ payment            │
                           │  │ wait fulfillment   │
                           │  │ settle/refund      │
                           │  └─────────┬──────────┘
                           │            │
                           │            ▼
                           │      Mastra Agents
                           │            │
                           │            ▼
                           │          LLM API
                           │
                           └──────────────┐
                                          ▼
                                  Wallet Adapter
                                          │
                                          ▼
                                Circle Agent Wallet
                                          │
                                          ▼
                                NEW.sol
                                          │
                                          ▼
                                        Arc

No VPS is required.


======================================================================
12. VERCEL RESPONSIBILITY
======================================================================

Vercel hosts only the customer-facing Next.js application.

Vercel owns:

- homepage;
- subscription dashboard;
- renewal detail;
- agent decision visualization;
- onchain receipt visualization;
- demo interactions.

Vercel does NOT own:

- agent orchestration;
- wallet credentials;
- Circle execution;
- durable jobs;
- settlement monitoring.

Do not spread backend state between Vercel and Cloudflare.

Browser data flow:

    Browser
    ↓
    Vercel Next.js
    ↓
    Cloudflare API


======================================================================
13. CLOUDFLARE WORKER RESPONSIBILITY
======================================================================

The main Worker owns:

- API;
- request validation;
- D1 access;
- workflow creation;
- workflow event delivery;
- chain readback;
- public status endpoints;
- internal wallet-executor invocation.

Recommended runtime:

    TypeScript
    Hono
    Zod
    viem
    Mastra


======================================================================
14. CLOUDFLARE WORKFLOWS
======================================================================

Use Cloudflare Workflows for every renewal assessment.

This is preferred over keeping a Worker alive.

Canonical workflow:

    START
     ↓
    snapshot subscription evidence
     ↓
    run Operations ─┐
    run Finance ────┼── parallel
    run Auditor ────┘
     ↓
    Controller
     ↓
    persist final decision
     ↓

    CANCEL?
     ├─ yes → complete without payment
     │
     └─ no
          ↓
     build renewal terms
          ↓
     wallet execution
          ↓
     open NEW
          ↓
     waitForEvent("vendor_fulfilled")
          ↓
     verify vendor state
          ↓
     contract release
          ↓
     chain readback
          ↓
     COMPLETE

Cloudflare Workflows should own durable retry/wait/resume semantics.

This is ideal for:

    agent decides
    ↓
    money locked
    ↓
    workflow sleeps
    ↓
    vendor changes subscription
    ↓
    webhook arrives
    ↓
    workflow resumes


======================================================================
15. DATABASE
======================================================================

Use Cloudflare D1.

Do not use PostgreSQL for MVP.

Do not use Supabase solely for storage.

Do not introduce Redis.

Required tables:

    subscriptions
    renewals
    evidence
    agent_reports
    decisions
    escrows
    settlements
    activity_log


----------------------------------------------------------------------
subscriptions
----------------------------------------------------------------------

    id
    name
    vendor
    current_plan
    current_seats
    renewal_price_atomic
    renewal_date
    vendor_wallet
    status
    created_at
    updated_at


----------------------------------------------------------------------
renewals
----------------------------------------------------------------------

    id
    subscription_id
    workflow_id
    snapshot_hash
    status
    target_plan
    target_seats
    amount_atomic
    decision_hash
    terms_hash
    created_at
    completed_at


----------------------------------------------------------------------
agent_reports
----------------------------------------------------------------------

    id
    renewal_id
    role
    verdict
    reason_codes_json
    summary
    evidence_refs_json
    model
    created_at


----------------------------------------------------------------------
decisions
----------------------------------------------------------------------

    id
    renewal_id
    action
    rationale
    target_plan
    target_seats
    amount_atomic
    created_at


----------------------------------------------------------------------
escrows
----------------------------------------------------------------------

    renewal_id
    contract_address
    chain_id
    open_tx_hash
    amount_atomic
    status
    expires_at


----------------------------------------------------------------------
settlements
----------------------------------------------------------------------

    renewal_id
    evidence_hash
    settle_tx_hash
    refund_tx_hash
    settled_at
    refunded_at

Money values are integer atomic USDC.

Never use JS floating point for financial amounts.


======================================================================
16. CIRCLE AGENT WALLET
======================================================================

Use one business Circle Agent Wallet.

Do NOT create a wallet for every AI role.

Architecture:

    Operations ─┐
    Finance ────┼── AI only
    Auditor ────┘
         ↓
    Controller
         ↓
    Wallet Adapter
         ↓
    ONE Circle Agent Wallet

Circle Agent Wallet is responsible for generic wallet controls:

- holding USDC;
- signing;
- contract calls;
- supported-chain restrictions;
- global spending limits;
- per-service caps;
- contract/chain allowlists;
- bounded sessions.

Wallet creation and policy modification remain human-controlled setup
operations.

Agents never receive wallet secrets.


======================================================================
17. WALLET ADAPTER
======================================================================

Business logic must not directly invoke Circle commands.

Define:

interface WalletAdapter {
  getAddress(): Promise<string>;
  getUsdcBalance(): Promise<bigint>;

  executeContractCall(input: {
    contract: `0x${string}`;
    calldata: `0x${string}`;
    idempotencyKey: string;
  }): Promise<{
    txHash: `0x${string}`;
  }>;
}

Implementation:

    CircleAgentWalletAdapter

This isolates Circle-specific execution from the agent workflow.


======================================================================
18. CIRCLE SERVERLESS EXECUTION
======================================================================

Preferred path:

Use Circle's supported programmatic Agent Platform interface/API from the
Worker when available to the hackathon environment.

Do NOT reverse-engineer undocumented Circle CLI internals.

If Agent Wallet contract execution requires a full CLI runtime, use the
fallback defined below.


======================================================================
19. OPTIONAL CLOUDFLARE CONTAINER — CIRCLE EXECUTOR
======================================================================

A Cloudflare Container may host a tiny Node service containing Circle CLI.

It is NOT an agent server.

It only executes validated wallet operations.

    Cloudflare Workflow
          ↓
    WalletAdapter
          ↓
    internal Worker binding
          ↓
    Circle Executor Container
          ↓
    Circle CLI
          ↓
    Agent Wallet

Container API surface:

    POST /internal/wallet/balance

    POST /internal/wallet/execute-contract

No public internet route should expose these methods directly.

Important deployment constraint:

Cloudflare Container filesystem is ephemeral after the container sleeps.

Therefore Circle authentication/session persistence MUST be verified
before this path becomes production-enabled.

Do not store Circle credentials in:

- image layers;
- source code;
- D1 plaintext;
- frontend variables.

If secure non-interactive Agent Wallet authentication cannot be persisted
through a documented mechanism, mark:

    WALLET_EXECUTOR_BLOCKED

and use an official Circle programmatic interface instead.

This is a release gate.


======================================================================
20. ARC
======================================================================

MVP chain:

    Arc Mainnet (chain ID 5042)

Asset:

    USDC

Contract and token addresses must be environment configuration.

Do not hardcode addresses copied from documentation.

Before deployment:

    verify chain id
    verify canonical USDC address
    verify contract address
    verify Wallet policy

Smart contract deployment and real-money end-to-end execution are deferred
until the final live-integration phases. Before then, use local D1, mocked
WalletAdapter behavior, Foundry unit tests, and Anvil or another local EVM.
Do not use Arc Testnet as an intermediate deployment environment.

Keep Circle behind WalletAdapter and verify official Arc Mainnet support at
the live-integration phase. Real wallet mutations must fail closed while
MAINNET_EXECUTION_ENABLED is false; this flag defaults to false. Execution
also requires the Mainnet chain ID and RPC URL to be configured.


======================================================================
21. SMART CONTRACT
======================================================================

Deploy exactly one application contract:

    NEW.sol

Purpose:

    AI approval does not equal vendor delivery.

Circle Agent Wallet decides whether the wallet is allowed to initiate
the transaction.

NEW determines whether the vendor has earned the locked payment.

Responsibility boundary:

    CIRCLE AGENT WALLET

    WHO can spend
    HOW MUCH can move
    WHICH chain
    WHICH contracts


    NEW.sol

    WHICH renewal
    WHAT terms were agreed
    WHETHER fulfillment happened
    RELEASE or REFUND


======================================================================
22. RENEWAL ESCROW DATA MODEL
======================================================================

enum Status {
    NONE,
    OPEN,
    SETTLED,
    REFUNDED
}

struct Renewal {
    address payer;
    address vendor;
    uint256 amount;
    bytes32 subscriptionId;
    bytes32 decisionHash;
    bytes32 termsHash;
    uint64 expiresAt;
    Status status;
}

Required mappings:

    mapping(bytes32 => Renewal) public renewals;

Contract configuration:

    immutable USDC
    owner
    verifier


======================================================================
23. CONTRACT FUNCTIONS
======================================================================

----------------------------------------------------------------------
openRenewal
----------------------------------------------------------------------

openRenewal(
    bytes32 renewalId,
    bytes32 subscriptionId,
    address vendor,
    uint256 amount,
    bytes32 decisionHash,
    bytes32 termsHash,
    uint64 expiresAt
)

Behavior:

    renewalId unused
    vendor != zero
    amount > 0
    expiry > now

    transferFrom payer → contract
    persist renewal
    emit Opened

A bounded USDC allowance may be configured during owner-controlled wallet
setup.


----------------------------------------------------------------------
confirmFulfillment
----------------------------------------------------------------------

confirmFulfillment(
    bytes32 renewalId,
    bytes32 evidenceHash
)

Callable only by:

    verifier

Behavior:

    renewal OPEN
    not expired
    mark SETTLED
    release USDC → vendor
    emit Settled


----------------------------------------------------------------------
refundExpired
----------------------------------------------------------------------

refundExpired(
    bytes32 renewalId
)

Behavior:

    renewal OPEN
    now >= expiresAt
    mark REFUNDED
    return USDC → payer
    emit Refunded

Anyone may trigger an expired refund.

Funds always return to recorded payer.


======================================================================
24. CONTRACT EVENTS
======================================================================

event Opened(
    bytes32 indexed renewalId,
    bytes32 indexed subscriptionId,
    address indexed vendor,
    uint256 amount,
    bytes32 decisionHash,
    bytes32 termsHash,
    uint64 expiresAt
);

event Settled(
    bytes32 indexed renewalId,
    bytes32 indexed evidenceHash,
    uint256 amount
);

event Refunded(
    bytes32 indexed renewalId,
    uint256 amount
);

These events are the primary onchain demo evidence.


======================================================================
25. TERMS HASH
======================================================================

The contract must not store long SaaS metadata.

Backend constructs canonical renewal terms:

{
  "subscription": "Figma Professional",
  "current_seats": 8,
  "target_seats": 3,
  "target_plan": "professional",
  "period_start": "2026-10-01",
  "period_end": "2026-11-01",
  "amount_atomic": "36000000",
  "vendor": "0x..."
}

Canonicalize.

Then:

    termsHash = keccak256(canonicalTerms)

Persist exact terms in D1.

Store only hash onchain.


======================================================================
26. DECISION HASH
======================================================================

Build:

    decisionHash =
    keccak256(
      renewal id
      +
      snapshot hash
      +
      operations report hash
      +
      finance report hash
      +
      auditor report hash
      +
      controller output
    )

The decision hash proves which AI decision led to the escrow.

It does not prove that the reasoning was objectively correct.


======================================================================
27. VERIFIER
======================================================================

The verifier is a deterministic backend component.

It is not an LLM agent.

Responsibilities:

    read vendor state
    compare against agreed terms
    build evidence
    hash evidence
    submit confirmFulfillment

Example:

Agreed:

    3 seats
    36 USDC

Vendor API says:

    plan = professional
    activeSeats = 3
    status = active

Verifier:

    FULFILLED

Then contract releases payment.

If:

    activeSeats = 8

verifier does nothing.

No payment is released.


======================================================================
28. MVP VENDOR INTEGRATION
======================================================================

Do not integrate five real SaaS providers.

Implement exactly one provider adapter interface:

interface SubscriptionProvider {
  getState(subscriptionId: string): Promise<{
    plan: string;
    seats: number;
    active: boolean;
  }>;
}

MVP implementation:

    DemoSaaSProvider

It must expose realistic state transitions:

    8 seats
    ↓
    3 seats

Optional hackathon improvement:

Replace DemoSaaSProvider with one real provider API if credentials and API
access are straightforward.

Do not delay the core MVP for vendor integrations.


======================================================================
29. WORKFLOW STATE MACHINE
======================================================================

    CREATED

    → ANALYZING

    → CONTROLLER_DECISION


    if CANCEL:
        CANCELLED
        no payment


    if NEEDS_REVIEW:
        WAITING_FOR_HUMAN


    if KEEP / DOWNGRADE:
        PREPARING_ESCROW

    → ESCROW_OPEN

    → WAITING_FOR_VENDOR


    vendor fulfilled:
    → VERIFYING
    → SETTLING
    → SETTLED


    deadline expired:
    → REFUNDING
    → REFUNDED

Workflow states must be visible in the UI.


======================================================================
30. API
======================================================================

Public/read API:

    GET /api/subscriptions
    GET /api/subscriptions/:id
    GET /api/renewals/:id
    GET /api/renewals/:id/agents
    GET /api/renewals/:id/onchain

Mutation API:

    POST /api/subscriptions
    POST /api/subscriptions/:id/assess
    POST /api/renewals/:id/demo-fulfill
    POST /api/renewals/:id/verify

Internal:

    POST /internal/wallet/execute
    POST /internal/workflows/:id/vendor-event

Strict Zod schemas required.


======================================================================
31. FRONTEND
======================================================================

Pages:

    /
    Dashboard

    /subscriptions/:id
    Subscription Detail

    /renewals/:id
    Renewal Decision

Do not add:

- chat interface;
- prompt playground;
- agent builder;
- workflow designer;
- wallet dashboard clone.

Primary renewal page hierarchy:

    SUBSCRIPTION

    CURRENT COST

    USAGE

    3 AGENT REPORTS

    FINAL DECISION

    SAVINGS

    ESCROW

    FULFILLMENT

    ARC TRANSACTION


======================================================================
32. DEMO SCRIPT
======================================================================

Target demo:

    under 3 minutes.


----------------------------------------------------------------------
Scene 1 — problem
----------------------------------------------------------------------

    Figma

    8 seats
    96 USDC/month

    Only 3 seats active.

Say:

    "NEW reviews a subscription before the company pays for
    another month."


----------------------------------------------------------------------
Scene 2 — agents
----------------------------------------------------------------------

Click:

    Review Renewal

Show parallel results:

    Operations
    KEEP

    Finance
    DOWNGRADE

    Auditor
    DOWNGRADE

Controller:

    DOWNGRADE 8 → 3

Savings:

    60 USDC/month


----------------------------------------------------------------------
Scene 3 — money
----------------------------------------------------------------------

Show:

    Circle Agent Wallet

    amount: 36 USDC
    chain: Arc
    contract: NEW

Then:

    36 USDC LOCKED

Show Arc transaction link.


----------------------------------------------------------------------
Scene 4 — fulfillment
----------------------------------------------------------------------

Vendor currently:

    8 seats

Click demo vendor fulfillment:

    8 → 3

Verifier confirms.

Contract:

    36 USDC
    → vendor

Show second Arc transaction.


----------------------------------------------------------------------
Scene 5 — thesis
----------------------------------------------------------------------

Final screen:

    AI DECIDED
    DOWNGRADE


    BUSINESS SAVING
    60 USDC / MONTH


    ESCROW
    36 USDC


    FULFILLMENT
    VERIFIED


    SETTLEMENT
    ✓ ARC

Closing line:

    The AI can approve the renewal.
    The vendor still has to deliver before it gets paid.


======================================================================
33. FAILURE DEMO
======================================================================

Optional second scenario:

    Agent decision:
    DOWNGRADE → 3 seats

    42 USDC escrowed

Vendor never changes plan.

Deadline expires.

    TERMS NOT FULFILLED

    42 USDC
    → REFUNDED

This is the strongest proof that the contract has a real responsibility.


======================================================================
34. SECURITY
======================================================================

Required:

- agents never receive Circle credentials;
- agents never receive wallet session material;
- agents cannot create arbitrary calldata;
- Controller outputs structured business decisions only;
- backend constructs contract calldata;
- wallet adapter only accepts known contract/function calls;
- exact Arc chain binding;
- exact USDC binding;
- exact vendor address binding;
- immutable renewal terms after escrow open;
- idempotency key on every money mutation;
- no retry of an unknown transaction without chain readback;
- Circle policy changes require human-controlled setup;
- verifier role separate from AI reasoning.


======================================================================
35. IDEMPOTENCY
======================================================================

Every assessment gets:

    renewal_id

Every wallet operation gets:

    idempotency_key

Before transaction submission:

    persist PREPARED

After submission:

    persist txHash

Never blindly resubmit if response is ambiguous.

Read Arc first.


======================================================================
36. SERVERLESS DEPLOYMENT
======================================================================

Frontend:

    Vercel
    Next.js

Environment:

    NEXT_PUBLIC_API_URL

No wallet secret.

No LLM key.


Cloudflare:

Deploy:

    API Worker
    Workflow
    D1
    optional Wallet Container

Use Wrangler.


======================================================================
37. SMART CONTRACT DEPLOYMENT
======================================================================

Contract deployment is not part of runtime.

Deploy NEW.sol once using:

    Foundry
    +
    Arc RPC

Deployment may run:

- locally;
- or through an explicit GitHub Actions deployment job.

Runtime never deploys contracts dynamically.

Persist:

    NEW_CONTRACT_ADDRESS
    ARC_CHAIN_ID
    USDC_ADDRESS

only after onchain readback verification.


======================================================================
38. ENVIRONMENT VARIABLES
======================================================================

Cloudflare Worker:

    LLM_API_KEY
    LLM_MODEL

    ARC_RPC_URL
    ARC_CHAIN_ID
    USDC_ADDRESS
    NEW_CONTRACT_ADDRESS

    CIRCLE_WALLET_ADDRESS

    WALLET_EXECUTOR_MODE
    WALLET_EXECUTOR_INTERNAL_TOKEN

    APP_BASE_URL

If supported Circle API path:

    CIRCLE_API_*

only according to official Agent Platform documentation.

Never invent or derive undocumented credentials.


======================================================================
39. REPOSITORY STRUCTURE
======================================================================

    new/

    apps/
      web/
        Next.js

      worker/
        src/
          api/
          agents/
          prompts/
          workflows/
          db/
          providers/
          verifier/
          wallet/
          chain/

    contracts/
      src/
        NEW.sol

      test/
        NEW.t.sol

      script/
        Deploy.s.sol

    packages/
      shared/
        schemas/
        types/

    docs/
      PRD.md
      ARCHITECTURE.md
      DEMO.md
      DEPLOYMENT.md

Optional only if required:

    wallet-executor/
      Dockerfile
      src/

Do not add microservices beyond this.


======================================================================
39.1 END-TO-END IMPLEMENTATION PLAN
======================================================================

This section is the implementation source of truth.

The coding agent should build the system in the exact dependency order
below. Do not build disconnected mocks that cannot reach the final Arc
settlement flow.


----------------------------------------------------------------------
PHASE 1 — MONOREPO + SHARED TYPES
----------------------------------------------------------------------

Create:

    new/

    apps/
      web/
      worker/

    contracts/

    packages/
      shared/

Shared package defines:

    Subscription
    Renewal
    Evidence
    AgentReport
    ControllerDecision
    EscrowState
    SettlementState

Shared Zod schemas must be consumed by both frontend and Worker.

Required controller action enum:

    KEEP
    DOWNGRADE
    CANCEL
    NEEDS_REVIEW


----------------------------------------------------------------------
PHASE 2 — CLOUDFLARE D1
----------------------------------------------------------------------

Create D1 database and migrations for:

    subscriptions
    renewals
    evidence
    agent_reports
    decisions
    escrows
    settlements
    activity_log

Seed one canonical demo subscription:

    name:
    Figma Professional

    current_plan:
    professional-8-seat

    current_seats:
    8

    active_seats:
    3

    renewal_price_atomic:
    96000000

    downgrade_plan:
    professional-3-seat

    downgrade_price_atomic:
    36000000

    vendor_wallet:
    configured Arc Mainnet vendor address; keep NULL until deliberately configured

The demo must start from persisted D1 state.

Do not hardcode the complete demo only in frontend state.


----------------------------------------------------------------------
PHASE 3 — DEMO SAAS PROVIDER
----------------------------------------------------------------------

Implement:

    DemoSaaSProvider

Methods:

    getSubscriptionState()
    applyPlanChange()
    resetDemoState()

Initial state:

    plan = professional-8-seat
    seats = 8
    active = true

Fulfilled state:

    plan = professional-3-seat
    seats = 3
    active = true

Persist provider state in D1.

POST:

    /api/renewals/:id/demo-fulfill

must simulate the vendor fulfilling the downgrade.

This endpoint exists only for the hackathon demo.


----------------------------------------------------------------------
PHASE 4 — EVIDENCE SNAPSHOT
----------------------------------------------------------------------

Before any agent call, build an immutable RenewalSnapshot.

Include:

    subscription id
    plan
    seat count
    active seats
    price
    alternative plan
    alternative price
    historical renewal state
    relevant usage evidence
    billing evidence

Canonicalize the JSON.

Hash it.

Persist:

    snapshot_json
    snapshot_hash

All agents in that renewal must reason from the same snapshot version.


----------------------------------------------------------------------
PHASE 5 — THREE PARALLEL SPECIALIST AGENTS
----------------------------------------------------------------------

Implement with Mastra:

    Operations Agent
    Finance Agent
    Auditor Agent

They may all use the same configured LLM.

The distinction MUST come from:

    different system instructions
    different allowed context
    different objective
    different output constraints

All outputs must validate through Zod.

Run all three from the same workflow stage in parallel where the runtime
supports it.

Persist all reports before invoking Controller.

No agent may call Circle, Arc, or NEW.sol directly.


----------------------------------------------------------------------
PHASE 6 — CONTROLLER AGENT
----------------------------------------------------------------------

Controller receives:

    immutable renewal snapshot
    Operations report
    Finance report
    Auditor report
    allowed actions

Controller emits exactly one structured decision:

{
  "action": "DOWNGRADE",
  "target_plan": "professional-3-seat",
  "target_seats": 3,
  "amount_usdc": "36.00",
  "rationale": "...",
  "supporting_evidence_refs": [...]
}

Validate:

    target plan exists
    target seats match known plan
    amount matches known provider price
    action belongs to allowed enum

The model does NOT invent the vendor address.

The model does NOT invent arbitrary payment amounts.

The backend binds the final decision to verified application data.


----------------------------------------------------------------------
PHASE 7 — DECISION HASH + TERMS HASH
----------------------------------------------------------------------

Canonicalize:

    snapshot
    three specialist reports
    controller decision

Produce:

    decisionHash

Build canonical payment/fulfillment terms:

{
  "subscription": "...",
  "current_plan": "...",
  "target_plan": "...",
  "current_seats": 8,
  "target_seats": 3,
  "period_start": "...",
  "period_end": "...",
  "amount_atomic": "36000000",
  "vendor": "0x..."
}

Produce:

    termsHash

Persist both before any wallet mutation.


----------------------------------------------------------------------
PHASE 8 — NEW.sol
----------------------------------------------------------------------

Deploy exactly one contract:

    contracts/src/NEW.sol

The contract handles application-specific conditional settlement only.

It must NOT duplicate generic Circle wallet policies.

Required state:

    payer
    vendor
    amount
    subscriptionId
    decisionHash
    termsHash
    expiresAt
    status

Required functions:

    open(...)
    settle(...)
    refundExpired(...)

Use short names in Solidity where clarity is preserved.

Suggested public API:

    open(
      bytes32 renewalId,
      bytes32 subscriptionId,
      address vendor,
      uint256 amount,
      bytes32 decisionHash,
      bytes32 termsHash,
      uint64 expiresAt
    )

    settle(
      bytes32 renewalId,
      bytes32 evidenceHash
    )

    refundExpired(
      bytes32 renewalId
    )

Required events:

    Opened
    Settled
    Refunded

Required invariants:

    renewal id cannot be reused
    only verifier can settle
    settlement only while OPEN
    refund only after expiry
    settled cannot refund
    refunded cannot settle
    exact amount is transferred
    exact payer is refunded

Use OpenZeppelin SafeERC20.

Use checks-effects-interactions.

Test all irreversible state transitions with Foundry.


----------------------------------------------------------------------
PHASE 9 — ARC DEPLOYMENT
----------------------------------------------------------------------

Configure:

    ARC_RPC_URL
    ARC_CHAIN_ID
    USDC_ADDRESS

Deploy NEW.sol.

Verify through chain readback:

    bytecode exists
    immutable USDC is correct
    verifier is correct
    owner is correct

Persist:

    NEW_CONTRACT_ADDRESS

Do not continue wallet E2E until contract readback passes.


----------------------------------------------------------------------
PHASE 10 — CIRCLE AGENT WALLET
----------------------------------------------------------------------

Create exactly one business wallet.

Human setup configures the wallet.

Use Circle for generic wallet authority:

    wallet custody
    signing
    session authority
    generic spend limits where available
    allowed chain
    allowed NEW.sol contract

Do not create one wallet per AI agent.

Agents never receive Circle credentials.

Implement:

    CircleAgentWalletAdapter

Required capabilities:

    getAddress()
    getUsdcBalance()
    approveUsdcIfNeeded()
    executeContractCall()
    getTransactionStatus()

Preferred execution:

    documented Circle programmatic Agent Platform interface

Fallback only if required:

    isolated Cloudflare Container wallet executor

The rest of the code must not care which execution mode is active.


----------------------------------------------------------------------
PHASE 11 — OPEN ONCHAIN
----------------------------------------------------------------------

For KEEP/DOWNGRADE requiring payment:

1. persist PREPARING_ESCROW;
2. verify current D1 decision;
3. verify exact vendor;
4. verify exact amount;
5. verify Arc chain;
6. ensure required USDC allowance;
7. submit NEW.open(...);
8. persist transaction hash immediately;
9. read transaction receipt from Arc;
10. read NEW contract state;
11. only then mark ESCROW_OPEN.

If submission result is ambiguous:

    DO NOT RESUBMIT BLINDLY.

Read chain state by:

    tx hash
    wallet
    renewal id
    contract event

before deciding whether another submission is safe.


----------------------------------------------------------------------
PHASE 12 — WAIT FOR FULFILLMENT
----------------------------------------------------------------------

Cloudflare Workflow enters:

    WAITING_FOR_VENDOR

Use workflow wait/event semantics instead of keeping a request open.

Demo fulfillment endpoint:

    POST /api/renewals/:id/demo-fulfill

must:

1. update DemoSaaSProvider state;
2. send vendor_fulfilled event to the correct Workflow instance.


----------------------------------------------------------------------
PHASE 13 — DETERMINISTIC VERIFIER
----------------------------------------------------------------------

Verifier reads:

    stored canonical terms
    current DemoSaaSProvider state

It checks:

    target plan
    target seat count
    active status

No LLM is involved.

If terms match:

    build canonical evidence JSON
    produce evidenceHash
    persist evidence

Then invoke:

    NEW.settle(...)

If terms do not match:

    do not settle
    remain WAITING_FOR_VENDOR until expiry or another vendor event


----------------------------------------------------------------------
PHASE 14 — SETTLEMENT READBACK
----------------------------------------------------------------------

After NEW.settle:

1. persist settle tx hash;
2. read Arc receipt;
3. read NEW contract renewal state;
4. verify vendor USDC movement where practical;
5. mark SETTLED only after readback confirms settlement.

UI must expose:

    settlement status
    amount
    tx hash
    Arc explorer link
    evidence hash


----------------------------------------------------------------------
PHASE 15 — REFUND PATH
----------------------------------------------------------------------

For an OPEN renewal past expiresAt:

invoke:

    NEW.refundExpired(...)

Then:

    read Arc receipt
    verify state = REFUNDED
    persist refund tx hash
    mark workflow REFUNDED

This path must be tested independently from the happy path.


----------------------------------------------------------------------
PHASE 16 — CLOUDFLARE API
----------------------------------------------------------------------

Implement Hono routes:

    GET  /api/subscriptions
    GET  /api/subscriptions/:id

    POST /api/subscriptions/:id/assess

    GET  /api/renewals/:id
    GET  /api/renewals/:id/agents
    GET  /api/renewals/:id/onchain

    POST /api/renewals/:id/demo-fulfill

Assessment endpoint:

    creates renewal record
    creates Cloudflare Workflow instance
    immediately returns renewal id + workflow id

It must NOT wait for all agents inside the HTTP request.


----------------------------------------------------------------------
PHASE 17 — VERCEL FRONTEND
----------------------------------------------------------------------

Deploy Next.js to Vercel.

Frontend reads only from Cloudflare API.

Required screens:

1. Dashboard

   Shows subscription,
   current monthly cost,
   seats used,
   upcoming renewal.

2. Renewal Analysis

   Shows the three specialist agents independently.

3. Final Decision

   Shows Controller action,
   previous cost,
   new cost,
   monthly saving.

4. Onchain Lifecycle

   Shows:

       DECIDED
       ESCROW OPEN
       WAITING FOR VENDOR
       VERIFIED
       SETTLED

5. Transaction Proof

   Shows NEW.sol contract address,
   amount,
   Arc tx hashes,
   decisionHash,
   termsHash,
   evidenceHash.


----------------------------------------------------------------------
PHASE 18 — HAPPY PATH E2E TEST
----------------------------------------------------------------------

Canonical E2E scenario:

STEP 1

    Subscription:
    Figma Professional

    8 seats
    3 active

    96 USDC/month

STEP 2

    user clicks:
    REVIEW RENEWAL

STEP 3

    Operations:
    KEEP

    Finance:
    DOWNGRADE

    Auditor:
    DOWNGRADE

STEP 4

    Controller:
    DOWNGRADE 8 → 3

    target cost:
    36 USDC

    saving:
    60 USDC/month

STEP 5

    Circle Agent Wallet opens NEW escrow.

STEP 6

    Arc confirms:

    36 USDC locked.

STEP 7

    UI:
    WAITING FOR VENDOR

STEP 8

    Demo vendor applies:

    8 seats → 3 seats

STEP 9

    deterministic verifier confirms terms.

STEP 10

    NEW.settle executes.

STEP 11

    Arc confirms:

    36 USDC → vendor

STEP 12

    UI shows:

    AI DECISION
    DOWNGRADE

    MONTHLY SAVING
    60 USDC

    FULFILLMENT
    VERIFIED

    PAYMENT
    36 USDC

    SETTLEMENT
    ARC CONFIRMED


----------------------------------------------------------------------
PHASE 19 — FAILURE PATH E2E TEST
----------------------------------------------------------------------

Canonical failure scenario:

    agents approve DOWNGRADE
    USDC enters NEW
    vendor never applies new plan
    verifier refuses settlement
    expiry passes
    refundExpired executes
    Arc confirms payer refund

UI shows:

    TERMS NOT FULFILLED

    VENDOR NOT PAID

    USDC REFUNDED


----------------------------------------------------------------------
PHASE 20 — DEPLOYMENT ORDER
----------------------------------------------------------------------

Deploy in this order:

1. D1.
2. Worker API without money mutation.
3. Mastra agents.
4. Cloudflare Workflow.
5. Demo SaaS Provider.
6. NEW.sol Foundry tests.
7. NEW.sol on Arc.
8. Circle Agent Wallet adapter.
9. Full escrow open.
10. Verifier + settle.
11. Refund path.
12. Vercel frontend.
13. Full production-like E2E test.
14. Record final demo only after real Arc evidence exists.


----------------------------------------------------------------------
PHASE 21 — E2E DEFINITION OF DONE
----------------------------------------------------------------------

The project is NOT finished because:

    agents produce text
    frontend looks good
    contract is deployed
    wallet can transfer USDC

It is finished only when one deployed user flow performs:

    VERCEL UI
        ↓
    CLOUDFLARE API
        ↓
    CLOUDFLARE WORKFLOW
        ↓
    3 MASTRA SPECIALISTS
        ↓
    CONTROLLER
        ↓
    CIRCLE AGENT WALLET
        ↓
    NEW.sol ON ARC
        ↓
    VENDOR STATE CHANGE
        ↓
    DETERMINISTIC VERIFIER
        ↓
    NEW.sol SETTLEMENT
        ↓
    ARC READBACK
        ↓
    VERCEL UI SHOWS PROOF

No manual SQL edit.

No manually forged transaction hash.

No fake "settled" UI state.

No simulated Circle transaction presented as real.

Demo provider state may be simulated.

Money movement and Arc settlement must be real.


======================================================================
40. MVP ACCEPTANCE CRITERIA
======================================================================

The MVP is complete only when all of the following work.

A real subscription record can be created.

A renewal assessment starts from the deployed website.

Operations, Finance and Auditor run independently.

The three role outputs are persisted.

Controller produces structured final action.

A DOWNGRADE or KEEP decision can open a USDC escrow.

NEW is deployed on Arc.

The escrow transaction is visible onchain.

Vendor state can be changed to match agreed terms.

Verifier confirms matching state.

USDC releases to vendor.

The settlement transaction is visible onchain.

An expired unfulfilled renewal can refund payer.

The UI connects:

    agent evidence
    → decision
    → escrow
    → fulfillment
    → Arc transaction

No manual database modification may be required during the happy-path
demo.


======================================================================
41. OUT OF SCOPE
======================================================================

Do not implement for hackathon MVP:

- generic procurement;
- accounts payable;
- generic invoices;
- payroll;
- treasury management;
- provider marketplace;
- x402 purchasing;
- CCTP;
- Gateway unless specifically required;
- USYC;
- crosschain routing;
- multiple wallet agents;
- DAO voting;
- multisig;
- GraphRAG;
- vector memory;
- social simulation;
- 20+ personas;
- agent-to-agent chat;
- autonomous coding;
- ERP integration;
- five SaaS integrations;
- production billing cancellation against real Figma/Notion accounts.

Keep the product narrow.


======================================================================
42. OPTIONAL POST-MVP
======================================================================

Only after the core demo works:

    real Slack usage evidence
    real GitHub usage evidence
    Google Workspace seat analysis
    Notion seat analysis
    multiple subscription providers
    daily automatic renewal scanning
    email notifications
    real business onboarding
    Circle Gateway / x402 integrations

These are not prerequisites for submission.


======================================================================
43. RELEASE GATES
======================================================================

----------------------------------------------------------------------
Gate A — Agent quality
----------------------------------------------------------------------

Each role must receive meaningfully different context.

Changing only persona text is insufficient.


----------------------------------------------------------------------
Gate B — Deterministic execution
----------------------------------------------------------------------

LLMs may not construct raw wallet transactions.

Backend owns transaction construction.


----------------------------------------------------------------------
Gate C — Wallet integration
----------------------------------------------------------------------

Circle Agent Wallet execution method must use a supported documented
interface.

If CLI is required inside Cloudflare Container, secure auth persistence
must be verified before enabling autonomous execution.


----------------------------------------------------------------------
Gate D — Contract
----------------------------------------------------------------------

Tests must prove:

    valid renewal opens
    duplicate renewal fails
    only verifier settles
    vendor receives exact amount
    expired renewal refunds payer
    settled renewal cannot refund
    refunded renewal cannot settle


----------------------------------------------------------------------
Gate E — Real chain
----------------------------------------------------------------------

At least one complete:

    decision
    → escrow
    → fulfillment
    → release

must exist on Arc and be linked from the UI.


======================================================================
44. SUCCESS METRICS
======================================================================

Hackathon metrics shown on dashboard:

    Renewals reviewed

    USDC placed in escrow

    USDC settled

    USDC refunded

    Monthly spend avoided

    Seats removed

    Autonomous decisions

    Human-review decisions

Do not fabricate traction.


======================================================================
45. FINAL PRODUCT POSITIONING
======================================================================

Do NOT pitch as:

    AI company
    AI board of directors
    multi-agent simulation
    Mesa for finance
    MiroFish for business
    AI treasury
    wallet infrastructure

Pitch as:

    NEW reviews SaaS subscriptions before your business pays for another month.

Technical line:

    Three specialized AI roles evaluate operational need, financial
    value, and billing waste. A Controller decides KEEP, DOWNGRADE, or
    CANCEL. Approved renewals enter a USDC escrow on Arc and vendors are
    paid only after the agreed subscription state is verified.

Architecture line:

    Vercel serves the product, Cloudflare runs the agents and durable
    workflow, Circle Agent Wallet controls the money, NEW
    enforces delivery, and Arc proves settlement.

Final invariant:

    AI DECIDES

    CIRCLE AUTHORIZES

    NEW.sol ENFORCES DELIVERY

    ARC SETTLES


======================================================================
46. IMPLEMENTATION PRIORITY
======================================================================

Build in this order:

1. D1 schema + subscription/renewal state machine.
2. Operations, Finance, Auditor structured-output agents.
3. Controller structured-output agent.
4. Cloudflare Workflow orchestration.
5. Demo SaaS provider state.
6. NEW.sol + Foundry tests.
7. Arc deployment + chain readback.
8. WalletAdapter + Circle Agent Wallet integration.
9. Verifier + settle/refund path.
10. Next.js UI.
11. End-to-end demo evidence.
12. Optional real SaaS provider integration.

Do not start with wallet integration or UI polish before agent outputs,
workflow state, and contract behavior are deterministic and testable.


======================================================================
47. EXTERNAL TECHNOLOGY REFERENCES
======================================================================

Circle Agent Stack / Agent Wallet:
https://www.circle.com/agent-stack

Circle Agent Platform:
https://agents.circle.com/

Cloudflare Workers:
https://developers.cloudflare.com/workers/

Cloudflare Workflows:
https://developers.cloudflare.com/workflows/

Cloudflare D1:
https://developers.cloudflare.com/d1/

Cloudflare Containers:
https://developers.cloudflare.com/containers/

Mastra:
https://mastra.ai/

Arc:
https://www.arc.network/

Vercel:
https://vercel.com/

Do not rely on undocumented API behavior. Verify exact Circle Agent
Wallet programmatic interfaces, Arc chain configuration, canonical USDC
address, and current Cloudflare runtime compatibility at implementation
time.
