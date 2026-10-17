import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import App from "./App.tsx"
import { PreferencesProvider } from "./state/PreferencesContext.tsx"
import { WorkspaceProvider } from "./state/WorkspaceContext.tsx"

beforeEach(() => localStorage.clear())

describe("App", () => {
  it("shows the home action for a new visitor", () => {
    render(
      <PreferencesProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </PreferencesProvider>,
    )
    expect(screen.getByRole("button", { name: "Create a path" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Make information make sense." })).toBeTruthy()
  })
})
