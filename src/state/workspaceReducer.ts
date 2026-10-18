import { readyStepIds, selectNextAction } from "../domain/focus.ts"
import { readMap } from "../domain/mapLayout.ts"
import { parseInstructions } from "../domain/parseInstructions.ts"
import {
  applyReextract,
  compareExtraction,
  reextractNeedsReview,
  reextractReady,
  type FieldChoice,
  type ReextractDecision,
  type ReextractField,
  type ReextractPlan,
} from "../domain/reextract.ts"
import { createId, nowIso } from "../domain/ids.ts"
import { applyItemPatch, createItem } from "../domain/items.ts"
import { linkItems, removeItem, unlinkItems } from "../domain/links.ts"
import { userConnection } from "../domain/relationships.ts"
import { commitReview } from "../domain/reviewCommit.ts"
import { applyHistory, boundHistory, captureChange, coalesceEdit, type HistoryEntry } from "../domain/history.ts"
import type { PersistedSession } from "../domain/validate.ts"
import type { AppView, ExtractionStatus, ItemPatch, PathItem, PathWorkspace, Relationship, SourceRef, WorkspaceTab } from "../domain/types.ts"
import type { ExtractionUpdate } from "../domain/mergeExtraction.ts"
import type { ExtractionWarning } from "../domain/extraction/types.ts"
import type { LoadedAppState } from "../storage/persistence.ts"

export interface WorkspaceState {
  workspaces: PathWorkspace[]
  activeId: string | null
  view: AppView
  tab: WorkspaceTab
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  undoConflict: { message: string; itemId: string | null; direction: "undo" | "redo" } | null
  notice: string | null
  message: string | null
  draftSource: string
  draftItems: PathItem[] | null
  draftTitle: string
  extractionNotice: string | null
  extractionStatus: ExtractionStatus | null
  draftRelationships: Relationship[]
  draftWarnings: ExtractionWarning[]
  draftMode: "create" | "merge"
  draftSourceRef: SourceRef | null
  settingsReturn: AppView | null
  reextractPlan: ReextractPlan | null
  pendingReview: {
    additions: PathItem[]
    updates: ExtractionUpdate[]
    notice: string | null
    status: ExtractionStatus
  } | null
}

export type WorkspaceAction =
  | { type: "notice"; notice: string | null }
  | { type: "dismiss-notice" }
  | { type: "go-home" }
  | { type: "start-create"; sourceText: string }
  | { type: "go-settings" }
  | { type: "close-settings" }
  | { type: "set-draft"; sourceText: string; sourceRef?: SourceRef | null }
  | {
      type: "set-review"
      items: PathItem[] | null
      title?: string
      notice?: string | null
      status?: ExtractionStatus | null
      relationships?: Relationship[]
      warnings?: ExtractionWarning[]
      mode?: "create" | "merge"
    }
  | { type: "set-draft-title"; title: string }
  | { type: "organize-again" }
  | { type: "reextract"; sourceText: string }
  | { type: "reextract-decision"; id: string; decision: ReextractDecision }
  | { type: "reextract-field"; id: string; field: ReextractField; choice: FieldChoice }
  | { type: "reextract-relationship"; id: string; decision: "accept" | "reject" }
  | { type: "commit-reextract" }
  | { type: "accept-addition"; item: PathItem }
  | { type: "accept-update"; existingId: string; proposed: PathItem }
  | { type: "dismiss-suggestion"; id: string }
  | { type: "dismiss-review" }
  | { type: "open"; id: string }
  | { type: "rename-workspace"; id: string; title: string }
  | { type: "delete-workspace"; id: string }
  | { type: "set-tab"; tab: WorkspaceTab }
  | { type: "enter-focus" }
  | { type: "exit-focus" }
  | { type: "create"; title: string; sourceText: string; items: PathItem[]; relationships?: Relationship[]; sourceRef?: SourceRef | null }
  | { type: "commit-merge"; items: PathItem[]; relationships: Relationship[] }
  | { type: "cancel-draft" }
  | { type: "update-item"; id: string; patch: ItemPatch; recordUndo: boolean }
  | { type: "add-item" }
  | { type: "delete-item"; id: string }
  | { type: "link"; sourceId: string; targetId: string }
  | { type: "unlink"; sourceId: string; targetId: string }
  | { type: "set-current"; id: string }
  | { type: "complete-current" }
  | { type: "move-step"; direction: -1 | 1 }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "skip-undo" }
  | { type: "show-undo-card" }

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
    undoStack: loaded.history.undo,
    redoStack: loaded.history.redo,
    undoConflict: null,
    notice: loaded.notice,
    message: null,
    draftSource: loaded.session.draftSource,
    draftSourceRef: loaded.session.draftSourceRef,
    draftItems: loaded.session.draftItems,
    draftTitle: loaded.session.draftTitle,
    extractionNotice: loaded.session.extractionNotice,
    extractionStatus: loaded.session.extractionStatus,
    draftRelationships: loaded.session.draftRelationships,
    draftWarnings: [],
    draftMode: loaded.session.draftMode,
    settingsReturn: null,
    reextractPlan: null,
    pendingReview: null,
  }
}

export function sessionFromState(state: WorkspaceState): PersistedSession {
  return {
    view: state.view,
    tab: state.tab,
    draftSource: state.draftSource,
    draftItems: state.draftItems,
    draftTitle: state.draftTitle,
    extractionNotice: state.extractionNotice,
    extractionStatus: state.extractionStatus,
    draftRelationships: state.draftRelationships,
    draftMode: state.draftMode,
    draftSourceRef: state.draftSourceRef,
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
  const recorded = recordChange(state, current, nextWorkspace, recordUndo)
  return {
    ...state,
    message,
    undoStack: recorded.undo,
    redoStack: recorded.redo,
    undoConflict: recorded.changed ? null : state.undoConflict,
    workspaces: state.workspaces.map((workspace) =>
      workspace.id === current.id ? nextWorkspace : workspace,
    ),
  }
}

function stepHistory(state: WorkspaceState, direction: "undo" | "redo"): WorkspaceState {
  const stack = direction === "undo" ? state.undoStack : state.redoStack
  const entry = stack[stack.length - 1]
  if (!entry) return state
  const current = state.workspaces.find((workspace) => workspace.id === entry.workspaceId)
  if (!current) {
    const message =
      direction === "undo"
        ? "This change cannot be undone because that path is no longer here. Skip this step, or edit a card yourself."
        : "This change cannot be redone because that path is no longer here. Skip this step, or edit a card yourself."
    return { ...state, message, undoConflict: { message, itemId: null, direction } }
  }
  const result = applyHistory(current, entry, direction)
  if (!result.ok) {
    return { ...state, message: result.reason, undoConflict: { message: result.reason, itemId: result.itemId, direction } }
  }
  const rest = stack.slice(0, -1)
  const bounded =
    direction === "undo"
      ? boundHistory(rest, [...state.redoStack, entry])
      : boundHistory([...state.undoStack, entry], rest)
  return {
    ...state,
    undoConflict: null,
    undoStack: bounded.undo,
    redoStack: bounded.redo,
    workspaces: state.workspaces.map((workspace) => (workspace.id === result.workspace.id ? result.workspace : workspace)),
    message:
      direction === "undo"
        ? "Undid the last card change. Other paths were left as they are."
        : "Redid the last card change. Other paths were left as they are.",
  }
}

function recordChange(
  state: WorkspaceState,
  before: PathWorkspace,
  after: PathWorkspace,
  recordUndo: boolean,
): { undo: HistoryEntry[]; redo: HistoryEntry[]; changed: boolean } {
  if (!recordUndo) {
    const coalesced = coalesceEdit(state.undoStack, before, after)
    if (!coalesced) return { undo: state.undoStack, redo: state.redoStack, changed: false }
    return { undo: coalesced, redo: state.redoStack, changed: true }
  }
  const entry = captureChange(before, after)
  if (!entry) return { undo: state.undoStack, redo: state.redoStack, changed: false }
  const bounded = boundHistory([...state.undoStack, entry], [])
  return { undo: bounded.undo, redo: bounded.redo, changed: true }
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

function focusWorkspace(workspace: PathWorkspace, mode: "recommend" | "keep"): PathWorkspace {
  const plan = selectNextAction(workspace.items, workspace.relationships ?? [])
  if (plan.state !== "ready" || !plan.selectedId) return workspace
  const eligible = readyStepIds(plan)
  const keep = mode === "keep" && workspace.currentItemId !== null && eligible.includes(workspace.currentItemId)
  const nextId = keep ? workspace.currentItemId : plan.selectedId
  if (nextId === workspace.currentItemId) return workspace
  return touch(workspace, workspace.items, nextId)
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
        draftTitle: "",
        extractionNotice: null,
        extractionStatus: null,
        draftRelationships: [],
        draftWarnings: [],
        draftMode: "create",
        draftSourceRef: null,
        reextractPlan: null,
        pendingReview: null,
        message: null,
      }
    case "go-settings":
      return {
        ...state,
        view: "settings",
        settingsReturn: state.view === "settings" ? state.settingsReturn : state.view,
        message: null,
      }
    case "close-settings":
      return {
        ...state,
        view: state.settingsReturn && state.settingsReturn !== "settings"
          ? state.settingsReturn
          : state.activeId
            ? "workspace"
            : "home",
        settingsReturn: null,
        message: null,
      }
    case "set-draft": {
      const draftSourceRef = action.sourceRef === undefined ? state.draftSourceRef : action.sourceRef
      if (state.draftSource === action.sourceText && draftSourceRef === state.draftSourceRef) return state
      return { ...state, draftSource: action.sourceText, draftSourceRef }
    }
    case "set-review":
      return {
        ...state,
        draftItems: action.items,
        draftTitle: action.title === undefined ? state.draftTitle : action.title,
        extractionNotice: action.notice === undefined ? state.extractionNotice : action.notice,
        extractionStatus: action.status === undefined ? state.extractionStatus : action.status,
        draftRelationships:
          action.items === null
            ? []
            : action.relationships === undefined
              ? state.draftRelationships
              : action.relationships,
        draftWarnings:
          action.items === null ? [] : action.warnings === undefined ? state.draftWarnings : action.warnings,
        draftMode: action.mode === undefined ? state.draftMode : action.mode,
      }
    case "set-draft-title":
      return { ...state, draftTitle: action.title }
    case "organize-again": {
      const current = activeWorkspace(state)
      if (!current) return state
      return openReextract(state, current.sourceText)
    }
    case "reextract": {
      if (!activeWorkspace(state)) return state
      return openReextract(state, action.sourceText)
    }
    case "reextract-decision": {
      if (!state.reextractPlan) return state
      return {
        ...state,
        reextractPlan: {
          ...state.reextractPlan,
          entries: state.reextractPlan.entries.map((entry) =>
            entry.id === action.id ? decideEntry(entry, action.decision) : entry,
          ),
        },
      }
    }
    case "reextract-field": {
      if (!state.reextractPlan) return state
      return {
        ...state,
        reextractPlan: {
          ...state.reextractPlan,
          entries: state.reextractPlan.entries.map((entry) => {
            if (entry.id !== action.id) return entry
            const fields = { ...entry.fields, [action.field]: action.choice }
            const decision = Object.values(fields).some((choice) => choice === "accept") ? "accept" : "keep"
            return { ...entry, fields, decision } as typeof entry
          }),
        },
      }
    }
    case "reextract-relationship": {
      if (!state.reextractPlan) return state
      return {
        ...state,
        reextractPlan: {
          ...state.reextractPlan,
          relationships: state.reextractPlan.relationships.map((entry) =>
            entry.relationship.id === action.id ? { ...entry, decision: action.decision } : entry,
          ),
        },
      }
    }
    case "commit-reextract": {
      const current = activeWorkspace(state)
      if (!current || !state.reextractPlan) return state
      if (!reextractReady(state.reextractPlan)) return state
      const committed = applyReextract({
        existing: current.items,
        existingRelationships: current.relationships,
        plan: state.reextractPlan,
      })
      const repair = committed.repairs.length > 0 ? ` ${committed.repairs.join(" ")}` : ""
      const message =
        committed.added === 0 && committed.removed === 0 && repair.length === 0
          ? "Reviewed changes were applied. Cards you kept were left as they are."
          : `Reviewed changes were applied.${repair}`
      const merged = replaceActive(
        state,
        (workspace) => ({
          ...touch(
            workspace,
            committed.items,
            committed.items.some((item) => item.id === workspace.currentItemId)
              ? workspace.currentItemId
              : (committed.items[0]?.id ?? null),
          ),
          sourceText: state.draftSource,
          relationships: committed.relationships,
        }),
        true,
        message,
      )
      return {
        ...merged,
        view: "workspace",
        tab: "cards",
        draftItems: null,
        draftTitle: "",
        draftRelationships: [],
        draftWarnings: [],
        draftMode: "create",
        reextractPlan: null,
        extractionNotice: null,
        extractionStatus: null,
      }
    }
    case "cancel-draft":
      return {
        ...state,
        view: state.draftMode === "merge" && state.activeId ? "workspace" : "home",
        draftItems: null,
        draftTitle: "",
        draftRelationships: [],
        draftWarnings: [],
        draftMode: "create",
        reextractPlan: null,
        extractionNotice: null,
        extractionStatus: null,
        message: state.draftMode === "merge" ? "Review cancelled. Your path was not changed." : null,
      }
    case "commit-merge": {
      const current = activeWorkspace(state)
      if (!current) return state
      const committed = commitReview({
        existing: current.items,
        existingRelationships: current.relationships,
        draft: action.items,
        relationships: action.relationships,
      })
      const merged = replaceActive(
        state,
        (workspace) => ({
          ...touch(workspace, committed.items, readMap(committed.items, committed.relationships).startId ?? workspace.currentItemId),
          relationships: committed.relationships,
        }),
        true,
        committed.added === 0
          ? "Nothing new was added. Your cards were left as they are."
          : "Accepted cards were added. You can undo this.",
      )
      return {
        ...merged,
        view: "workspace",
        tab: "cards",
        draftItems: null,
        draftTitle: "",
        draftRelationships: [],
        draftWarnings: [],
        draftMode: "create",
        reextractPlan: null,
        extractionNotice: null,
        extractionStatus: null,
      }
    }
    case "dismiss-review":
      return { ...state, pendingReview: null }
    case "dismiss-suggestion": {
      if (!state.pendingReview) return state
      const additions = state.pendingReview.additions.filter((item) => item.id !== action.id)
      const updates = state.pendingReview.updates.filter((update) => update.existingId !== action.id)
      if (additions.length === 0 && updates.length === 0) return { ...state, pendingReview: null }
      return { ...state, pendingReview: { ...state.pendingReview, additions, updates } }
    }
    case "accept-addition": {
      const item = withoutReviewFlag(action.item)
      const added = replaceActive(
        state,
        (workspace) => {
          const position = workspace.items.reduce((max, entry) => Math.max(max, entry.position), -1) + 1
          const linked = applyKnownLinks(
            [...workspace.items, { ...item, position, linkedItemIds: [] }],
            item.id,
            item.linkedItemIds,
          )
          return touch(workspace, withKnownBlockers(linked, item.id, item.blockedByIds ?? []))
        },
        true,
        "Suggestion added. You can undo this.",
      )
      return {
        ...added,
        pendingReview: added.pendingReview
          ? {
              ...added.pendingReview,
              additions: added.pendingReview.additions.filter((entry) => entry.id !== action.item.id),
            }
          : null,
      }
    }
    case "accept-update": {
      const updated = replaceActive(
        state,
        (workspace) => {
          const proposed = withoutReviewFlag(action.proposed)
          const cleared = workspace.items.map((item) => {
            if (item.id !== action.existingId) {
              return { ...item, linkedItemIds: item.linkedItemIds.filter((id) => id !== action.existingId) }
            }
            return {
              ...proposed,
              id: item.id,
              status: item.status,
              position: item.position,
              createdAt: item.createdAt,
              origin: item.origin,
              userEdited: item.userEdited,
              linkedItemIds: [],
            }
          })
          const linked = applyKnownLinks(cleared, action.existingId, proposed.linkedItemIds)
          return touch(workspace, withKnownBlockers(linked, action.existingId, proposed.blockedByIds ?? []))
        },
        true,
        "Suggestion applied. You can undo this.",
      )
      return {
        ...updated,
        pendingReview: updated.pendingReview
          ? {
              ...updated.pendingReview,
              updates: updated.pendingReview.updates.filter((entry) => entry.existingId !== action.existingId),
            }
          : null,
      }
    }
    case "open":
      if (!state.workspaces.some((workspace) => workspace.id === action.id)) return state
      return { ...state, activeId: action.id, view: "workspace", message: null }
    case "rename-workspace": {
      const title = action.title.trim() || "Untitled path"
      if (!state.workspaces.some((workspace) => workspace.id === action.id)) return state
      return {
        ...state,
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === action.id ? { ...workspace, title, updatedAt: nowIso() } : workspace,
        ),
        message: `Path renamed to “${title}”.`,
      }
    }
    case "delete-workspace": {
      if (!state.workspaces.some((workspace) => workspace.id === action.id)) return state
      const workspaces = state.workspaces.filter((workspace) => workspace.id !== action.id)
      const deletingActive = state.activeId === action.id
      const nextActive = deletingActive ? workspaces[0]?.id ?? null : state.activeId
      const clearingDraft = deletingActive && (state.draftMode === "merge" || state.reextractPlan !== null)
      return {
        ...state,
        workspaces,
        activeId: nextActive,
        view: deletingActive ? "home" : state.view,
        undoStack: state.undoStack.filter((entry) => entry.workspaceId !== action.id),
        redoStack: state.redoStack.filter((entry) => entry.workspaceId !== action.id),
        undoConflict: state.undoConflict && state.activeId === action.id ? null : state.undoConflict,
        reextractPlan: clearingDraft ? null : state.reextractPlan,
        draftMode: clearingDraft ? "create" : state.draftMode,
        draftItems: clearingDraft ? null : state.draftItems,
        draftTitle: clearingDraft ? "" : state.draftTitle,
        draftRelationships: clearingDraft ? [] : state.draftRelationships,
        draftWarnings: clearingDraft ? [] : state.draftWarnings,
        extractionNotice: clearingDraft ? null : state.extractionNotice,
        extractionStatus: clearingDraft ? null : state.extractionStatus,
        pendingReview: deletingActive ? null : state.pendingReview,
        message: "Path deleted. Other paths were left as they are.",
      }
    }
    case "set-tab":
      return { ...state, tab: action.tab }
    case "enter-focus": {
      const current = activeWorkspace(state)
      if (!current) return state
      const plan = selectNextAction(current.items, current.relationships ?? [])
      const aligned = focusWorkspace(current, "recommend")
      return {
        ...state,
        view: "focus",
        message: plan.reason,
        workspaces:
          aligned === current
            ? state.workspaces
            : state.workspaces.map((workspace) => (workspace.id === current.id ? aligned : workspace)),
      }
    }
    case "exit-focus":
      return { ...state, view: state.activeId ? "workspace" : "home" }
    case "create": {
      const id = createId()
      const now = nowIso()
      const committed = commitReview({
        existing: [],
        draft: action.items,
        relationships: action.relationships ?? [],
      })
      const workspace: PathWorkspace = {
        id,
        title: action.title.trim() || "Untitled path",
        sourceText: action.sourceText,
        items: committed.items,
        relationships: committed.relationships,
        currentItemId: readMap(committed.items, committed.relationships).startId,
        createdAt: now,
        updatedAt: now,
        ...(action.sourceRef ? { sourceRef: action.sourceRef } : {}),
      }
      return {
        ...state,
        workspaces: [workspace, ...state.workspaces],
        activeId: id,
        view: "workspace",
        tab: "cards",
        draftSource: "",
        draftItems: null,
        draftTitle: "",
        extractionNotice: null,
        extractionStatus: null,
        draftRelationships: [],
        draftWarnings: [],
        draftMode: "create",
        message: "Path created. Change any card that does not look right.",
      }
    }
    case "update-item":
      return replaceActive(
        state,
        (workspace) => {
          const next = touch(
            workspace,
            workspace.items.map((item) =>
              item.id === action.id ? markEdited(applyItemPatch(item, action.patch), action.patch) : item,
            ),
          )
          const affectsFocus =
            action.patch.dueDate !== undefined ||
            action.patch.status !== undefined ||
            action.patch.priority !== undefined
          return state.view === "focus" && affectsFocus ? focusWorkspace(next, "keep") : next
        },
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
          return {
            ...touch(workspace, items, currentItemId),
            relationships: (workspace.relationships ?? []).filter(
              (relationship) => relationship.fromId !== action.id && relationship.toId !== action.id,
            ),
          }
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
        (workspace) => {
          const relationships = workspace.relationships ?? []
          const exists = relationships.some(
            (relationship) =>
              (relationship.fromId === action.sourceId && relationship.toId === action.targetId) ||
              (relationship.fromId === action.targetId && relationship.toId === action.sourceId),
          )
          const linked = {
            ...touch(workspace, linkItems(workspace.items, action.sourceId, action.targetId)),
            relationships: exists ? relationships : [...relationships, userConnection(action.sourceId, action.targetId)],
          }
          return state.view === "focus" ? focusWorkspace(linked, "keep") : linked
        },
        true,
        "Link saved. You can undo this.",
      )
    }
    case "unlink":
      return replaceActive(
        state,
        (workspace) => {
          const unlinked = {
            ...touch(
              workspace,
              unlinkItems(workspace.items, action.sourceId, action.targetId).map((item) => {
                if (item.id !== action.sourceId && item.id !== action.targetId) return item
                const otherId = item.id === action.sourceId ? action.targetId : action.sourceId
                return {
                  ...item,
                  blockedByIds: (item.blockedByIds ?? []).filter((id) => id !== otherId),
                }
              }),
            ),
            relationships: (workspace.relationships ?? []).filter(
              (relationship) =>
                !(
                  (relationship.fromId === action.sourceId && relationship.toId === action.targetId) ||
                  (relationship.fromId === action.targetId && relationship.toId === action.sourceId)
                ),
            ),
          }
          return state.view === "focus" ? focusWorkspace(unlinked, "keep") : unlinked
        },
        true,
        "Link removed. You can undo this.",
      )
    case "set-current":
      return replaceActive(state, (workspace) => touch(workspace, workspace.items, action.id), false, null)
    case "complete-current": {
      const current = activeWorkspace(state)
      if (!current?.currentItemId) return state
      const target = current.items.find((item) => item.id === current.currentItemId)
      if (!target || target.status === "completed") return state
      const now = nowIso()
      const items = current.items.map((item) =>
        item.id === target.id ? { ...item, status: "completed" as const, updatedAt: now } : item,
      )
      const aligned = focusWorkspace(touch(current, items, current.currentItemId), "recommend")
      const plan = selectNextAction(aligned.items, aligned.relationships ?? [])
      const message =
        plan.state === "complete"
          ? "All steps are complete."
          : plan.state === "blocked"
            ? plan.reason
            : `Step marked complete. ${plan.reason}`
      return replaceActive(state, () => aligned, true, message)
    }
    case "move-step":
      return replaceActive(
        state,
        (workspace) => {
          const plan = selectNextAction(workspace.items, workspace.relationships ?? [])
          const ids = readyStepIds(plan)
          const index = ids.indexOf(workspace.currentItemId ?? "")
          if (index < 0) {
            const fallback = ids[0]
            if (!fallback) return workspace
            return touch(workspace, workspace.items, fallback)
          }
          const next = ids[index + action.direction]
          if (!next) return workspace
          return touch(workspace, workspace.items, next)
        },
        false,
        null,
      )
    case "undo":
    case "redo":
      return stepHistory(state, action.type)
    case "skip-undo": {
      const direction = state.undoConflict?.direction ?? "undo"
      const stack = direction === "undo" ? state.undoStack : state.redoStack
      if (stack.length === 0) return { ...state, undoConflict: null }
      const next = stack.slice(0, -1)
      return {
        ...state,
        undoConflict: null,
        undoStack: direction === "undo" ? next : state.undoStack,
        redoStack: direction === "redo" ? next : state.redoStack,
        message: "That step was skipped. The path was left as it is. You can edit the card yourself.",
      }
    }
    case "show-undo-card": {
      const itemId = state.undoConflict?.itemId
      const current = activeWorkspace(state)
      if (!itemId || !current?.items.some((item) => item.id === itemId)) return state
      return {
        ...state,
        view: "workspace",
        tab: "cards",
        workspaces: state.workspaces.map((workspace) =>
          workspace.id === current.id ? { ...workspace, currentItemId: itemId } : workspace,
        ),
      }
    }
    default:
      return state
  }
}

function openReextract(state: WorkspaceState, sourceText: string): WorkspaceState {
  const current = activeWorkspace(state)
  if (!current) return state
  const result = parseInstructions(sourceText)
  if (
    result.items.length === 0 &&
    (result.status === "failed" || result.status === "unsupported" || result.status === "clarification")
  ) {
    return { ...state, message: result.notice ?? "That text did not produce cards. Your path was not changed." }
  }
  const plan = compareExtraction({
    existing: current.items,
    existingRelationships: current.relationships,
    proposed: result.items,
    proposedRelationships: result.relationships,
    sourceText,
  })
  if (!reextractNeedsReview(plan)) {
    return {
      ...state,
      reextractPlan: null,
      pendingReview: null,
      message: "Nothing in the source changed these cards. Your edits were left as they are.",
    }
  }
  return {
    ...state,
    view: "create",
    draftMode: "merge",
    draftSource: sourceText,
    draftItems: null,
    draftTitle: current.title,
    draftRelationships: [],
    draftWarnings: result.warnings,
    extractionNotice: result.notice,
    extractionStatus: result.status,
    reextractPlan: plan,
    pendingReview: null,
    message: "Review this update. Nothing is saved until you apply it.",
  }
}

function decideEntry(
  entry: ReextractPlan["entries"][number],
  decision: ReextractDecision,
): ReextractPlan["entries"][number] {
  if (entry.change === "new" && decision !== "accept" && decision !== "reject") return entry
  if (entry.change === "removed-from-source" && decision !== "keep" && decision !== "remove") return entry
  if ((entry.change === "modified" || entry.change === "conflicting") && decision !== "keep" && decision !== "accept") {
    return entry
  }
  if (entry.change === "unchanged") return entry
  const fields = { ...entry.fields }
  if (decision === "accept" && (entry.change === "modified" || entry.change === "conflicting")) {
    for (const field of entry.changedFields) fields[field] = "accept"
  }
  if (decision === "keep") {
    for (const field of entry.changedFields) fields[field] = "keep"
  }
  return { ...entry, decision, fields }
}

function withoutReviewFlag(item: PathItem): PathItem {
  const next = { ...item }
  if (next.reviewAccepted || next.reviewStatus === "pending") next.reviewStatus = "accepted"
  delete next.reviewAccepted
  return next
}

function applyKnownLinks(items: PathItem[], sourceId: string, linkedIds: string[]): PathItem[] {
  return linkedIds.reduce((current, targetId) => {
    if (targetId === sourceId || !current.some((item) => item.id === targetId)) return current
    return linkItems(current, sourceId, targetId)
  }, items)
}

function withKnownBlockers(items: PathItem[], sourceId: string, blockedByIds: string[]): PathItem[] {
  const known = new Set(items.map((item) => item.id))
  return items.map((item) =>
    item.id === sourceId
      ? { ...item, blockedByIds: blockedByIds.filter((id) => known.has(id) && id !== sourceId) }
      : item,
  )
}

function markEdited(item: PathItem, patch: ItemPatch): PathItem {
  const content =
    patch.title !== undefined ||
    patch.description !== undefined ||
    patch.type !== undefined ||
    patch.dueDate !== undefined ||
    patch.priority !== undefined ||
    patch.actionInstruction !== undefined
  if (!content) return item
  const next: PathItem = { ...item, userEdited: true }
  if (patch.dueDate) next.dateCertainty = "exact"
  if (patch.dueDate === "") delete next.dateCertainty
  return next
}
