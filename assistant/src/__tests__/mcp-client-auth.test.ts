import { afterEach, describe, expect, jest, mock, spyOn, test } from "bun:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Mock secure-keys so McpOAuthProvider doesn't try to access the credential store
import { useMemorySecureKeyMap } from "./helpers/secure-keys.js";

// The REAL secure-keys module pinned to an empty memory backend: no
// credentials configured, no keychain access.
useMemorySecureKeyMap();

mock.module("../config/env-registry.js", () => ({
  getDebugStdoutLogs: () => false,
  getIsContainerized: () => false,
  getIsCloud: () => false,
  getCpuLimit: () => undefined,
  getMinikubeStorageSize: () => undefined,
  getProfilerRunId: () => undefined,
  getProfilerMode: () => undefined,
  getProfilerMaxBytes: () => undefined,
  getProfilerMaxRuns: () => undefined,
  getProfilerMinFreeMb: () => undefined,
  checkUnrecognizedEnvVars: () => [],
}));

const { McpClient } = await import("../mcp/client.js");
const { McpOAuthProvider } = await import("../mcp/mcp-oauth-provider.js");

/**
 * Mimics the SDK's StreamableHTTPError which has a `.code` property
 * containing the HTTP status code, but doesn't include it in `.message`.
 */
class FakeStreamableHTTPError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(`Streamable HTTP error: ${message}`);
    this.code = code;
  }
}

const httpTransport = {
  type: "streamable-http" as const,
  url: "https://example.com/mcp",
};

let connectSpy: ReturnType<typeof mockSdkConnect> | undefined;

function mockSdkConnect(impl: (this: Client) => Promise<void>) {
  return spyOn(Client.prototype, "connect").mockImplementation(impl);
}

afterEach(() => {
  connectSpy?.mockRestore();
  connectSpy = undefined;
});

describe("McpClient auth error detection", () => {
  test("treats StreamableHTTPError with code 401 as auth error (does not throw)", async () => {
    const client = new McpClient("test-server");

    connectSpy = mockSdkConnect(async () => {
      throw new FakeStreamableHTTPError(
        401,
        'Error POSTing to endpoint: {"error":"invalid_token"}',
      );
    });

    // Should NOT throw — auth errors are swallowed, isConnected stays false
    await client.connect(httpTransport);
    expect(client.isConnected).toBe(false);
  });

  test("treats StreamableHTTPError with code 403 as auth error (does not throw)", async () => {
    const client = new McpClient("test-server");

    connectSpy = mockSdkConnect(async () => {
      throw new FakeStreamableHTTPError(403, "Forbidden");
    });

    await client.connect(httpTransport);
    expect(client.isConnected).toBe(false);
  });

  test("swallows non-auth StreamableHTTPError (connect never throws)", async () => {
    const client = new McpClient("test-server");

    connectSpy = mockSdkConnect(async () => {
      throw new FakeStreamableHTTPError(500, "Internal Server Error");
    });

    // Non-auth errors are logged but never propagated — daemon keeps running
    await client.connect(httpTransport);
    expect(client.isConnected).toBe(false);
  });

  test("treats error message containing 'unauthorized' as auth error", async () => {
    const client = new McpClient("test-server");

    connectSpy = mockSdkConnect(async () => {
      throw new Error("unauthorized request");
    });

    await client.connect(httpTransport);
    expect(client.isConnected).toBe(false);
  });

  test("treats SDK fetchToken 'authorizationCode is required' error as auth error", async () => {
    const client = new McpClient("test-server");

    connectSpy = mockSdkConnect(async () => {
      throw new Error(
        "Either provider.prepareTokenRequest() or authorizationCode is required",
      );
    });

    await client.connect(httpTransport);
    expect(client.isConnected).toBe(false);
  });
});

describe("McpClient connection lifecycle", () => {
  test("a close during connect cannot restore a stale connected state", async () => {
    const onUnexpectedClose = jest.fn();
    const client = new McpClient("test-server", "workspace", onUnexpectedClose);
    let finishConnect: (() => void) | undefined;
    let onClose: (() => void) | undefined;
    connectSpy = mockSdkConnect(function () {
      onClose = this.onclose?.bind(this);
      return new Promise<void>((resolve) => {
        finishConnect = resolve;
      });
    });

    const connecting = client.connect(httpTransport);
    while (!finishConnect) {
      await Promise.resolve();
    }
    onClose!();
    finishConnect!();
    await connecting;

    expect(client.isConnected).toBe(false);
    expect(client.lastError?.message).toContain("closed during initialization");
    expect(onUnexpectedClose).not.toHaveBeenCalled();
  });

  test("reports an unexpected close after connecting", async () => {
    const onUnexpectedClose = jest.fn();
    const client = new McpClient("test-server", "workspace", onUnexpectedClose);
    let onClose: (() => void) | undefined;
    connectSpy = mockSdkConnect(async function () {
      onClose = this.onclose?.bind(this);
    });

    await client.connect(httpTransport);
    onClose!();

    expect(client.isConnected).toBe(false);
    expect(onUnexpectedClose).toHaveBeenCalledTimes(1);
  });

  test("does not report an intentional disconnect as a transport failure", async () => {
    const onUnexpectedClose = jest.fn();
    const client = new McpClient("test-server", "workspace", onUnexpectedClose);
    connectSpy = mockSdkConnect(async () => {});
    const closeSpy = spyOn(Client.prototype, "close").mockImplementation(
      async function (this: Client) {
        this.onclose?.();
      },
    );

    await client.connect(httpTransport);
    try {
      await client.disconnect();
    } finally {
      closeSpy.mockRestore();
    }

    expect(client.isConnected).toBe(false);
    expect(onUnexpectedClose).not.toHaveBeenCalled();
  });
});

describe("McpOAuthProvider redirectUrl", () => {
  test("redirectUrl is undefined until startCallbackServer() is called", () => {
    const nonInteractive = new McpOAuthProvider(
      "test-server",
      "https://example.com/mcp",
      /* interactive */ false,
    );
    expect(nonInteractive.redirectUrl).toBeUndefined();

    const interactive = new McpOAuthProvider(
      "test-server",
      "https://example.com/mcp",
      /* interactive */ true,
    );
    expect(interactive.redirectUrl).toBeUndefined();
  });
});
