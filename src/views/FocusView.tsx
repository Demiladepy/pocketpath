import { useEffect } from "react"
import { ArrowLeft, ArrowRight, Check, Link2, Square, Volume2, X } from "lucide-react"
import { focusProgress } from "../domain/focus.ts"
import { TYPE_LABELS } from "../domain/labels.ts"
import { byPosition } from "../domain/order.ts"
import { useSpeech } from "../hooks/useSpeech.ts"
import { usePreferences } from "../state/PreferencesContext.tsx"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { StatusBadge, TypeBadge } from "../components/StatusBadge.tsx"

export function FocusView() {
  const { active, exitFocus, completeCurrent, moveStep, goHome } = useWorkspace()
  const { preferences } = usePreferences()
  const { supported, speaking, speak, stop } = useSpeech()

  const progress = active ? focusProgress(active.items, active.currentItemId) : null
  const current = progress?.current ?? null
  const related = current
    ? byPosition(active?.items.filter((item) => current.linkedItemIds.includes(item.id)) ?? [])
    : []
  const speechText = current
    ? `${TYPE_LABELS[current.type]}. ${current.title}. ${current.description}`
    : ""

  useEffect(() => {
    if (!preferences.readAloudEnabled || !speechText) return
    speak(speechText)
    return () => stop()
  }, [current?.id, preferences.readAloudEnabled, speak, speechText, stop])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return
      if (event.key === "ArrowRight") {
        event.preventDefault()
        moveStep(1)
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        moveStep(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [moveStep])

  if (!active || !progress) {
    return (
      <div className="stack">
        <h1>Nothing to focus on</h1>
        <Button variant="primary" onClick={goHome}>
          Go to your paths
        </Button>
      </div>
    )
  }

  const position = progress.total === 0 ? 0 : progress.index + 1
  const atStart = progress.index <= 0
  const atEnd = progress.index >= progress.total - 1

  return (
    <div className="focus-layout">
      <p className="eyebrow">Focus</p>
      <p className="progress-label">
        {progress.total === 0 ? "No steps yet" : `Step ${position} of ${progress.total}`}
      </p>
      <div
        className="meter"
        role="progressbar"
        aria-valuemin={progress.total === 0 ? 0 : 1}
        aria-valuemax={Math.max(progress.total, 1)}
        aria-valuenow={progress.total === 0 ? 0 : position}
        aria-label="Progress through steps"
      >
        <span style={{ width: progress.total === 0 ? "0%" : `${(position / progress.total) * 100}%` }} />
      </div>
      <p className="hint">
        {progress.completed} of {progress.total} steps completed. Arrow keys move between steps when a button is not
        focused.
      </p>

      {current ? (
        <article className="focus-card">
          <div className="badge-row">
            <TypeBadge type={current.type} />
            <StatusBadge status={current.status} />
          </div>
          <h1>{current.title}</h1>
          <p className="lede">{current.description || "Add a short instruction from the path editor."}</p>
          {current.dueDate ? <p className="hint">Due {current.dueDate}</p> : null}
        </article>
      ) : (
        <p className="empty">Add a step before using focus mode.</p>
      )}

      <div className="action-row">
        <Button variant="secondary" icon={ArrowLeft} onClick={() => moveStep(-1)} disabled={atStart || !current}>
          Previous
        </Button>
        <Button
          variant="primary"
          icon={Check}
          onClick={completeCurrent}
          disabled={!current || current.status === "completed"}
        >
          {current?.status === "completed" ? "Completed" : "Mark complete"}
        </Button>
        <Button variant="secondary" icon={ArrowRight} onClick={() => moveStep(1)} disabled={atEnd || !current}>
          Next
        </Button>
      </div>

      <details className="related-panel">
        <summary>
          <Link2 aria-hidden="true" size={20} />
          Show related information
        </summary>
        {related.length === 0 ? (
          <p>This step is not linked to other cards yet.</p>
        ) : (
          <ul className="stack">
            {related.map((item) => (
              <li key={item.id} className="path-card">
                <TypeBadge type={item.type} />
                <h2>{item.title}</h2>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="action-row">
        {supported ? (
          <>
            <Button variant="secondary" icon={Volume2} onClick={() => speak(speechText)} disabled={!speechText}>
              Read aloud
            </Button>
            <Button variant="secondary" icon={Square} onClick={stop} disabled={!speaking}>
              Stop
            </Button>
          </>
        ) : (
          <p className="hint" role="status">
            Read aloud is not available in this browser. You can still read the step on screen.
          </p>
        )}
        <Button variant="quiet" icon={X} onClick={exitFocus}>
          Exit focus
        </Button>
      </div>
    </div>
  )
}
