import { useEffect } from "react";
import type { DatabaseStartupState } from "@zcode/shared";

/**
 * MOS-owned database startup admission screen (the product-shell swap).
 *
 * The substrate lifecycle (DatabaseStartupAdmission + the MessagePort
 * handshake with the electron main process) is retained VERBATIM; only the
 * VISIBLE surface changes: the main window's startup phase presents MOS
 * product identity — "MOS — Marketing Operating System" — instead of the
 * inherited ZCode coding-product chrome. Every phase of the admission
 * state machine renders explicitly (initializing → migrating → ready
 * hand-off), failures render the structured error code with the SAME
 * controls the substrate screen offered (retry / copy details / exit),
 * and no ZCode product language appears on the path.
 */

const PHASE_LABELS: Record<DatabaseStartupState["phase"], string> = {
  initializing: "Preparing the MOS workspace database…",
  migrating: "Applying MOS database migrations…",
  ready: "Starting the MOS surface…",
  failed: "MOS could not start its workspace database.",
};

const ERROR_HINTS: Partial<Record<DatabaseStartupState["errorCode"], string>> = {
  storage_full: "The storage device is full. Free up space and retry.",
  permission_denied:
    "The MOS data directory is not writable by this user. Check the directory permissions and retry.",
  io_error: "A storage I/O error occurred while opening the MOS database. Retry after checking the device.",
  out_of_memory: "The system ran out of memory while starting the MOS database. Close other applications and retry.",
  corrupt: "The MOS database failed an integrity check. The startup diagnostics below name the exact failure.",
  open_failed: "The MOS database could not be opened. The startup diagnostics below name the exact failure.",
  lock_timeout:
    "Another MOS process is still holding the database write lock. Wait for it to finish, then retry.",
  checksum_mismatch: "A MOS database file failed its checksum verification. The startup diagnostics below name the file.",
  sql_failed: "A database statement failed while starting MOS. The startup diagnostics below carry the detail.",
  startup_status_timeout:
    "The MOS database did not report its startup status in time. Retry; if it persists, consult the diagnostics below.",
  transport_closed: "The connection to the MOS database process closed during startup. Retry.",
  unsupported_runtime:
    "This environment does not satisfy the MOS database runtime requirements. The diagnostics below carry the detail.",
};

/**
 * The MOS startup admission surface. Renders the admission state machine's
 * phases; `phase === "ready"` never renders here (the admission hands the
 * window to the MOS shell instead — see main.tsx's enterAppIfPrepared).
 */
export function MosDatabaseStartupScreen({
  state,
  onRetry,
  onCopy,
  onExit,
}: {
  readonly state: DatabaseStartupState | null;
  readonly onRetry: () => void;
  readonly onCopy: (details: string) => void;
  readonly onExit: () => void;
}) {
  useEffect(() => {
    document.title = "MOS — Marketing Operating System";
  }, []);

  const failed = state?.phase === "failed";
  const label = state ? PHASE_LABELS[state.phase] : PHASE_LABELS.initializing;
  const details = state ? JSON.stringify(state, null, 2) : "";

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "2rem",
        background: "#020617",
        color: "#e2e8f0",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
      role={failed ? "alert" : "status"}
      data-testid="mos-database-startup-screen"
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "0.02em" }}>
        MOS — Marketing Operating System
      </h1>
      <p style={{ fontSize: "0.9rem", opacity: failed ? 1 : 0.75, textAlign: "center", maxWidth: "34rem" }}>
        {label}
        {failed && state?.errorCode && ERROR_HINTS[state.errorCode] ? ` ${ERROR_HINTS[state.errorCode]}` : ""}
      </p>
      {failed ? (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #34d399",
              background: "rgba(16, 185, 129, 0.15)",
              color: "#a7f3d0",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Retry startup
          </button>
          <button
            type="button"
            onClick={() => onCopy(details)}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #475569",
              background: "transparent",
              color: "#cbd5e1",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Copy diagnostics
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #475569",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: "0.875rem",
            }}
          >
            Exit
          </button>
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: "2.25rem",
            height: "2.25rem",
            borderRadius: "9999px",
            border: "2px solid rgba(52, 211, 153, 0.25)",
            borderTopColor: "#34d399",
            animation: "mos-startup-spin 0.9s linear infinite",
          }}
        />
      )}
      <style>{`@keyframes mos-startup-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
