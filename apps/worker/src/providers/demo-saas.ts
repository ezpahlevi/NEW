import {
  DemoSaaSSubscriptionStateSchema,
  type DemoSaaSSubscriptionState
} from "@new/shared";
import { getSubscriptionById } from "../repositories/subscriptions.ts";

interface DemoSaaSStateRow {
  plan: string;
  seats: number;
  active: number;
}

export type DemoSaaSProviderErrorCode =
  | "SUBSCRIPTION_NOT_FOUND"
  | "DEMO_PROVIDER_STATE_NOT_FOUND"
  | "DEMO_PROVIDER_INACTIVE"
  | "DEMO_PROVIDER_PLAN_INVALID"
  | "DEMO_PROVIDER_STATE_CONFLICT";

export class DemoSaaSProviderError extends Error {
  readonly code: DemoSaaSProviderErrorCode;

  constructor(code: DemoSaaSProviderErrorCode) {
    super(code);
    this.name = "DemoSaaSProviderError";
    this.code = code;
  }
}

function stateFromRow(row: DemoSaaSStateRow): DemoSaaSSubscriptionState {
  return DemoSaaSSubscriptionStateSchema.parse({
    plan: row.plan,
    seats: row.seats,
    active: row.active === 1
  });
}

export class DemoSaaSProvider {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async getSubscriptionState(
    subscriptionId: string
  ): Promise<DemoSaaSSubscriptionState> {
    const row = await this.database
      .prepare(
        "SELECT plan, seats, active FROM demo_provider_state WHERE subscription_id = ?"
      )
      .bind(subscriptionId)
      .first<DemoSaaSStateRow>();

    if (row === null) {
      const subscription = await getSubscriptionById(this.database, subscriptionId);
      if (subscription === null) {
        throw new DemoSaaSProviderError("SUBSCRIPTION_NOT_FOUND");
      }
      throw new DemoSaaSProviderError("DEMO_PROVIDER_STATE_NOT_FOUND");
    }

    return stateFromRow(row);
  }

  async applyPlanChange(
    subscriptionId: string
  ): Promise<DemoSaaSSubscriptionState> {
    const subscription = await getSubscriptionById(this.database, subscriptionId);
    if (subscription === null) {
      throw new DemoSaaSProviderError("SUBSCRIPTION_NOT_FOUND");
    }

    const currentState = await this.getSubscriptionState(subscriptionId);
    if (!currentState.active) {
      throw new DemoSaaSProviderError("DEMO_PROVIDER_INACTIVE");
    }

    const targetSeats = subscription.downgradeSeats;
    if (targetSeats >= subscription.currentSeats) {
      throw new DemoSaaSProviderError("DEMO_PROVIDER_PLAN_INVALID");
    }

    if (
      currentState.plan === subscription.downgradePlan &&
      currentState.seats === targetSeats
    ) {
      return currentState;
    }

    if (
      currentState.plan !== subscription.currentPlan ||
      currentState.seats !== subscription.currentSeats
    ) {
      throw new DemoSaaSProviderError("DEMO_PROVIDER_STATE_CONFLICT");
    }

    await this.database
      .prepare(
        `UPDATE demo_provider_state
         SET plan = ?, seats = ?, active = 1
         WHERE subscription_id = ?`
      )
      .bind(subscription.downgradePlan, targetSeats, subscriptionId)
      .run();

    return this.getSubscriptionState(subscriptionId);
  }

  async resetDemoState(
    subscriptionId: string
  ): Promise<DemoSaaSSubscriptionState> {
    const subscription = await getSubscriptionById(this.database, subscriptionId);
    if (subscription === null) {
      throw new DemoSaaSProviderError("SUBSCRIPTION_NOT_FOUND");
    }

    await this.database
      .prepare(
        `INSERT INTO demo_provider_state (subscription_id, plan, seats, active)
         VALUES (?, ?, ?, 1)
         ON CONFLICT (subscription_id) DO UPDATE SET
           plan = excluded.plan,
           seats = excluded.seats,
           active = excluded.active`
      )
      .bind(subscriptionId, subscription.currentPlan, subscription.currentSeats)
      .run();

    return this.getSubscriptionState(subscriptionId);
  }
}
