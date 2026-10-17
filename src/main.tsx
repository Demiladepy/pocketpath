import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import { PreferencesProvider } from "./state/PreferencesContext.tsx"
import { WorkspaceProvider } from "./state/WorkspaceContext.tsx"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </PreferencesProvider>
  </StrictMode>,
)
