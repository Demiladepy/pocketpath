import { useState, type ChangeEvent } from "react"
import { FileText, Sparkles } from "lucide-react"
import { describeDeadline } from "../domain/dates.ts"
import { createItem } from "../domain/items.ts"
import { RELATIONSHIP_LABELS, RELATIONSHIP_OPTIONS, TYPE_LABELS, TYPE_OPTIONS } from "../domain/labels.ts"
import { parseInstructions } from "../domain/parseInstructions.ts"
import { canUseKind } from "../domain/relationships.ts"
import { conflictingDeadlines } from "../domain/reviewCommit.ts"
import { SAMPLE_SOURCE } from "../domain/sample.ts"
import { ingestUpload, ingestUrl, MAX_IMPORT_BYTES, sourceRefFrom } from "../domain/sources/ingestSource.ts"
import type { PathItem, PathItemType, Relationship, RelationshipKind } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { ReextractReview } from "../components/ReextractReview.tsx"

export function CreatePathView() {
  const {
    draftSource,
    draftSourceRef,
    draftItems,
    draftTitle,
    extractionNotice,
    extractionStatus,
    draftRelationships,
    draftWarnings,
    draftMode,
    active,
    reextractPlan,
    setDraft,
    setDraftTitle,
    setReview,
    createWorkspace,
    cancelDraft,
    commitMerge,
    reextract,
    setReextractDecision,
    setReextractField,
    setReextractRelationship,
    commitReextract,
  } = useWorkspace()
  const [formError, setFormError] = useState<string | null>(null)
  const [pageUrl, setPageUrl] = useState("")
  const review = draftItems

  function organize(source = draftSource) {
    if (draftMode === "merge" && active) {
      reextract(source)
      setFormError(null)
      return
    }
    const result = parseInstructions(source)
    const warningText = result.warnings.map((warning) => warning.message).join(" ")
    const hideItems = result.status === "failed" || result.status === "unsupported" || result.items.length === 0
    setReview(hideItems ? null : result.items, {
      title: result.title,
      notice: [result.notice, warningText].filter(Boolean).join(" "),
      status: result.status,
      relationships: result.relationships,
      warnings: result.warnings,
      mode: draftMode,
    })
    setFormError(null)
  }

  function updateRelationship(id: string, recipe: (relationship: Relationship) => Relationship) {
    setReview(review, { relationships: draftRelationships.map((relationship) => (relationship.id === id ? recipe(relationship) : relationship)) })
  }

  function updateDraftItem(id: string, recipe: (item: PathItem) => PathItem) {
    if (!review) return
    setReview(review.map((item) => (item.id === id ? recipe(item) : item)))
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    const rejected = ingestUpload({
      name: file.name,
      mediaType: file.type,
      byteLength: file.size,
      text: null,
    })
    if (file.size > MAX_IMPORT_BYTES || rejected.status === "unsupported") {
      setFormError(rejected.message)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : null
      const loaded = ingestUpload({
        name: file.name,
        mediaType: file.type,
        byteLength: file.size,
        text,
      })
      if (!loaded.textAvailable) {
        setFormError(loaded.message)
        return
      }
      setDraft(loaded.text, sourceRefFrom(loaded))
      setReview(null, { title: "", notice: null, status: null })
      setFormError(null)
    }
    reader.onerror = () => {
      const failed = ingestUpload({ name: file.name, mediaType: file.type, byteLength: file.size, text: null })
      setFormError(failed.message)
    }
    reader.readAsText(file)
  }

  function checkUrl() {
    const result = ingestUrl(pageUrl)
    setFormError(result.message)
  }

  function addCardYourself() {
    const item = createItem({
      title: "First step",
      type: "step",
      description: "Write the next thing you need to do.",
      origin: "manual",
    })
    item.reviewStatus = "accepted"
    item.reviewAccepted = true
    createWorkspace(draftTitle.trim() || "Untitled path", draftSource, [item], [], draftSourceRef ?? { kind: "paste" })
  }

  const remaining = review?.length ?? 0
  const cardsAccepted = remaining > 0 && review?.every((item) => item.reviewAccepted) === true
  const linksAccepted = draftRelationships.every((relationship) => relationship.reviewStatus === "accepted")
  const deadlineClash = conflictingDeadlines(review ?? [])
  const allAccepted = cardsAccepted && linksAccepted && deadlineClash.length === 0

  function acceptHighConfidence() {
    if (!review) return
    setReview(
      review.map((item) =>
        item.confidence === "high" ? { ...item, reviewAccepted: true, reviewStatus: "accepted" } : item,
      ),
      {
        relationships: draftRelationships.map((relationship) =>
          relationship.confidence === "high" ? { ...relationship, reviewStatus: "accepted" } : relationship,
        ),
      },
    )
  }

  function acceptEverything() {
    if (!review) return
    setReview(
      review.map((item) => ({ ...item, reviewAccepted: true, reviewStatus: "accepted" })),
      {
        relationships: draftRelationships.map((relationship) => ({
          ...relationship,
          reviewStatus: "accepted",
        })),
      },
    )
  }

  function commitAccepted() {
    if (!allAccepted || !review) return
    if (draftMode === "merge") {
      commitMerge(review, draftRelationships)
      return
    }
    createWorkspace(
      draftTitle.trim() || "Untitled path",
      draftSource,
      review,
      draftRelationships,
      draftSourceRef ?? { kind: "paste" },
    )
  }

  return (
    <div className="stack">
      <header className="page-intro">
        <p className="eyebrow">{draftMode === "merge" ? "Existing path" : "New path"}</p>
        <h1>{heading(reextractPlan, extractionStatus, review)}</h1>
        <p className="lede">
          An email, assignment, or syllabus is enough. Labels such as Goal: and Step: still work when you already
          have them.
        </p>
        {draftMode === "create" && !review && !reextractPlan ? (
          <ol className="howto">
            <li>Paste the instructions, or load a .txt, .md, or .eml file.</li>
            <li>Press Organize. Nothing is saved until you create the path.</li>
            <li>Accept, edit, or reject each card, then Create path.</li>
          </ol>
        ) : null}
      </header>

      <div className="editor">
        <label className="field">
          <span>Instructions</span>
          <textarea
            id="instructions"
            className="control control-tall"
            value={draftSource}
            onChange={(event) => setDraft(event.target.value)}
            rows={12}
            placeholder="Paste an email, assignment, or a labeled brief."
            aria-describedby={draftSourceRef?.filename ? "source-origin" : undefined}
          />
        </label>
        {draftSourceRef?.filename ? (
          <p id="source-origin" className="hint" role="status">
            Text from {draftSourceRef.filename} is in the box above. Review or edit it, then organize. The file is read as text only.
          </p>
        ) : (
          <p className="hint">Example label: Goal: Prepare an application before Friday</p>
        )}
        <div className="action-row">
          <Button variant="primary" icon={Sparkles} onClick={() => organize()}>
            Organize
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(SAMPLE_SOURCE, null)
              setReview(null, { title: "", notice: null, status: null })
              setFormError(null)
            }}
          >
            Load sample
          </Button>
          <label className="btn btn-secondary">
            <FileText size={18} aria-hidden="true" />
            Load a file
            <input
              className="sr-only"
              type="file"
              accept=".txt,.md,.markdown,.pdf,.docx,.doc,.eml,.png,.jpg,.jpeg,.gif,.webp,text/plain,text/markdown,application/pdf,message/rfc822,image/*"
              onChange={onFile}
            />
          </label>
        </div>
        <p className="hint">
          Plain text, Markdown, and exported .eml email files can be loaded. PDF, Word, pictures, and web pages are not read in the browser.
        </p>
        <details className="source-extra">
          <summary>Webpage address (not loaded in this browser)</summary>
          <p className="hint">
            PocketPaths cannot fetch other websites from the browser. Paste the page text instead, or check an address to see why.
          </p>
          <div className="field">
            <label htmlFor="source-url">Webpage address</label>
            <input
              id="source-url"
              className="control"
              value={pageUrl}
              onChange={(event) => setPageUrl(event.target.value)}
              placeholder="https://example.edu/assignment"
              inputMode="url"
            />
            <Button variant="secondary" onClick={checkUrl}>
              Check this address
            </Button>
          </div>
        </details>
        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
      </div>

      {showRecovery(extractionStatus, remaining, reextractPlan, draftMode) ? (
        <section className="stack" aria-label={recoveryLabel(extractionStatus)}>
          <div className="empty">
            <p className="eyebrow">{recoveryLabel(extractionStatus)}</p>
            <p role="alert">{extractionNotice}</p>
            <div className="action-row">
              <Button variant="primary" onClick={() => organize()}>
                Try again
              </Button>
              <Button variant="secondary" onClick={() => document.getElementById("instructions")?.focus()}>
                Edit the text
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(SAMPLE_SOURCE, null)
                  setReview(null, { title: "", notice: null, status: null })
                  setFormError(null)
                }}
              >
                Load an example
              </Button>
              <Button variant="secondary" onClick={addCardYourself}>
                Add a card yourself
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {reextractPlan ? (
        <ReextractReview
          plan={reextractPlan}
          onDecision={setReextractDecision}
          onField={setReextractField}
          onRelationship={setReextractRelationship}
          onCommit={commitReextract}
          onCancel={cancelDraft}
        />
      ) : review && review.length > 0 && extractionStatus !== "failed" && extractionStatus !== "unsupported" ? (
        <section className="stack" aria-label="Review extracted cards">
          <div className="review-banner">
            <strong>{reviewLead(extractionStatus, remaining)}</strong>
            <span>
              Nothing is saved until you commit. Rejected cards are left out.
              {extractionNotice ? ` ${extractionNotice}` : ""}
            </span>
          </div>
          <p className="hint">
            Confidence estimates how sure the extraction is. It does not mean a card is correct.
          </p>
          {deadlineClash.length > 1 ? (
            <p className="form-error" role="alert">
              These deadlines disagree. Choose one before you commit. The others will be left out.
            </p>
          ) : null}
          <label className="field">
            <span>Path title</span>
            <input className="control" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </label>
          <ReviewCommitBar
            allAccepted={allAccepted}
            deadlineClash={deadlineClash.length > 1}
            draftMode={draftMode}
            onAcceptHigh={acceptHighConfidence}
            onAcceptAll={acceptEverything}
            onCreate={commitAccepted}
            onCancel={cancelDraft}
          />
          {review.map((item) => {
            const itemWarnings = draftWarnings.filter((warning) => warning.draftId === item.id)
            const itemLinks = draftRelationships.filter(
              (relationship) => relationship.fromId === item.id || relationship.toId === item.id,
            )
            return (
            <article key={item.id} className="editor" aria-labelledby={`review-${item.id}`}>
              <h2 id={`review-${item.id}`}>{item.title || "Untitled card"}</h2>
              <div className="action-row">
                <span className="badge">{TYPE_LABELS[item.type]}</span>
                {item.reviewAccepted ? <span className="badge">Accepted</span> : <span className="badge">Not accepted</span>}
                {item.basis ? <span className="badge">{item.basis === "stated" ? "Stated" : "Inferred"}</span> : null}
                {item.confidence ? <span className="badge">{confidenceLabel(item.confidence)}</span> : null}
              </div>
              {item.basis ? (
                <p className="hint">
                  {item.basis === "stated" ? "This was written in the source." : "This was inferred, so check it."}
                </p>
              ) : null}
              {item.sourceExcerpt ? <p className="hint">Source: {item.sourceExcerpt}</p> : null}
              {itemWarnings.map((warning) => (
                <p key={warning.code + warning.message} className="hint">
                  Warning: {warning.message}
                </p>
              ))}
              {item.dateLabel || item.dueDate ? <p className="hint">{describeDeadline(item)}</p> : null}
              {itemLinks.length > 0 ? (
                <ul className="connection-list">
                  {itemLinks.map((relationship) => {
                    const otherId = relationship.fromId === item.id ? relationship.toId : relationship.fromId
                    const other = review.find((entry) => entry.id === otherId) ?? active?.items.find((entry) => entry.id === otherId)
                    if (!other) return null
                    return (
                      <li key={relationship.id}>
                        {RELATIONSHIP_LABELS[relationship.kind]}: {other.title}. {relationship.reason}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              <label className="field">
                <span>Title</span>
                <input
                  className="control"
                  value={item.title}
                  onChange={(event) =>
                    updateDraftItem(item.id, (current) => ({
                      ...current,
                      title: event.target.value,
                      userEdited: true,
                      reviewAccepted: true,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Details</span>
                <textarea
                  className="control"
                  rows={3}
                  value={item.description}
                  onChange={(event) =>
                    updateDraftItem(item.id, (current) => ({
                      ...current,
                      description: event.target.value,
                      userEdited: true,
                      reviewAccepted: true,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Type</span>
                <select
                  className="control"
                  value={item.type}
                  onChange={(event) =>
                    updateDraftItem(item.id, (current) => ({
                      ...current,
                      type: event.target.value as PathItemType,
                      userEdited: true,
                      reviewAccepted: true,
                    }))
                  }
                >
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {TYPE_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Deadline</span>
                <input
                  className="control"
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(event) =>
                    updateDraftItem(item.id, (current) => ({
                      ...current,
                      dueDate: event.target.value,
                      dateCertainty: event.target.value ? "exact" : current.dateCertainty,
                      userEdited: true,
                      reviewAccepted: true,
                      reviewStatus: "accepted",
                    }))
                  }
                />
              </label>
              {deadlineClash.length > 1 && item.type === "deadline" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const removed = new Set(deadlineClash.filter((deadline) => deadline.id !== item.id).map((deadline) => deadline.id))
                    setReview(
                      review
                        .filter((entry) => !removed.has(entry.id))
                        .map((entry) =>
                          entry.id === item.id
                            ? { ...entry, reviewAccepted: true, reviewStatus: "accepted" }
                            : entry,
                        ),
                      {
                        relationships: draftRelationships.filter(
                          (relationship) => !removed.has(relationship.fromId) && !removed.has(relationship.toId),
                        ),
                      },
                    )
                  }}
                >
                  Use this deadline
                </Button>
              ) : null}
              <div className="action-row">
                <Button
                  variant="secondary"
                  aria-label={`Accept ${item.title || "untitled card"}`}
                  onClick={() =>
                    updateDraftItem(item.id, (current) => ({
                      ...current,
                      reviewAccepted: true,
                      reviewStatus: "accepted",
                    }))
                  }
                >
                  Accept
                </Button>
                <Button
                  variant="quiet"
                  aria-label={`Reject ${item.title || "untitled card"}`}
                  onClick={() => {
                    setReview(
                      review.filter((entry) => entry.id !== item.id),
                      {
                        relationships: draftRelationships.filter(
                          (relationship) => relationship.fromId !== item.id && relationship.toId !== item.id,
                        ),
                      },
                    )
                  }}
                >
                  Reject
                </Button>
              </div>
            </article>
            )
          })}
          {draftRelationships.length > 0 ? (
            <section className="stack" aria-label="Proposed connections">
              <h2>Proposed connections</h2>
              <p className="hint">
                These are not saved until you accept them. A suggested order is not a rule that one step must wait.
              </p>
              {draftRelationships.map((relationship) => {
                const cards = [...review, ...(active?.items ?? [])]
                const from = cards.find((item) => item.id === relationship.fromId)
                const to = cards.find((item) => item.id === relationship.toId)
                if (!from || !to) return null
                return (
                  <article key={relationship.id} className="editor">
                    <div className="action-row">
                      <span className="badge">{RELATIONSHIP_LABELS[relationship.kind]}</span>
                      <span className="badge">{relationship.reviewStatus === "accepted" ? "Accepted" : "Not accepted"}</span>
                      <span className="badge">{relationship.basis === "stated" ? "Stated" : "Inferred"}</span>
                      {relationship.basis === "inferred" ? (
                        <span className="badge">{confidenceLabel(relationship.confidence)}</span>
                      ) : null}
                    </div>
                    <p>
                      {from.title} → {to.title}
                    </p>
                    <p className="hint">{relationship.reason}</p>
                    <label className="field">
                      <span>Connection type</span>
                      <select
                        className="control"
                        value={relationship.kind}
                        onChange={(event) => {
                          const kind = event.target.value as RelationshipKind
                          if (!canUseKind(draftRelationships, relationship.id, kind)) {
                            setFormError("That change would make a circle, so the connection was left as it is.")
                            return
                          }
                          setFormError(null)
                          updateRelationship(relationship.id, (current) => ({
                            ...current,
                            kind,
                            basis: "stated",
                            confidence: "high",
                            reason: `You changed this connection. It was: ${current.reason}`,
                          }))
                        }}
                      >
                        {RELATIONSHIP_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {RELATIONSHIP_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="action-row">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          updateRelationship(relationship.id, (current) => ({ ...current, reviewStatus: "accepted" }))
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        variant="quiet"
                        onClick={() =>
                          setReview(review, {
                            relationships: draftRelationships.filter((entry) => entry.id !== relationship.id),
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </article>
                )
              })}
            </section>
          ) : null}
          <div className="review-commit">
            <ReviewCommitBar
              allAccepted={allAccepted}
              deadlineClash={deadlineClash.length > 1}
              draftMode={draftMode}
              sticky
              onAcceptHigh={acceptHighConfidence}
              onAcceptAll={acceptEverything}
              onCreate={commitAccepted}
              onCancel={cancelDraft}
            />
          </div>
        </section>
      ) : extractionStatus === "failed" || extractionStatus === "unsupported" ? null : (
        <Button variant="quiet" onClick={cancelDraft}>
          Cancel
        </Button>
      )}
    </div>
  )
}

function ReviewCommitBar({
  allAccepted,
  deadlineClash,
  draftMode,
  sticky = false,
  onAcceptHigh,
  onAcceptAll,
  onCreate,
  onCancel,
}: {
  allAccepted: boolean
  deadlineClash: boolean
  draftMode: "create" | "merge"
  sticky?: boolean
  onAcceptHigh: () => void
  onAcceptAll: () => void
  onCreate: () => void
  onCancel: () => void
}) {
  return (
    <div className={sticky ? "review-commit-inner" : "stack"}>
      {!allAccepted ? (
        <p className="hint">
          Accept or reject each card and each connection, then create the path.
          {deadlineClash ? " A deadline clash must be resolved first." : ""}
        </p>
      ) : (
        <p className="hint" role="status">
          Ready to save. Create the path when the cards look right.
        </p>
      )}
      <div className="action-row">
        <Button variant="secondary" onClick={onAcceptHigh}>
          Accept high-confidence items
        </Button>
        <Button variant="secondary" onClick={onAcceptAll}>
          Accept all
        </Button>
        <Button variant="primary" disabled={!allAccepted} onClick={onCreate}>
          {draftMode === "merge" ? "Add accepted cards" : "Create path"}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function heading(
  reextractPlan: unknown,
  status: string | null,
  review: PathItem[] | null,
): string {
  if (reextractPlan) return "Review the update"
  if (status === "failed") return "Extraction failed"
  if (status === "unsupported") return "This text was not organized"
  if (status === "clarification") return "Needs clarification"
  if (status === "partial") return "Review a partial result"
  if (review && review.length > 0) return "Review the draft"
  return "Paste the instructions"
}

function showRecovery(
  status: string | null,
  remaining: number,
  reextractPlan: unknown,
  draftMode: string,
): boolean {
  if (reextractPlan || draftMode === "merge") return false
  if (status === "failed" || status === "unsupported") return true
  return status === "clarification" && remaining === 0
}

function recoveryLabel(status: string | null): string {
  if (status === "unsupported") return "Source too long or unsupported"
  if (status === "clarification") return "Needs clarification"
  return "Extraction failed"
}

function reviewLead(status: string | null, remaining: number): string {
  if (status === "partial") return "Partial result"
  if (status === "clarification") return "Needs clarification"
  return `${remaining} cards to review`
}

function confidenceLabel(confidence: NonNullable<PathItem["confidence"]>): string {
  if (confidence === "high") return "High confidence"
  if (confidence === "medium") return "Medium confidence"
  return "Low confidence"
}

