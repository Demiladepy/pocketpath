import { findDate } from "./dates.ts"
import { extractPlainText, type ExtractionResult } from "./extractInstructions.ts"
import { assessCards, assessRelationships, screenSource } from "./extraction/quality.ts"
import { createId, nowIso } from "./ids.ts"
import { proposeRelationships } from "./relationships.ts"
import { sourceItemId } from "./sourceId.ts"
import type { PathItem, PathItemType } from "./types.ts"

const LABELS: Record<string, PathItemType> = {
  goal: "goal",
  step: "step",
  requirement: "requirement",
  deadline: "deadline",
  resource: "resource",
  person: "person",
  contact: "person",
  note: "note",
}

const LABEL_PATTERN = /^(goal|step|requirement|deadline|resource|person|contact|note)\s*:\s*(.+)$/i
const LINK_PATTERN = /^link\s*:\s*(.+?)\s*->\s*(.+)$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Labeled mode is for deliberately tagged briefs (Goal:, Step:, Link:).
 * A single prose line such as "Note: …" must not hijack ordinary extraction.
 */
function hasLabeledLines(text: string): boolean {
  let labeledCards = 0
  let hasGoalOrStep = false
  let hasLink = false
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue
    if (LINK_PATTERN.test(trimmed)) {
      hasLink = true
      continue
    }
    const match = trimmed.match(LABEL_PATTERN)
    if (!match) continue
    const label = match[1].toLowerCase()
    labeledCards += 1
    if (label === "goal" || label === "step") hasGoalOrStep = true
  }
  if (hasGoalOrStep) return true
  if (hasLink && labeledCards >= 1) return true
  return labeledCards >= 2
}

function splitBody(body: string): { title: string; description: string } {
  const parts = body.split(/\s+\|\s+/)
  return {
    title: parts[0]?.trim() ?? "",
    description: parts.slice(1).join(" | ").trim(),
  }
}

export function parseInstructions(text: string, now: Date = new Date()): ExtractionResult {
  const screened = screenSource(text)
  if (screened) {
    return {
      title: "",
      items: [],
      relationships: [],
      status: screened.status,
      notice: screened.notice,
      warnings: [],
      error: screened.error,
    }
  }
  if (hasLabeledLines(text)) return parseLabeled(text, now)
  return extractPlainText(text, now)
}

function parseLabeled(text: string, now: Date): ExtractionResult {
  const stamp = nowIso()
  const items: PathItem[] = []
  const pendingLinks: Array<[string, string]> = []

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue

    const linkMatch = line.match(LINK_PATTERN)
    if (linkMatch) {
      pendingLinks.push([linkMatch[1].trim(), linkMatch[2].trim()])
      continue
    }

    const labelMatch = line.match(LABEL_PATTERN)
    if (!labelMatch) continue

    const type = LABELS[labelMatch[1].toLowerCase()]
    const body = splitBody(labelMatch[2])
    if (!type || !body.title) continue

    let title = body.title
    let description = body.description
    let dueDate: string | undefined
    let dueTime: string | undefined
    let timeZone: string | undefined
    let deadlineReview: string | undefined
    let rangeStart: string | undefined
    let rangeEnd: string | undefined
    let recurrence: string | undefined
    let dateLabel: string | undefined
    let dateCertainty: PathItem["dateCertainty"]

    if (type === "deadline" && DATE_PATTERN.test(title)) {
      dueDate = title
      dateLabel = title
      dateCertainty = "exact"
      timeZone = "unspecified"
      title = description || "Deadline"
      description = dueDate ? `Due ${dueDate}` : ""
    } else if (type === "deadline") {
      const dated = findDate(body.title, now) ?? findDate(line, now)
      if (dated?.dueDate) dueDate = dated.dueDate
      if (dated) {
        dateLabel = dated.dateLabel
        dateCertainty = dated.certainty
        dueTime = dated.dueTime
        timeZone = dated.timeZone
        deadlineReview = dated.deadlineReview
        rangeStart = dated.rangeStart
        rangeEnd = dated.rangeEnd
        recurrence = dated.recurrence
      }
    }

    const item: PathItem = {
      id: createId(),
      type,
      title,
      description,
      status: "not-started",
      position: items.length,
      linkedItemIds: [],
      blockedByIds: [],
      origin: "extracted",
      userEdited: false,
      sourceExcerpt: line,
      sourceId: sourceItemId(type, line),
      spokenInstruction: title.replace(/[.]+$/, ""),
      createdAt: stamp,
      updatedAt: stamp,
    }
    if (dueDate) item.dueDate = dueDate
    if (dueTime) item.dueTime = dueTime
    if (timeZone) item.timeZone = timeZone
    if (deadlineReview) item.deadlineReview = deadlineReview
    if (rangeStart) item.rangeStart = rangeStart
    if (rangeEnd) item.rangeEnd = rangeEnd
    if (recurrence) item.recurrence = recurrence
    if (dateLabel) item.dateLabel = dateLabel
    if (dateCertainty) item.dateCertainty = dateCertainty
    items.push(item)
  }

  const proposed = proposeRelationships(
    items,
    text,
    pendingLinks.map(([fromTitle, toTitle]) => ({ fromTitle, toTitle })),
  )
  const cards = assessCards({
    sourceText: text,
    title: items.find((item) => item.type === "goal")?.title || items[0]?.title || "",
    items,
    warnings: proposed.warnings,
  })
  const links = assessRelationships(cards.items, proposed.relationships, cards.warnings)
  const partial = links.changed && (cards.status === "ready" || cards.status === "partial")
  return {
    title: cards.title,
    items: cards.items,
    relationships: links.relationships,
    status: partial ? "partial" : cards.status,
    notice: partial
      ? "Some of this text became cards. A connection needed repair, so review what was kept. A draft is not a checked reading."
      : cards.notice,
    warnings: links.warnings,
    error: cards.error,
  }
}
