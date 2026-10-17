import { byPosition } from "./order.ts"
import type { PathItem } from "./types.ts"

export function stepSequence(items: PathItem[]): PathItem[] {
  const steps = byPosition(items.filter((item) => item.type === "step"))
  if (steps.length > 0) return steps
  return byPosition(items)
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
