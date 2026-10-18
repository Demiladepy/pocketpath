import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { ExtractionWarning } from "../domain/extraction/types.ts"
import type { FieldChoice, ReextractDecision, ReextractField, ReextractPlan } from "../domain/reextract.ts"
import { HISTORY_SCHEMA_VERSION } from "../domain/history.ts"
import type { ItemPatch, PathItem, PathWorkspace, Relationship, SourceRef, WorkspaceTab } from "../domain/types.ts"
import { loadAppState, saveAppState } from "../storage/persistence.ts"
import { usePreferences } from "./PreferencesContext.tsx"
import { createInitialState, sessionFromState, workspaceReducer } from "./workspaceReducer.ts"

interface WorkspaceValue {
  workspaces: PathWorkspace[]
  active: PathWorkspace | null
  view: ReturnType<typeof createInitialState>["view"]
  tab: WorkspaceTab
  notice: string | null
  message: string | null
  saveStatus: string | null
  canUndo: boolean
  canRedo: boolean
  undoConflict: { message: string; itemId: string | null; direction: "undo" | "redo" } | null
  draftSource: string
  draftSourceRef: SourceRef | null
  draftItems: PathItem[] | null
  draftTitle: string
  extractionNotice: string | null
  extractionStatus: ReturnType<typeof createInitialState>["extractionStatus"]
  draftRelationships: Relationship[]
  draftWarnings: ExtractionWarning[]
  draftMode: "create" | "merge"
  reextractPlan: ReextractPlan | null
  pendingReview: ReturnType<typeof createInitialState>["pendingReview"]
  dismissNotice: () => void
  goHome: () => void
  startCreate: (sourceText?: string) => void
  goSettings: () => void
  closeSettings: () => void
  setDraft: (sourceText: string, sourceRef?: SourceRef | null) => void
  setDraftTitle: (title: string) => void
  setReview: (
    items: PathItem[] | null,
    meta?: {
      title?: string
      notice?: string | null
      status?: ReturnType<typeof createInitialState>["extractionStatus"]
      relationships?: Relationship[]
      warnings?: ExtractionWarning[]
      mode?: "create" | "merge"
    },
  ) => void
  cancelDraft: () => void
  commitMerge: (items: PathItem[], relationships: Relationship[]) => void
  organizeAgain: () => void
  reextract: (sourceText: string) => void
  setReextractDecision: (id: string, decision: ReextractDecision) => void
  setReextractField: (id: string, field: ReextractField, choice: FieldChoice) => void
  setReextractRelationship: (id: string, decision: "accept" | "reject") => void
  commitReextract: () => void
  acceptAddition: (item: PathItem) => void
  acceptUpdate: (existingId: string, proposed: PathItem) => void
  dismissSuggestion: (id: string) => void
  dismissReview: () => void
  openWorkspace: (id: string) => void
  renameWorkspace: (id: string, title: string) => void
  deleteWorkspace: (id: string) => void
  setTab: (tab: WorkspaceTab) => void
  enterFocus: () => void
  exitFocus: () => void
  createWorkspace: (
    title: string,
    sourceText: string,
    items: PathItem[],
    relationships?: Relationship[],
    sourceRef?: SourceRef | null,
  ) => void
  updateItem: (id: string, patch: ItemPatch, kind: "text" | "commit") => void
  endTextEdit: () => void
  addItem: () => void
  deleteItem: (id: string) => void
  linkItem: (sourceId: string, targetId: string) => void
  unlinkItem: (sourceId: string, targetId: string) => void
  setCurrent: (id: string) => void
  completeCurrent: () => void
  moveStep: (direction: -1 | 1) => void
  undo: () => void
  redo: () => void
  skipUndo: () => void
  showUndoCard: () => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences } = usePreferences()
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () =>
    createInitialState(loadAppState(localStorage)),
  )
  const textUndoCard = useRef<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const savedSnapshot = useRef<string | null>(null)

  useEffect(() => {
    const session = sessionFromState(state)
    const error = saveAppState(localStorage, {
      workspaces: state.workspaces,
      activeId: state.activeId,
      preferences,
      session,
      history: { schemaVersion: HISTORY_SCHEMA_VERSION, undo: state.undoStack, redo: state.redoStack },
    })
    const snapshot = JSON.stringify({
      workspaces: state.workspaces,
      activeId: state.activeId,
      preferences: { ...preferences, focusMode: false },
      session,
    })
    if (error) {
      dispatch({ type: "notice", notice: error })
      setSaveStatus(null)
      return
    }
    if (savedSnapshot.current === null) {
      savedSnapshot.current = snapshot
      return
    }
    if (savedSnapshot.current !== snapshot) {
      savedSnapshot.current = snapshot
      setSaveStatus("Changes saved on this device.")
    }
  }, [preferences, state])

  useEffect(() => {
    const focusMode = state.view === "focus"
    if (preferences.focusMode !== focusMode) updatePreferences({ focusMode })
  }, [preferences.focusMode, state.view, updatePreferences])

  const active = state.workspaces.find((workspace) => workspace.id === state.activeId) ?? null

  const value = useMemo<WorkspaceValue>(() => {
    return {
      workspaces: state.workspaces,
      active,
      view: state.view,
      tab: state.tab,
      notice: state.notice,
      message: state.message,
      saveStatus,
      canUndo: state.undoStack.length > 0,
      canRedo: state.redoStack.length > 0,
      undoConflict: state.undoConflict,
      draftSource: state.draftSource,
      draftSourceRef: state.draftSourceRef,
      draftItems: state.draftItems,
      draftTitle: state.draftTitle,
      extractionNotice: state.extractionNotice,
      extractionStatus: state.extractionStatus,
      draftRelationships: state.draftRelationships,
      draftWarnings: state.draftWarnings,
      draftMode: state.draftMode,
      reextractPlan: state.reextractPlan,
      pendingReview: state.pendingReview,
      dismissNotice: () => dispatch({ type: "dismiss-notice" }),
      goHome: () => dispatch({ type: "go-home" }),
      startCreate: (sourceText = "") => dispatch({ type: "start-create", sourceText }),
      goSettings: () => dispatch({ type: "go-settings" }),
      closeSettings: () => dispatch({ type: "close-settings" }),
      setDraft: (sourceText, sourceRef) => dispatch({ type: "set-draft", sourceText, sourceRef }),
      setDraftTitle: (title) => dispatch({ type: "set-draft-title", title }),
      setReview: (items, meta) => dispatch({ type: "set-review", items, ...meta }),
      cancelDraft: () => dispatch({ type: "cancel-draft" }),
      commitMerge: (items, relationships) => dispatch({ type: "commit-merge", items, relationships }),
      organizeAgain: () => dispatch({ type: "organize-again" }),
      reextract: (sourceText) => dispatch({ type: "reextract", sourceText }),
      setReextractDecision: (id, decision) => dispatch({ type: "reextract-decision", id, decision }),
      setReextractField: (id, field, choice) => dispatch({ type: "reextract-field", id, field, choice }),
      setReextractRelationship: (id, decision) => dispatch({ type: "reextract-relationship", id, decision }),
      commitReextract: () => dispatch({ type: "commit-reextract" }),
      acceptAddition: (item) => dispatch({ type: "accept-addition", item }),
      acceptUpdate: (existingId, proposed) => dispatch({ type: "accept-update", existingId, proposed }),
      dismissSuggestion: (id) => dispatch({ type: "dismiss-suggestion", id }),
      dismissReview: () => dispatch({ type: "dismiss-review" }),
      openWorkspace: (id) => dispatch({ type: "open", id }),
      renameWorkspace: (id, title) => dispatch({ type: "rename-workspace", id, title }),
      deleteWorkspace: (id) => dispatch({ type: "delete-workspace", id }),
      setTab: (tab) => dispatch({ type: "set-tab", tab }),
      enterFocus: () => dispatch({ type: "enter-focus" }),
      exitFocus: () => dispatch({ type: "exit-focus" }),
      createWorkspace: (title, sourceText, items, relationships = [], sourceRef = null) =>
        dispatch({ type: "create", title, sourceText, items, relationships, sourceRef }),
      updateItem: (id, patch, kind) => {
        const recordUndo = kind === "commit" || textUndoCard.current !== id
        textUndoCard.current = kind === "text" ? id : null
        dispatch({ type: "update-item", id, patch, recordUndo })
      },
      endTextEdit: () => {
        textUndoCard.current = null
      },
      addItem: () => dispatch({ type: "add-item" }),
      deleteItem: (id) => dispatch({ type: "delete-item", id }),
      linkItem: (sourceId, targetId) => dispatch({ type: "link", sourceId, targetId }),
      unlinkItem: (sourceId, targetId) => dispatch({ type: "unlink", sourceId, targetId }),
      setCurrent: (id) => dispatch({ type: "set-current", id }),
      completeCurrent: () => dispatch({ type: "complete-current" }),
      moveStep: (direction) => dispatch({ type: "move-step", direction }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
      skipUndo: () => dispatch({ type: "skip-undo" }),
      showUndoCard: () => dispatch({ type: "show-undo-card" }),
    }
  }, [active, saveStatus, state])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return value
}
