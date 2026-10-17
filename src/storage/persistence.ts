import {
  defaultPreferences,
  defaultSession,
  validatePreferences,
  validateSession,
  validateWorkspaces,
  type PersistedSession,
} from "../domain/validate.ts"
import type { AccessibilityPreferences, PathWorkspace } from "../domain/types.ts"

export const STORAGE_KEYS = {
  workspaces: "pocketpaths.workspaces",
  activeId: "pocketpaths.activeId",
  preferences: "pocketpaths.preferences",
  session: "pocketpaths.session",
} as const

export interface LoadedAppState {
  workspaces: PathWorkspace[]
  activeId: string | null
  preferences: AccessibilityPreferences
  session: PersistedSession
  notice: string | null
}

function readJson(storage: Storage, key: string): { value: unknown; corrupt: boolean; missing: boolean } {
  const raw = storage.getItem(key)
  if (raw === null) return { value: null, corrupt: false, missing: true }
  try {
    return { value: JSON.parse(raw) as unknown, corrupt: false, missing: false }
  } catch {
    return { value: null, corrupt: true, missing: false }
  }
}

export function loadAppState(storage: Storage): LoadedAppState {
  const workspacesRaw = readJson(storage, STORAGE_KEYS.workspaces)
  const preferencesRaw = readJson(storage, STORAGE_KEYS.preferences)
  const sessionRaw = readJson(storage, STORAGE_KEYS.session)
  const activeRaw = storage.getItem(STORAGE_KEYS.activeId)

  const notices: string[] = []
  let workspaces: PathWorkspace[] = []

  if (workspacesRaw.corrupt || (!workspacesRaw.missing && !Array.isArray(workspacesRaw.value))) {
    notices.push("Saved paths could not be read. Starting fresh so you can continue.")
  } else if (!workspacesRaw.missing) {
    const validated = validateWorkspaces(workspacesRaw.value)
    workspaces = validated.workspaces
    if (validated.notice) notices.push(validated.notice)
  }

  const preferences = preferencesRaw.corrupt || preferencesRaw.missing
    ? { ...defaultPreferences }
    : validatePreferences(preferencesRaw.value)
  if (preferencesRaw.corrupt) {
    notices.push("Accessibility settings could not be read, so the defaults are in use.")
  }

  const session = sessionRaw.corrupt || sessionRaw.missing
    ? { ...defaultSession, draftItems: null }
    : validateSession(sessionRaw.value)
  if (sessionRaw.corrupt) {
    notices.push("Your place in the app could not be restored, so you are back at the start.")
  }

  const activeId = workspaces.some((workspace) => workspace.id === activeRaw) ? activeRaw : null

  return {
    workspaces,
    activeId,
    preferences,
    session,
    notice: notices.length > 0 ? notices.join(" ") : null,
  }
}

export interface SaveAppInput {
  workspaces: PathWorkspace[]
  activeId: string | null
  preferences: AccessibilityPreferences
  session: PersistedSession
}

export function saveAppState(storage: Storage, input: SaveAppInput): string | null {
  try {
    storage.setItem(STORAGE_KEYS.workspaces, JSON.stringify(input.workspaces))
    if (input.activeId) storage.setItem(STORAGE_KEYS.activeId, input.activeId)
    else storage.removeItem(STORAGE_KEYS.activeId)
    storage.setItem(STORAGE_KEYS.preferences, JSON.stringify(input.preferences))
    storage.setItem(STORAGE_KEYS.session, JSON.stringify(input.session))
    return null
  } catch {
    return "Changes could not be saved on this device. Copy anything important before you leave."
  }
}
