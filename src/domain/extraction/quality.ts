import type { DateCertainty, EvidenceBasis, ExtractionConfidence, ExtractionStatus, PathItem, PathItemType, Relationship } from "../types.ts"
import type { ExtractionDraft, ExtractionError, ExtractionWarning } from "./types.ts"

export const MAX_SOURCE_CHARS = 12_000
const LONG_SOURCE_CHARS = 500

const ACTION =
  /^(?:\d+[.)]\s*|[-*]\s*)?(?:please\s+|pls\s+)?(?:read|gather|collect|write|draft|submit|ask|upload|review|list|send|open|complete|fill|save|check|email|download|print|sign|finish|prepare|add|make|keep|include|create|start|update|confirm|schedule|register|bring|call|meet|pack|label|cite|outline|revise|edit|share|note|study|practice|compare|turn|get|take|put|set|find|do|work)\b/i

const GENERIC_GOAL = /^(?:follow these steps|untitled path|untitled|goal|instructions|notes|to do|todo)$/i

const STRUCTURAL = new Set<ExtractionWarning["code"]>([
  "no-goal",
  "generic-steps",
  "empty-card",
  "duplicate-card",
  "unresolved-deadline",
  "no-steps",
  "malformed-link",
  "circular-dependency",
  "insufficient-evidence",
  "conflicting-dates",
])

export interface QualityCard {
  id: string
  type: PathItemType
  title: string
  description: string
  sourceExcerpt?: string
  basis?: EvidenceBasis
  confidence?: ExtractionConfidence
  dateCertainty?: DateCertainty
  dueDate?: string
  dateLabel?: string
  rangeStart?: string
}

export interface CardAssessment<T extends QualityCard> {
  items: T[]
  warnings: ExtractionWarning[]
  status: ExtractionStatus
  notice: string
  error: ExtractionError | null
  title: string
}

export function screenSource(text: string): { status: ExtractionStatus; notice: string; error: ExtractionError } | null {
  if (!text.trim()) {
    return {
      status: "failed",
      notice: "Paste some instructions first, or load the sample.",
      error: {
        code: "empty",
        message: "Nothing was pasted.",
        clarification: "Paste some instructions first, or load the sample.",
      },
    }
  }
  if (text.length > MAX_SOURCE_CHARS) {
    return {
      status: "unsupported",
      notice: "This text is too long to organize. Paste a shorter section. Your text is still in the box.",
      error: {
        code: "too-long",
        message: "The source is too long.",
        clarification: "This text is too long to organize. Paste a shorter section. Your text is still in the box.",
      },
    }
  }
  if (unsupportedText(text)) {
    return {
      status: "unsupported",
      notice: "This does not look like plain instructions. Paste the words, or load the sample. Your text is still in the box.",
      error: {
        code: "unsupported",
        message: "The source is not plain instructions.",
        clarification: "This does not look like plain instructions. Paste the words, or load the sample. Your text is still in the box.",
      },
    }
  }
  return null
}

export function assessCards<T extends QualityCard>(input: {
  sourceText: string
  title: string
  items: T[]
  warnings: ExtractionWarning[]
}): CardAssessment<T> {
  const sourceText = input.sourceText ?? ""
  const screened = screenSource(sourceText)
  if (screened) {
    return {
      items: [],
      warnings: input.warnings,
      status: screened.status,
      notice: screened.notice,
      error: screened.error,
      title: "",
    }
  }

  const warnings = [...input.warnings]
  let items = input.items.filter((item) => keepCard(item, sourceText, warnings))
  items = dropGenericSteps(items, warnings)
  items = dropDuplicateCards(items, warnings)

  const steps = items.filter((item) => item.type === "step")
  const goal = items.find((item) => isMeaningfulGoal(item))
  if (steps.length > 0 && !goal) warnOnce(warnings, "no-goal", "No goal was stated. Rename the placeholder, or add the outcome you want.")
  if (steps.length === 0 && items.length > 0) {
    warnOnce(warnings, "no-steps", "No goal or step was found. Add the actions you need to take.")
  }
  for (const item of items) {
    if (!unresolvedDeadline(item)) continue
    warnOnce(
      warnings,
      "unresolved-deadline",
      `A deadline could not be resolved: “${item.dateLabel || item.title}”. It was left as written.`,
      item.id,
    )
  }

  const structural = warnings.some((warning) => STRUCTURAL.has(warning.code))
  if (items.length === 0) {
    const long = sourceText.trim().length >= LONG_SOURCE_CHARS
    return {
      items,
      warnings,
      status: long ? "clarification" : "failed",
      notice: long
        ? "This is a long text, and it does not say what to do. Add the actions, or paste the part that lists them. Your text is still in the box."
        : "This text does not say what to do. Add the actions, or paste the part that lists them. Your text is still in the box.",
      error: {
        code: "no-action",
        message: "There is not enough here to make a path.",
        clarification: "This text does not say what to do. Add the actions, or paste the part that lists them.",
      },
      title: displayTitle(input.title, undefined, "Untitled path"),
    }
  }

  if (steps.length === 0) {
    return {
      items,
      warnings,
      status: "clarification",
      notice: "No goal or step was found. Add what you need to do. Cards that were clear are still listed. Your text is still in the box.",
      error: null,
      title: displayTitle(input.title, undefined, items[0]?.title || "Untitled path"),
    }
  }

  if (structural) {
    return {
      items,
      warnings,
      status: "partial",
      notice: "Some of this text became cards. Review what was kept before saving. A draft is not a checked reading.",
      error: null,
      title: displayTitle(input.title, goal, items[0]?.title || "Untitled path"),
    }
  }

  return {
    items,
    warnings,
    status: "ready",
    notice: "Review these cards before you save them. A draft can look complete and still be wrong.",
    error: null,
    title: displayTitle(input.title, goal, items[0]?.title || "Untitled path"),
  }
}

export function assessRelationships(
  items: PathItem[],
  relationships: Relationship[],
  warnings: ExtractionWarning[],
): { relationships: Relationship[]; warnings: ExtractionWarning[]; changed: boolean } {
  const known = new Set(items.map((item) => item.id))
  const nextWarnings = [...warnings]
  const kept: Relationship[] = []
  let changed = false
  for (const relationship of relationships) {
    const malformed =
      !relationship.fromId ||
      !relationship.toId ||
      relationship.fromId === relationship.toId ||
      !known.has(relationship.fromId) ||
      !known.has(relationship.toId)
    if (malformed) {
      changed = true
      warnOnce(nextWarnings, "malformed-link", "A connection did not match two cards, so it was left out.")
      continue
    }
    if (
      relationship.kind === "before" &&
      reaches(kept.filter((entry) => entry.kind === "before"), relationship.toId, relationship.fromId)
    ) {
      changed = true
      warnOnce(
        nextWarnings,
        "circular-dependency",
        "A dependency was left out because it would make steps wait on each other in a circle.",
      )
      continue
    }
    const duplicate = kept.some(
      (entry) => entry.kind === relationship.kind && entry.fromId === relationship.fromId && entry.toId === relationship.toId,
    )
    if (duplicate) {
      changed = true
      warnOnce(nextWarnings, "duplicate-link", "A repeated connection was left out.")
      continue
    }
    kept.push(relationship)
  }
  return { relationships: kept, warnings: nextWarnings, changed }
}

export function providerFailure(sourceText: string): ExtractionDraft {
  const notice = "Organizing stopped before a path was made. Your text is still in the box. Try again, edit it, or load the sample."
  return {
    title: "",
    items: [],
    warnings: [],
    error: {
      code: "provider",
      message: "Extraction stopped.",
      clarification: notice,
    },
    status: "failed",
    notice,
    sourceLines: [],
    sourceText,
  }
}

function keepCard<T extends QualityCard>(item: T, sourceText: string, warnings: ExtractionWarning[]): boolean {
  if (!item.title.trim() && !item.description.trim()) {
    warnOnce(warnings, "empty-card", "An empty card was left out.")
    return false
  }
  if (!excerptSupported(item, sourceText)) {
    warnOnce(
      warnings,
      "insufficient-evidence",
      "A card was left out because its text was not in the source. A valid result is not the same as a correct one.",
      item.id,
    )
    return false
  }
  return true
}

function excerptSupported(item: QualityCard, sourceText: string): boolean {
  const parts = (item.sourceExcerpt ?? "")
    .split(/\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return item.type === "goal" && item.basis === "inferred"
  const haystack = sourceText.toLowerCase().replace(/\s+/g, " ")
  return parts.every((part) => haystack.includes(part))
}

function dropGenericSteps<T extends QualityCard>(items: T[], warnings: ExtractionWarning[]): T[] {
  const generic = items.filter((item) => isGenericStep(item))
  if (generic.length < 2) return items
  warnOnce(
    warnings,
    "generic-steps",
    `${generic.length} paragraphs were not turned into steps because they do not say what to do.`,
  )
  const drop = new Set(generic.map((item) => item.id))
  return items.filter((item) => !drop.has(item.id))
}

function dropDuplicateCards<T extends QualityCard>(items: T[], warnings: ExtractionWarning[]): T[] {
  const seen = new Map<string, T>()
  const kept: T[] = []
  for (const item of items) {
    const key = `${item.type}:${item.title.trim().toLowerCase().replace(/\s+/g, " ")}`
    const previous = seen.get(key)
    if (!previous) {
      seen.set(key, item)
      kept.push(item)
      continue
    }
    warnOnce(warnings, "duplicate-card", `A repeated “${item.title}” card was left out.`)
    if (item.description.trim().length > previous.description.trim().length) {
      const index = kept.findIndex((entry) => entry.id === previous.id)
      if (index >= 0) kept[index] = item
      seen.set(key, item)
    }
  }
  return kept
}

function isGenericStep(item: QualityCard): boolean {
  if (item.type !== "step") return false
  const title = item.title.replace(/\s+/g, " ").trim()
  if (!title) return true
  if (ACTION.test(title)) return false
  return title.split(/\s+/).length >= 10 || title.length > 80
}

function displayTitle(title: string, goal: QualityCard | undefined, fallback: string): string {
  const clean = title.trim()
  if (clean && !GENERIC_GOAL.test(clean)) return clean.length <= 80 ? clean : `${clean.slice(0, 77).trimEnd()}...`
  if (goal?.title.trim()) return goal.title.trim()
  return fallback
}

function isMeaningfulGoal(item: QualityCard): boolean {
  if (item.type !== "goal") return false
  const title = item.title.trim()
  if (title.length < 3 || GENERIC_GOAL.test(title)) return false
  if (item.basis === "inferred" && item.confidence === "low") return false
  return true
}

function unresolvedDeadline(item: QualityCard): boolean {
  if (item.type !== "deadline") return false
  if (item.dateCertainty === "unresolved") return true
  return !item.dueDate && !item.rangeStart
}

function unsupportedText(text: string): boolean {
  const sample = text.slice(0, 2000)
  if (sample.startsWith("%PDF") || sample.includes("\u0000")) return true
  const trimmed = sample.trim()
  if (trimmed.length < 40) return false
  const letters = trimmed.match(/[A-Za-z]/g)?.length ?? 0
  return letters / trimmed.length < 0.2
}

function warnOnce(
  warnings: ExtractionWarning[],
  code: ExtractionWarning["code"],
  message: string,
  draftId?: string,
): void {
  if (warnings.some((warning) => warning.code === code && warning.draftId === draftId)) return
  warnings.push(draftId ? { code, message, draftId } : { code, message })
}

function reaches(relationships: Relationship[], startId: string, goalId: string): boolean {
  const pending = [startId]
  const seen = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (!current || seen.has(current)) continue
    if (current === goalId) return true
    seen.add(current)
    for (const relationship of relationships) {
      if (relationship.kind === "before" && relationship.fromId === current) pending.push(relationship.toId)
    }
  }
  return false
}
