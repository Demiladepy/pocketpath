import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import App from "./App.tsx"
import { createItem } from "./domain/items.ts"
import { defaultPreferences, defaultSession } from "./domain/validate.ts"
import { ReadAloudControls } from "./components/ReadAloudControls.tsx"
import { PreferencesProvider } from "./state/PreferencesContext.tsx"
import { WorkspaceProvider } from "./state/WorkspaceContext.tsx"
import { saveAppState } from "./storage/persistence.ts"

class FakeUtterance {
  text: string
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onpause: (() => void) | null = null
  onresume: (() => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

function installSpeech() {
  const synth = {
    speaking: false,
    paused: false,
    cancel() {
      this.speaking = false
      this.paused = false
    },
    pause() {
      this.paused = true
    },
    resume() {
      this.paused = false
    },
    speak() {
      this.speaking = true
      this.paused = false
    },
  }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth })
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "speechSynthesis")
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance")
})

function instructionValue(): string {
  return (screen.getByRole("textbox", { name: "Suggested instruction" }) as HTMLTextAreaElement).value
}

function renderApp() {
  return render(
    <PreferencesProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </PreferencesProvider>,
  )
}

function seedFocus() {
  saveAppState(localStorage, {
    workspaces: [
      {
        id: "path-1",
        title: "Lab report",
        sourceText: "Read the prompt. Submit the form.",
        items: [
          createItem({
            id: "step-read",
            title: "Read the prompt",
            type: "step",
            description: "Read the prompt.",
            position: 0,
          }),
          createItem({
            id: "step-submit",
            title: "Submit the form",
            type: "step",
            description: "Submit the form.",
            position: 1,
          }),
        ],
        currentItemId: "step-read",
        createdAt: "2026-10-18T00:00:00.000Z",
        updatedAt: "2026-10-18T00:00:00.000Z",
      },
    ],
    activeId: "path-1",
    preferences: { ...defaultPreferences },
    session: { ...defaultSession, view: "focus" },
  })
}

describe("accessibility", () => {
  it("keeps the instruction on screen when speech synthesis is unavailable", () => {
    render(
      <ReadAloudControls
        text="Read the prompt."
        speech={{
          supported: false,
          pauseSupported: false,
          phase: "idle",
          notice: null,
          speak: () => false,
          pause: () => false,
          resume: () => false,
          stop: () => undefined,
        }}
      />,
    )
    expect(screen.getByText(/not available in this browser/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Start reading" })).toBeNull()
  })

  it(
    "moves ready steps from the keyboard and announces complete and undo",
    async () => {
      installSpeech()
      seedFocus()
      const user = userEvent.setup()
      renderApp()

      expect(screen.getByRole("heading", { name: "Read the prompt" })).toBeTruthy()
      expect(instructionValue()).toBe("Read the prompt.")
      await user.click(screen.getByRole("button", { name: "Start reading" }))
      await user.click(screen.getByRole("button", { name: "Pause" }))
      await user.click(screen.getByRole("button", { name: "Resume" }))
      await user.click(screen.getByRole("button", { name: "Repeat instruction" }))
      await user.click(screen.getByRole("button", { name: "Stop" }))

      const instruction = screen.getByRole("textbox", { name: "Suggested instruction" })
      await user.click(instruction)
      await user.keyboard("{ArrowRight}")
      expect(screen.getByRole("heading", { name: "Read the prompt" })).toBeTruthy()

      instruction.blur()
      await user.keyboard("{ArrowRight}")
      expect(screen.getByRole("heading", { name: "Submit the form" })).toBeTruthy()
      expect(instructionValue()).toBe("Submit the form.")

      await user.click(screen.getByRole("button", { name: "Mark complete" }))
      expect(await screen.findByText(/step marked complete/i)).toBeTruthy()
      expect(await screen.findByText("Changes saved on this device.")).toBeTruthy()

      await user.click(screen.getByRole("button", { name: "Undo" }))
      expect(await screen.findByText(/undid the last card change/i)).toBeTruthy()

      await user.click(screen.getByRole("button", { name: "Settings" }))
      expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
      await user.click(screen.getByRole("button", { name: "Done" }))
      expect(screen.getByRole("heading", { name: "Submit the form" })).toBeTruthy()
    },
    15_000,
  )

  it(
    "keeps text size, contrast, and reduced motion after a reload",
    async () => {
      const user = userEvent.setup()
      const first = renderApp()
      await user.click(screen.getByRole("button", { name: "Settings" }))
      await user.click(screen.getByRole("radio", { name: "Extra large" }))
      await user.click(screen.getByRole("checkbox", { name: "High contrast" }))
      await user.click(screen.getByRole("checkbox", { name: "Reduce motion" }))

      expect(document.documentElement.dataset.fontScale).toBe("extra-large")
      expect(document.documentElement.dataset.contrast).toBe("high")
      expect(document.documentElement.dataset.motion).toBe("reduce")
      expect(await screen.findByText("Changes saved on this device.")).toBeTruthy()

      first.unmount()
      renderApp()
      await user.click(screen.getByRole("button", { name: "Settings" }))
      expect((screen.getByRole("radio", { name: "Extra large" }) as HTMLInputElement).checked).toBe(true)
      expect((screen.getByRole("checkbox", { name: "High contrast" }) as HTMLInputElement).checked).toBe(true)
      expect((screen.getByRole("checkbox", { name: "Reduce motion" }) as HTMLInputElement).checked).toBe(true)
      expect(document.documentElement.dataset.fontScale).toBe("extra-large")
    },
    15_000,
  )
})
