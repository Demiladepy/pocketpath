import { sanitizeLinks } from "./links.ts"
import { validateRelationships } from "./relationships.ts"
import type {
  AccessibilityPreferences,
  AppView,
  DateCertainty,
  EvidenceBasis,
  ExtractionConfidence,
  ExtractionStatus,
  ItemOrigin,
  ItemPriority,
  Relationship,
  RelationshipKind,
  ReviewStatus,
  SourceKind,
  SourceRef,
  PathItem,
  PathItemStatus,
  PathItemType,
  PathWorkspace,
  WorkspaceTab,
} from "./types.ts"

const ITEM_TYPES = new Set<PathItemType>([
  "goal",
  "step",
  "requirement",
  "deadline",
  "resource",
  "person",
  "note",
])

const STATUSES = new Set<PathItemStatus>(["not-started", "in-progress", "completed"])
const PRIORITIES = new Set<ItemPriority>(["high", "normal", "low"])
const ORIGINS = new Set<ItemOrigin>(["extracted", "manual"])
const CERTAINTIES = new Set<DateCertainty>(["exact", "resolved", "approximate", "unresolved"])
const EXTRACTION = new Set<ExtractionStatus>(["ready", "partial", "clarification", "failed", "unsupported"])
const CONFIDENCE = new Set<ExtractionConfidence>(["high", "medium", "low"])
const BASIS = new Set<EvidenceBasis>(["stated", "inferred"])
const REVIEW = new Set<ReviewStatus>(["pending", "accepted", "rejected"])
const RELATIONSHIP_KINDS = new Set<RelationshipKind>([
  "satisfies",
  "requires",
  "before",
  "applies-to",
  "supports",
  "order",
  "connects",
])
const VIEWS = new Set<AppView>(["home", "create", "workspace", "focus", "settings"])
const TABS = new Set<WorkspaceTab>(["cards", "map", "steps"])
const SCALES = new Set<AccessibilityPreferences["fontScale"]>(["normal", "large", "extra-large"])

export const defaultPreferences: AccessibilityPreferences = {
  fontScale: "normal",
  reducedMotion: false,
  highContrast: false,
  readAloudEnabled: false,
  focusMode: false,
}

export interface PersistedSession {
  view: AppView
  tab: WorkspaceTab
  draftSource: string
  draftItems: PathItem[] | null
  draftTitle: string
  extractionNotice: string | null
  extractionStatus: ExtractionStatus | null
  draftRelationships: Relationship[]
  draftMode: "create" | "merge"
  draftSourceRef: SourceRef | null
}

export const defaultSession: PersistedSession = {
  view: "home",
  tab: "cards",
  draftSource: "",
  draftItems: null,
  draftTitle: "",
  extractionNotice: null,
  extractionStatus: null,
  draftRelationships: [],
  draftMode: "create",
  draftSourceRef: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function validateItem(value: unknown): PathItem | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== "string" || value.id.length === 0) return null
  if (typeof value.title !== "string") return null
  if (typeof value.description !== "string") return null
  if (typeof value.position !== "number" || !Number.isFinite(value.position)) return null
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null
  if (typeof value.type !== "string" || !ITEM_TYPES.has(value.type as PathItemType)) return null
  if (typeof value.status !== "string" || !STATUSES.has(value.status as PathItemStatus)) return null
  if (!Array.isArray(value.linkedItemIds) || value.linkedItemIds.some((id) => typeof id !== "string")) {
    return null
  }

  const item: PathItem = {
    id: value.id,
    type: value.type as PathItemType,
    title: value.title,
    description: value.description,
    status: value.status as PathItemStatus,
    position: value.position,
    linkedItemIds: [...value.linkedItemIds],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
  if (typeof value.dueDate === "string" && value.dueDate.length > 0) item.dueDate = value.dueDate
  item.blockedByIds = Array.isArray(value.blockedByIds)
    ? value.blockedByIds.filter((id): id is string => typeof id === "string")
    : []
  if (typeof value.origin === "string" && ORIGINS.has(value.origin as ItemOrigin)) {
    item.origin = value.origin as ItemOrigin
  }
  if (value.userEdited === true) item.userEdited = true
  if (typeof value.sourceExcerpt === "string") item.sourceExcerpt = value.sourceExcerpt
  if (typeof value.sourceId === "string" && value.sourceId.length > 0) item.sourceId = value.sourceId
  if (typeof value.dateLabel === "string" && value.dateLabel.length > 0) item.dateLabel = value.dateLabel
  if (typeof value.dateCertainty === "string" && CERTAINTIES.has(value.dateCertainty as DateCertainty)) {
    item.dateCertainty = value.dateCertainty as DateCertainty
  }
  if (typeof value.dueTime === "string" && /^\d{2}:\d{2}$/.test(value.dueTime)) item.dueTime = value.dueTime
  if (typeof value.timeZone === "string" && value.timeZone.length > 0) item.timeZone = value.timeZone
  if (typeof value.deadlineReview === "string" && value.deadlineReview.length > 0) item.deadlineReview = value.deadlineReview
  if (typeof value.rangeStart === "string" && value.rangeStart.length > 0) item.rangeStart = value.rangeStart
  if (typeof value.rangeEnd === "string" && value.rangeEnd.length > 0) item.rangeEnd = value.rangeEnd
  if (typeof value.recurrence === "string" && value.recurrence.length > 0) item.recurrence = value.recurrence
  if (typeof value.spokenInstruction === "string" && value.spokenInstruction.length > 0) {
    item.spokenInstruction = value.spokenInstruction
  }
  if (typeof value.priority === "string" && PRIORITIES.has(value.priority as ItemPriority)) {
    item.priority = value.priority as ItemPriority
  }
  if (typeof value.actionInstruction === "string" && value.actionInstruction.trim().length > 0) {
    item.actionInstruction = value.actionInstruction.trim()
  }
  if (value.reviewAccepted === true) item.reviewAccepted = true
  if (typeof value.confidence === "string" && CONFIDENCE.has(value.confidence as ExtractionConfidence)) {
    item.confidence = value.confidence as ExtractionConfidence
  }
  if (typeof value.basis === "string" && BASIS.has(value.basis as EvidenceBasis)) {
    item.basis = value.basis as EvidenceBasis
  }
  if (typeof value.reviewStatus === "string" && REVIEW.has(value.reviewStatus as ReviewStatus)) {
    item.reviewStatus = value.reviewStatus as ReviewStatus
  }
  return item
}

export function validateWorkspaces(input: unknown): { workspaces: PathWorkspace[]; notice: string | null } {
  if (!Array.isArray(input)) {
    return {
      workspaces: [],
      notice: "Saved paths could not be read. Starting fresh so you can continue.",
    }
  }

  const workspaces: PathWorkspace[] = []
  let dropped = false
  let repaired = false

  for (const entry of input) {
    if (!isRecord(entry)) {
      dropped = true
      continue
    }
    if (typeof entry.id !== "string" || typeof entry.title !== "string" || typeof entry.sourceText !== "string") {
      dropped = true
      continue
    }
    if (typeof entry.createdAt !== "string" || typeof entry.updatedAt !== "string" || !Array.isArray(entry.items)) {
      dropped = true
      continue
    }

    const items: PathItem[] = []
    const seen = new Set<string>()
    for (const rawItem of entry.items) {
      const item = validateItem(rawItem)
      if (!item || seen.has(item.id)) {
        repaired = true
        continue
      }
      seen.add(item.id)
      items.push(item)
    }

    const links = sanitizeLinks(items)
    if (links.repaired) repaired = true
    const known = new Set(links.items.map((item) => item.id))
    const cleaned = links.items.map((item) => {
      const blockers = (item.blockedByIds ?? []).filter((id) => known.has(id) && id !== item.id)
      if (blockers.length === (item.blockedByIds ?? []).length) return item
      repaired = true
      return { ...item, blockedByIds: blockers }
    })

    const requestedCurrent = typeof entry.currentItemId === "string" ? entry.currentItemId : null
    const currentExists = requestedCurrent !== null && cleaned.some((item) => item.id === requestedCurrent)
    if (requestedCurrent && !currentExists) repaired = true

    const relationships = validateStoredRelationships(entry.relationships, cleaned)
    if (relationships.dropped) repaired = true
    const sourceRef = validateSourceRef(entry.sourceRef)

    workspaces.push({
      id: entry.id,
      title: entry.title,
      sourceText: entry.sourceText,
      ...(sourceRef ? { sourceRef } : {}),
      items: cleaned,
      relationships: relationships.relationships,
      currentItemId: currentExists ? requestedCurrent : (cleaned[0]?.id ?? null),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })
  }

  const notices: string[] = []
  if (dropped) notices.push("Some saved paths were unreadable and were skipped.")
  if (repaired) notices.push("A broken link or missing step was repaired so you can keep going.")
  return { workspaces, notice: notices.length > 0 ? notices.join(" ") : null }
}

export function validatePreferences(input: unknown): AccessibilityPreferences {
  if (!isRecord(input)) return { ...defaultPreferences }
  const fontScale = SCALES.has(input.fontScale as AccessibilityPreferences["fontScale"])
    ? (input.fontScale as AccessibilityPreferences["fontScale"])
    : "normal"
  return {
    fontScale,
    reducedMotion: input.reducedMotion === true,
    highContrast: input.highContrast === true,
    readAloudEnabled: input.readAloudEnabled === true,
    focusMode: input.focusMode === true,
  }
}

export function validateSession(input: unknown): PersistedSession {
  if (!isRecord(input)) return { ...defaultSession, draftItems: null }
  const view = VIEWS.has(input.view as AppView) ? (input.view as AppView) : "home"
  const tab = TABS.has(input.tab as WorkspaceTab) ? (input.tab as WorkspaceTab) : "cards"
  const draftSource = typeof input.draftSource === "string" ? input.draftSource : ""
  let draftItems: PathItem[] | null = null
  if (Array.isArray(input.draftItems)) {
    const items = input.draftItems.map(validateItem).filter((item): item is PathItem => item !== null)
    draftItems = items.length > 0 ? sanitizeLinks(items).items : null
  }
  const draftTitle = typeof input.draftTitle === "string" ? input.draftTitle : ""
  const extractionNotice = typeof input.extractionNotice === "string" ? input.extractionNotice : null
  const storedStatus = input.extractionStatus === "weak" ? "partial" : input.extractionStatus
  const extractionStatus = EXTRACTION.has(storedStatus as ExtractionStatus)
    ? (storedStatus as ExtractionStatus)
    : null
  const draftRelationships = validateStoredRelationships(input.draftRelationships, draftItems ?? []).relationships
  const draftMode = input.draftMode === "merge" ? "merge" : "create"
  const draftSourceRef = validateSourceRef(input.draftSourceRef)
  return {
    view,
    tab,
    draftSource,
    draftItems,
    draftTitle,
    extractionNotice,
    extractionStatus,
    draftRelationships,
    draftMode,
    draftSourceRef,
  }
}

const SOURCE_KINDS = new Set<SourceKind>([
  "paste",
  "text-file",
  "markdown",
  "pdf",
  "docx",
  "url",
  "image",
  "email-file",
])

export function validateSourceRef(value: unknown): SourceRef | null {
  if (!isRecord(value) || !SOURCE_KINDS.has(value.kind as SourceKind)) return null
  const ref: SourceRef = { kind: value.kind as SourceKind }
  if (typeof value.filename === "string") {
    const filename = value.filename.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180)
    if (filename) ref.filename = filename
  }
  if (typeof value.url === "string") {
    const url = value.url.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 2000)
    if (url) ref.url = url
  }
  return ref
}

function validateStoredRelationships(input: unknown, items: PathItem[]): { relationships: Relationship[]; dropped: boolean } {
  if (!Array.isArray(input)) return { relationships: [], dropped: false }
  const parsed: Relationship[] = []
  let dropped = false
  for (const entry of input) {
    const relationship = validateRelationship(entry)
    if (!relationship) {
      dropped = true
      continue
    }
    parsed.push(relationship)
  }
  const checked = validateRelationships(items, parsed)
  return { relationships: checked.relationships, dropped: dropped || checked.dropped }
}

function validateRelationship(value: unknown): Relationship | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== "string" || typeof value.fromId !== "string" || typeof value.toId !== "string") return null
  if (typeof value.reason !== "string" || value.reason.length === 0) return null
  if (!RELATIONSHIP_KINDS.has(value.kind as RelationshipKind)) return null
  if (!BASIS.has(value.basis as Relationship["basis"])) return null
  if (!CONFIDENCE.has(value.confidence as Relationship["confidence"])) return null
  if (!REVIEW.has(value.reviewStatus as Relationship["reviewStatus"])) return null
  return {
    id: value.id,
    fromId: value.fromId,
    toId: value.toId,
    kind: value.kind as RelationshipKind,
    reason: value.reason,
    basis: value.basis as Relationship["basis"],
    confidence: value.confidence as Relationship["confidence"],
    reviewStatus: value.reviewStatus as Relationship["reviewStatus"],
  }
}
