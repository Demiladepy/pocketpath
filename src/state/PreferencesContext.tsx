import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { AccessibilityPreferences } from "../domain/types.ts"
import { loadAppState } from "../storage/persistence.ts"

interface PreferencesValue {
  preferences: AccessibilityPreferences
  preferenceNotice: string | null
  updatePreferences: (patch: Partial<AccessibilityPreferences>) => void
  dismissPreferenceNotice: () => void
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const initial = useState(() => loadAppState(localStorage))[0]
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(initial.preferences)
  const [preferenceNotice, setPreferenceNotice] = useState<string | null>(
    initial.notice?.includes("Accessibility settings") ? initial.notice : null,
  )

  useEffect(() => {
    document.documentElement.dataset.fontScale = preferences.fontScale
    document.documentElement.dataset.contrast = preferences.highContrast ? "high" : "normal"
    document.documentElement.dataset.motion = preferences.reducedMotion ? "reduce" : "system"
  }, [preferences])

  const value = useMemo<PreferencesValue>(
    () => ({
      preferences,
      preferenceNotice,
      updatePreferences: (patch) => setPreferences((current) => ({ ...current, ...patch })),
      dismissPreferenceNotice: () => setPreferenceNotice(null),
    }),
    [preferences, preferenceNotice],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext)
  if (!value) throw new Error("usePreferences must be used within PreferencesProvider")
  return value
}
