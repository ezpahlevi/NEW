# Implementation status

Updated: 2026-09-28

## Current repository state

- Public GitHub repository [ezpahlevi/NEW](https://github.com/ezpahlevi/NEW) is configured as `origin`. Phase 1 commit `01ba1d9c2f5174ff5871e30d0334c60f6ff2268d` is pushed to `master`.
- Current implementation branch: `feat/phase-2-d1-foundation`.
- Repository working specification is [docs/PRD.md](docs/PRD.md); its Arc target now follows the owner-directed Mainnet requirement.
- Workspaces: Next.js frontend in `apps/web`, Hono Cloudflare Worker in `apps/worker`, and shared Zod schemas/types in `packages/shared`.
- Verified local runtime: Node.js 22.18.0 and npm 10.9.3. Application dependencies are pinned in the lockfile. Wrangler types are generated from Worker configuration.
- The Worker has a local D1 binding named `DB` and four ordered migrations in `apps/worker/migrations`. Only local D1 has been used; no remote database has been created or accessed.
- Arc chain configuration accepts only Mainnet chain ID `5042`. `MAINNET_EXECUTION_ENABLED` defaults to `false`; the server-side mutation wrapper rejects invalid/missing configuration, disabled execution, or missing Mainnet RPC/chain settings before it runs a mutation.
- `ControllerDecisionProposalSchema` still rejects payment amounts. Payment amounts remain backend-bound from verified plan data; the proposal amount rejection test passes.
- The frontend remains a build scaffold and does not present renewal analysis or settlement as active.

## Completed PRD phases

- **Phase 1 — repository foundation and shared types: complete and pushed to `master`.** Shared domain and environment schemas are imported by both apps. Atomic USDC amounts use validated integer strings.
- **Phase 2 — D1 schema, migrations, deterministic seed, and repository: implemented locally on the current branch.** The eight canonical tables and Figma subscription seed are created by ordered migrations. Subscription list/read operations use prepared D1 queries and validate returned rows with the shared schema. Local Wrangler migration and seed execution, and Miniflare-backed migration/read tests, pass.
- **Phase 3 — DemoSaaSProvider: implemented locally on the current branch.** Provider state is persisted separately in D1, seeded from the Figma baseline, and supports idempotent downgrade plus reset. The downgrade seat count is explicit validated D1 data; `subscriptions` retains its baseline for future snapshots. The HTTP fulfillment route is part of the later API phase.

## Current phase

- **Phase 3 is complete on `feat/phase-2-d1-foundation`; [PR #1 remains open and unmerged](https://github.com/ezpahlevi/NEW/pull/1).** Both GitHub Actions checks passed on implementation commit `660fd57`. Phase 4 (immutable renewal snapshot) is next after the pending status-only follow-up is pushed and its current-head checks pass.

## Blockers

- A configured Arc Mainnet vendor wallet address is needed to populate the Figma seed before real payment integration; `vendor_wallet` remains `NULL` until then.
- A remote Cloudflare D1 database has not been provisioned. Current migrations and data validation are local only.
- No known Phase 3 implementation or local validation failures remain. GitHub CI for the next PR head has not run yet.

## Tests currently passing

- `npm ci` — passed; 77 packages audited, zero vulnerabilities reported.
- `npm test` — passed, 24 tests total: 9 shared and 15 Worker tests, including persisted demo provider seed, downgrade/reset behavior, idempotency, and state conflict handling.
- `npm run typecheck` — passed for shared, Worker (including D1 tests), and Next.js workspaces.
- `npm run build` — passed; Worker used `wrangler deploy --dry-run` only, and the Next.js production build succeeded.
- `npx wrangler d1 migrations apply new-app --local` — migration `0004` applied successfully to the existing local D1 state. A separate fresh Wrangler local store applied all four migrations successfully.
- Wrangler D1 readback confirmed Figma provider state `professional-8-seat`, 8 seats, active, `downgrade_seats = 3`, and `vendor_wallet = NULL`.
- Both GitHub Actions checks passed on implementation commit `660fd57`; the status-only follow-up will trigger CI on its own head.
- `git diff --check` — passed. No lint script is configured.

## External integration status

- GitHub: Phase 1 is pushed to `master`; Phase 2 and Phase 3 are pushed on `feat/phase-2-d1-foundation`; [PR #1](https://github.com/ezpahlevi/NEW/pull/1) is open and unmerged. Phase 3 checks passed on implementation commit `660fd57`.
- Cloudflare D1: local binding and migrations are configured and validated; remote D1 is not provisioned. Cloudflare Workflows are not implemented.
- DemoSaaSProvider state transitions are implemented and tested locally; no public fulfillment API route is wired yet. Mastra agents, `NEW.sol`, Circle Agent Wallet, Arc RPC, and transaction flows are not implemented or invoked. Circle Agent Wallet support for Arc Mainnet is unverified and must be checked at the live-integration phase; Circle remains behind the future `WalletAdapter`.
- Vercel is not configured or deployed. No credentials or keys were added to repository files, and no transactions were submitted.

## Next concrete tasks

1. Push the status-only follow-up and wait for its current-head CI to pass; do not merge.
2. Then implement Phase 4: immutable renewal evidence snapshot, canonical serialization, hashing, and persisted snapshot JSON/hash.
3. Continue the remaining local phases in dependency order; before Workflows become authoritative, add a unique partial index on non-null `renewals.workflow_id` values.
4. Defer remote D1 provisioning, Mainnet vendor configuration, Circle live integration, contract deployment, and real-money E2E to the final integration phases.
