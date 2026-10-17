import { sanitizeLinks } from "./links.ts"
import type {
  AccessibilityPreferences,
  AppView,
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
}

export const defaultSession: PersistedSession = {
  view: "home",
  tab: "cards",
  draftSource: "",
  draftItems: null,
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

    const requestedCurrent = typeof entry.currentItemId === "string" ? entry.currentItemId : null
    const currentExists = requestedCurrent !== null && links.items.some((item) => item.id === requestedCurrent)
    if (requestedCurrent && !currentExists) repaired = true

    workspaces.push({
      id: entry.id,
      title: entry.title,
      sourceText: entry.sourceText,
      items: links.items,
      currentItemId: currentExists ? requestedCurrent : (links.items[0]?.id ?? null),
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
  return { view, tab, draftSource, draftItems }
}
