/**
 * Tests for the zcode-rpc facade adapter and the disclosed skeletons.
 *
 * W0-B / BOOT-003 — node:test, zero new dependencies.
 * The facade is exercised against a structurally-compatible fake channel
 * (the facade holds only a type-level dependency on @zcode/rpc, so any
 * call/listen-compatible object drives it; the test deliberately does NOT
 * import @zcode/rpc — the boundary rules allow @zcode imports only inside
 * src/adapters/**, and the fake still typechecks against the facade's
 * IChannel parameter structurally). The skeletons must throw
 * SubstrateAdapterNotBoundError naming their follow-up work items.
 */

import { deepEqual, equal, ok, rejects, throws } from "node:assert/strict";
import test from "node:test";
import {
  createZcodeChannelRpcPort,
  RpcTimeoutError,
  SubstrateAdapterNotBoundError,
  UnboundAgentRuntimeAdapter,
  UnboundPermissionsAdapter,
  UnboundSessionEventsAdapter,
  UnboundToolsAdapter,
} from "../src/index.ts";

interface FakeChannelState {
  calls: Array<{ command: string; arg?: unknown }>;
  listeners: Map<string, Set<(payload: unknown) => void>>;
}

/** Structural stand-in for the zcode IChannel surface the facade uses. */
interface FakeChannel {
  call<T>(command: string, arg?: unknown): Promise<T>;
  listen<T>(event: string): (listener: (payload: T) => void) => { dispose(): void };
}

function fakeChannel(
  handlers: Record<string, (arg?: unknown) => unknown>,
): {
  channel: FakeChannel;
  state: FakeChannelState;
  emit: (event: string, payload: unknown) => void;
} {
  const state: FakeChannelState = { calls: [], listeners: new Map() };
  const channel: FakeChannel = {
    async call<T>(command: string, arg?: unknown): Promise<T> {
      state.calls.push({ command, arg });
      const handler = handlers[command];
      if (!handler) {
        throw new Error(`no fake handler for "${command}"`);
      }
      return handler(arg) as T;
    },
    listen<T>(event: string) {
      const set = state.listeners.get(event) ?? new Set();
      state.listeners.set(event, set);
      return (listener: (payload: T) => void) => {
        set.add(listener as (payload: unknown) => void);
        return {
          dispose() {
            set.delete(listener as (payload: unknown) => void);
          },
        };
      };
    },
  };
  const emit = (event: string, payload: unknown) => {
    for (const listener of state.listeners.get(event) ?? []) {
      listener(payload);
    }
  };
  return { channel, state, emit };
}

test("facade: request delegates to channel.call with method and params", async () => {
  const { channel, state } = fakeChannel({ echo: (arg) => arg });
  const port = createZcodeChannelRpcPort(channel);
  const result = await port.request<unknown>("echo", { value: 42 });
  deepEqual(result, { value: 42 });
  equal(state.calls.length, 1);
  equal(state.calls[0]?.command, "echo");
  deepEqual(state.calls[0]?.arg, { value: 42 });
});

test("facade: request without params passes undefined", async () => {
  const { channel, state } = fakeChannel({ ping: () => "pong" });
  const port = createZcodeChannelRpcPort(channel);
  equal(await port.request<string>("ping"), "pong");
  deepEqual(state.calls[0]?.arg, undefined);
});

test("facade: request rejects with channel errors (propagation)", async () => {
  const { channel } = fakeChannel({
    fail: () => {
      throw new Error("substrate boom");
    },
  });
  const port = createZcodeChannelRpcPort(channel);
  await rejects(port.request("fail"), /substrate boom/);
});

test("facade: timeoutMs rejects with RpcTimeoutError and leaves call running", async () => {
  const { channel, state } = fakeChannel({ hang: () => new Promise(() => {}) });
  const port = createZcodeChannelRpcPort(channel);
  await rejects(port.request("hang", undefined, { timeoutMs: 25 }), RpcTimeoutError);
  equal(state.calls.length, 1);
});

test("facade: onNotification delivers channel events until disposed", async () => {
  const { channel, emit } = fakeChannel({});
  const port = createZcodeChannelRpcPort(channel);
  const received: unknown[] = [];
  const subscription = port.onNotification<unknown>("session-events", (payload) => {
    received.push(payload);
  });
  emit("session-events", { seq: 1 });
  emit("session-events", { seq: 2 });
  subscription.dispose();
  emit("session-events", { seq: 3 });
  deepEqual(received, [{ seq: 1 }, { seq: 2 }]);
});

test("facade: subscription dispose is idempotent", () => {
  const { channel, emit } = fakeChannel({});
  const port = createZcodeChannelRpcPort(channel);
  const subscription = port.onNotification<unknown>("e", () => {});
  subscription.dispose();
  subscription.dispose();
  emit("e", null);
});

test("skeletons: constructing throws SubstrateAdapterNotBoundError naming follow-up work items", () => {
  const cases: ReadonlyArray<[string, new () => unknown, RegExp]> = [
    ["UnboundAgentRuntimeAdapter", UnboundAgentRuntimeAdapter, /AGT-002/],
    ["UnboundSessionEventsAdapter", UnboundSessionEventsAdapter, /AGT-003/],
    ["UnboundPermissionsAdapter", UnboundPermissionsAdapter, /AGT-001/],
    ["UnboundToolsAdapter", UnboundToolsAdapter, /AGT-001/],
  ];
  for (const [name, Adapter, workItem] of cases) {
    throws(
      () => new Adapter(),
      (error: unknown) => {
        ok(error instanceof SubstrateAdapterNotBoundError, `${name} threw wrong error`);
        equal(error.code, "MOS_SUBSTRATE_ADAPTER_NOT_BOUND");
        ok(workItem.test(error.message), `${name} message names follow-up work item`);
        ok(
          error.message.includes("W0-B / BOOT-003"),
          `${name} message names the interface-stage source`,
        );
        return true;
      },
    );
  }
});

test("skeletons: methods stay unbound even if construction is bypassed", () => {
  // Object.create bypasses the throwing constructor; every method must
  // still refuse to operate (defense in depth for the disclosed stubs).
  // Methods throw synchronously (they never reach a substrate call), so
  // these are `throws`, not `rejects`.
  const agentRuntime = Object.create(UnboundAgentRuntimeAdapter.prototype) as InstanceType<
    typeof UnboundAgentRuntimeAdapter
  >;
  throws(() => agentRuntime.start({ agentBodyRef: "x" }), SubstrateAdapterNotBoundError);
  throws(
    () => agentRuntime.execute({ runtimeId: "r", input: "in" }),
    SubstrateAdapterNotBoundError,
  );
  throws(() => agentRuntime.stop("r"), SubstrateAdapterNotBoundError);
  const tools = Object.create(UnboundToolsAdapter.prototype) as InstanceType<
    typeof UnboundToolsAdapter
  >;
  throws(
    () => tools.invokeTool({ toolName: "x", input: null }),
    SubstrateAdapterNotBoundError,
  );
  throws(
    () => tools.registerTool({ name: "x", inputSchema: { type: "object" } }, async () => null),
    SubstrateAdapterNotBoundError,
  );
  throws(() => tools.listTools(), SubstrateAdapterNotBoundError);
  const permissions = Object.create(UnboundPermissionsAdapter.prototype) as InstanceType<
    typeof UnboundPermissionsAdapter
  >;
  throws(
    () => permissions.check({ principal: "p", action: "a", scope: "s" }),
    SubstrateAdapterNotBoundError,
  );
  throws(
    () => permissions.grant({ principal: "p", action: "a", scope: "s" }),
    SubstrateAdapterNotBoundError,
  );
  throws(() => permissions.revoke("g"), SubstrateAdapterNotBoundError);
  const sessions = Object.create(UnboundSessionEventsAdapter.prototype) as InstanceType<
    typeof UnboundSessionEventsAdapter
  >;
  throws(() => sessions.openSession({ tenantId: "t" }), SubstrateAdapterNotBoundError);
  throws(() => sessions.closeSession("s"), SubstrateAdapterNotBoundError);
  throws(() => sessions.subscribe("s", () => {}), SubstrateAdapterNotBoundError);
});
