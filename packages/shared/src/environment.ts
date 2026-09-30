import { z } from "zod";
import { ArcChainIdSchema, EvmAddressSchema } from "./domain.ts";

const blankAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  blankAsUndefined,
  z.string().min(1).optional()
);

const optionalUrl = z.preprocess(
  blankAsUndefined,
  z.string().url().optional()
);

const optionalAddress = z.preprocess(
  blankAsUndefined,
  EvmAddressSchema.optional()
);

const optionalChainId = z.preprocess(
  (value) => {
    if (value === undefined || value === "") return undefined;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return value;
  },
  ArcChainIdSchema.optional()
);

const mainnetExecutionEnabled = z
  .preprocess(blankAsUndefined, z.enum(["true", "false"]).default("false"))
  .transform((value) => value === "true");

export const WorkerEnvironmentSchema = z
  .object({
    LLM_API_KEY: optionalString,
    LLM_MODEL: optionalString,
    ARC_RPC_URL: optionalUrl,
    ARC_CHAIN_ID: optionalChainId,
    MAINNET_EXECUTION_ENABLED: mainnetExecutionEnabled,
    USDC_ADDRESS: optionalAddress,
    NEW_CONTRACT_ADDRESS: optionalAddress,
    CIRCLE_WALLET_ADDRESS: optionalAddress,
    WALLET_EXECUTOR_MODE: z.preprocess(
      blankAsUndefined,
      z.enum(["direct", "container"]).optional()
    ),
    WALLET_EXECUTOR_INTERNAL_TOKEN: optionalString,
    APP_BASE_URL: optionalUrl
  })
  .passthrough()
  .superRefine((environment, context) => {
    if (
      environment.WALLET_EXECUTOR_MODE === "container" &&
      !environment.WALLET_EXECUTOR_INTERNAL_TOKEN
    ) {
      context.addIssue({
        code: "custom",
        path: ["WALLET_EXECUTOR_INTERNAL_TOKEN"],
        message: "Required when WALLET_EXECUTOR_MODE is container"
      });
    }
  });

export const WebEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: optionalUrl
});

export type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof WebEnvironmentSchema>;
