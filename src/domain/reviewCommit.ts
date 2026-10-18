import { isProtectedItem } from "./mergeExtraction.ts"
import { applyRelationships, validateRelationships } from "./relationships.ts"
import type { PathItem, Relationship } from "./types.ts"

export function isAcceptedDraft(item: PathItem): boolean {
  if (item.reviewStatus === "rejected") return false
  return item.reviewAccepted === true || item.reviewStatus === "accepted"
}

export function conflictingDeadlines(items: PathItem[]): PathItem[] {
  const deadlines = items.filter((item) => item.type === "deadline")
  const keys = new Set(deadlines.map((item) => item.dueDate || item.dateLabel || item.title))
  if (keys.size < 2) return []
  return deadlines
}

export function commitReview(input: {
  existing: PathItem[]
  existingRelationships?: Relationship[]
  draft: PathItem[]
  relationships: Relationship[]
}): { items: PathItem[]; relationships: Relationship[]; added: number } {
  const accepted = input.draft.filter(isAcceptedDraft)
  const idMap = new Map<string, string>()
  let items: PathItem[] = input.existing.map((item) => ({
    ...item,
    linkedItemIds: [...item.linkedItemIds],
    blockedByIds: [...(item.blockedByIds ?? [])],
  }))
  let added = 0

  for (const proposal of accepted) {
    const match = findMatch(items, proposal)
    if (match) {
      idMap.set(proposal.id, match.id)
      if (isProtectedItem(match) || sameEditable(match, proposal)) continue
      items = items.map((item) => (item.id === match.id ? applyDraftEdit(item, proposal) : item))
      continue
    }
    const position = items.reduce((max, item) => Math.max(max, item.position), -1) + 1
    const created = clearReview({ ...proposal, position, linkedItemIds: [], blockedByIds: [] })
    items.push(created)
    idMap.set(proposal.id, created.id)
    added += 1
  }

  const mapped = input.relationships
    .filter((relationship) => relationship.reviewStatus === "accepted")
    .map((relationship) => ({
      ...relationship,
      fromId: idMap.get(relationship.fromId) ?? relationship.fromId,
      toId: idMap.get(relationship.toId) ?? relationship.toId,
    }))
  const withLinks = applyRelationships(items, mapped)
  const relationships = validateRelationships(withLinks, [...(input.existingRelationships ?? []), ...mapped]).relationships
  return { items: withLinks, relationships, added }
}

function findMatch(items: PathItem[], proposal: PathItem): PathItem | undefined {
  const byId = items.find((item) => item.id === proposal.id)
  if (byId) return byId
  const excerpt = excerptKey(proposal)
  if (!excerpt) return undefined
  const sameExcerpt = items.filter((item) => excerptKey(item) === excerpt)
  return (
    sameExcerpt.find((item) => item.type === proposal.type) ??
    sameExcerpt.find((item) => (item.type === "deadline") === (proposal.type === "deadline"))
  )
}

function excerptKey(item: PathItem): string {
  return item.sourceExcerpt?.trim().toLowerCase() ?? ""
}

function sameEditable(existing: PathItem, proposal: PathItem): boolean {
  return (
    existing.title === proposal.title &&
    existing.description === proposal.description &&
    existing.type === proposal.type &&
    (existing.dueDate ?? "") === (proposal.dueDate ?? "")
  )
}

function applyDraftEdit(existing: PathItem, proposal: PathItem): PathItem {
  const next: PathItem = {
    ...existing,
    title: proposal.title,
    description: proposal.description,
    type: proposal.type,
    spokenInstruction: proposal.title.replace(/[.]+$/, ""),
    updatedAt: proposal.updatedAt,
  }
  if (proposal.dueDate) next.dueDate = proposal.dueDate
  if (proposal.dueDate === "") delete next.dueDate
  if (proposal.dateLabel) next.dateLabel = proposal.dateLabel
  if (proposal.dateCertainty) next.dateCertainty = proposal.dateCertainty
  if (proposal.userEdited) next.userEdited = true
  if (!next.sourceId) next.sourceId = proposal.sourceId ?? proposal.id
  return next
}

function clearReview(item: PathItem): PathItem {
  const next = { ...item, reviewStatus: "accepted" as const, sourceId: item.sourceId ?? item.id }
  delete next.reviewAccepted
  return next
}
