# Implementation status

Updated: 2026-09-28

## Current repository state

- Public GitHub repository [ezpahlevi/NEW](https://github.com/ezpahlevi/NEW) is configured as `origin`. Phase 1 commit `01ba1d9c2f5174ff5871e30d0334c60f6ff2268d` is pushed to `master`.
- Current implementation branch: `feat/phase-2-d1-foundation`.
- Repository working specification is [docs/PRD.md](docs/PRD.md); its Arc target now follows the owner-directed Mainnet requirement.
- Workspaces: Next.js frontend in `apps/web`, Hono Cloudflare Worker in `apps/worker`, and shared Zod schemas/types in `packages/shared`.
- Verified local runtime: Node.js 22.18.0 and npm 10.9.3. Application dependencies are pinned in the lockfile. Wrangler types are generated from Worker configuration.
- The Worker has a local D1 binding named `DB` and migrations in `apps/worker/migrations`. Only local D1 has been used; no remote database has been created or accessed.
- Arc chain configuration accepts only Mainnet chain ID `5042`. `MAINNET_EXECUTION_ENABLED` defaults to `false`; the server-side mutation wrapper rejects invalid/missing configuration, disabled execution, or missing Mainnet RPC/chain settings before it runs a mutation.
- `ControllerDecisionProposalSchema` still rejects payment amounts. Payment amounts remain backend-bound from verified plan data; the proposal amount rejection test passes.
- The frontend remains a build scaffold and does not present renewal analysis or settlement as active.

## Completed PRD phases

- **Phase 1 — repository foundation and shared types: complete and pushed to `master`.** Shared domain and environment schemas are imported by both apps. Atomic USDC amounts use validated integer strings.
- **Phase 2 — D1 schema, migrations, deterministic seed, and repository: implemented locally on the current branch.** The eight canonical tables and Figma subscription seed are created by ordered migrations. Subscription list/read operations use prepared D1 queries and validate returned rows with the shared schema. Local Wrangler migration and seed execution, and Miniflare-backed migration/read tests, pass.

## Current phase

- **Phase 2 — local schema, migrations, seed execution, repository, mainnet configuration, and execution gate are implemented on `feat/phase-2-d1-foundation`; [PR #1 is open for review](https://github.com/ezpahlevi/NEW/pull/1).** The deterministic seed keeps `vendor_wallet` as `NULL` until a real Arc Mainnet vendor address is deliberately configured. The latest PR checks pass, including Wrangler migration application and seed readback. Phase 3 has not started.

## Blockers

- A configured Arc Mainnet vendor wallet address is needed to populate the Figma seed before real payment integration; `vendor_wallet` remains `NULL` until then.
- A remote Cloudflare D1 database has not been provisioned. Current migrations and data validation are local only.
- No Phase 2 implementation, local validation, or current PR CI failures remain.

## Tests currently passing

- `npm ci` — passed; 77 packages audited, zero vulnerabilities reported.
- `npm test` — passed, 20 tests total: 8 shared and 12 Worker tests, including D1 schema, seed, repository reads, amount constraints, Mainnet chain ID validation, and fail-closed mutation gate coverage.
- `npm run typecheck` — passed for shared, Worker (including D1 tests), and Next.js workspaces.
- `npm run build` — passed; Worker used `wrangler deploy --dry-run` only, and the Next.js production build succeeded.
- `npx wrangler d1 migrations apply new-app --local` — both migrations applied successfully to local D1.
- `npx wrangler d1 execute new-app --local --command "SELECT id, name, current_plan, current_seats, active_seats, renewal_price_atomic, downgrade_plan, downgrade_price_atomic, vendor_wallet FROM subscriptions" --json` — read back the seeded Figma Professional row and integer atomic plan prices from local D1.
- GitHub Actions on the current PR head passed; it applies D1 migrations through Wrangler in local mode, checks the deterministic seed readback, and then runs the remaining CI checks.
- `git diff --check` — passed. No lint script is configured.

## External integration status

- GitHub: Phase 1 is pushed to `master`; Phase 2 branch `feat/phase-2-d1-foundation` is pushed and [PR #1](https://github.com/ezpahlevi/NEW/pull/1) is open with passing checks.
- Cloudflare D1: local binding and migrations are configured and validated; remote D1 is not provisioned. Cloudflare Workflows are not implemented.
- DemoSaaSProvider, Mastra agents, `NEW.sol`, Circle Agent Wallet, Arc RPC, and transaction flows are not implemented or invoked. Circle Agent Wallet support for Arc Mainnet is unverified and must be checked at the live-integration phase; Circle remains behind the future `WalletAdapter`.
- Vercel is not configured or deployed. No credentials or keys were added to repository files, and no transactions were submitted.

## Next concrete tasks

1. Merge Phase 2 only after the Wrangler migration CI step passes.
2. Then begin Phase 3: implement `DemoSaaSProvider` state in D1.
3. Before Phase 12 makes Cloudflare Workflows authoritative, add a unique partial index on non-null `renewals.workflow_id` values.
4. Before real payment integration, configure a real Arc Mainnet vendor wallet address and provision the remote D1 database required for deployment.
