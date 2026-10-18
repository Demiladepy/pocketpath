import type {
  DateCertainty,
  EvidenceBasis,
  ExtractionConfidence,
  ExtractionStatus,
  PathItemType,
  ReviewStatus,
} from "../types.ts"

export interface ExtractionInput {
  text: string
  now: Date
  timeZone?: string
  sourceLabel?: string
}

export interface ExtractionWarning {
  code:
    | "merged-duplicate"
    | "missing-deadline"
    | "conflicting-dates"
    | "inferred-goal"
    | "inferred-order"
    | "ambiguous-date"
    | "past-deadline"
    | "dst-time"
    | "missing-prerequisite"
    | "cycle-prevented"
    | "duplicate-link"
    | "no-goal"
    | "generic-steps"
    | "empty-card"
    | "duplicate-card"
    | "unresolved-deadline"
    | "no-steps"
    | "malformed-link"
    | "circular-dependency"
    | "insufficient-evidence"
  message: string
  draftId?: string
}

export interface ExtractionError {
  code: "empty" | "no-action" | "provider" | "too-long" | "unsupported"
  message: string
  clarification: string
}

export interface DraftItem {
  id: string
  type: PathItemType
  title: string
  description: string
  sourceExcerpt: string
  confidence: ExtractionConfidence
  basis: EvidenceBasis
  reviewStatus: ReviewStatus
  dueDate?: string
  dueTime?: string
  timeZone?: string
  deadlineReview?: string
  rangeStart?: string
  rangeEnd?: string
  recurrence?: string
  dateLabel?: string
  dateCertainty?: DateCertainty
  blockedByIds: string[]
  warnings: string[]
}

export interface ExtractionDraft {
  title: string
  items: DraftItem[]
  warnings: ExtractionWarning[]
  error: ExtractionError | null
  status: ExtractionStatus
  notice: string | null
  sourceLines: string[]
  sourceText: string
}

export interface ExtractionProvider {
  readonly id: string
  extract(input: ExtractionInput): ExtractionDraft
}
