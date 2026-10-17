import { useState } from "react"
import { Check, TextQuote } from "lucide-react"
import { STATUS_LABELS, TYPE_LABELS, TYPE_OPTIONS } from "../domain/labels.ts"
import { removeItem } from "../domain/links.ts"
import { byPosition } from "../domain/order.ts"
import { parseInstructions } from "../domain/parseInstructions.ts"
import { SAMPLE_SOURCE } from "../domain/sample.ts"
import type { PathItem } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { StatusBadge, TypeBadge } from "../components/StatusBadge.tsx"

export function CreatePathView() {
  const { draftSource, draftItems, setDraft, setReview, createWorkspace, goHome } = useWorkspace()
  const [formError, setFormError] = useState<string | null>(null)
  const review = draftItems ? byPosition(draftItems) : null

  function organize() {
    const items = parseInstructions(draftSource)
    if (items.length === 0) {
      setFormError("Paste some instructions first, or load the sample.")
      setReview(null)
      return
    }
    setFormError(null)
    setReview(items)
  }

  function patchReview(id: string, patch: Partial<PathItem>) {
    if (!draftItems) return
    setReview(
      draftItems.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)),
    )
  }

  function createPath() {
    if (!review || review.length === 0) {
      setFormError("Organize the instructions before creating the path.")
      return
    }
    const goal = review.find((item) => item.type === "goal")
    const title = goal?.title.trim() || review[0]?.title.trim() || "Untitled path"
    createWorkspace(title, draftSource, review)
  }

  return (
    <div className="stack">
      <header className="page-intro">
        <p className="eyebrow">New path</p>
        <h1>Create a path</h1>
        <p className="lede">Paste the instructions, organize them into cards, then correct anything that looks wrong.</p>
      </header>

      <label className="field">
        <span>Instructions</span>
        <textarea
          className="control control-tall"
          value={draftSource}
          onChange={(event) => {
            setDraft(event.target.value)
            setFormError(null)
          }}
          rows={12}
        />
        <span className="hint">Example: Goal: Prepare an application before Friday</span>
      </label>

      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="action-row">
        <Button
          variant="secondary"
          icon={TextQuote}
          onClick={() => {
            setDraft(SAMPLE_SOURCE)
            setReview(null)
            setFormError(null)
          }}
        >
          Load sample
        </Button>
        <Button variant={review ? "secondary" : "primary"} onClick={organize}>
          Organize
        </Button>
        <Button variant="quiet" onClick={goHome}>
          Back
        </Button>
      </div>

      {review ? (
        <section className="stack" aria-labelledby="review-heading">
          <div className="review-banner">
            <h2 id="review-heading">Review these cards</h2>
            <p>
              These cards were organized from your text. They can be wrong. Edit them before you rely on them.
            </p>
          </div>
          <ul className="stack">
            {review.map((item) => {
              const related = review.filter((candidate) => item.linkedItemIds.includes(candidate.id))
              return (
                <li key={item.id} className="editor">
                  <div className="badge-row">
                    <TypeBadge type={item.type} />
                    <StatusBadge status={item.status} />
                  </div>
                  <label className="field">
                    <span>Title</span>
                    <input
                      className="control"
                      value={item.title}
                      onChange={(event) => patchReview(item.id, { title: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      className="control"
                      rows={3}
                      value={item.description}
                      onChange={(event) => patchReview(item.id, { description: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <select
                      className="control"
                      value={item.type}
                      onChange={(event) => patchReview(item.id, { type: event.target.value as PathItem["type"] })}
                    >
                      {TYPE_OPTIONS.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {item.dueDate ? <p className="hint">Due {item.dueDate}</p> : null}
                  {related.length > 0 ? (
                    <p className="hint">Linked to {related.map((linked) => linked.title).join(", ")}</p>
                  ) : null}
                  <p className="hint">Status: {STATUS_LABELS[item.status]}</p>
                  <Button
                    variant="quiet"
                    onClick={() => setReview(removeItem(review, item.id))}
                  >
                    Remove card
                  </Button>
                </li>
              )
            })}
          </ul>
          <Button variant="primary" icon={Check} onClick={createPath} disabled={review.length === 0}>
            Create path
          </Button>
        </section>
      ) : null}
    </div>
  )
}
