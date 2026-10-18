export type PathItemType =
  | "goal"
  | "step"
  | "requirement"
  | "deadline"
  | "resource"
  | "person"
  | "note"

export type PathItemStatus = "not-started" | "in-progress" | "completed"

export type ItemPriority = "high" | "normal" | "low"

export type ItemOrigin = "extracted" | "manual"

export type DateCertainty = "exact" | "resolved" | "approximate" | "unresolved"

export type ExtractionStatus = "ready" | "partial" | "clarification" | "failed" | "unsupported"

export type ExtractionConfidence = "high" | "medium" | "low"

export type EvidenceBasis = "stated" | "inferred"

export type ReviewStatus = "pending" | "accepted" | "rejected"

export type RelationshipKind =
  | "satisfies"
  | "requires"
  | "before"
  | "applies-to"
  | "supports"
  | "order"
  | "connects"

export interface Relationship {
  id: string
  fromId: string
  toId: string
  kind: RelationshipKind
  reason: string
  basis: EvidenceBasis
  confidence: ExtractionConfidence
  reviewStatus: ReviewStatus
}

export interface PathItem {
  id: string
  type: PathItemType
  title: string
  description: string
  status: PathItemStatus
  position: number
  dueDate?: string
  dueTime?: string
  timeZone?: string
  deadlineReview?: string
  rangeStart?: string
  rangeEnd?: string
  recurrence?: string
  linkedItemIds: string[]
  blockedByIds?: string[]
  priority?: ItemPriority
  actionInstruction?: string
  origin?: ItemOrigin
  userEdited?: boolean
  sourceExcerpt?: string
  sourceId?: string
  dateLabel?: string
  dateCertainty?: DateCertainty
  spokenInstruction?: string
  reviewAccepted?: boolean
  confidence?: ExtractionConfidence
  basis?: EvidenceBasis
  reviewStatus?: ReviewStatus
  createdAt: string
  updatedAt: string
}

export type SourceKind =
  | "paste"
  | "text-file"
  | "markdown"
  | "pdf"
  | "docx"
  | "url"
  | "image"
  | "email-file"

export interface SourceRef {
  kind: SourceKind
  filename?: string
  url?: string
}

export interface PathWorkspace {
  id: string
  title: string
  sourceText: string
  sourceRef?: SourceRef
  items: PathItem[]
  relationships?: Relationship[]
  currentItemId: string | null
  createdAt: string
  updatedAt: string
}

export interface AccessibilityPreferences {
  fontScale: "normal" | "large" | "extra-large"
  reducedMotion: boolean
  highContrast: boolean
  readAloudEnabled: boolean
  focusMode: boolean
}

export type AppView = "home" | "create" | "workspace" | "focus" | "settings"

export type WorkspaceTab = "cards" | "map" | "steps"

export interface ItemPatch {
  type?: PathItemType
  title?: string
  description?: string
  status?: PathItemStatus
  dueDate?: string
  position?: number
  priority?: ItemPriority | ""
  actionInstruction?: string
}
