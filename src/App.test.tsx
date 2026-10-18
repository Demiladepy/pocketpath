import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import App from "./App.tsx"
import { ASSIGNMENT_BRIEF } from "./domain/audit/fixtures.ts"
import { PreferencesProvider } from "./state/PreferencesContext.tsx"
import { WorkspaceProvider } from "./state/WorkspaceContext.tsx"

beforeEach(() => localStorage.clear())
afterEach(() => cleanup())

function renderApp() {
  return render(
    <PreferencesProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </PreferencesProvider>,
  )
}

describe("App", () => {
  it("shows the home action for a new visitor", () => {
    renderApp()
    expect(screen.getByRole("button", { name: "Create a path" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Make information make sense." })).toBeTruthy()
    expect(screen.getByText(/Paste an email, assignment, or brief/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try the sample" })).toBeTruthy()
  })

  it("puts Organize first and keeps webpage loading tucked away", async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Create a path" }))
    const organize = screen.getByRole("button", { name: "Organize" })
    expect(organize.className).toMatch(/btn-primary/)
    const extra = document.querySelector("details.source-extra")
    expect(extra).toBeTruthy()
    expect(extra?.hasAttribute("open")).toBe(false)
    expect(screen.getByText(/Webpage address \(not loaded in this browser\)/i)).toBeTruthy()
  })

  it("keeps Accept all and Create path available while reviewing a brief", async () => {
    const user = userEvent.setup()
    renderApp()
    await user.click(screen.getByRole("button", { name: "Create a path" }))
    await user.click(screen.getByRole("textbox", { name: "Instructions" }))
    await user.paste(ASSIGNMENT_BRIEF)
    await user.click(screen.getByRole("button", { name: "Organize" }))
    expect(screen.getByRole("heading", { level: 1, name: "Review the draft" })).toBeTruthy()
    const acceptAll = screen.getAllByRole("button", { name: "Accept all" })
    expect(acceptAll.length).toBeGreaterThanOrEqual(2)
    await user.click(acceptAll[0]!)
    const create = screen.getAllByRole("button", { name: "Create path" })
    expect(create.some((button) => !(button as HTMLButtonElement).disabled)).toBe(true)
  }, 15_000)
})
