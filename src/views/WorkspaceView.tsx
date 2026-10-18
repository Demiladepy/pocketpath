import { useState } from "react"
import { Focus, Plus, RefreshCw } from "lucide-react"
import { TYPE_LABELS } from "../domain/labels.ts"
import { describeSourceRef } from "../domain/sources/ingestSource.ts"
import { byPosition } from "../domain/order.ts"
import type { WorkspaceTab } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { ItemEditor } from "../components/ItemEditor.tsx"
import { MapView } from "../components/MapView.tsx"
import { StatusBadge, TypeBadge } from "../components/StatusBadge.tsx"

const TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "cards", label: "Cards" },
  { id: "map", label: "Map" },
  { id: "steps", label: "Steps" },
]

export function WorkspaceView() {
  const {
    active,
    tab,
    pendingReview,
    setTab,
    setCurrent,
    enterFocus,
    addItem,
    goHome,
    organizeAgain,
    acceptAddition,
    acceptUpdate,
    dismissSuggestion,
    dismissReview,
    renameWorkspace,
    deleteWorkspace,
  } = useWorkspace()
  const [tabMessage, setTabMessage] = useState("")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!active) {
    return (
      <div className="stack">
        <h1>No path is open</h1>
        <p>Choose a path from the home screen.</p>
        <Button variant="primary" onClick={goHome}>
          Go to your paths
        </Button>
      </div>
    )
  }

  const items = byPosition(active.items)
  const selected = items.find((item) => item.id === active.currentItemId) ?? null
  const steps = items.filter((item) => item.type === "step")
  const contextItems = items.filter((item) => item.type !== "step")

  function moveTab(index: number, direction: 1 | -1) {
    const next = TABS[(index + direction + TABS.length) % TABS.length]
    setTab(next.id)
    setTabMessage(`${next.label} view`)
    window.requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus())
  }

  return (
    <div className="stack">
      <header className="page-intro">
        <p className="eyebrow">Path</p>
        {editingTitle ? (
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault()
              renameWorkspace(active.id, titleDraft)
              setEditingTitle(false)
            }}
          >
            <label className="field">
              <span>Path name</span>
              <input
                className="control"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                autoFocus
                aria-label="Path name"
              />
            </label>
            <div className="action-row">
              <Button variant="primary" type="submit">
                Save name
              </Button>
              <Button variant="quiet" type="button" onClick={() => setEditingTitle(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <h1>{active.title}</h1>
        )}
        {describeSourceRef(active.sourceRef) ? <p className="hint">{describeSourceRef(active.sourceRef)}</p> : null}
        <div className="action-row">
          <Button variant="primary" icon={Focus} onClick={enterFocus}>
            Focus
          </Button>
          <Button variant="secondary" icon={Plus} onClick={addItem}>
            Add card
          </Button>
          <Button variant="secondary" icon={RefreshCw} onClick={organizeAgain}>
            Organize again
          </Button>
          {!editingTitle ? (
            <Button
              variant="quiet"
              onClick={() => {
                setConfirmDelete(false)
                setTitleDraft(active.title)
                setEditingTitle(true)
              }}
            >
              Rename
            </Button>
          ) : null}
          {confirmDelete ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  deleteWorkspace(active.id)
                  setConfirmDelete(false)
                }}
              >
                Confirm delete
              </Button>
              <Button variant="quiet" onClick={() => setConfirmDelete(false)}>
                Keep path
              </Button>
            </>
          ) : (
            <Button
              variant="quiet"
              onClick={() => {
                setEditingTitle(false)
                setConfirmDelete(true)
              }}
            >
              Delete path
            </Button>
          )}
        </div>
        {confirmDelete ? (
          <p className="hint" role="status">
            This removes the path from this device and returns you to your paths list.
          </p>
        ) : null}
      </header>

      {pendingReview ? (
        <section className="stack" aria-label="Suggestions from the source">
          <div className="review-banner">
            <strong>Suggestions</strong>
            <span>{pendingReview.notice ?? "Nothing is saved until you accept it."}</span>
          </div>
          {pendingReview.updates.map((update) => (
            <article key={update.existingId} className="editor">
              <span className="badge">Update</span>
              <h2>{update.proposed.title}</h2>
              <p>{update.proposed.description}</p>
              <div className="action-row">
                <Button variant="secondary" onClick={() => acceptUpdate(update.existingId, update.proposed)}>
                  Accept update
                </Button>
                <Button variant="quiet" onClick={() => dismissSuggestion(update.existingId)}>
                  Skip
                </Button>
              </div>
            </article>
          ))}
          {pendingReview.additions.map((item) => (
            <article key={item.id} className="editor">
              <span className="badge">{TYPE_LABELS[item.type]}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <div className="action-row">
                <Button variant="secondary" onClick={() => acceptAddition(item)}>
                  Accept
                </Button>
                <Button variant="quiet" onClick={() => dismissSuggestion(item.id)}>
                  Skip
                </Button>
              </div>
            </article>
          ))}
          <Button variant="quiet" onClick={dismissReview}>
            Dismiss suggestions
          </Button>
        </section>
      ) : null}

      <div className="tablist" role="tablist" aria-label="Path views">
        {TABS.map((entry, index) => {
          const selectedTab = tab === entry.id
          return (
            <button
              key={entry.id}
              id={`tab-${entry.id}`}
              type="button"
              role="tab"
              aria-selected={selectedTab}
              aria-controls={`panel-${entry.id}`}
              tabIndex={selectedTab ? 0 : -1}
              className={selectedTab ? "tab selected" : "tab"}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault()
                  moveTab(index, 1)
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault()
                  moveTab(index, -1)
                }
              }}
            >
              {entry.label}
            </button>
          )
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {tabMessage}
      </p>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {items.length === 0 ? (
          <p className="empty">This path has no cards. Add a card to start.</p>
        ) : null}

        {tab === "cards" && items.length > 0 ? (
          <ul className="card-grid">
            {items.map((item) => {
              const isSelected = item.id === active.currentItemId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={isSelected ? "info-card selected" : "info-card"}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setCurrent(item.id)}
                  >
                    <span className="badge-row">
                      <TypeBadge type={item.type} />
                      <StatusBadge status={item.status} />
                      {isSelected ? <span className="badge">Selected</span> : null}
                    </span>
                    <span className="card-title">{item.title}</span>
                    <span className="card-copy">{item.description}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {tab === "map" && items.length > 0 ? <MapView items={items} /> : null}

        {tab === "steps" && items.length > 0 ? (
          <div className="stack">
            <ol className="step-list">
              {steps.map((item, index) => {
                const isSelected = item.id === active.currentItemId
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={isSelected ? "step-row selected" : "step-row"}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setCurrent(item.id)}
                    >
                      <span className="step-index">{index + 1}</span>
                      <span>
                        <span className="card-title">{item.title}</span>
                        <span className="card-copy">{item.description}</span>
                      </span>
                      <span className="badge-row">
                        {isSelected ? <span className="badge">Selected</span> : null}
                        <StatusBadge status={item.status} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            {contextItems.length > 0 ? (
              <section className="stack" aria-labelledby="context-heading">
                <h2 id="context-heading">Also on this path</h2>
                <ul className="card-grid">
                  {contextItems.map((item) => {
                    const isSelected = item.id === active.currentItemId
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={isSelected ? "info-card selected" : "info-card"}
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => setCurrent(item.id)}
                        >
                          <span className="badge-row">
                            <TypeBadge type={item.type} />
                            <StatusBadge status={item.status} />
                            {isSelected ? <span className="badge">Selected</span> : null}
                          </span>
                          <span className="card-title">{item.title}</span>
                          <span className="card-copy">{item.description}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {selected ? <ItemEditor item={selected} items={items} /> : items.length > 0 ? (
        <p className="empty">Select a card to edit it. Changes show up in Cards, Map, and Steps.</p>
      ) : null}
    </div>
  )
}
