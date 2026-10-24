import { DatabaseStartupAdmission } from "./databaseStartupAdmission.js";
import { MosDatabaseStartupScreen } from "./mosDatabaseStartupScreen.js";
import { initializeDesktopLocalTtft } from "./localTtftBootstrap.js";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import {
  AppErrorBoundary,
  UpdateStatusWindowRoot,
  registerBaseWorkspaceServices,
  registerRemoteWorkspaceSession,
  createRemoteWorkspaceDisconnectedError,
  playTaskNotificationSound,
  setStreamClientId,
  setReactErrorArmsReporter,
} from "@zcode/ui";
import "@zcode/ui/styles.css";
import { connectViaMessagePort, createMessagePortServiceConnection } from "@zcode/client";
import {
  InternalChannels,
  databaseStartupStateSchema,
  type DatabaseStartupControl,
  collectTelemetryRendererContext,
  parseLaunchMarks,
  LAUNCH_MARKS_QUERY_KEY,
  type LaunchMarks,
  DEFAULT_LOCALE,
} from "@zcode/shared";
import type { Locale } from "@zcode/shared";
import type { IServiceAccessor } from "@zcode/services";
import { syncAppTelemetryContext } from "../appTelemetryBridge.js";
import { createDesktopPlatform } from "./desktopPlatform.js";
import { createSubstrateSurfaceHost } from "./substrateSurface.js";
import { startPerformanceTimelineCleanup } from "./performanceTimelineCleanup.js";
import { initializeDesktopUserActionTrace } from "./userActionTraceBootstrap.js";
import { buildRemoteWorkspaceSessionServices } from "./remoteWorkspaceSessionServices.js";
import {
  notifyRemoteWorkspaceServicePortReady,
  parseRemoteWorkspaceServicePortMessage,
  type RemoteWorkspaceServicePortRegistration,
} from "./remoteWorkspaceServicePortBridge.js";

type DesktopRendererImportMetaEnv = {
  VITE_ZCODE_E2E_STORE_BRIDGE?: string;
};

startPerformanceTimelineCleanup();

// T4:renderer bundle 开始执行。同时从 loadURL query 解析 main 注入的 T0-T3。
const rendererStartedAt = Date.now();
const launchMarks: LaunchMarks | null = parseLaunchMarks(
  new URLSearchParams(window.location.search).get(LAUNCH_MARKS_QUERY_KEY),
);
(
  window as Window & {
    __ZCODE_RENDERER_START__?: number;
    __ZCODE_LAUNCH_MARKS__?: LaunchMarks | null;
  }
).__ZCODE_RENDERER_START__ = rendererStartedAt;
(window as Window & { __ZCODE_LAUNCH_MARKS__?: LaunchMarks | null }).__ZCODE_LAUNCH_MARKS__ =
  launchMarks;
registerE2EStoreBridgesIfEnabled();

function registerE2EStoreBridgesIfEnabled() {
  const env = ((import.meta as ImportMeta & { env?: DesktopRendererImportMetaEnv }).env ??
    {}) as DesktopRendererImportMetaEnv;
  if (env.VITE_ZCODE_E2E_STORE_BRIDGE !== "1") {
    return;
  }

  void import("@zcode/ui/e2e-store-bridge").then(({ registerE2EStoreBridges }) => {
    registerE2EStoreBridges();
  });
}

// 初始化主题：默认 Zai dark，后续由 useTheme hook 接管
{
  const saved = localStorage.getItem("zcode-theme") || "zai-dark";
  const resolved =
    saved === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : saved === "dark" || saved === "zai-dark"
        ? "dark"
        : "light";
  const appliedTheme =
    saved === "system"
      ? resolved === "dark"
        ? "zai-dark"
        : "zai-light"
      : saved === "dark"
        ? "zai-dark"
        : saved === "light"
          ? "zai-light"
          : saved;
  if (resolved === "dark") document.documentElement.classList.add("dark");
  document.documentElement.classList.toggle("theme-zai-light", appliedTheme === "zai-light");
  document.documentElement.classList.toggle("theme-zai-dark", appliedTheme === "zai-dark");
}

const isMacDesktop = navigator.userAgent.includes("Mac");
const isWindowsDesktop = navigator.userAgent.includes("Windows");
const isLinuxDesktop = !isMacDesktop && !isWindowsDesktop;
// macOS hidden 原生标题栏仍参与鼠标拖拽命中，深层浮层需要平台标记避开其高度。
document.documentElement.classList.toggle("platform-mac-desktop", isMacDesktop);
// Windows 的原生 titleBarOverlay 与 renderer 共用右上角，深层浮层拿不到
// Root 的 isWindowsDesktop prop 时会把关闭按钮放进原生窗控命中区。根节点平台标记只描述
// Desktop chrome，不会让普通 Windows Web 误用标题栏安全区。
document.documentElement.classList.toggle("platform-windows-desktop", isWindowsDesktop);
// Linux 的窗口标题栏由 renderer 自绘，应用内 Dialog overlay 如果覆盖整个 webContents，
// 会把标题栏点击区一起拦截。给桌面 Linux 根节点打平台标记，让 UI overlay 能只在 Linux 避开标题栏。
document.documentElement.classList.toggle("platform-linux-desktop", isLinuxDesktop);
const isLocalDevelopmentRuntime =
  (globalThis as typeof globalThis & { __ZCODE_LOCAL_DEVELOPMENT_RUNTIME__?: boolean })
    .__ZCODE_LOCAL_DEVELOPMENT_RUNTIME__ === true;

function readStringFlag(name: string): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return value == null || value.trim() === "" ? undefined : value;
}

function readBooleanFlag(name: string, fallback: boolean): boolean {
  const value = new URLSearchParams(window.location.search).get(name);
  if (value === null) return fallback;
  return value === "true" || value === "1";
}

const windowKind = readStringFlag("windowKind");
const initialLocaleFlag = readStringFlag("locale");
// The AGENT WORKBENCH host flags (the substrate Root's original mount
// contract, verbatim from the pre-swap boot): session restore, the
// settings capability, and the launch workspace descriptors the main
// process passes on the load URL.
const restoreSession = readBooleanFlag("restoreSession", true);
const supportsSettings = readBooleanFlag("supportsSettings", true);
const initialWorkspaceAbsPath = readStringFlag("initialWorkspacePath");
const initialWorkspacePurposeFlag = readStringFlag("initialWorkspacePurpose");
const unavailableWorkspacePath = readStringFlag("unavailableWorkspacePath");
const initialLocale: Locale =
  initialLocaleFlag === "zh-CN" || initialLocaleFlag === "en-US"
    ? initialLocaleFlag
    : DEFAULT_LOCALE;
let baseServicesForRemoteSessions: IServiceAccessor | null = null;
const pendingRemoteWorkspaceServicePorts: RemoteWorkspaceServicePortRegistration[] = [];

const desktopPlatform = createDesktopPlatform({ isLocalDevelopmentRuntime });
initializeDesktopLocalTtft(desktopPlatform);
initializeDesktopUserActionTrace({
  platform: desktopPlatform,
  isLocalDevelopmentRuntime,
});

/**
 * 等待 preload 通过 window.postMessage 转发 MessagePort。
 *
 * MessagePort 不能经过 contextBridge（会丢失原生方法），
 * 所以 preload 用 window.postMessage + transfer 把 port 原样传递到 renderer。
 * 本地窗口的 port 来自 utilityProcess，远程窗口也一样，renderer 无需区分。
 */
// 之前用匿名函数注册 addEventListener("message")，reload/HMR 时会重复注册，
// 导致多次 createRoot 在同一 DOM 节点上挂载。用 flag 防止重复初始化。
let appInitialized = false;
const databaseStartupAdmission = new DatabaseStartupAdmission();
const appRoot =
  windowKind === "update-status" ? null : createRoot(document.getElementById("root")!);
const sendStartupControl = (control: DatabaseStartupControl) =>
  window.postMessage({ type: InternalChannels.DatabaseStartupControl, control }, "*");
function renderDatabaseStartup(): void {
  appRoot?.render(
    <MosDatabaseStartupScreen
      state={databaseStartupAdmission.state}
      onRetry={() => {
        if (databaseStartupAdmission.state)
          sendStartupControl({
            action: "retry",
            attemptId: databaseStartupAdmission.state.attemptId,
          });
      }}
      onCopy={(details) => navigator.clipboard.writeText(details)}
      onExit={() => sendStartupControl({ action: "exit" })}
    />,
  );
}
function enterAppIfPrepared(): void {
  if (appInitialized) return;
  const port = databaseStartupAdmission.takeReadyPort();
  if (port) initializeBusinessRoot(port);
}
const firstStartupStateTimer =
  windowKind === "update-status"
    ? undefined
    : setTimeout(() => {
        if (databaseStartupAdmission.state) return;
        const now = Date.now();
        databaseStartupAdmission.state = {
          schemaVersion: 1,
          startupId: "unavailable",
          attemptId: "startup-channel-unavailable",
          sequence: 0,
          startedAt: rendererStartedAt,
          updatedAt: now,
          phase: "failed",
          errorCode: "startup_status_timeout",
          disk: [],
        };
        renderDatabaseStartup();
      }, 30_000);

function registerRemoteWorkspaceServicePort(params: RemoteWorkspaceServicePortRegistration) {
  if (!baseServicesForRemoteSessions) {
    return;
  }

  const remoteConnection = createMessagePortServiceConnection(params.port);
  const remoteServices = remoteConnection.services;
  const services = buildRemoteWorkspaceSessionServices(
    baseServicesForRemoteSessions,
    remoteServices,
  );
  registerRemoteWorkspaceSession({
    sessionId: params.sessionId,
    target: params.target,
    services,
    dispose: (reason) =>
      remoteConnection.dispose(reason ?? createRemoteWorkspaceDisconnectedError()),
  });
  // canonical workspace bind 会换代 remote-scoped port。
  // 只有 store 已注册新 services 后才能确认 ready，bind IPC 返回后的调用方才可重新读取并使用新代 services。
  notifyRemoteWorkspaceServicePortReady(params);
}

function flushPendingRemoteWorkspaceServicePorts(): void {
  if (!baseServicesForRemoteSessions || pendingRemoteWorkspaceServicePorts.length === 0) {
    return;
  }

  const pending = pendingRemoteWorkspaceServicePorts.splice(0);
  for (const entry of pending) {
    registerRemoteWorkspaceServicePort(entry);
  }
}

function StartupReadyNotifier() {
  useEffect(() => {
    // T5:React 首次 commit。供启动分阶段耗时计算 react_commit 段。
    (window as Window & { __ZCODE_REACT_COMMIT_AT__?: number }).__ZCODE_REACT_COMMIT_AT__ =
      Date.now();
    // HTML 启动壳的弹出动画结束时，React 首屏可能还没 commit，直接移除壳会露出空白。
    // 这里在 React commit 后通知 index.html，再由启动壳统一判断动画和 React ready 两个条件后退场。
    window.dispatchEvent(new Event("zcode-react-startup-ready"));
  }, []);

  return null;
}

function handleServicePortMessage(event: MessageEvent): void {
  if (event.source === window && event.data?.type === InternalChannels.DatabaseStartupState) {
    const result = databaseStartupStateSchema.safeParse(event.data.state);
    if (!result.success || appInitialized) return;
    const next = result.data;
    if (!databaseStartupAdmission.acceptState(next)) return;
    if (firstStartupStateTimer) clearTimeout(firstStartupStateTimer);
    renderDatabaseStartup();
    enterAppIfPrepared();
    return;
  }

  if (event.data === InternalChannels.TaskNotificationSound) {
    void playTaskNotificationSound();
    return;
  }

  const remoteWorkspacePort = parseRemoteWorkspaceServicePortMessage(event);
  if (remoteWorkspacePort) {
    if (!baseServicesForRemoteSessions) {
      // renderer reload 时 main 可能先补投 remote port，再投本地 ServicePort。
      // 早到的 remote port 不能直接丢弃，否则 SSH host 仍存活但 UI 会进入断连代理。
      pendingRemoteWorkspaceServicePorts.push(remoteWorkspacePort);
      return;
    }

    registerRemoteWorkspaceServicePort(remoteWorkspacePort);
    return;
  }

  if (
    event.source !== window ||
    event.data?.type !== InternalChannels.ServicePort ||
    appInitialized
  )
    return;
  const port = event.ports[0];
  if (!port) return;
  databaseStartupAdmission.acceptPort({ databaseStartupId: event.data.databaseStartupId }, port);
  enterAppIfPrepared();
}

function initializeBusinessRoot(port: MessagePort): void {
  appInitialized = true;
  const services = connectViaMessagePort(port);
  baseServicesForRemoteSessions = services;
  registerBaseWorkspaceServices(services);
  flushPendingRemoteWorkspaceServicePorts();

  syncAppTelemetryContext({
    bridge: {
      syncTelemetryContext: (context) => window.zcode.syncTelemetryContext(context),
    },
    createRendererContext: collectTelemetryRendererContext,
  });

  // 初始化稳定的设备 ID，确保所有 hook 在首次渲染前就使用正确的值
  setStreamClientId(desktopPlatform.getDeviceId());

  // React 错误边界捕获的异常不会冒泡到 window.onerror，RUM Browser SDK 默认收不到。
  // 必须在 createRoot 之前注入 reporter：根级 AppErrorBoundary 的职责正是兜住根组件
  // 自身渲染崩溃，若依赖组件的 effect 注入，首帧就崩时上报会丢失。
  setReactErrorArmsReporter(desktopPlatform);

  // AGENT WORKBENCH host (the owner's build-ON-ZCode directive): the
  // renderer hosts TWO product surfaces in #root — the MOS shell (mounted
  // by the @mos/desktop entry into the host's mos-surface container) and,
  // lazily on the first /workbench* route, the ORIGINAL substrate UI
  // (@zcode/ui Root — sessions/groups/projects workspace, Automations,
  // Settings, and every other substrate capability) in the
  // substrate-surface container. Both stay mounted once created: switching
  // is instant and state on either side survives. The substrate tree is
  // mounted with the EXACT pre-swap mount contract (ZCodeIntlProvider +
  // Root with the launch flags) so its own theme/locale/session services
  // behave exactly as they did before the MOS shell swap.
  const hostRootElement = document.getElementById("root");
  if (!hostRootElement) {
    throw new Error("renderer root element missing at business initialization");
  }
  // The database-startup admission screen (rendered through appRoot) is
  // superseded by the two-surface layout; clear it so only the live
  // surfaces remain under #root.
  appRoot?.render(null);
  let mosShellController: { resumeMosSurface(): void } | null = null;
  const substrateHost = createSubstrateSurfaceHost({
    rootElement: hostRootElement,
    services,
    platform: desktopPlatform,
    isMacDesktop,
    isWindowsDesktop,
    restoreSession,
    supportsSettings,
    initialWorkspaceAbsPath,
    initialWorkspacePurpose:
      initialWorkspacePurposeFlag === "conversation" ? "conversation" : "project",
    unavailableWorkspacePath,
    onBackToMos: () => {
      substrateHost.hideSubstrateSurface();
      mosShellController?.resumeMosSurface();
    },
  });

  // MOS 产品表面（desktop shell swap）：主窗口挂载 @mos/desktop 的 MOS shell
  // （与浏览器 shell 相同的 mos-web 路由组件树 + 桌面平台端口 + 生产 composition
  // root），替代此前的 @zcode/ui Root 编码产品表面。substrate 生命周期全部保留：
  // database-startup 握手已在上方完成，remote-workspace 服务端口继续注册消费，
  // telemetry/ARMS 引导不变。update-status 窗口分支仍渲染 @zcode/ui 的
  // UpdateStatusWindowRoot（见文件尾）。AGENT WORKBENCH：substrate Root 不再被
  // 丢弃 —— 它由上方两表面宿主按需挂载，从 MOS 导轨的 Agent Workbench 分组进入。
  void import("@mos/desktop/mos-desktop-entry.jsx").then(
    ({ bootMosDesktopShell }) => {
      mosShellController = bootMosDesktopShell({
        rootElement: substrateHost.mosSurfaceElement,
        onFirstReactCommit: () => {
          // T5:React 首次 commit（MOS shell 首帧）。供启动分阶段耗时计算 react_commit 段。
          (
            window as Window & { __ZCODE_REACT_COMMIT_AT__?: number }
          ).__ZCODE_REACT_COMMIT_AT__ = Date.now();
          // HTML 启动壳等待 React ready 后退场（见 index.html 的启动壳脚本）。
          window.dispatchEvent(new Event("zcode-react-startup-ready"));
        },
        shellVersion: __ZCODE_VERSION__,
        // The Agent Workbench handoff: /workbench* routes mount the substrate
        // surface behind the MOS chrome (see substrateSurface.tsx).
        onRequestSubstrateSurface: (surface) => {
          substrateHost.showSubstrateSurface(surface);
        },
        // The return handoff: MOS-side navigation to a NON-workbench route
        // (rail clicks while the substrate shows, composer intents, link
        // bridges) dismisses the substrate so the title never lies about
        // which surface is visible. Idempotent — a no-op when the MOS
        // surface is already showing (the common case).
        onRequestMosSurface: () => {
          substrateHost.ensureMosSurfaceVisible();
        },
      });
    },
    (error: unknown) => {
      // 显式失败，绝不静默空白：MOS shell 模块加载失败时主窗口呈现明确的错误面。
      appRoot?.render(
        <AppErrorBoundary isDesktop isMacDesktop={isMacDesktop} isWindowsDesktop={isWindowsDesktop}>
          <div
            role="alert"
            style={{
              display: "flex",
              minHeight: "100vh",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem",
              color: "#b91c1c",
              background: "#f8fafc",
              fontFamily: "system-ui, sans-serif",
              textAlign: "center",
            }}
          >
            <div>
              <h1 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
                MOS failed to start
              </h1>
              <p style={{ fontSize: "0.875rem", opacity: 0.8 }}>
                The MOS desktop shell could not be loaded:{" "}
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          </div>
        </AppErrorBoundary>,
      );
    },
  );
}

window.addEventListener("message", handleServicePortMessage);
if (windowKind !== "update-status") {
  renderDatabaseStartup();
  sendStartupControl({ action: "snapshot" });
}

if (windowKind === "update-status") {
  createRoot(document.getElementById("root")!).render(
    <AppErrorBoundary isDesktop isMacDesktop={isMacDesktop} isWindowsDesktop={isWindowsDesktop}>
      <StartupReadyNotifier />
      <UpdateStatusWindowRoot
        platform={desktopPlatform}
        initialLocale={initialLocale}
        onRequestClose={() => window.close()}
      />
    </AppErrorBoundary>,
  );
}
