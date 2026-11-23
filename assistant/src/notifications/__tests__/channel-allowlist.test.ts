import { describe, expect, test } from "bun:test";

import {
  intersectChannelAllowlist,
  readChannelAllowlist,
} from "../channel-allowlist.js";
import type { NotificationChannel } from "../types.js";

describe("readChannelAllowlist", () => {
  test("returns trimmed non-empty strings", () => {
    expect(
      readChannelAllowlist({
        channelAllowlist: [" telegram ", "", "slack"],
      }),
    ).toEqual(["telegram", "slack"]);
  });

  test("returns undefined for a missing or empty list", () => {
    expect(readChannelAllowlist({})).toBeUndefined();
    expect(readChannelAllowlist({ channelAllowlist: [] })).toBeUndefined();
    expect(
      readChannelAllowlist({ channelAllowlist: ["", "  "] }),
    ).toBeUndefined();
  });
});

describe("intersectChannelAllowlist", () => {
  test("keeps only available channel ids", () => {
    const available: NotificationChannel[] = ["cadet", "telegram"];
    expect(intersectChannelAllowlist(["telegram", "nope"], available)).toEqual([
      "telegram",
    ]);
  });

  test("deduplicates a repeated available channel", () => {
    const available: NotificationChannel[] = ["cadet", "telegram"];
    expect(
      intersectChannelAllowlist(["telegram", "telegram"], available),
    ).toEqual(["telegram"]);
  });
});
