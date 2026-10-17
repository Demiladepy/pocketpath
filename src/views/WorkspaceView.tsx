import { useState } from "react"
import { Focus, Plus } from "lucide-react"
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
  const { active, tab, setTab, setCurrent, enterFocus, addItem, goHome } = useWorkspace()
  const [tabMessage, setTabMessage] = useState("")

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
        <h1>{active.title}</h1>
        <div className="action-row">
          <Button variant="primary" icon={Focus} onClick={enterFocus}>
            Focus
          </Button>
          <Button variant="secondary" icon={Plus} onClick={addItem}>
            Add card
          </Button>
        </div>
      </header>

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
