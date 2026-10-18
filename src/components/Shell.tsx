import { Redo2, Settings, Undo2 } from "lucide-react"
import type { ReactNode } from "react"
import { usePreferences } from "../state/PreferencesContext.tsx"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "./Button.tsx"

export function Shell({ children }: { children: ReactNode }) {
  const {
    notice,
    message,
    saveStatus,
    canUndo,
    canRedo,
    undoConflict,
    dismissNotice,
    undo,
    redo,
    skipUndo,
    showUndoCard,
    goHome,
    goSettings,
    active,
    view,
  } = useWorkspace()
  const { preferenceNotice, dismissPreferenceNotice } = usePreferences()
  const banner = notice ?? preferenceNotice
  const onHome = view === "home"

  return (
    <div className={`app-shell${onHome ? " app-shell-home" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <p className="edge-label" aria-hidden="true">
        PocketPaths · local
      </p>
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="brand-lockup" onClick={goHome}>
            <img className="brand-mark" src="/logo.svg" width={36} height={36} alt="" />
            <span className="wordmark">
              PocketPaths
              <span className="sr-only">, your paths</span>
            </span>
          </button>
          {active && view !== "home" && view !== "create" ? (
            <p className="current-path">{active.title}</p>
          ) : (
            <p className="current-path">{onHome ? "On this device" : "Saved on this device"}</p>
          )}
          {saveStatus ? (
            <p className="save-status" role="status">
              {saveStatus}
            </p>
          ) : null}
          <div className="topbar-actions">
            <Button icon={Undo2} variant="quiet" onClick={undo} disabled={!canUndo} aria-label="Undo">
              Undo
            </Button>
            <Button icon={Redo2} variant="quiet" onClick={redo} disabled={!canRedo} aria-label="Redo">
              Redo
            </Button>
            <Button icon={Settings} variant="secondary" onClick={goSettings}>
              Settings
            </Button>
          </div>
        </div>
      </header>
      {banner ? (
        <div className="banner" role="status">
          <p>{banner}</p>
          <Button
            variant="quiet"
            onClick={() => {
              dismissNotice()
              dismissPreferenceNotice()
            }}
          >
            Dismiss
          </Button>
        </div>
      ) : null}
      <main id="main" className="page">
        {message ? (
          <p className="message" role="status">
            {message}
          </p>
        ) : null}
        {undoConflict ? (
          <div className="action-row">
            {undoConflict.itemId ? (
              <Button variant="secondary" onClick={showUndoCard}>
                Open the card
              </Button>
            ) : null}
            <Button variant="secondary" onClick={skipUndo}>
              Skip this step
            </Button>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  )
}
