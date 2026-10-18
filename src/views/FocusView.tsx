import { useEffect } from "react"
import { ArrowLeft, ArrowRight, Check, Link2, X } from "lucide-react"
import { actionInstructionFor } from "../domain/actionInstruction.ts"
import { describeDeadline } from "../domain/dates.ts"
import { focusTasks, readyStepIds, selectNextAction } from "../domain/focus.ts"
import { byPosition } from "../domain/order.ts"
import type { PathItem } from "../domain/types.ts"
import { useSpeech } from "../hooks/useSpeech.ts"
import { usePreferences } from "../state/PreferencesContext.tsx"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { ReadAloudControls } from "../components/ReadAloudControls.tsx"
import { StatusBadge, TypeBadge } from "../components/StatusBadge.tsx"

export function FocusView() {
  const { active, exitFocus, completeCurrent, moveStep, setCurrent, goHome } = useWorkspace()
  const { preferences } = usePreferences()
  const speech = useSpeech()

  const plan = active ? selectNextAction(active.items, active.relationships ?? []) : null
  const tasks = active ? focusTasks(active.items) : []
  const completed = tasks.filter((item) => item.status === "completed").length
  const readyIds = plan ? readyStepIds(plan) : []
  const recommended = active?.items.find((item) => item.id === plan?.selectedId) ?? null
  const current = active?.items.find((item) => item.id === active.currentItemId) ?? null
  const blockerIds = new Set(plan?.waiting.flatMap((entry) => entry.blockers.map((blocker) => blocker.id)) ?? [])
  const openedBlocker = plan?.state === "blocked" && current && blockerIds.has(current.id) ? current : null
  const showing =
    plan?.state === "ready"
      ? active?.items.find((item) => item.id === active.currentItemId && readyIds.includes(item.id)) ?? recommended
      : openedBlocker
  const instruction = showing ? actionInstructionFor(showing) : null
  const speechText = instruction?.text || plan?.reason || ""
  const related = showing
    ? byPosition(active?.items.filter((item) => showing.linkedItemIds.includes(item.id)) ?? [])
    : []
  const cycleIndex = showing ? readyIds.indexOf(showing.id) : -1
  const viewingOther = plan?.state === "ready" && showing && recommended && showing.id !== recommended.id

  useEffect(() => {
    if (!preferences.readAloudEnabled || !speechText) return
    speech.speak(speechText)
    return () => speech.stop()
  }, [showing?.id, plan?.state, preferences.readAloudEnabled, speech.speak, speech.stop])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return
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

  if (!active || !plan) {
    return (
      <div className="stack">
        <h1>Nothing to focus on</h1>
        <Button variant="primary" onClick={goHome}>
          Go to your paths
        </Button>
      </div>
    )
  }

  const atStart = cycleIndex <= 0
  const atEnd = cycleIndex < 0 || cycleIndex >= readyIds.length - 1

  return (
    <div className="focus-layout">
      <p className="eyebrow">Focus</p>
      <p className="sr-only" role="status">
        {showing && instruction ? `${showing.title}. ${instruction.text}` : plan.reason}
      </p>
      <p className="progress-label">
        {tasks.length === 0 ? "No steps yet" : `${completed} of ${tasks.length} steps completed`}
      </p>
      <div
        className="meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(tasks.length, 1)}
        aria-valuenow={completed}
        aria-label="Completed steps"
      >
        <span style={{ width: tasks.length === 0 ? "0%" : `${(completed / tasks.length) * 100}%` }} />
      </div>

      {plan.state === "complete" ? (
        <article className="focus-card">
          <h1>All steps are complete</h1>
          <p className="lede">Every step on this path is marked complete.</p>
        </article>
      ) : null}

      {plan.state === "empty" ? <p className="empty">Add a step before using focus mode.</p> : null}

      {plan.state === "blocked" && !openedBlocker ? (
        <article className="focus-card">
          <h1>Every remaining step is waiting</h1>
          <p className="lede">{plan.reason}</p>
          <ul className="stack">
            {plan.waiting.map((entry) => (
              <li key={entry.stepId}>
                <p>“{entry.stepTitle}” waits on:</p>
                <div className="action-row">
                  {entry.blockers.map((blocker) => (
                    <Button key={blocker.id} variant="secondary" onClick={() => setCurrent(blocker.id)}>
                      Open {blocker.title}
                    </Button>
                  ))}
                </div>
                {entry.missingIds.length > 0 ? (
                  <p className="hint">A listed predecessor is not on this path.</p>
                ) : null}
              </li>
            ))}
          </ul>
        </article>
      ) : null}

      {showing && instruction ? (
        <FocusStep
          item={showing}
          instruction={instruction}
          reason={viewingOther ? `You are looking at another ready step. ${plan.reason}` : plan.reason}
          priorityLabel={showing.priority ? `Priority: ${showing.priority}.` : null}
        />
      ) : null}

      {viewingOther && recommended ? (
        <Button variant="secondary" onClick={() => setCurrent(recommended.id)}>
          Show {recommended.title}
        </Button>
      ) : null}

      {plan.state === "ready" && !viewingOther && plan.alternatives.length > 0 ? (
        <div className="stack">
          <h2>Other steps you can start</h2>
          <ul className="action-row">
            {plan.alternatives.map((alternative) => (
              <li key={alternative.id}>
                <Button variant="secondary" onClick={() => setCurrent(alternative.id)}>
                  Choose {alternative.title}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plan.state === "ready" && showing ? (
        <div className="action-row">
          <Button
            variant="secondary"
            icon={ArrowLeft}
            onClick={() => moveStep(-1)}
            disabled={atStart}
            aria-keyshortcuts="ArrowLeft"
          >
            Previous ready step
          </Button>
          <Button
            variant="primary"
            icon={Check}
            onClick={completeCurrent}
            disabled={showing.status === "completed"}
          >
            {showing.status === "completed" ? "Completed" : "Mark complete"}
          </Button>
          <Button
            variant="secondary"
            icon={ArrowRight}
            onClick={() => moveStep(1)}
            disabled={atEnd}
            aria-keyshortcuts="ArrowRight"
          >
            Next ready step
          </Button>
        </div>
      ) : null}

      {openedBlocker ? (
        <div className="stack">
          <p className="lede" role="status">
            {blockerPrompt(openedBlocker.id, openedBlocker.title, plan.waiting)}
          </p>
          <div className="action-row">
            <Button variant="secondary" onClick={() => setCurrent(plan.waiting[0]?.stepId ?? openedBlocker.id)}>
              Show waiting steps
            </Button>
            <Button
              variant="primary"
              icon={Check}
              onClick={completeCurrent}
              disabled={openedBlocker.status === "completed"}
            >
              {openedBlocker.status === "completed" ? "Completed" : "Mark complete"}
            </Button>
          </div>
        </div>
      ) : null}

      {showing ? (
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
      ) : null}

      <ReadAloudControls text={speechText} speech={speech} />
      <div className="action-row">
        <Button variant="quiet" icon={X} onClick={exitFocus}>
          Exit focus
        </Button>
      </div>
      {plan.state === "ready" ? (
        <p className="hint">Left and right arrow keys move between ready steps. They stay still while you are typing.</p>
      ) : null}
    </div>
  )
}

function blockerPrompt(
  blockerId: string,
  blockerTitle: string,
  waiting: Array<{ stepTitle: string; blockers: Array<{ id: string }> }>,
): string {
  const named = waiting.filter((entry) => entry.blockers.some((blocker) => blocker.id === blockerId))
  if (named.length === 0) {
    return `Finish “${blockerTitle}” first. Other steps are waiting on it.`
  }
  const list = named.map((entry) => `“${entry.stepTitle}”`).join(", ")
  const verb = named.length === 1 ? "waits" : "wait"
  return `Finish “${blockerTitle}” first. ${list} ${verb} until it is complete.`
}

function sameWording(left: string, right: string): boolean {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").toLowerCase()
  return clean(left) === clean(right)
}

function FocusStep({
  item,
  instruction,
  reason,
  priorityLabel,
}: {
  item: PathItem
  instruction: { text: string; authored: boolean }
  reason: string
  priorityLabel: string | null
}) {
  const { updateItem } = useWorkspace()
  const hintId = `instruction-hint-${item.id}`
  return (
    <article className="focus-card">
      <div className="badge-row">
        <TypeBadge type={item.type} />
        <StatusBadge status={item.status} />
      </div>
      <h1>{item.title}</h1>
      <p>{reason}</p>
      {priorityLabel ? <p className="hint">{priorityLabel}</p> : null}
      {item.dueDate || item.dateLabel ? <p className="hint">{describeDeadline(item)}</p> : null}
      <label className="field" htmlFor={`instruction-${item.id}`}>
        <span>{instruction.authored ? "Your instruction" : "Suggested instruction"}</span>
      </label>
      <textarea
        id={`instruction-${item.id}`}
        className="control"
        rows={3}
        value={instruction.authored ? item.actionInstruction ?? "" : instruction.text}
        aria-describedby={hintId}
        onChange={(event) => updateItem(item.id, { actionInstruction: event.target.value }, "text")}
      />
      <p id={hintId} className="hint">
        {instruction.authored
          ? "Read aloud uses this wording."
          : "Generated from the title and description. Edit it to use your own wording. Read aloud uses this suggestion until you do."}
      </p>
      {item.description && !sameWording(item.description, instruction.text) ? (
        <p className="hint">Details: {item.description}</p>
      ) : null}
    </article>
  )
}
