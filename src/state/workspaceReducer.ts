import { focusProgress } from "../domain/focus.ts"
import { createId, nowIso } from "../domain/ids.ts"
import { applyItemPatch, createItem } from "../domain/items.ts"
import { linkItems, removeItem, unlinkItems } from "../domain/links.ts"
import { applyUndo, pushUndo, type UndoEntry } from "../domain/undo.ts"
import type { PersistedSession } from "../domain/validate.ts"
import type { AppView, ItemPatch, PathItem, PathWorkspace, WorkspaceTab } from "../domain/types.ts"
import type { LoadedAppState } from "../storage/persistence.ts"

export interface WorkspaceState {
  workspaces: PathWorkspace[]
  activeId: string | null
  view: AppView
  tab: WorkspaceTab
  undoStack: UndoEntry[]
  notice: string | null
  message: string | null
  draftSource: string
  draftItems: PathItem[] | null
}

export type WorkspaceAction =
  | { type: "notice"; notice: string | null }
  | { type: "dismiss-notice" }
  | { type: "go-home" }
  | { type: "start-create"; sourceText: string }
  | { type: "go-settings" }
  | { type: "close-settings" }
  | { type: "set-draft"; sourceText: string }
  | { type: "set-review"; items: PathItem[] | null }
  | { type: "open"; id: string }
  | { type: "set-tab"; tab: WorkspaceTab }
  | { type: "enter-focus" }
  | { type: "exit-focus" }
  | { type: "create"; title: string; sourceText: string; items: PathItem[] }
  | { type: "update-item"; id: string; patch: ItemPatch; recordUndo: boolean }
  | { type: "add-item" }
  | { type: "delete-item"; id: string }
  | { type: "link"; sourceId: string; targetId: string }
  | { type: "unlink"; sourceId: string; targetId: string }
  | { type: "set-current"; id: string }
  | { type: "complete-current" }
  | { type: "move-step"; direction: -1 | 1 }
  | { type: "undo" }

export function createInitialState(loaded: LoadedAppState): WorkspaceState {
  const activeId = loaded.workspaces.some((workspace) => workspace.id === loaded.activeId)
    ? loaded.activeId
    : null
  let view = loaded.session.view
  if ((view === "workspace" || view === "focus") && !activeId) view = "home"
  return {
    workspaces: loaded.workspaces,
    activeId,
    view,
    tab: loaded.session.tab,
    undoStack: [],
    notice: loaded.notice,
    message: null,
    draftSource: loaded.session.draftSource,
    draftItems: loaded.session.draftItems,
  }
}

export function sessionFromState(state: WorkspaceState): PersistedSession {
  return {
    view: state.view,
    tab: state.tab,
    draftSource: state.draftSource,
    draftItems: state.draftItems,
  }
}

function activeWorkspace(state: WorkspaceState): PathWorkspace | null {
  return state.workspaces.find((workspace) => workspace.id === state.activeId) ?? null
}

function replaceActive(
  state: WorkspaceState,
  recipe: (workspace: PathWorkspace) => PathWorkspace,
  recordUndo: boolean,
  message: string | null,
): WorkspaceState {
  const current = activeWorkspace(state)
  if (!current) return state
  const nextWorkspace = recipe(current)
  return {
    ...state,
    message,
    undoStack: recordUndo
      ? pushUndo(state.undoStack, {
          workspaceId: current.id,
          items: current.items,
          currentItemId: current.currentItemId,
        })
      : state.undoStack,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === current.id ? nextWorkspace : workspace,
    ),
  }
}

function touch(
  workspace: PathWorkspace,
  items: PathItem[],
  currentItemId: string | null = workspace.currentItemId,
): PathWorkspace {
  return {
    ...workspace,
    items,
    currentItemId,
    updatedAt: nowIso(),
  }
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "notice":
      return state.notice === action.notice ? state : { ...state, notice: action.notice }
    case "dismiss-notice":
      return { ...state, notice: null }
    case "go-home":
      return { ...state, view: "home", message: null }
    case "start-create":
      return {
        ...state,
        view: "create",
        draftSource: action.sourceText,
        draftItems: null,
        message: null,
      }
    case "go-settings":
      return { ...state, view: "settings", message: null }
    case "close-settings":
      return {
        ...state,
        view: state.activeId ? "workspace" : "home",
        message: null,
      }
    case "set-draft":
      return state.draftSource === action.sourceText ? state : { ...state, draftSource: action.sourceText }
    case "set-review":
      return { ...state, draftItems: action.items }
    case "open":
      if (!state.workspaces.some((workspace) => workspace.id === action.id)) return state
      return { ...state, activeId: action.id, view: "workspace", message: null }
    case "set-tab":
      return { ...state, tab: action.tab }
    case "enter-focus": {
      const current = activeWorkspace(state)
      if (!current) return state
      const progress = focusProgress(current.items, current.currentItemId)
      const nextId = progress.current?.id ?? null
      const workspaces =
        nextId === current.currentItemId
          ? state.workspaces
          : state.workspaces.map((workspace) =>
              workspace.id === current.id ? touch(workspace, workspace.items, nextId) : workspace,
            )
      return { ...state, view: "focus", workspaces, message: null }
    }
    case "exit-focus":
      return { ...state, view: state.activeId ? "workspace" : "home" }
    case "create": {
      const id = createId()
      const now = nowIso()
      const first = action.items.find((item) => item.type === "step") ?? action.items[0]
      const workspace: PathWorkspace = {
        id,
        title: action.title.trim() || "Untitled path",
        sourceText: action.sourceText,
        items: action.items,
        currentItemId: first?.id ?? null,
        createdAt: now,
        updatedAt: now,
      }
      return {
        ...state,
        workspaces: [workspace, ...state.workspaces],
        activeId: id,
        view: "workspace",
        tab: "cards",
        draftSource: "",
        draftItems: null,
        message: "Path created. Change any card that does not look right.",
      }
    }
    case "update-item":
      return replaceActive(
        state,
        (workspace) =>
          touch(
            workspace,
            workspace.items.map((item) =>
              item.id === action.id ? applyItemPatch(item, action.patch) : item,
            ),
          ),
        action.recordUndo,
        null,
      )
    case "add-item": {
      const current = activeWorkspace(state)
      if (!current) return state
      const item = createItem({
        title: "New step",
        type: "step",
        position: current.items.reduce((max, entry) => Math.max(max, entry.position), -1) + 1,
        description: "Describe what to do.",
      })
      return replaceActive(
        state,
        (workspace) => touch(workspace, [...workspace.items, item], item.id),
        true,
        "Card added. You can undo this.",
      )
    }
    case "delete-item":
      return replaceActive(
        state,
        (workspace) => {
          const items = removeItem(workspace.items, action.id)
          const currentItemId =
            workspace.currentItemId === action.id ? (items[0]?.id ?? null) : workspace.currentItemId
          return touch(workspace, items, currentItemId)
        },
        true,
        "Card deleted. You can undo this.",
      )
    case "link": {
      const current = activeWorkspace(state)
      const source = current?.items.find((item) => item.id === action.sourceId)
      if (!current || !source || source.linkedItemIds.includes(action.targetId)) return state
      return replaceActive(
        state,
        (workspace) => touch(workspace, linkItems(workspace.items, action.sourceId, action.targetId)),
        true,
        "Link saved. You can undo this.",
      )
    }
    case "unlink":
      return replaceActive(
        state,
        (workspace) => touch(workspace, unlinkItems(workspace.items, action.sourceId, action.targetId)),
        true,
        "Link removed. You can undo this.",
      )
    case "set-current":
      return replaceActive(state, (workspace) => touch(workspace, workspace.items, action.id), false, null)
    case "complete-current":
      return replaceActive(
        state,
        (workspace) => {
          const progress = focusProgress(workspace.items, workspace.currentItemId)
          if (!progress.current) return workspace
          const now = nowIso()
          const completedId = progress.current.id
          const items = workspace.items.map((item) =>
            item.id === completedId ? { ...item, status: "completed" as const, updatedAt: now } : item,
          )
          const next = progress.sequence[progress.index + 1]
          return touch(workspace, items, next?.id ?? completedId)
        },
        true,
        "Step marked complete. You can undo this.",
      )
    case "move-step":
      return replaceActive(
        state,
        (workspace) => {
          const progress = focusProgress(workspace.items, workspace.currentItemId)
          const next = progress.sequence[progress.index + action.direction]
          if (!next) return workspace
          return touch(workspace, workspace.items, next.id)
        },
        false,
        null,
      )
    case "undo": {
      const entry = state.undoStack[state.undoStack.length - 1]
      if (!entry) return state
      return {
        ...state,
        undoStack: state.undoStack.slice(0, -1),
        workspaces: applyUndo(state.workspaces, entry),
        message: "Undid the last card change. Other paths were left as they are.",
      }
    }
    default:
      return state
  }
}
