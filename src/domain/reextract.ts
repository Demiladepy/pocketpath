import { removeItem } from "./links.ts"
import { applyRelationships, validateRelationships } from "./relationships.ts"
import type { PathItem, Relationship } from "./types.ts"

export type CardProvenance = "manual" | "extracted" | "user-edited"

export type ReextractChange = "new" | "unchanged" | "modified" | "removed-from-source" | "conflicting"

export type ReextractDecision = "pending" | "keep" | "accept" | "remove" | "reject"

export type ReextractField = "title" | "description" | "type" | "deadline"

export type FieldChoice = "keep" | "accept"

export interface ReextractEntry {
  id: string
  change: ReextractChange
  provenance: CardProvenance
  existingId?: string
  current?: PathItem
  proposed?: PathItem
  reason: string
  decision: ReextractDecision
  changedFields: ReextractField[]
  fields: Partial<Record<ReextractField, FieldChoice>>
  linkNotes: string[]
}

export interface ReextractRelationship {
  relationship: Relationship
  decision: "accept" | "reject"
  note: string
}

export interface ReextractPlan {
  entries: ReextractEntry[]
  relationships: ReextractRelationship[]
}

const STOP = new Set([
  "also", "this", "that", "with", "from", "your", "have", "been", "were", "will",
  "into", "than", "then", "them", "they", "what", "when", "where", "the", "and", "for", "you",
])

export function cardProvenance(item: PathItem): CardProvenance {
  if (item.origin !== "extracted") return "manual"
  if (item.userEdited) return "user-edited"
  return "extracted"
}

export function compareExtraction(input: {
  existing: PathItem[]
  existingRelationships?: Relationship[]
  proposed: PathItem[]
  proposedRelationships?: Relationship[]
  sourceText: string
}): ReextractPlan {
  const claimedExisting = new Set<string>()
  const claimedProposed = new Set<string>()
  const pairs: Array<{ current: PathItem; proposed: PathItem }> = []

  const claim = (current: PathItem, proposed: PathItem) => {
    if (claimedExisting.has(current.id) || claimedProposed.has(proposed.id)) return
    claimedExisting.add(current.id)
    claimedProposed.add(proposed.id)
    pairs.push({ current, proposed })
  }

  for (const current of input.existing) {
    const proposal = input.proposed.find((item) => !claimedProposed.has(item.id) && sameSourceId(current, item))
    if (proposal) claim(current, proposal)
  }

  for (const current of input.existing) {
    if (claimedExisting.has(current.id)) continue
    const excerpt = excerptKey(current)
    if (!excerpt) continue
    const proposal = input.proposed.find(
      (item) => !claimedProposed.has(item.id) && excerptKey(item) === excerpt && item.type === current.type,
    )
    if (proposal) claim(current, proposal)
  }

  for (const current of input.existing) {
    if (claimedExisting.has(current.id)) continue
    const words = contentWords(current)
    if (words.length < 2) continue
    const existingTwins = input.existing.filter(
      (item) => !claimedExisting.has(item.id) && item.type === current.type && sameWords(contentWords(item), words),
    )
    const proposedTwins = input.proposed.filter(
      (item) => !claimedProposed.has(item.id) && item.type === current.type && sameWords(contentWords(item), words),
    )
    if (existingTwins.length === 1 && proposedTwins.length === 1 && proposedTwins[0]) claim(current, proposedTwins[0])
  }

  const entries: ReextractEntry[] = []
  for (const pair of pairs) {
    entries.push(matchedEntry(pair.current, pair.proposed, input.existing, input.existingRelationships ?? []))
  }

  for (const proposed of input.proposed) {
    if (claimedProposed.has(proposed.id)) continue
    entries.push({
      id: `new:${proposed.id}`,
      change: "new",
      provenance: "extracted",
      proposed,
      reason: "This card is not on the path yet.",
      decision: "pending",
      changedFields: [],
      fields: {},
      linkNotes: [],
    })
  }

  for (const current of input.existing) {
    if (claimedExisting.has(current.id)) continue
    entries.push(unmatchedEntry(current, input))
  }

  const idMap = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.proposed || !entry.existingId) continue
    idMap.set(entry.proposed.id, entry.existingId)
    if (entry.proposed.sourceId) idMap.set(entry.proposed.sourceId, entry.existingId)
  }

  const relationships = (input.proposedRelationships ?? [])
    .filter((relationship) => !alreadySaved(input.existingRelationships ?? [], relationship, idMap))
    .map((relationship) => ({
      relationship,
      decision: "reject" as const,
      note: relationshipNote(relationship, entries, idMap),
    }))

  return { entries, relationships }
}

export function reextractReady(plan: ReextractPlan): boolean {
  return plan.entries.every((entry) => entry.decision !== "pending")
}

export function reextractNeedsReview(plan: ReextractPlan): boolean {
  return plan.entries.some((entry) => entry.change !== "unchanged")
}

export function applyReextract(input: {
  existing: PathItem[]
  existingRelationships?: Relationship[]
  plan: ReextractPlan
}): { items: PathItem[]; relationships: Relationship[]; repairs: string[]; added: number; removed: number } {
  let items: PathItem[] = input.existing.map((item) => ({
    ...item,
    linkedItemIds: [...item.linkedItemIds],
    blockedByIds: [...(item.blockedByIds ?? [])],
  }))
  const repairs: string[] = []
  let added = 0
  let removed = 0
  const removedIds = new Set<string>()

  for (const entry of input.plan.entries) {
    if (entry.change === "new") {
      if (entry.decision !== "accept" || !entry.proposed) continue
      if (items.some((item) => sameSourceId(item, entry.proposed as PathItem) || sameExcerptAndType(item, entry.proposed as PathItem))) {
        repairs.push(`“${entry.proposed.title}” was already on the path, so it was not added again.`)
        continue
      }
      items.push(newCard(entry.proposed, items))
      added += 1
      continue
    }
    if (!entry.existingId || !entry.current) continue
    if (entry.change === "removed-from-source" && entry.decision === "remove") {
      removedIds.add(entry.existingId)
      continue
    }
    if ((entry.change === "modified" || entry.change === "conflicting") && entry.decision === "accept" && entry.proposed) {
      items = items.map((item) => (item.id === entry.existingId ? mergeFields(item, entry.proposed as PathItem, entry) : item))
    }
  }

  for (const id of removedIds) {
    const title = input.existing.find((item) => item.id === id)?.title ?? "A card"
    for (const item of items) {
      if (item.id === id) continue
      const linked = item.linkedItemIds.includes(id)
      const blocked = (item.blockedByIds ?? []).includes(id)
      if (linked || blocked) {
        repairs.push(`The connection between “${item.title}” and “${title}” was removed because “${title}” was removed.`)
      }
    }
    for (const relationship of input.existingRelationships ?? []) {
      if (relationship.fromId !== id && relationship.toId !== id) continue
      const otherId = relationship.fromId === id ? relationship.toId : relationship.fromId
      const other = input.existing.find((item) => item.id === otherId)
      repairs.push(`“${other?.title ?? "A card"}” no longer connects to “${title}” because that card was removed.`)
    }
    items = removeItem(items, id)
    removed += 1
  }

  const idMap = new Map<string, string>()
  for (const entry of input.plan.entries) {
    if (!entry.proposed) continue
    if (entry.existingId && !removedIds.has(entry.existingId)) {
      idMap.set(entry.proposed.id, entry.existingId)
      continue
    }
    if (entry.change === "new" && entry.decision === "accept") idMap.set(entry.proposed.id, entry.proposed.id)
  }

  const acceptedNew = input.plan.relationships
    .filter((entry) => entry.decision === "accept")
    .map((entry) => ({
      ...entry.relationship,
      fromId: idMap.get(entry.relationship.fromId) ?? entry.relationship.fromId,
      toId: idMap.get(entry.relationship.toId) ?? entry.relationship.toId,
      reviewStatus: "accepted" as const,
    }))

  for (const relationship of acceptedNew) {
    const known = new Set(items.map((item) => item.id))
    if (known.has(relationship.fromId) && known.has(relationship.toId)) continue
    repairs.push("A proposed connection was left out because one of its cards is not on the path.")
  }

  const keptExisting = (input.existingRelationships ?? []).filter(
    (relationship) =>
      items.some((item) => item.id === relationship.fromId) && items.some((item) => item.id === relationship.toId),
  )
  items = applyRelationships(items, acceptedNew)
  const relationships = validateRelationships(items, [...keptExisting, ...acceptedNew]).relationships
  return { items, relationships, repairs: [...new Set(repairs)], added, removed }
}

function matchedEntry(
  current: PathItem,
  proposed: PathItem,
  items: PathItem[],
  relationships: Relationship[],
): ReextractEntry {
  const changedFields = differingFields(current, proposed)
  const provenance = cardProvenance(current)
  const protectedCard = provenance !== "extracted"
  const change: ReextractChange = changedFields.length === 0 ? "unchanged" : protectedCard ? "conflicting" : "modified"
  const reason =
    change === "unchanged"
      ? "This card matches the latest text."
      : change === "conflicting"
        ? "The latest text differs from your version. Your wording stays until you choose the new one."
        : "The latest text changed this card. It stays as it is until you accept the new version."
  return {
    id: current.id,
    change,
    provenance,
    existingId: current.id,
    current,
    proposed: { ...proposed, id: current.id, sourceId: proposed.sourceId ?? proposed.id },
    reason,
    decision: change === "unchanged" ? "keep" : "pending",
    changedFields,
    fields: {},
    linkNotes: linkNotes(current, items, relationships),
  }
}

function unmatchedEntry(
  current: PathItem,
  input: { existing: PathItem[]; sourceText: string },
): ReextractEntry {
  const provenance = cardProvenance(current)
  const excerpt = excerptKey(current)
  const stillThere = excerpt.length > 0 && normalize(input.sourceText).includes(excerpt)
  const duplicate = stillThere && input.existing.some((item) => item.id !== current.id && excerptKey(item) === excerpt)
  if (provenance === "manual" || stillThere) {
    return {
      id: current.id,
      change: "unchanged",
      provenance,
      existingId: current.id,
      current,
      reason: duplicate
        ? "This repeats text that another card already matches. It was kept."
        : provenance === "manual"
          ? "This card was added by you. It is not removed by extraction."
          : "Your card was kept. The new extraction did not match it.",
      decision: "keep",
      changedFields: [],
      fields: {},
      linkNotes: [],
    }
  }
  return {
    id: current.id,
    change: "removed-from-source",
    provenance,
    existingId: current.id,
    current,
    reason: "The latest text no longer includes this card. It stays on the path unless you remove it.",
    decision: "keep",
    changedFields: [],
    fields: {},
    linkNotes: linkNotes(current, input.existing, []),
  }
}

function differingFields(current: PathItem, proposed: PathItem): ReextractField[] {
  const fields: ReextractField[] = []
  if (current.title !== proposed.title) fields.push("title")
  if (current.description !== proposed.description) fields.push("description")
  if (current.type !== proposed.type) fields.push("type")
  if ((current.dueDate ?? "") !== (proposed.dueDate ?? "") || (current.dateLabel ?? "") !== (proposed.dateLabel ?? "")) {
    fields.push("deadline")
  }
  return fields
}

function mergeFields(current: PathItem, proposed: PathItem, entry: ReextractEntry): PathItem {
  const take = (field: ReextractField) => (entry.fields[field] ?? "keep") === "accept"
  const next: PathItem = {
    ...current,
    linkedItemIds: [...current.linkedItemIds],
    blockedByIds: [...(current.blockedByIds ?? [])],
    updatedAt: proposed.updatedAt,
  }
  if (take("title")) {
    next.title = proposed.title
    next.spokenInstruction = proposed.title.replace(/[.]+$/, "")
  }
  if (take("description")) next.description = proposed.description
  if (take("type")) next.type = proposed.type
  if (take("deadline")) {
    if (proposed.dueDate) next.dueDate = proposed.dueDate
    else delete next.dueDate
    if (proposed.dateLabel) next.dateLabel = proposed.dateLabel
    else delete next.dateLabel
    if (proposed.dateCertainty) next.dateCertainty = proposed.dateCertainty
    if (proposed.dueTime) next.dueTime = proposed.dueTime
    else delete next.dueTime
    if (proposed.timeZone) next.timeZone = proposed.timeZone
  }
  const replacedAll = entry.changedFields.every((field) => take(field))
  next.userEdited = replacedAll ? false : true
  if (current.origin === "extracted") next.origin = "extracted"
  next.sourceId = proposed.sourceId ?? current.sourceId
  if (proposed.sourceExcerpt) next.sourceExcerpt = proposed.sourceExcerpt
  return next
}

function newCard(proposed: PathItem, items: PathItem[]): PathItem {
  const position = items.reduce((max, item) => Math.max(max, item.position), -1) + 1
  const next: PathItem = {
    ...proposed,
    id: items.some((item) => item.id === proposed.id) ? `${proposed.id}-new` : proposed.id,
    position,
    linkedItemIds: [],
    blockedByIds: [],
    origin: "extracted",
    userEdited: false,
    sourceId: proposed.sourceId ?? proposed.id,
    reviewStatus: "accepted",
  }
  delete next.reviewAccepted
  return next
}

function linkNotes(item: PathItem, items: PathItem[], relationships: Relationship[]): string[] {
  const names = new Map(items.map((entry) => [entry.id, entry.title]))
  const notes: string[] = []
  for (const id of item.linkedItemIds) notes.push(`This card connects to “${names.get(id) ?? "another card"}”.`)
  for (const id of item.blockedByIds ?? []) notes.push(`This card waits on “${names.get(id) ?? "another card"}”.`)
  for (const other of items) {
    if (other.id === item.id) continue
    if (other.linkedItemIds.includes(item.id)) notes.push(`“${other.title}” connects to this card.`)
    if (other.blockedByIds?.includes(item.id)) notes.push(`“${other.title}” waits on this card.`)
  }
  for (const relationship of relationships) {
    if (relationship.fromId !== item.id && relationship.toId !== item.id) continue
    const otherId = relationship.fromId === item.id ? relationship.toId : relationship.fromId
    notes.push(`A saved connection involves “${names.get(otherId) ?? "another card"}”.`)
  }
  if (notes.length > 0) notes.push("Removing this card drops those connections. Keeping it leaves them in place.")
  return [...new Set(notes)]
}

function relationshipNote(relationship: Relationship, entries: ReextractEntry[], idMap: Map<string, string>): string {
  const title = (id: string) => {
    const mapped = idMap.get(id) ?? id
    const entry = entries.find((item) => item.existingId === mapped || item.proposed?.id === id || item.current?.id === mapped)
    return entry?.current?.title ?? entry?.proposed?.title ?? "a card"
  }
  return `“${title(relationship.fromId)}” to “${title(relationship.toId)}”. This is added only if you accept it and both cards stay.`
}

function alreadySaved(existing: Relationship[], relationship: Relationship, idMap: Map<string, string>): boolean {
  const fromId = idMap.get(relationship.fromId) ?? relationship.fromId
  const toId = idMap.get(relationship.toId) ?? relationship.toId
  return existing.some((saved) => saved.kind === relationship.kind && saved.fromId === fromId && saved.toId === toId)
}

function sameSourceId(current: PathItem, proposed: PathItem): boolean {
  const currentKeys = [current.sourceId, current.id].filter((value): value is string => Boolean(value))
  const proposedKeys = [proposed.sourceId, proposed.id].filter((value): value is string => Boolean(value))
  return currentKeys.some((key) => proposedKeys.includes(key))
}

function sameExcerptAndType(current: PathItem, proposed: PathItem): boolean {
  const excerpt = excerptKey(current)
  return excerpt.length > 0 && excerpt === excerptKey(proposed) && current.type === proposed.type
}

function excerptKey(item: PathItem): string {
  return normalize(item.sourceExcerpt ?? "")
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function contentWords(item: PathItem): string[] {
  const raw = `${item.sourceExcerpt ?? ""} ${item.description}`.toLowerCase()
  const stripped = raw
    .replace(/\b\d{1,4}\b/g, " ")
    .replace(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|noon|midnight)\b/g,
      " ",
    )
  const words = stripped.match(/[a-z]{3,}/g) ?? []
  return [...new Set(words.filter((word) => !STOP.has(word)))].sort()
}

function sameWords(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((word, index) => word === right[index])
}
