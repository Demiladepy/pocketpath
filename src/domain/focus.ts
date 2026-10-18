import { byPosition } from "./order.ts"
import type { PathItem, Relationship } from "./types.ts"

export type NextActionState = "ready" | "blocked" | "complete" | "empty"

export interface FocusAlternative {
  id: string
  title: string
}

export interface FocusBlocker {
  id: string
  title: string
}

export interface FocusWaiting {
  stepId: string
  stepTitle: string
  blockers: FocusBlocker[]
  missingIds: string[]
}

export interface MissingDependency {
  stepId: string
  stepTitle: string
  missingIds: string[]
}

export interface NextActionPlan {
  state: NextActionState
  selectedId: string | null
  reason: string
  alternatives: FocusAlternative[]
  waiting: FocusWaiting[]
  missingDependencies: MissingDependency[]
}

interface PredecessorReport {
  blockers: PathItem[]
  missingIds: string[]
}

export function focusTasks(items: PathItem[]): PathItem[] {
  const steps = items.filter((item) => item.type === "step")
  if (steps.length > 0) return steps
  const tasks = items.filter((item) => item.type !== "note")
  return tasks.length > 0 ? tasks : items
}

export function stepSequence(items: PathItem[]): PathItem[] {
  const steps = byPosition(items.filter((item) => item.type === "step"))
  if (steps.length > 0) return steps
  return byPosition(items)
}

export function openBlockerTitles(item: PathItem, items: PathItem[]): string[] {
  return incompletePredecessors(item, items, []).blockers.map((blocker) => blocker.title)
}

export function isActionable(item: PathItem, items: PathItem[]): boolean {
  return item.status !== "completed" && openBlockerTitles(item, items).length === 0
}

export function readyStepIds(plan: NextActionPlan): string[] {
  if (!plan.selectedId) return []
  return [plan.selectedId, ...plan.alternatives.map((alternative) => alternative.id)]
}

export function selectNextAction(items: PathItem[], relationships: Relationship[] = []): NextActionPlan {
  const pool = focusTasks(items)
  if (pool.length === 0) {
    return {
      state: "empty",
      selectedId: null,
      reason: "Add a step to get a next action.",
      alternatives: [],
      waiting: [],
      missingDependencies: [],
    }
  }

  const unfinished = pool.filter((item) => item.status !== "completed")
  if (unfinished.length === 0) {
    return {
      state: "complete",
      selectedId: null,
      reason: "All steps are complete.",
      alternatives: [],
      waiting: [],
      missingDependencies: [],
    }
  }

  const reports = new Map<string, PredecessorReport>(
    unfinished.map((item) => [item.id, incompletePredecessors(item, items, relationships)]),
  )
  const waiting: FocusWaiting[] = unfinished
    .filter((item) => (reports.get(item.id)?.blockers.length ?? 0) > 0)
    .map((item) => {
      const report = reports.get(item.id) ?? { blockers: [], missingIds: [] }
      return {
        stepId: item.id,
        stepTitle: item.title,
        blockers: report.blockers.map((blocker) => ({ id: blocker.id, title: blocker.title })),
        missingIds: report.missingIds,
      }
    })
  const missingDependencies: MissingDependency[] = unfinished
    .filter((item) => (reports.get(item.id)?.missingIds.length ?? 0) > 0)
    .map((item) => ({
      stepId: item.id,
      stepTitle: item.title,
      missingIds: reports.get(item.id)?.missingIds ?? [],
    }))

  const ready = unfinished.filter((item) => (reports.get(item.id)?.blockers.length ?? 0) === 0)
  if (ready.length === 0) {
    return {
      state: "blocked",
      selectedId: null,
      reason: explainBlocked(waiting),
      alternatives: [],
      waiting,
      missingDependencies,
    }
  }

  const useOrder = !hasHardDependencies(items, relationships)
  const depth = orderDepths(ready, relationships)
  const ranked = [...ready].sort((left, right) => compareEligible(left, right, useOrder, depth))
  const selected = ranked[0]
  if (!selected) {
    return {
      state: "blocked",
      selectedId: null,
      reason: explainBlocked(waiting),
      alternatives: [],
      waiting,
      missingDependencies,
    }
  }
  const rest = ranked.slice(1)
  const missing = (reports.get(selected.id)?.missingIds.length ?? 0) > 0
  return {
    state: "ready",
    selectedId: selected.id,
    reason: explainReady(selected, rest, useOrder, depth, missing),
    alternatives: rest.map((item) => ({ id: item.id, title: item.title })),
    waiting,
    missingDependencies,
  }
}

export function nextActionableStep(
  items: PathItem[],
  currentItemId: string | null,
  relationships: Relationship[] = [],
): PathItem | null {
  const plan = selectNextAction(items, relationships)
  if (plan.state !== "ready" || !plan.selectedId) return null
  const chosen = plan.selectedId === currentItemId ? plan.alternatives[0]?.id : plan.selectedId
  if (!chosen) return null
  return items.find((item) => item.id === chosen) ?? null
}

export function focusTarget(
  items: PathItem[],
  currentItemId: string | null,
  relationships: Relationship[] = [],
): { id: string | null; reason: string | null } {
  const plan = selectNextAction(items, relationships)
  if (plan.state === "ready" && plan.selectedId) return { id: plan.selectedId, reason: plan.reason }
  return { id: currentItemId, reason: plan.reason }
}

export function focusProgress(items: PathItem[], currentItemId: string | null) {
  const sequence = stepSequence(items)
  const found = sequence.findIndex((item) => item.id === currentItemId)
  const index = found >= 0 ? found : 0
  return {
    sequence,
    index,
    total: sequence.length,
    completed: sequence.filter((item) => item.status === "completed").length,
    current: sequence[index] ?? null,
  }
}

function incompletePredecessors(
  item: PathItem,
  items: PathItem[],
  relationships: Relationship[],
): PredecessorReport {
  const ids: string[] = []
  for (const id of item.blockedByIds ?? []) {
    if (id !== item.id && !ids.includes(id)) ids.push(id)
  }
  for (const relationship of relationships) {
    if (relationship.reviewStatus !== "accepted" || relationship.kind !== "before" || relationship.toId !== item.id) {
      continue
    }
    if (relationship.fromId !== item.id && !ids.includes(relationship.fromId)) ids.push(relationship.fromId)
  }
  const blockers: PathItem[] = []
  const missingIds: string[] = []
  for (const id of ids) {
    const found = items.find((candidate) => candidate.id === id)
    if (!found) {
      missingIds.push(id)
      continue
    }
    if (found.status !== "completed") blockers.push(found)
  }
  return { blockers, missingIds }
}

function hasHardDependencies(items: PathItem[], relationships: Relationship[]): boolean {
  const known = new Set(items.map((item) => item.id))
  if (items.some((item) => (item.blockedByIds ?? []).some((id) => known.has(id) && id !== item.id))) return true
  return relationships.some(
    (relationship) =>
      relationship.kind === "before" &&
      relationship.reviewStatus === "accepted" &&
      known.has(relationship.fromId) &&
      known.has(relationship.toId) &&
      relationship.fromId !== relationship.toId,
  )
}

function orderDepths(ready: PathItem[], relationships: Relationship[]): Map<string, number> {
  const unfinished = new Set(ready.map((item) => item.id))
  const depth = new Map<string, number>()
  for (const item of ready) {
    const count = relationships.filter(
      (relationship) =>
        relationship.kind === "order" &&
        relationship.reviewStatus === "accepted" &&
        relationship.toId === item.id &&
        unfinished.has(relationship.fromId),
    ).length
    depth.set(item.id, count)
  }
  return depth
}

function priorityRank(item: PathItem): number {
  if (item.priority === "high") return 0
  if (item.priority === "low") return 2
  return 1
}

function deadlineKey(item: PathItem): string | null {
  const date = item.dueDate ?? item.rangeEnd
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const time = item.dueDate && item.dueTime && /^\d{2}:\d{2}$/.test(item.dueTime) ? item.dueTime : "99:99"
  return `${date}T${time}`
}

function deadlinePhrase(item: PathItem): string {
  if (item.dateLabel) return item.dateLabel
  if (item.dueDate && item.dueTime) return `${item.dueDate} ${item.dueTime}`
  return item.dueDate ?? item.rangeEnd ?? "the listed date"
}

function compareEligible(left: PathItem, right: PathItem, useOrder: boolean, depth: Map<string, number>): number {
  const priority = priorityRank(left) - priorityRank(right)
  if (priority !== 0) return priority
  const leftDeadline = deadlineKey(left)
  const rightDeadline = deadlineKey(right)
  if (leftDeadline && rightDeadline && leftDeadline !== rightDeadline) return leftDeadline < rightDeadline ? -1 : 1
  if (leftDeadline && !rightDeadline) return -1
  if (!leftDeadline && rightDeadline) return 1
  if (useOrder) {
    const order = (depth.get(left.id) ?? 0) - (depth.get(right.id) ?? 0)
    if (order !== 0) return order
  }
  return left.id.localeCompare(right.id)
}

function explainReady(
  winner: PathItem,
  rest: PathItem[],
  useOrder: boolean,
  depth: Map<string, number>,
  missing: boolean,
): string {
  const rival = rest[0]
  let reason: string
  if (!rival) {
    reason = "This is the only step that is ready to start."
  } else if (priorityRank(winner) < priorityRank(rival)) {
    reason = winner.priority
      ? `This step is ready to start. Its priority is ${winner.priority}.`
      : "This step is ready to start. The other ready steps have low priority."
  } else if (earlierDeadline(winner, rival)) {
    reason = `This step is ready to start. It has the earliest deadline, ${deadlinePhrase(winner)}.`
  } else if (useOrder && (depth.get(winner.id) ?? 0) < (depth.get(rival.id) ?? 0)) {
    reason = "No step waits on another. This one is earlier in the listed order."
  } else {
    reason = "Several steps are ready to start and none is a better match, so you can choose another."
  }
  if (!missing) return reason
  return `${reason} A listed predecessor is missing, so this step stays available.`
}

function earlierDeadline(winner: PathItem, rival: PathItem): boolean {
  const winnerKey = deadlineKey(winner)
  const rivalKey = deadlineKey(rival)
  if (!winnerKey) return false
  if (!rivalKey) return true
  return winnerKey < rivalKey
}

function explainBlocked(waiting: FocusWaiting[]): string {
  const parts = waiting.map((entry) => {
    const names = entry.blockers.map((blocker) => blocker.title).join(", ")
    return `“${entry.stepTitle}” waits on ${names}.`
  })
  return `Every unfinished step is waiting. ${parts.join(" ")}`
}
