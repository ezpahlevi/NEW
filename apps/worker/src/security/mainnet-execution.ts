import { ARC_CHAIN_ID, WorkerEnvironmentSchema } from "@new/shared";

export class MainnetExecutionDisabledError extends Error {
  readonly code = "MAINNET_EXECUTION_DISABLED";

  constructor() {
    super("Mainnet wallet mutations are disabled");
    this.name = "MainnetExecutionDisabledError";
  }
}

export class MainnetChainNotConfiguredError extends Error {
  readonly code = "MAINNET_CHAIN_UNCONFIGURED";

  constructor() {
    super("Mainnet RPC and chain ID must be configured before wallet mutations");
    this.name = "MainnetChainNotConfiguredError";
  }
}

export class MainnetEnvironmentInvalidError extends Error {
  readonly code = "MAINNET_ENV_INVALID";

  constructor() {
    super("Mainnet wallet mutations are blocked by invalid Worker configuration");
    this.name = "MainnetEnvironmentInvalidError";
  }
}

export async function runMainnetMutation<T>(
  environment: unknown,
  mutation: () => Promise<T>
): Promise<T> {
  const result = WorkerEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new MainnetEnvironmentInvalidError();
  }

  const config = result.data;

  if (!config.MAINNET_EXECUTION_ENABLED) {
    throw new MainnetExecutionDisabledError();
  }

  if (config.ARC_CHAIN_ID !== ARC_CHAIN_ID || !config.ARC_RPC_URL) {
    throw new MainnetChainNotConfiguredError();
  }

  return mutation();
}
