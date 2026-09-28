# Error codes

| Code | Meaning |
| --- | --- |
| `INVALID_WORKER_ENV` | A configured Cloudflare Worker environment value failed validation. The response lists field names only and never includes values. |
| `INVALID_WEB_ENV` | A configured frontend environment value failed validation during server startup or build. |
| `MAINNET_EXECUTION_DISABLED` | A mainnet wallet mutation was blocked because `MAINNET_EXECUTION_ENABLED` is missing or false. Enclose every real wallet mutation in the server-side mainnet execution gate. |
| `MAINNET_CHAIN_UNCONFIGURED` | Mainnet execution was enabled, but the RPC URL or Mainnet chain ID is missing. No wallet mutation ran. |
| `MAINNET_ENV_INVALID` | Mainnet wallet mutation was blocked because Worker configuration failed validation. The error does not expose environment values. |
| `SUBSCRIPTION_NOT_FOUND` | No application subscription exists for the requested ID. |
| `DEMO_PROVIDER_STATE_NOT_FOUND` | The subscription exists, but its persisted DemoSaaSProvider state is missing. |
| `DEMO_PROVIDER_INACTIVE` | The demo vendor cannot apply a plan change to an inactive subscription. |
| `DEMO_PROVIDER_PLAN_INVALID` | The configured demo downgrade seat count is not lower than the current seat count. |
| `DEMO_PROVIDER_STATE_CONFLICT` | Persisted vendor state differs from both the expected baseline and the already-fulfilled target state. |
| `RENEWAL_NOT_FOUND` | No renewal exists for the requested ID. |
| `RENEWAL_SUBSCRIPTION_MISMATCH` | The renewal does not belong to the requested subscription or its subscription row is missing. |
| `SNAPSHOT_STATE_INVALID` | A snapshot cannot be initialized after a renewal has left its initial analysis states. |
| `SNAPSHOT_PARTIAL` | Only one of the persisted renewal snapshot JSON or hash fields is present. |
| `SNAPSHOT_CORRUPT` | Persisted snapshot JSON is noncanonical, invalid, or does not match its SHA-256 hash. |
| `SNAPSHOT_PERSIST_FAILED` | Snapshot initialization lost a write race and no complete persisted snapshot was available to read back. |
| `AGENT_CONFIGURATION_MISSING` | Specialist execution requires an LLM API key and model ID; no agent call was made. |
| `SPECIALIST_GENERATION_FAILED` | A specialist model call failed; no reports were persisted. |
| `SPECIALIST_OUTPUT_INVALID` | A specialist output failed its role-specific Zod schema. |
| `SPECIALIST_EVIDENCE_INVALID` | A specialist cited an evidence ID that was not visible in its snapshot context. |
| `AGENT_REPORTS_INCOMPLETE` | Some but not all three specialist reports exist for the renewal. |
| `AGENT_REPORTS_CORRUPT` | A stored specialist report failed validation. |
| `AGENT_REPORT_PERSIST_FAILED` | The three reports could not be written and read back as one complete set. |
