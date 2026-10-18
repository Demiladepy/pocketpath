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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <button type="button" className="wordmark" onClick={goHome}>
            PocketPaths
            <span className="sr-only">, your paths</span>
          </button>
          {active && view !== "home" && view !== "create" ? (
            <p className="current-path">{active.title}</p>
          ) : (
            <p className="current-path">Saved on this device</p>
          )}
          {saveStatus ? (
            <p className="save-status" role="status">
              {saveStatus}
            </p>
          ) : null}
          <div className="topbar-actions">
            <Button icon={Undo2} variant="secondary" onClick={undo} disabled={!canUndo}>
              Undo
            </Button>
            <Button icon={Redo2} variant="secondary" onClick={redo} disabled={!canRedo}>
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
