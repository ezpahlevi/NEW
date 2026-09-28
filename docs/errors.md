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
