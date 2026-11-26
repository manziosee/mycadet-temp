import { describe, expect, test } from "bun:test";

import {
  MIN_RUN_COST_LIMIT_USD,
  startRunCostGuard,
  validateMaxRunCostUsd,
} from "../run-cost-guard.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("startRunCostGuard", () => {
  test("without a limit it never reads spend and never trips", () => {
    let reads = 0;
    const guard = startRunCostGuard({
      runId: "run-1",
      limitUsd: null,
      onExceeded: () => {
        throw new Error("must not trip");
      },
      readCostUsd: () => {
        reads += 1;
        return 1_000;
      },
    });

    expect(guard.finish()).toBeNull();
    expect(reads).toBe(0);
  });

  test("a run within its limit finishes without tripping", () => {
    const exceeded: number[] = [];
    const guard = startRunCostGuard({
      runId: "run-1",
      limitUsd: 1,
      onExceeded: (cost) => exceeded.push(cost),
      readCostUsd: () => 0.5,
    });

    expect(guard.finish()).toBeNull();
    expect(exceeded).toEqual([]);
  });

  test("polling trips the guard mid-run, once, and stops reading afterwards", async () => {
    // GIVEN spend that climbs past a $1.00 limit while the run is going
    let spend = 0;
    let reads = 0;
    const exceeded: number[] = [];
    const guard = startRunCostGuard({
      runId: "run-1",
      limitUsd: 1,
      onExceeded: (cost) => exceeded.push(cost),
      pollMs: 5,
      readCostUsd: () => {
        reads += 1;
        spend += 0.4;
        return spend;
      },
    });

    // WHEN the run keeps going past the point the limit is crossed
    await sleep(60);
    const readsAtTrip = reads;
    await sleep(30);

    // THEN onExceeded fired exactly once, before the run finished
    expect(exceeded).toHaveLength(1);
    expect(exceeded[0]).toBeGreaterThan(1);
    // AND no further reads happened once it tripped
    expect(reads).toBe(readsAtTrip);
    expect(guard.finish()).toBe(exceeded[0]);
    expect(exceeded).toHaveLength(1);
  });

  test("the final check catches spend that landed after the last poll", () => {
    const exceeded: number[] = [];
    const guard = startRunCostGuard({
      runId: "run-1",
      limitUsd: 1,
      onExceeded: (cost) => exceeded.push(cost),
      pollMs: 3_600_000,
      readCostUsd: () => 3,
    });

    expect(guard.finish()).toBe(3);
    expect(exceeded).toEqual([3]);
  });

  test("a failed spend read is treated as within the limit", () => {
    const guard = startRunCostGuard({
      runId: "run-1",
      limitUsd: 1,
      onExceeded: () => {
        throw new Error("must not trip");
      },
      readCostUsd: () => {
        throw new Error("database is locked");
      },
    });

    expect(guard.finish()).toBeNull();
  });
});

describe("validateMaxRunCostUsd", () => {
  test("accepts null and amounts of at least the minimum", () => {
    for (const value of [null, MIN_RUN_COST_LIMIT_USD, 1, 25.5]) {
      expect(validateMaxRunCostUsd(value)).toBeNull();
    }
  });

  test("rejects non-numbers and amounts below the minimum", () => {
    for (const value of [0, 0.001, -1, Number.NaN, Infinity, "5", undefined]) {
      expect(validateMaxRunCostUsd(value)).not.toBeNull();
    }
  });
});
