import { Shell } from "./components/Shell.tsx"
import { useWorkspace } from "./state/WorkspaceContext.tsx"
import { CreatePathView } from "./views/CreatePathView.tsx"
import { FocusView } from "./views/FocusView.tsx"
import { HomeView } from "./views/HomeView.tsx"
import { SettingsView } from "./views/SettingsView.tsx"
import { WorkspaceView } from "./views/WorkspaceView.tsx"

export default function App() {
  const { view } = useWorkspace()

  return (
    <Shell>
      {view === "home" ? <HomeView /> : null}
      {view === "create" ? <CreatePathView /> : null}
      {view === "workspace" ? <WorkspaceView /> : null}
      {view === "focus" ? <FocusView /> : null}
      {view === "settings" ? <SettingsView /> : null}
    </Shell>
  )
}
