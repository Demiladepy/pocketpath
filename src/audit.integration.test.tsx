import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import App from "./App.tsx"
import { actionInstructionFor } from "./domain/actionInstruction.ts"
import { INSUFFICIENT_SOURCE, MESSY_EMAIL } from "./domain/audit/fixtures.ts"
import { parseInstructions } from "./domain/parseInstructions.ts"
import { PreferencesProvider } from "./state/PreferencesContext.tsx"
import { WorkspaceProvider } from "./state/WorkspaceContext.tsx"

class FakeUtterance {
  text: string
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

const spoken: string[] = []

function installSpeech() {
  spoken.length = 0
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
    speak(utterance: FakeUtterance) {
      spoken.push(utterance.text)
      this.speaking = true
      this.paused = false
    },
  }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth })
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
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

beforeEach(() => {
  localStorage.clear()
  installSpeech()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "speechSynthesis")
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance")
})

describe("quality audit in the app", () => {
  it("reviews a messy email, keeps a correction, and reads the next step", async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Create a path" }))
    const instructions = screen.getByRole("textbox", { name: "Instructions" })
    await user.click(instructions)
    await user.paste(MESSY_EMAIL)
    await user.click(screen.getByRole("button", { name: "Organize" }))

    expect(screen.getByRole("heading", { name: /review/i })).toBeTruthy()
    expect(screen.getByDisplayValue("Collect the absorbance readings from the shared sheet")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Reject Draft is due/i })).toBeNull()
    expect(screen.getByRole("button", { name: /Reject Due Friday/i })).toBeTruthy()

    const uploadTitle = "Upload the PDF to the portal at https://learn.university.edu/bio101/lab4"
    await user.click(screen.getByRole("button", { name: `Reject ${uploadTitle}` }))
    expect(screen.queryByDisplayValue(uploadTitle)).toBeNull()
    await user.click(screen.getAllByRole("button", { name: "Accept all" })[0]!)
    await user.click(screen.getAllByRole("button", { name: "Create path" }).find((button) => !(button as HTMLButtonElement).disabled)!)

    expect(screen.getByRole("heading", { name: /week 4 lab/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Step\s*Not started\s*Upload the PDF/i })).toBeNull()

    const discussionCard = screen.getAllByRole("button").find(
      (button) => button.classList.contains("info-card") && button.textContent?.includes("Write the discussion"),
    )
    expect(discussionCard).toBeTruthy()
    await user.click(discussionCard!)
    const title = screen.getByRole("textbox", { name: "Title" })
    await user.clear(title)
    await user.type(title, "Write the results discussion")
    await user.click(screen.getByRole("button", { name: "Organize again" }))
    expect(screen.getByRole("heading", { name: "Review the update" })).toBeTruthy()
    const keep = screen.getByRole("button", { name: /Keep current version of Write the results discussion/i })
    await user.click(keep)
    const pendingAdds = screen.queryAllByRole("button", { name: /^Leave out / })
    for (const button of pendingAdds) await user.click(button)
    await user.click(screen.getByRole("button", { name: "Apply reviewed changes" }))

    expect(screen.getByRole("button", { name: /Write the results discussion/ })).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Focus" }))
    const spokenInstruction = "Collect the absorbance readings from the shared sheet."
    expect(screen.getByRole("heading", { name: "Collect the absorbance readings from the shared sheet" })).toBeTruthy()
    expect(screen.getByDisplayValue(spokenInstruction)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: "Start reading" }))
    expect(spoken.at(-1)).toBe(spokenInstruction)

    const parsed = parseInstructions(MESSY_EMAIL)
    const step = parsed.items.find((item) => item.title === "Collect the absorbance readings from the shared sheet")
    expect(actionInstructionFor(step!).text).toBe(spokenInstruction)
  }, 20_000)

  it("keeps an unclear note on screen when nothing can be organized", async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Create a path" }))
    const instructions = screen.getByRole("textbox", { name: "Instructions" })
    await user.click(instructions)
    await user.paste(INSUFFICIENT_SOURCE)
    await user.click(screen.getByRole("button", { name: "Organize" }))

    expect(screen.getByRole("heading", { name: "Extraction failed" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Edit the text" })).toBeTruthy()
    expect((instructions as HTMLTextAreaElement).value).toBe(INSUFFICIENT_SOURCE)
    expect(screen.queryByRole("button", { name: "Create path" })).toBeNull()

    cleanup()
    renderApp()
    expect(screen.getByRole("heading", { name: "Extraction failed" })).toBeTruthy()
    expect((screen.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value).toBe(INSUFFICIENT_SOURCE)
  })
})
