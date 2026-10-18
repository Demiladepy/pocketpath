import { byPosition } from "./order.ts"
import { isActionable, openBlockerTitles, selectNextAction } from "./focus.ts"
import type { PathItem, Relationship, RelationshipKind } from "./types.ts"

export type MapEdgeRole = "order" | "blocker" | "info"

export interface MapEdge {
  key: string
  fromId: string
  toId: string
  role: MapEdgeRole
  label: string
}

export interface MapReading {
  edges: MapEdge[]
  startId: string | null
  explanation: string
}

export function edgeRole(kind: RelationshipKind): MapEdgeRole {
  if (kind === "before") return "blocker"
  if (kind === "order") return "order"
  return "info"
}

export function readMap(items: PathItem[], relationships: Relationship[]): MapReading {
  const accepted = relationships.filter((relationship) => relationship.reviewStatus !== "rejected")
  const covered = new Set<string>()
  const edges: MapEdge[] = []

  for (const relationship of accepted) {
    const from = items.find((item) => item.id === relationship.fromId)
    const to = items.find((item) => item.id === relationship.toId)
    if (!from || !to) continue
    const role = edgeRole(relationship.kind)
    const key = pairKey(from.id, to.id, role)
    if (covered.has(key)) continue
    covered.add(key)
    edges.push({ key, fromId: from.id, toId: to.id, role, label: edgeLabel(role, from.title, to.title) })
  }

  for (const item of items) {
    for (const blockerId of item.blockedByIds ?? []) {
      const key = pairKey(blockerId, item.id, "blocker")
      if (covered.has(key) || !items.some((candidate) => candidate.id === blockerId)) continue
      covered.add(key)
      const blocker = items.find((candidate) => candidate.id === blockerId)
      if (!blocker) continue
      edges.push({
        key,
        fromId: blockerId,
        toId: item.id,
        role: "blocker",
        label: edgeLabel("blocker", blocker.title, item.title),
      })
    }
    for (const linkedId of item.linkedItemIds) {
      if (item.id > linkedId) continue
      const key = pairKey(item.id, linkedId, "info")
      const ordered = pairKey(item.id, linkedId, "order")
      const blocking = pairKey(item.id, linkedId, "blocker")
      if (covered.has(key) || covered.has(ordered) || covered.has(blocking)) continue
      const other = items.find((candidate) => candidate.id === linkedId)
      if (!other) continue
      covered.add(key)
      edges.push({
        key,
        fromId: item.id,
        toId: linkedId,
        role: "info",
        label: edgeLabel("info", item.title, other.title),
      })
    }
  }

  const steps = byPosition(items.filter((item) => item.type === "step"))
  const sequence = steps.length > 0 ? steps : byPosition(items)
  const plan = selectNextAction(items, relationships)
  const recommended = plan.selectedId ? items.find((item) => item.id === plan.selectedId) ?? null : null
  const start = recommended ?? sequence.find((item) => isActionable(item, items)) ?? sequence[0] ?? null
  return { edges, startId: start?.id ?? null, explanation: explainStart(start, items, edges) }
}

function explainStart(start: PathItem | null, items: PathItem[], edges: MapEdge[]): string {
  if (!start) return "Add a card to see where to begin."
  const waiting = openBlockerTitles(start, items)
  if (waiting.length > 0) {
    return `Start with “${waiting[0]}”. “${start.title}” waits on it.`
  }
  const roles = new Set(edges.map((edge) => edge.role))
  const notes = ["Start with “" + start.title + "”."]
  if (roles.has("order")) notes.push("Dashed lines are a suggested order, not a rule that one step must wait.")
  if (roles.has("blocker")) notes.push("Solid lines mean the later card waits on the earlier one.")
  if (roles.has("info")) notes.push("Dotted lines are extra information, such as a document, person, or deadline.")
  return notes.join(" ")
}

function edgeLabel(role: MapEdgeRole, from: string, to: string): string {
  if (role === "order") return `${from} is listed before ${to}`
  if (role === "blocker") return `${to} waits on ${from}`
  return `${from} is connected to ${to}`
}

function pairKey(left: string, right: string, role: MapEdgeRole): string {
  return `${role}:${[left, right].sort().join(":")}`
}
