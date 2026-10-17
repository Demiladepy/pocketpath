import { Circle, CircleCheck, CircleDot } from "lucide-react"
import { STATUS_LABELS, TYPE_LABELS } from "../domain/labels.ts"
import type { PathItemStatus, PathItemType } from "../domain/types.ts"

const STATUS_ICONS = {
  "not-started": Circle,
  "in-progress": CircleDot,
  completed: CircleCheck,
} satisfies Record<PathItemStatus, typeof Circle>

export function StatusBadge({ status }: { status: PathItemStatus }) {
  const Icon = STATUS_ICONS[status]
  return (
    <span className={`badge badge-${status}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={2} />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function TypeBadge({ type }: { type: PathItemType }) {
  return <span className="badge badge-type">{TYPE_LABELS[type]}</span>
}
