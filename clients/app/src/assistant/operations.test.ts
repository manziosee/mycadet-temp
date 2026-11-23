import { afterEach, describe, expect, test } from "bun:test";
import * as operations from "./operations";

// The coalescing lives in module state — each scenario swaps the global fetch
// the request rides and reads the call count through it.
const realFetch = globalThis.fetch;
let fetchCalls = 0;
let responses: Array<unknown> = [];

function respondWith(sequence: Array<unknown>): void {
  responses = sequence;
  globalThis.fetch = (async () => {
    const next = responses.shift();
    fetchCalls++;
    return {
      json: async () => (next !== undefined ? next : { ok: true }),
    } as Response;
  }) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  operations.releaseHatchGuard();
  globalThis.fetch = realFetch;
  fetchCalls = 0;
  responses = [];
});

describe("hatchAssistant — the coalesced hatch", () => {
  test("concurrent callers await the same in-flight hatch", async () => {
    respondWith([{ ok: true, assistantId: "a-1" }]);

    const [first, second] = await Promise.all([
      operations.hatchAssistant("local"),
      operations.hatchAssistant("local"),
    ]);

    expect(fetchCalls).toBe(1);
    expect(first).toEqual({ ok: true, assistantId: "a-1" });
    expect(second).toEqual(first);
  });

  test("sends provider settings and coalesces only identical hatch inputs", async () => {
    const bodies: unknown[] = [];
    globalThis.fetch = (async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, assistantId: "a-1" });
    }) as typeof fetch;
    const provider = { provider: "fireworks", precollectedApiKey: "fw_test" };
    await operations.hatchAssistant("local", provider);
    await operations.hatchAssistant("local", provider);
    await operations.hatchAssistant("local", {
      ...provider,
      precollectedApiKey: "fw_changed",
    });
    expect(bodies).toEqual([
      { remote: "local", ...provider },
      { remote: "local", ...provider, precollectedApiKey: "fw_changed" },
    ]);
  });

  test("a held promise answers only for the same remote — a switched mode hatches fresh", async () => {
    respondWith([
      { ok: true, assistantId: "local-1" },
      { ok: true, assistantId: "cloud-1" },
    ]);

    await operations.hatchAssistant("local");
    const switched = await operations.hatchAssistant("cloud");

    expect(fetchCalls).toBe(2);
    expect(switched).toEqual({ ok: true, assistantId: "cloud-1" });
  });

  test("a failed hatch releases immediately — a retry re-hatches", async () => {
    respondWith([
      { ok: false, error: "no ports left" },
      { ok: true, assistantId: "a-2" },
    ]);

    const failed = await operations.hatchAssistant("local");
    expect(failed.ok).toBe(false);

    const retried = await operations.hatchAssistant("local");
    expect(fetchCalls).toBe(2);
    expect(retried).toEqual({ ok: true, assistantId: "a-2" });
  });

  test("releaseHatchGuard retires a resolved hatch for the next session", async () => {
    respondWith([
      { ok: true, assistantId: "a-1" },
      { ok: true, assistantId: "a-2" },
    ]);

    await operations.hatchAssistant("local");
    operations.releaseHatchGuard();
    await operations.hatchAssistant("local");

    expect(fetchCalls).toBe(2);
  });
});
