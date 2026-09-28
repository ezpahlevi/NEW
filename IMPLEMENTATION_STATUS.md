# Implementation status

Updated: 2026-09-28

## Current repository state

- Public GitHub repository [ezpahlevi/NEW](https://github.com/ezpahlevi/NEW) is configured as `origin`. Phase 1 commit `01ba1d9c2f5174ff5871e30d0334c60f6ff2268d` is pushed to `master`.
- Current implementation branch: `feat/phase-2-d1-foundation`.
- Repository working specification is [docs/PRD.md](docs/PRD.md); its Arc target now follows the owner-directed Mainnet requirement.
- Workspaces: Next.js frontend in `apps/web`, Hono Cloudflare Worker in `apps/worker`, and shared Zod schemas/types in `packages/shared`.
- The Worker now pins Mastra Agent primitives and the OpenAI AI SDK provider; Mastra Workflows are not used. Role prompts are bundled as text modules.
- Verified local runtime: Node.js 22.18.0 and npm 10.9.3. Application dependencies are pinned in the lockfile. Wrangler types are generated from Worker configuration.
- The Worker has a local D1 binding named `DB` and five ordered migrations in `apps/worker/migrations`. Only local D1 has been used; no remote database has been created or accessed.
- Arc chain configuration accepts only Mainnet chain ID `5042`. `MAINNET_EXECUTION_ENABLED` defaults to `false`; the server-side mutation wrapper rejects invalid/missing configuration, disabled execution, or missing Mainnet RPC/chain settings before it runs a mutation.
- `ControllerDecisionProposalSchema` still rejects payment amounts. Payment amounts remain backend-bound from verified plan data; the proposal amount rejection test passes.
- The frontend remains a build scaffold and does not present renewal analysis or settlement as active.

## Completed PRD phases

- **Phase 1 — repository foundation and shared types: complete and pushed to `master`.** Shared domain and environment schemas are imported by both apps. Atomic USDC amounts use validated integer strings.
- **Phase 2 — D1 schema, migrations, deterministic seed, and repository: implemented locally on the current branch.** The eight canonical tables and Figma subscription seed are created by ordered migrations. Subscription list/read operations use prepared D1 queries and validate returned rows with the shared schema. Local Wrangler migration and seed execution, and Miniflare-backed migration/read tests, pass.
- **Phase 3 — DemoSaaSProvider: implemented locally on the current branch.** Provider state is persisted separately in D1, seeded from the Figma baseline, and supports idempotent downgrade plus reset. The downgrade seat count is explicit validated D1 data; `subscriptions` retains its baseline for future snapshots. The HTTP fulfillment route is part of the later API phase.
- **Phase 4 — immutable renewal snapshot: implemented locally on the current branch.** Snapshots contain the subscription baseline, latest previous renewal state, usage evidence, and billing evidence; canonical JSON and its SHA-256 hash are persisted together before agents run.
- **Phase 5 — specialist agents: implemented locally on the current branch.** Operations, Finance, and Auditor use distinct Mastra instructions, Zod outputs, and role-filtered contexts built from the same persisted snapshot hash. They run in parallel, cannot access wallet/chain calls, reject unobserved evidence references, and persist all three reports as one D1 batch before readback.

## Current phase

- **Phase 5 is complete and pushed on `feat/phase-2-d1-foundation`; both GitHub Actions checks passed on head `ce5d231`.** [PR #1 remains open and unmerged](https://github.com/ezpahlevi/NEW/pull/1). Phase 6 is next.

## Blockers

- A configured Arc Mainnet vendor wallet address is needed to populate the Figma seed before real payment integration; `vendor_wallet` remains `NULL` until then.
- A remote Cloudflare D1 database has not been provisioned. Current migrations and data validation are local only.
- No real provider call has been run; live LLM credentials/model configuration remain unverified. If either required value is missing at invocation, agent construction fails with `AGENT_CONFIGURATION_MISSING`; specialist logic is covered with test responses.
- No known Phase 5 implementation or local test/typecheck/build failures remain. The local Node 22.18 install reports a non-fatal `EBADENGINE` warning from Mastra's transitive `posthog-node` package, which declares Node `>=22.22.0`; install and all checks still complete.

## Tests currently passing

- `npm ci` — passed; 226 packages installed, zero vulnerabilities reported. It emitted the noted transitive Node engine warning.
- `npm test` — passed, 31 tests total: 12 shared and 19 Worker tests, including role-specific specialist contexts, output/evidence rejection, D1 report persistence and retry readback, canonical JSON/hash behavior, and immutable snapshot behavior.
- `npm run typecheck` — passed for shared, Worker (including D1 tests), and Next.js workspaces.
- `npm run build` — passed; Wrangler bundled the Mastra modules and Markdown prompt assets with `wrangler deploy --dry-run` only, and the Next.js production build succeeded.
- `npx wrangler d1 migrations apply new-app --local` — a fresh Wrangler local store applied all five migrations successfully; the existing local store reports no pending migrations.
- Wrangler D1 readback confirmed the seeded provider state and `snapshot_json` migration column; `vendor_wallet` remains `NULL`.
- The five-migration Wrangler local store reports no pending migrations; readback confirms the seeded Figma provider state and `vendor_wallet = NULL`.
- Both GitHub Actions checks passed on current PR head `ce5d231`, including Wrangler D1 migration application and seed readback.
- `git diff --check` — passed. No lint script is configured.

## External integration status

- GitHub: Phase 1 is pushed to `master`; Phases 2–5 are pushed on `feat/phase-2-d1-foundation`; both CI checks passed on Phase 5 head `ce5d231`. [PR #1](https://github.com/ezpahlevi/NEW/pull/1) stays open and unmerged.
- Cloudflare D1: local binding and migrations are configured and validated; remote D1 is not provisioned. Cloudflare Workflows are not implemented.
- DemoSaaSProvider, immutable snapshots, and all three Mastra specialists are implemented and tested locally. The specialists use an OpenAI Chat Completions adapter; live LLM configuration is unverified and no live analysis has been run. No public fulfillment API route is wired yet. `NEW.sol`, Circle Agent Wallet, Arc RPC, and transaction flows are not implemented or invoked. Circle Agent Wallet support for Arc Mainnet is unverified and must be checked at the live-integration phase; Circle remains behind the future `WalletAdapter`.
- Vercel is not configured or deployed. No credentials or keys were added to repository files, and no transactions were submitted.

## Next concrete tasks

1. Implement Phase 6: Controller Agent with backend-controlled plan and amount binding.
2. Continue local phases in dependency order; before Workflows become authoritative, add a unique partial index on non-null `renewals.workflow_id` values.
3. Defer remote D1 provisioning, Mainnet vendor configuration, Circle live integration, contract deployment, and real-money E2E to the final integration phases.
