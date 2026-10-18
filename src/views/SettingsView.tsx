import type { AccessibilityPreferences } from "../domain/types.ts"
import { useSpeech } from "../hooks/useSpeech.ts"
import { usePreferences } from "../state/PreferencesContext.tsx"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"
import { ReadAloudControls } from "../components/ReadAloudControls.tsx"

const SCALES: Array<{ id: AccessibilityPreferences["fontScale"]; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "large", label: "Large" },
  { id: "extra-large", label: "Extra large" },
]

export function SettingsView() {
  const { preferences, updatePreferences } = usePreferences()
  const { closeSettings } = useWorkspace()
  const speech = useSpeech()
  const sample = "This is how PocketPaths sounds when it reads a step aloud."

  function toggleReadAloud(enabled: boolean) {
    updatePreferences({ readAloudEnabled: enabled })
    if (!enabled) {
      speech.stop()
      return
    }
    if (speech.supported) {
      speech.speak("Read aloud is on. PocketPaths will read the current step in focus mode.")
    }
  }

  return (
    <div className="stack settings">
      <header className="page-intro">
        <p className="eyebrow">Accessibility</p>
        <h1>Settings</h1>
        <p className="lede">These choices apply right away and stay on this device.</p>
      </header>

      <fieldset className="choice-group">
        <legend>Text size</legend>
        {SCALES.map((scale) => (
          <label key={scale.id} className="choice">
            <input
              type="radio"
              name="font-scale"
              value={scale.id}
              checked={preferences.fontScale === scale.id}
              onChange={() => updatePreferences({ fontScale: scale.id })}
            />
            <span>{scale.label}</span>
          </label>
        ))}
      </fieldset>

      <label className="choice">
        <input
          type="checkbox"
          checked={preferences.highContrast}
          onChange={(event) => updatePreferences({ highContrast: event.target.checked })}
        />
        <span>High contrast</span>
      </label>

      <label className="choice">
        <input
          type="checkbox"
          checked={preferences.reducedMotion}
          onChange={(event) => updatePreferences({ reducedMotion: event.target.checked })}
        />
        <span>Reduce motion</span>
      </label>

      <label className="choice">
        <input
          type="checkbox"
          checked={preferences.readAloudEnabled}
          onChange={(event) => toggleReadAloud(event.target.checked)}
        />
        <span>Read aloud in focus mode</span>
      </label>

      <ReadAloudControls text={sample} speech={speech} />

      <article className="path-card" aria-label="Preview">
        <p className="eyebrow">Preview</p>
        <h2>Prepare an application before Friday</h2>
        <p>This sentence uses your text size and contrast. Status is written in words, not color alone.</p>
      </article>

      <Button variant="primary" onClick={closeSettings}>
        Done
      </Button>
    </div>
  )
}
