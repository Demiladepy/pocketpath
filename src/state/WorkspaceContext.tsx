import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react"
import type { ItemPatch, PathItem, PathWorkspace, WorkspaceTab } from "../domain/types.ts"
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
  canUndo: boolean
  draftSource: string
  draftItems: PathItem[] | null
  dismissNotice: () => void
  goHome: () => void
  startCreate: (sourceText?: string) => void
  goSettings: () => void
  closeSettings: () => void
  setDraft: (sourceText: string) => void
  setReview: (items: PathItem[] | null) => void
  openWorkspace: (id: string) => void
  setTab: (tab: WorkspaceTab) => void
  enterFocus: () => void
  exitFocus: () => void
  createWorkspace: (title: string, sourceText: string, items: PathItem[]) => void
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
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences } = usePreferences()
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () =>
    createInitialState(loadAppState(localStorage)),
  )
  const textUndoCard = useRef<string | null>(null)

  useEffect(() => {
    const error = saveAppState(localStorage, {
      workspaces: state.workspaces,
      activeId: state.activeId,
      preferences,
      session: sessionFromState(state),
    })
    if (error) dispatch({ type: "notice", notice: error })
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
      canUndo: state.undoStack.length > 0,
      draftSource: state.draftSource,
      draftItems: state.draftItems,
      dismissNotice: () => dispatch({ type: "dismiss-notice" }),
      goHome: () => dispatch({ type: "go-home" }),
      startCreate: (sourceText = "") => dispatch({ type: "start-create", sourceText }),
      goSettings: () => dispatch({ type: "go-settings" }),
      closeSettings: () => dispatch({ type: "close-settings" }),
      setDraft: (sourceText) => dispatch({ type: "set-draft", sourceText }),
      setReview: (items) => dispatch({ type: "set-review", items }),
      openWorkspace: (id) => dispatch({ type: "open", id }),
      setTab: (tab) => dispatch({ type: "set-tab", tab }),
      enterFocus: () => dispatch({ type: "enter-focus" }),
      exitFocus: () => dispatch({ type: "exit-focus" }),
      createWorkspace: (title, sourceText, items) =>
        dispatch({ type: "create", title, sourceText, items }),
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
    }
  }, [active, state])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error("useWorkspace must be used within WorkspaceProvider")
  return value
}
