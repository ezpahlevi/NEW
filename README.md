# NEW

NEW reviews SaaS subscriptions before another renewal payment. This repository
is a greenfield npm workspace for the canonical architecture in docs/PRD.md.

## Requirements

- Node.js 22.18 or newer
- npm 10.9.3

## Local checks

From the repository root:

- `npm install`
- `npm test`
- `npm run typecheck`
- `npm run build`

The web app is in apps/web, the Cloudflare Worker is in apps/worker, and shared
Zod schemas and inferred types are in packages/shared. No D1 database, agent,
wallet, Arc contract, or settlement flow is configured in Phase 1.

Environment variable names are listed in .env.example. Do not put credentials
in that file; use the deployment platform's secret store.
