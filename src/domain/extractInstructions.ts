import { extractWithProvider } from "./extraction/provider.ts"
import { assessRelationships } from "./extraction/quality.ts"
import type { ExtractionDraft, ExtractionError, ExtractionWarning } from "./extraction/types.ts"
import { createId, nowIso } from "./ids.ts"
import { proposeRelationships } from "./relationships.ts"
import type { ExtractionStatus, PathItem, Relationship } from "./types.ts"

export interface ExtractionResult {
  title: string
  items: PathItem[]
  relationships: Relationship[]
  status: ExtractionStatus
  notice: string | null
  warnings: ExtractionWarning[]
  error: ExtractionError | null
}

export function extractPlainText(text: string, now: Date): ExtractionResult {
  const draft = extractWithProvider({ text, now })
  return draftToResult(draft)
}

export function draftToResult(draft: ExtractionDraft): ExtractionResult {
  const stamp = nowIso()
  const items = draft.items.map((item, index) => {
    const card: PathItem = {
      id: item.id || createId(),
      type: item.type,
      title: item.title,
      description: item.description,
      status: "not-started",
      position: index,
      linkedItemIds: [],
      blockedByIds: [],
      origin: "extracted",
      userEdited: false,
      sourceExcerpt: item.sourceExcerpt,
      sourceId: item.id,
      spokenInstruction: spokenFrom(item.title),
      confidence: item.confidence,
      basis: item.basis,
      reviewStatus: item.reviewStatus,
      createdAt: stamp,
      updatedAt: stamp,
    }
    if (item.dueDate) card.dueDate = item.dueDate
    if (item.dueTime) card.dueTime = item.dueTime
    if (item.timeZone) card.timeZone = item.timeZone
    if (item.deadlineReview) card.deadlineReview = item.deadlineReview
    if (item.rangeStart) card.rangeStart = item.rangeStart
    if (item.rangeEnd) card.rangeEnd = item.rangeEnd
    if (item.recurrence) card.recurrence = item.recurrence
    if (item.dateLabel) card.dateLabel = item.dateLabel
    if (item.dateCertainty) card.dateCertainty = item.dateCertainty
    return card
  })

  const proposed = proposeRelationships(items, draft.sourceText)
  const checked = assessRelationships(items, proposed.relationships, [...draft.warnings, ...proposed.warnings])
  const partial = checked.changed && (draft.status === "ready" || draft.status === "partial")
  return {
    title: draft.title,
    items,
    relationships: checked.relationships,
    status: partial ? "partial" : draft.status,
    notice: partial
      ? "Some of this text became cards. A connection needed repair, so review what was kept. A draft is not a checked reading."
      : draft.notice,
    warnings: checked.warnings,
    error: draft.error,
  }
}

function spokenFrom(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim().replace(/[.]+$/, "")
  if (clean.length <= 110) return clean
  return `${clean.slice(0, 107).trimEnd()}...`
}
