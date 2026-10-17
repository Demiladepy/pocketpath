import { BookOpen, Plus } from "lucide-react"
import { SAMPLE_SOURCE, SAMPLE_TITLE } from "../domain/sample.ts"
import type { PathWorkspace } from "../domain/types.ts"
import { useWorkspace } from "../state/WorkspaceContext.tsx"
import { Button } from "../components/Button.tsx"

function summary(workspace: PathWorkspace): string {
  const steps = workspace.items.filter((item) => item.type === "step")
  const done = steps.filter((item) => item.status === "completed").length
  const requirements = workspace.items.filter((item) => item.type === "requirement").length
  const stepLabel = steps.length === 1 ? "step" : "steps"
  const requirementLabel = requirements === 1 ? "requirement" : "requirements"
  return `${done} of ${steps.length} ${stepLabel} completed · ${requirements} ${requirementLabel}`
}

function savedOn(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "Saved on this device"
  return `Updated ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`
}

export function HomeView() {
  const { workspaces, startCreate, openWorkspace, enterFocus } = useWorkspace()
  const sample = workspaces.find((workspace) => workspace.title === SAMPLE_TITLE)

  return (
    <div className="stack">
      <header className="page-intro">
        <p className="eyebrow">For dense instructions</p>
        <h1>Make information make sense.</h1>
        <p className="lede">
          Turn a confusing brief into cards you can connect, then focus on one step and come back to the same place.
        </p>
        <div className="action-row">
          <Button variant="primary" icon={Plus} onClick={() => startCreate("")}>
            Create a path
          </Button>
        </div>
      </header>

      <section className="stack" aria-labelledby="your-paths">
        <h2 id="your-paths">Your paths</h2>
        {workspaces.length === 0 ? (
          <p className="empty">You have no paths yet. Create one, or start from the sample brief.</p>
        ) : (
          <ul className="card-grid">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <article className="path-card">
                  <h3>{workspace.title}</h3>
                  <p>{summary(workspace)}</p>
                  <p className="hint">{savedOn(workspace.updatedAt)}</p>
                  <div className="action-row">
                    <Button variant="secondary" onClick={() => openWorkspace(workspace.id)}>
                      Open
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        openWorkspace(workspace.id)
                        enterFocus()
                      }}
                    >
                      Resume
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sample ? null : (
        <section className="path-card sample-card" aria-labelledby="sample-path">
          <p className="eyebrow">Sample path</p>
          <h2 id="sample-path">{SAMPLE_TITLE}</h2>
          <p>A short application brief with a goal, five steps, two requirements, a deadline, and a portal link.</p>
          <Button variant="secondary" icon={BookOpen} onClick={() => startCreate(SAMPLE_SOURCE)}>
            Try the sample
          </Button>
        </section>
      )}
    </div>
  )
}
