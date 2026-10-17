export type PathItemType =
  | "goal"
  | "step"
  | "requirement"
  | "deadline"
  | "resource"
  | "person"
  | "note"

export type PathItemStatus = "not-started" | "in-progress" | "completed"

export interface PathItem {
  id: string
  type: PathItemType
  title: string
  description: string
  status: PathItemStatus
  position: number
  dueDate?: string
  linkedItemIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PathWorkspace {
  id: string
  title: string
  sourceText: string
  items: PathItem[]
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
}
