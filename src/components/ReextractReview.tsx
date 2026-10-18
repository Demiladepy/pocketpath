import { describeDeadline } from "../domain/dates.ts"
import { TYPE_LABELS } from "../domain/labels.ts"
import {
  reextractReady,
  type CardProvenance,
  type FieldChoice,
  type ReextractChange,
  type ReextractDecision,
  type ReextractEntry,
  type ReextractField,
  type ReextractPlan,
} from "../domain/reextract.ts"
import type { PathItem } from "../domain/types.ts"
import { Button } from "./Button.tsx"

interface ReextractReviewProps {
  plan: ReextractPlan
  onDecision: (id: string, decision: ReextractDecision) => void
  onField: (id: string, field: ReextractField, choice: FieldChoice) => void
  onRelationship: (id: string, decision: "accept" | "reject") => void
  onCommit: () => void
  onCancel: () => void
}

const CHANGE_LABEL: Record<ReextractChange, string> = {
  new: "New",
  unchanged: "Unchanged",
  modified: "Changed in the source",
  "removed-from-source": "Missing from the latest text",
  conflicting: "Conflicts with your edit",
}

const PROVENANCE_LABEL: Record<CardProvenance, string> = {
  manual: "Added by you",
  extracted: "From the source",
  "user-edited": "Edited by you",
}

const FIELD_LABEL: Record<ReextractField, string> = {
  title: "Title",
  description: "Description",
  type: "Type",
  deadline: "Deadline",
}

export function ReextractReview({
  plan,
  onDecision,
  onField,
  onRelationship,
  onCommit,
  onCancel,
}: ReextractReviewProps) {
  const ready = reextractReady(plan)
  const groups: ReextractChange[] = ["new", "conflicting", "modified", "removed-from-source"]
  const unchanged = plan.entries.filter((entry) => entry.change === "unchanged")

  return (
    <section className="stack" aria-label="Review extraction updates">
      <div className="review-banner">
        <strong>Review the update</strong>
        <span>Nothing is saved until you apply it. A card is not deleted unless you remove it.</span>
      </div>
      <p className="hint">
        Confidence estimates how sure the extraction is. It does not mean a card is correct. Edited cards stay as you
        wrote them until you accept a new version.
      </p>
      {groups.map((change) => {
        const entries = plan.entries.filter((entry) => entry.change === change)
        if (entries.length === 0) return null
        return (
          <section key={change} className="stack" aria-label={CHANGE_LABEL[change]}>
            <h2>{CHANGE_LABEL[change]}</h2>
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onDecision={onDecision}
                onField={onField}
              />
            ))}
          </section>
        )
      })}
      {unchanged.length > 0 ? (
        <details>
          <summary>
            {unchanged.length} {unchanged.length === 1 ? "card is" : "cards are"} unchanged and will stay
          </summary>
          <ul className="connection-list">
            {unchanged.map((entry) => (
              <li key={entry.id}>
                {entry.current?.title ?? "Untitled card"}. {entry.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {plan.relationships.length > 0 ? (
        <section className="stack" aria-label="Proposed connections">
          <h2>Proposed connections</h2>
          <p className="hint">Existing connections stay. A new connection is added only when you accept it.</p>
          {plan.relationships.map((entry) => (
            <article key={entry.relationship.id} className="editor">
              <p>{entry.note}</p>
              <div className="action-row">
                <Button
                  variant={entry.decision === "accept" ? "primary" : "secondary"}
                  aria-pressed={entry.decision === "accept"}
                  onClick={() => onRelationship(entry.relationship.id, "accept")}
                >
                  Add this connection
                </Button>
                <Button
                  variant="quiet"
                  aria-pressed={entry.decision === "reject"}
                  onClick={() => onRelationship(entry.relationship.id, "reject")}
                >
                  Leave it out
                </Button>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {!ready ? <p className="hint">Choose what to do with each new or changed card before applying.</p> : null}
      <div className="action-row">
        <Button variant="primary" disabled={!ready} onClick={onCommit}>
          Apply reviewed changes
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

function EntryCard({
  entry,
  onDecision,
  onField,
}: {
  entry: ReextractEntry
  onDecision: (id: string, decision: ReextractDecision) => void
  onField: (id: string, field: ReextractField, choice: FieldChoice) => void
}) {
  const title = entry.current?.title ?? entry.proposed?.title ?? "Untitled card"
  return (
    <article className="editor" aria-labelledby={`reextract-${entry.id}`}>
      <h3 id={`reextract-${entry.id}`}>{title}</h3>
      <div className="action-row">
        <span className="badge">{CHANGE_LABEL[entry.change]}</span>
        <span className="badge">{PROVENANCE_LABEL[entry.provenance]}</span>
        {entry.proposed?.confidence ? <span className="badge">{confidenceLabel(entry.proposed.confidence)}</span> : null}
      </div>
      <p className="hint">{entry.reason}</p>
      {entry.current?.sourceExcerpt ? <p className="hint">Saved source: {entry.current.sourceExcerpt}</p> : null}
      {entry.proposed?.sourceExcerpt && entry.proposed.sourceExcerpt !== entry.current?.sourceExcerpt ? (
        <p className="hint">Latest source: {entry.proposed.sourceExcerpt}</p>
      ) : null}
      {entry.changedFields.length > 0 ? (
        <div className="stack">
          {entry.changedFields.map((field) => (
            <div key={field} className="diff-grid">
              <p>
                <span className="badge">Current {FIELD_LABEL[field].toLowerCase()}</span>
                <br />
                {fieldText(entry.current, field)}
              </p>
              <p>
                <span className="badge">New {FIELD_LABEL[field].toLowerCase()}</span>
                <br />
                {fieldText(entry.proposed, field)}
              </p>
              <div className="action-row">
                <Button
                  variant={entry.fields[field] === "keep" ? "primary" : "secondary"}
                  aria-pressed={entry.fields[field] === "keep"}
                  aria-label={`Keep current ${FIELD_LABEL[field].toLowerCase()} for ${title}`}
                  onClick={() => onField(entry.id, field, "keep")}
                >
                  Keep current {FIELD_LABEL[field].toLowerCase()}
                </Button>
                <Button
                  variant={entry.fields[field] === "accept" ? "primary" : "secondary"}
                  aria-pressed={entry.fields[field] === "accept"}
                  aria-label={`Use new ${FIELD_LABEL[field].toLowerCase()} for ${title}`}
                  onClick={() => onField(entry.id, field, "accept")}
                >
                  Use new {FIELD_LABEL[field].toLowerCase()}
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {entry.linkNotes.map((note) => (
        <p key={note} className="hint">
          {note}
        </p>
      ))}
      <div className="action-row">
        {entry.change === "new" ? (
          <>
            <Button
              variant={entry.decision === "accept" ? "primary" : "secondary"}
              aria-pressed={entry.decision === "accept"}
              aria-label={`Add ${title}`}
              onClick={() => onDecision(entry.id, "accept")}
            >
              Add this card
            </Button>
            <Button
              variant={entry.decision === "reject" ? "primary" : "quiet"}
              aria-pressed={entry.decision === "reject"}
              aria-label={`Leave out ${title}`}
              onClick={() => onDecision(entry.id, "reject")}
            >
              Leave it out
            </Button>
          </>
        ) : null}
        {entry.change === "modified" || entry.change === "conflicting" ? (
          <>
            <Button
              variant={entry.decision === "keep" ? "primary" : "secondary"}
              aria-pressed={entry.decision === "keep"}
              aria-label={`Keep current version of ${title}`}
              onClick={() => onDecision(entry.id, "keep")}
            >
              Keep current version
            </Button>
            <Button
              variant={entry.decision === "accept" && entry.changedFields.every((field) => entry.fields[field] === "accept") ? "primary" : "secondary"}
              aria-pressed={entry.decision === "accept" && entry.changedFields.every((field) => entry.fields[field] === "accept")}
              aria-label={`Use the new version of ${title}`}
              onClick={() => onDecision(entry.id, "accept")}
            >
              Use the new version
            </Button>
          </>
        ) : null}
        {entry.change === "removed-from-source" ? (
          <>
            <Button
              variant={entry.decision === "keep" ? "primary" : "secondary"}
              aria-pressed={entry.decision === "keep"}
              aria-label={`Keep ${title}`}
              onClick={() => onDecision(entry.id, "keep")}
            >
              Keep this card
            </Button>
            <Button
              variant={entry.decision === "remove" ? "danger" : "quiet"}
              aria-pressed={entry.decision === "remove"}
              aria-label={`Remove ${title}`}
              onClick={() => onDecision(entry.id, "remove")}
            >
              Remove this card
            </Button>
          </>
        ) : null}
      </div>
    </article>
  )
}

function fieldText(item: PathItem | undefined, field: ReextractField): string {
  if (!item) return "None"
  if (field === "title") return item.title || "Untitled"
  if (field === "description") return item.description || "No description"
  if (field === "type") return TYPE_LABELS[item.type]
  if (item.dueDate || item.dateLabel) return describeDeadline(item)
  return "No deadline"
}

function confidenceLabel(confidence: NonNullable<PathItem["confidence"]>): string {
  if (confidence === "high") return "High confidence"
  if (confidence === "medium") return "Medium confidence"
  return "Low confidence"
}
