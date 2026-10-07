/**
 * RpcPort facade over `@zcode/rpc` channel types.
 *
 * MOS v2.0 (W0-B / BOOT-003). This is a thin, type-level facade: the only
 * `@zcode/*` import is a TYPE-ONLY import from the allowlisted package
 * ENTRY name `@zcode/rpc` (never a deep import), so this module has no
 * runtime dependency on the substrate at all. It is genuinely usable: hand
 * it any real `IChannel` (in-process, IPC, WebSocket remote — see
 * `@zcode/rpc` layers 3–6) and the returned port performs real
 * request/response calls and event subscriptions through it.
 *
 * Facade scope (deliberately narrow — disclosed):
 * - `request` maps to `channel.call` (with optional caller-side timeout).
 * - `onNotification` maps to `channel.listen` and wraps the zcode `Event<T>`
 *   subscription into an MOS `RpcSubscription`.
 * - Server-side request handling (IServerChannel/IPCServer registration)
 *   and cancellation tokens are NOT facaded at this stage; they belong to
 *   the composition root and to a follow-up when a domain consumer needs
 *   them. Outbound fire-and-forget notifications have no zcode channel
 *   primitive and are therefore absent from the port itself.
 */

import type { IChannel } from "@zcode/rpc";
import type {
  JsonValue,
  RpcCallOptions,
  RpcNotificationListener,
  RpcPort,
  RpcSubscription,
} from "../ports/rpc.port.ts";
import { RpcTimeoutError } from "../ports/rpc.port.ts";

/**
 * Create an {@link RpcPort} facade over a zcode `IChannel`.
 *
 * @param channel Any `@zcode/rpc` channel (obtained e.g. from an
 *        `IChannelClient.getChannel(name)` or an in-process channel pair).
 *        Only referenced at the type level; the facade performs plain
 *        method calls on it at runtime.
 */
export function createZcodeChannelRpcPort(channel: IChannel): RpcPort {
  return {
    request<Res>(
      method: string,
      params?: JsonValue,
      options?: RpcCallOptions,
    ): Promise<Res> {
      const underlying = channel.call<Res>(method, params);
      const timeoutMs = options?.timeoutMs;
      if (timeoutMs === undefined) {
        return underlying;
      }
      return Promise.race([
        underlying,
        new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(
            () => reject(new RpcTimeoutError(method, timeoutMs)),
            timeoutMs,
          );
          // Do not keep the process alive just for the timeout race.
          timer.unref();
        }),
      ]);
    },

    onNotification<T>(
      event: string,
      listener: RpcNotificationListener<T>,
    ): RpcSubscription {
      const zcodeEvent = channel.listen<T>(event);
      const disposable = zcodeEvent(listener);
      return {
        dispose() {
          disposable.dispose();
        },
      };
    },
  };
}
