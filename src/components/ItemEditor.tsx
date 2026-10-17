import { useState, type FocusEvent } from "react"
import { Trash2 } from "lucide-react"
import { STATUS_OPTIONS, TYPE_OPTIONS, TYPE_LABELS, STATUS_LABELS } from "../domain/labels.ts"
import { byPosition } from "../domain/order.ts"
import type { PathItem } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "./Button.tsx"

export function ItemEditor({ item, items }: { item: PathItem; items: PathItem[] }) {
  const { updateItem, endTextEdit, deleteItem, linkItem, unlinkItem } = useWorkspace()
  const [linkState, setLinkState] = useState({ itemId: item.id, target: "" })
  const linkTarget = linkState.itemId === item.id ? linkState.target : ""
  const related = byPosition(items.filter((candidate) => item.linkedItemIds.includes(candidate.id)))
  const linkChoices = byPosition(
    items.filter((candidate) => candidate.id !== item.id && !item.linkedItemIds.includes(candidate.id)),
  )

  function setLinkTarget(target: string) {
    setLinkState({ itemId: item.id, target })
  }

  function leaveEditor(event: FocusEvent<HTMLFormElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    endTextEdit()
  }

  return (
    <form className="editor" onSubmit={(event) => event.preventDefault()} onBlur={leaveEditor}>
      <div className="editor-heading">
        <h2>Edit card</h2>
        <Button variant="danger" icon={Trash2} onClick={() => deleteItem(item.id)}>
          Delete card
        </Button>
      </div>

      <label className="field">
        <span>Title</span>
        <input
          className="control"
          value={item.title}
          onChange={(event) => updateItem(item.id, { title: event.target.value }, "text")}
        />
      </label>

      <label className="field">
        <span>Description</span>
        <textarea
          className="control"
          rows={4}
          value={item.description}
          onChange={(event) => updateItem(item.id, { description: event.target.value }, "text")}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select
            className="control"
            value={item.type}
            onChange={(event) =>
              updateItem(item.id, { type: event.target.value as PathItem["type"] }, "commit")
            }
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select
            className="control"
            value={item.status}
            onChange={(event) =>
              updateItem(item.id, { status: event.target.value as PathItem["status"] }, "commit")
            }
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Due date</span>
        <input
          className="control"
          type="date"
          value={item.dueDate ?? ""}
          onChange={(event) => updateItem(item.id, { dueDate: event.target.value }, "commit")}
        />
      </label>

      <div className="field">
        <span id={`related-${item.id}`}>Related cards</span>
        {related.length === 0 ? (
          <p className="hint">No links yet. Connect this card to another one on the path.</p>
        ) : (
          <ul className="related-list" aria-labelledby={`related-${item.id}`}>
            {related.map((linked) => (
              <li key={linked.id}>
                <span>
                  {TYPE_LABELS[linked.type]}: {linked.title}
                </span>
                <Button variant="quiet" onClick={() => unlinkItem(item.id, linked.id)}>
                  Remove link
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="field-row">
        <label className="field">
          <span>Link to</span>
          <select className="control" value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)}>
            <option value="">Choose a card</option>
            {linkChoices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {TYPE_LABELS[candidate.type]}: {candidate.title}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          disabled={linkTarget.length === 0}
          onClick={() => {
            linkItem(item.id, linkTarget)
            setLinkTarget("")
          }}
        >
          Add link
        </Button>
      </div>
    </form>
  )
}
