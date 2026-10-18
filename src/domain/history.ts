import { createId, nowIso } from "./ids.ts"
import type { PathItem, PathWorkspace, Relationship } from "./types.ts"
import { validateItem } from "./validate.ts"

export const HISTORY_SCHEMA_VERSION = 1
export const HISTORY_LIMIT = 30
export const HISTORY_BYTE_LIMIT = 120_000

export type HistoryOperation =
  | "edit-card"
  | "delete-card"
  | "add-card"
  | "change-status"
  | "change-links"
  | "update-path"

export interface HistorySlice {
  items: PathItem[]
  relationships: Relationship[]
  sourceText?: string
  currentItemId?: string | null
}

export interface HistoryEntry {
  id: string
  schemaVersion: typeof HISTORY_SCHEMA_VERSION
  workspaceId: string
  operation: HistoryOperation
  affectedIds: string[]
  before: HistorySlice
  after: HistorySlice
  trackSourceText: boolean
  trackCurrentItemId: boolean
  at: string
}

export interface PersistedHistory {
  schemaVersion: number
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

export interface HistoryApplySuccess {
  ok: true
  workspace: PathWorkspace
}

export interface HistoryApplyFailure {
  ok: false
  reason: string
  itemId: string | null
}

const OPERATIONS = new Set<HistoryOperation>([
  "edit-card",
  "delete-card",
  "add-card",
  "change-status",
  "change-links",
  "update-path",
])

export function captureChange(before: PathWorkspace, after: PathWorkspace, at = nowIso()): HistoryEntry | null {
  if (before.id !== after.id) return null
  const beforeItems = new Map(before.items.map((item) => [item.id, item]))
  const afterItems = new Map(after.items.map((item) => [item.id, item]))
  const affectedIds: string[] = []
  for (const id of new Set([...beforeItems.keys(), ...afterItems.keys()])) {
    const left = beforeItems.get(id)
    const right = afterItems.get(id)
    if (!left || !right || stableItem(left) !== stableItem(right)) affectedIds.push(id)
  }
  const beforeRelationships = changedRelationships(before.relationships ?? [], after.relationships ?? [], "before")
  const afterRelationships = changedRelationships(before.relationships ?? [], after.relationships ?? [], "after")
  const relChanged = beforeRelationships.length > 0 || afterRelationships.length > 0
  const sourceChanged = before.sourceText !== after.sourceText
  if (affectedIds.length === 0 && !relChanged && !sourceChanged) return null

  const removed = affectedIds.filter((id) => beforeItems.has(id) && !afterItems.has(id))
  const added = affectedIds.filter((id) => !beforeItems.has(id) && afterItems.has(id))
  const updated = affectedIds.filter((id) => beforeItems.has(id) && afterItems.has(id))
  const operation = classifyOperation(beforeItems, afterItems, removed, added, updated, relChanged, sourceChanged)

  return {
    id: createId(),
    schemaVersion: HISTORY_SCHEMA_VERSION,
    workspaceId: before.id,
    operation,
    affectedIds,
    before: {
      items: affectedIds.flatMap((id) => {
        const item = beforeItems.get(id)
        return item ? [cloneItem(item)] : []
      }),
      relationships: beforeRelationships.map(cloneRelationship),
      sourceText: sourceChanged ? before.sourceText : undefined,
      currentItemId: before.currentItemId,
    },
    after: {
      items: affectedIds.flatMap((id) => {
        const item = afterItems.get(id)
        return item ? [cloneItem(item)] : []
      }),
      relationships: afterRelationships.map(cloneRelationship),
      sourceText: sourceChanged ? after.sourceText : undefined,
      currentItemId: after.currentItemId,
    },
    trackSourceText: sourceChanged,
    trackCurrentItemId: before.currentItemId !== after.currentItemId,
    at,
  }
}

export function applyHistory(
  workspace: PathWorkspace,
  entry: HistoryEntry,
  direction: "undo" | "redo",
): HistoryApplySuccess | HistoryApplyFailure {
  const undoing = direction === "undo"
  const from = undoing ? entry.after : entry.before
  const to = undoing ? entry.before : entry.after
  const verb = undoing ? "undone" : "redone"
  if (workspace.id !== entry.workspaceId) {
    return {
      ok: false,
      reason: `This change cannot be ${verb} because that path is no longer here. Skip this step, or edit a card yourself.`,
      itemId: null,
    }
  }

  for (const id of entry.affectedIds) {
    const expected = from.items.find((item) => item.id === id) ?? null
    const actual = workspace.items.find((item) => item.id === id) ?? null
    if (expected === null && actual === null) continue
    if (expected && actual && stableItem(expected) === stableItem(actual)) continue
    const title = itemTitle(entry, id)
    if (!actual) {
      return {
        ok: false,
        reason: `This change cannot be ${verb} because “${title}” is no longer on this path. Add the card yourself if you still need it, or skip this step.`,
        itemId: null,
      }
    }
    if (!expected) {
      return {
        ok: false,
        reason: `This change cannot be ${verb} because “${title}” was added again. Open the card, or skip this step.`,
        itemId: actual.id,
      }
    }
    return {
      ok: false,
      reason: `This change cannot be ${verb} because “${title}” was edited again. Open the card and correct it yourself, or skip this step.`,
      itemId: actual.id,
    }
  }

  const currentRelationships = workspace.relationships ?? []
  for (const relationship of from.relationships) {
    const actual = currentRelationships.find((entry) => entry.id === relationship.id)
    if (!actual || !sameRelationship(actual, relationship)) {
      return {
        ok: false,
        reason: `This change cannot be ${verb} because a connection was changed again. Edit the card links yourself, or skip this step.`,
        itemId: workspace.items.find((item) => item.id === relationship.fromId)?.id ?? null,
      }
    }
  }
  for (const relationship of to.relationships) {
    if (from.relationships.some((entry) => entry.id === relationship.id)) continue
    const returned = currentRelationships.some(
      (entry) => entry.id === relationship.id || sameConnection(entry, relationship),
    )
    if (returned) {
      return {
        ok: false,
        reason: `This change cannot be ${verb} because a connection was changed again. Edit the card links yourself, or skip this step.`,
        itemId: workspace.items.find((item) => item.id === relationship.fromId)?.id ?? null,
      }
    }
  }

  if (entry.trackSourceText && workspace.sourceText !== (from.sourceText ?? "")) {
    return {
      ok: false,
      reason: `This change cannot be ${verb} because the source text was edited again. Change it yourself, or skip this step.`,
      itemId: null,
    }
  }

  const affected = new Set(entry.affectedIds)
  const replacements = new Map(to.items.map((item) => [item.id, item]))
  const nextItems = workspace.items.flatMap((item) => {
    if (!affected.has(item.id)) return [item]
    const replacement = replacements.get(item.id)
    return replacement ? [stamp(replacement)] : []
  })
  for (const item of to.items) {
    if (!nextItems.some((current) => current.id === item.id)) nextItems.push(stamp(item))
  }
  nextItems.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))

  const removeRelationshipIds = new Set(
    from.relationships
      .map((relationship) => relationship.id)
      .filter((id) => !to.relationships.some((relationship) => relationship.id === id)),
  )
  const nextRelationships = currentRelationships.filter((relationship) => !removeRelationshipIds.has(relationship.id))
  for (const relationship of to.relationships) {
    const index = nextRelationships.findIndex((current) => current.id === relationship.id)
    if (index === -1) nextRelationships.push(cloneRelationship(relationship))
    else nextRelationships[index] = cloneRelationship(relationship)
  }

  let currentItemId = workspace.currentItemId
  if (entry.trackCurrentItemId && workspace.currentItemId === (from.currentItemId ?? null)) {
    currentItemId = to.currentItemId ?? null
  }
  if (currentItemId && !nextItems.some((item) => item.id === currentItemId)) {
    currentItemId = nextItems[0]?.id ?? null
  }

  return {
    ok: true,
    workspace: {
      ...workspace,
      items: nextItems,
      relationships: nextRelationships,
      currentItemId,
      sourceText: entry.trackSourceText ? (to.sourceText ?? "") : workspace.sourceText,
      updatedAt: nowIso(),
    },
  }
}

export function coalesceEdit(stack: HistoryEntry[], before: PathWorkspace, after: PathWorkspace): HistoryEntry[] | null {
  const last = stack[stack.length - 1]
  if (!last || last.workspaceId !== after.id) return null
  if ((last.operation !== "edit-card" && last.operation !== "change-status") || last.affectedIds.length !== 1) {
    return null
  }
  const id = last.affectedIds[0]
  if (!id || !sameExceptItem(before, after, id)) return null
  const nextItem = after.items.find((item) => item.id === id)
  const previousItem = last.before.items.find((item) => item.id === id)
  const recorded = last.after.items.find((item) => item.id === id)
  if (!nextItem || !previousItem) return null
  if (recorded && stableItem(recorded) === stableItem(nextItem)) return null
  if (stableItem(previousItem) === stableItem(nextItem) && !last.trackSourceText) return stack.slice(0, -1)
  const updated: HistoryEntry = {
    ...last,
    after: { ...last.after, items: [cloneItem(nextItem)] },
  }
  return [...stack.slice(0, -1), updated]
}

export function boundHistory(
  undo: HistoryEntry[],
  redo: HistoryEntry[],
  byteLimit = HISTORY_BYTE_LIMIT,
): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
  let nextUndo = undo.slice(-HISTORY_LIMIT)
  let nextRedo = redo.slice(-HISTORY_LIMIT)
  while (serializedSize(nextUndo, nextRedo) > byteLimit && nextUndo.length + nextRedo.length > 0) {
    if (nextUndo.length >= nextRedo.length && nextUndo.length > 0) nextUndo = nextUndo.slice(1)
    else nextRedo = nextRedo.slice(1)
  }
  return { undo: nextUndo, redo: nextRedo }
}

export function parseHistory(
  value: unknown,
  options: { missing: boolean; corrupt: boolean },
): { history: PersistedHistory; notice: string | null } {
  const empty = { schemaVersion: HISTORY_SCHEMA_VERSION, undo: [], redo: [] }
  if (options.missing) return { history: empty, notice: null }
  if (options.corrupt) {
    return {
      history: empty,
      notice: "Undo history could not be read, so it was cleared. You can still edit each card by hand.",
    }
  }
  if (!isRecord(value) || value.schemaVersion !== HISTORY_SCHEMA_VERSION) {
    return {
      history: empty,
      notice: "Undo history was cleared because it was saved by another version. You can still edit each card by hand.",
    }
  }
  const undo = validateEntries(value.undo)
  const redo = validateEntries(value.redo)
  const dropped = undo.dropped || redo.dropped
  const bounded = boundHistory(undo.entries, redo.entries)
  return {
    history: { schemaVersion: HISTORY_SCHEMA_VERSION, undo: bounded.undo, redo: bounded.redo },
    notice: dropped ? "Part of the undo history was unreadable and was skipped." : null,
  }
}

function classifyOperation(
  beforeItems: Map<string, PathItem>,
  afterItems: Map<string, PathItem>,
  removed: string[],
  added: string[],
  updated: string[],
  relChanged: boolean,
  sourceChanged: boolean,
): HistoryOperation {
  const contentUpdates = updated.filter((id) => {
    const left = beforeItems.get(id)
    const right = afterItems.get(id)
    return left && right && !linkFieldsOnly(left, right) && !statusOnly(left, right)
  })
  const statusUpdates = updated.filter((id) => {
    const left = beforeItems.get(id)
    const right = afterItems.get(id)
    return left && right && statusOnly(left, right)
  })
  const linkUpdates = updated.filter((id) => {
    const left = beforeItems.get(id)
    const right = afterItems.get(id)
    return left && right && linkFieldsOnly(left, right)
  })
  if (removed.length === 1 && added.length === 0 && contentUpdates.length === 0 && statusUpdates.length === 0) {
    return "delete-card"
  }
  if (added.length === 1 && removed.length === 0 && contentUpdates.length === 0 && statusUpdates.length === 0) {
    return "add-card"
  }
  if (
    removed.length === 0 &&
    added.length === 0 &&
    contentUpdates.length === 0 &&
    statusUpdates.length === 1 &&
    linkUpdates.length === 0 &&
    !relChanged &&
    !sourceChanged
  ) {
    return "change-status"
  }
  if (
    removed.length === 0 &&
    added.length === 0 &&
    contentUpdates.length === 0 &&
    statusUpdates.length === 0 &&
    (relChanged || linkUpdates.length > 0) &&
    !sourceChanged
  ) {
    return "change-links"
  }
  if (
    removed.length === 0 &&
    added.length === 0 &&
    contentUpdates.length === 1 &&
    statusUpdates.length === 0 &&
    linkUpdates.length === 0 &&
    !relChanged &&
    !sourceChanged
  ) {
    return "edit-card"
  }
  return "update-path"
}

function changedRelationships(
  before: Relationship[],
  after: Relationship[],
  side: "before" | "after",
): Relationship[] {
  const beforeMap = new Map(before.map((relationship) => [relationship.id, relationship]))
  const afterMap = new Map(after.map((relationship) => [relationship.id, relationship]))
  const changed: Relationship[] = []
  for (const id of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const left = beforeMap.get(id)
    const right = afterMap.get(id)
    if (left && right && sameRelationship(left, right)) continue
    const selected = side === "before" ? left : right
    if (selected) changed.push(selected)
  }
  return changed
}

function sameExceptItem(before: PathWorkspace, after: PathWorkspace, id: string): boolean {
  if (before.sourceText !== after.sourceText) return false
  if ((before.relationships ?? []).length !== (after.relationships ?? []).length) return false
  const afterItems = new Map(after.items.map((item) => [item.id, item]))
  if (before.items.length !== after.items.length) return false
  for (const item of before.items) {
    if (item.id === id) continue
    const other = afterItems.get(item.id)
    if (!other || stableItem(item) !== stableItem(other)) return false
  }
  const beforeRels = [...(before.relationships ?? [])].map(cloneRelationship)
  const afterRels = [...(after.relationships ?? [])].map(cloneRelationship)
  return JSON.stringify(beforeRels) === JSON.stringify(afterRels)
}

function linkFieldsOnly(before: PathItem, after: PathItem): boolean {
  return comparable(before, { blankLinks: true }) === comparable(after, { blankLinks: true }) && stableItem(before) !== stableItem(after)
}

function statusOnly(before: PathItem, after: PathItem): boolean {
  if (before.status === after.status) return false
  return comparable(before, { blankStatus: true }) === comparable(after, { blankStatus: true })
}

function stableItem(item: PathItem): string {
  return comparable(item)
}

function comparable(item: PathItem, options: { blankLinks?: boolean; blankStatus?: boolean } = {}): string {
  const { updatedAt, ...rest } = cloneItem(item)
  void updatedAt
  if (rest.userEdited !== true) delete rest.userEdited
  if (!rest.blockedByIds?.length) delete rest.blockedByIds
  if (options.blankLinks) {
    rest.linkedItemIds = []
    delete rest.blockedByIds
  }
  if (options.blankStatus) rest.status = "not-started"
  return JSON.stringify(rest)
}

function stamp(item: PathItem): PathItem {
  return { ...cloneItem(item), updatedAt: nowIso() }
}

function cloneItem(item: PathItem): PathItem {
  return {
    ...item,
    linkedItemIds: [...item.linkedItemIds],
    blockedByIds: item.blockedByIds ? [...item.blockedByIds] : undefined,
  }
}

function cloneRelationship(relationship: Relationship): Relationship {
  return { ...relationship }
}

function sameRelationship(left: Relationship, right: Relationship): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function sameConnection(left: Relationship, right: Relationship): boolean {
  const pair = (relationship: Relationship) => [relationship.fromId, relationship.toId].sort().join("|")
  return pair(left) === pair(right) && left.kind === right.kind
}

function itemTitle(entry: HistoryEntry, id: string): string {
  return (
    entry.after.items.find((item) => item.id === id)?.title ??
    entry.before.items.find((item) => item.id === id)?.title ??
    "A card"
  )
}

function validateEntries(value: unknown): { entries: HistoryEntry[]; dropped: boolean } {
  if (!Array.isArray(value)) return { entries: [], dropped: value !== undefined }
  const entries: HistoryEntry[] = []
  let dropped = false
  for (const entry of value) {
    const valid = validateEntry(entry)
    if (valid) entries.push(valid)
    else dropped = true
  }
  return { entries, dropped }
}

function validateEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== HISTORY_SCHEMA_VERSION) return null
  if (typeof value.id !== "string" || typeof value.workspaceId !== "string" || typeof value.at !== "string") return null
  if (!OPERATIONS.has(value.operation as HistoryOperation)) return null
  if (!Array.isArray(value.affectedIds) || value.affectedIds.some((id) => typeof id !== "string")) return null
  const before = validateSlice(value.before)
  const after = validateSlice(value.after)
  if (!before || !after) return null
  return {
    id: value.id,
    schemaVersion: HISTORY_SCHEMA_VERSION,
    workspaceId: value.workspaceId,
    operation: value.operation as HistoryOperation,
    affectedIds: [...value.affectedIds],
    before,
    after,
    trackSourceText: value.trackSourceText === true,
    trackCurrentItemId: value.trackCurrentItemId === true,
    at: value.at,
  }
}

function validateSlice(value: unknown): HistorySlice | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.relationships)) return null
  const items: PathItem[] = []
  for (const item of value.items) {
    const valid = validateItem(item)
    if (!valid) return null
    items.push(valid)
  }
  const relationships: Relationship[] = []
  for (const relationship of value.relationships) {
    if (!isRecord(relationship)) return null
    if (typeof relationship.id !== "string" || typeof relationship.fromId !== "string" || typeof relationship.toId !== "string") {
      return null
    }
    if (typeof relationship.kind !== "string" || typeof relationship.reason !== "string") return null
    relationships.push(relationship as unknown as Relationship)
  }
  const slice: HistorySlice = { items, relationships }
  if (typeof value.sourceText === "string") slice.sourceText = value.sourceText
  if (typeof value.currentItemId === "string" || value.currentItemId === null) slice.currentItemId = value.currentItemId
  return slice
}

function serializedSize(undo: HistoryEntry[], redo: HistoryEntry[]): number {
  return JSON.stringify({ schemaVersion: HISTORY_SCHEMA_VERSION, undo, redo }).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
