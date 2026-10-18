import { useState } from "react"
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
  const { workspaces, startCreate, openWorkspace, enterFocus, renameWorkspace, deleteWorkspace } = useWorkspace()
  const sample = workspaces.find((workspace) => workspace.title === SAMPLE_TITLE)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  function beginRename(workspace: PathWorkspace) {
    setConfirmDeleteId(null)
    setRenamingId(workspace.id)
    setRenameValue(workspace.title)
  }

  function saveRename(id: string) {
    renameWorkspace(id, renameValue)
    setRenamingId(null)
    setRenameValue("")
  }

  return (
    <div className="home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-hero-copy">
          <p className="eyebrow">Built for dense briefs</p>
          <p className="hero-kicker">PocketPaths</p>
          <h1 id="home-title">Make information make sense.</h1>
          <p className="lede">
            Paste a messy email or assignment. Turn it into cards you can fix, then one clear next step—kept on this
            device.
          </p>
          <div className="action-row hero-actions">
            <Button variant="primary" icon={Plus} onClick={() => startCreate("")}>
              Create a path
            </Button>
            {sample ? null : (
              <Button variant="secondary" icon={BookOpen} onClick={() => startCreate(SAMPLE_SOURCE)}>
                Try the sample
              </Button>
            )}
          </div>
        </div>
        <aside className="home-hero-artifact" aria-hidden="true">
          <img className="hero-logo" src="/logo.svg" width={220} height={220} alt="" />
          <div className="artifact-stack">
            <span className="artifact-card artifact-card-a">Goal</span>
            <span className="artifact-card artifact-card-b">Step</span>
            <span className="artifact-link" />
          </div>
        </aside>
      </section>

      <ol className="howto howto-rail">
        <li>
          <span className="howto-index">01</span>
          <span>Paste an email, assignment, or brief.</span>
        </li>
        <li>
          <span className="howto-index">02</span>
          <span>Organize, then accept or fix each card.</span>
        </li>
        <li>
          <span className="howto-index">03</span>
          <span>Open Focus when you are ready for the next step.</span>
        </li>
      </ol>

      <hr className="section-rule" />

      <section className="home-paths" aria-labelledby="your-paths">
        <div className="section-head">
          <h2 id="your-paths">Your paths</h2>
          <p className="section-note">Resume where you left off. Nothing leaves this browser.</p>
        </div>
        {workspaces.length === 0 ? (
          <p className="empty empty-panel">
            You have no paths yet. Create one from a pasted brief, or start from the sample above.
          </p>
        ) : (
          <ul className="card-grid path-grid">
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <article className="path-card">
                  {renamingId === workspace.id ? (
                    <form
                      className="stack"
                      onSubmit={(event) => {
                        event.preventDefault()
                        saveRename(workspace.id)
                      }}
                    >
                      <label className="field">
                        <span>Path name</span>
                        <input
                          className="control"
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          autoFocus
                          aria-label={`Rename ${workspace.title}`}
                        />
                      </label>
                      <div className="action-row">
                        <Button variant="primary" type="submit">
                          Save name
                        </Button>
                        <Button
                          variant="quiet"
                          type="button"
                          onClick={() => {
                            setRenamingId(null)
                            setRenameValue("")
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="path-meta">{savedOn(workspace.updatedAt)}</p>
                      <h3 className="path-title">{workspace.title}</h3>
                      <p className="path-summary">{summary(workspace)}</p>
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
                        <Button variant="quiet" onClick={() => beginRename(workspace)}>
                          Rename
                        </Button>
                        {confirmDeleteId === workspace.id ? (
                          <>
                            <Button
                              variant="danger"
                              onClick={() => {
                                deleteWorkspace(workspace.id)
                                setConfirmDeleteId(null)
                              }}
                            >
                              Confirm delete
                            </Button>
                            <Button variant="quiet" onClick={() => setConfirmDeleteId(null)}>
                              Keep path
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="quiet"
                            onClick={() => {
                              setRenamingId(null)
                              setConfirmDeleteId(workspace.id)
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                      {confirmDeleteId === workspace.id ? (
                        <p className="hint" role="status">
                          This removes the path from this device. Cards and undo history for it will be gone.
                        </p>
                      ) : null}
                    </>
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sample ? null : (
        <section className="sample-band" aria-labelledby="sample-path">
          <div className="sample-band-inner">
            <p className="eyebrow">Sample path</p>
            <h2 id="sample-path">{SAMPLE_TITLE}</h2>
            <p className="lede sample-lede">
              A short application brief with a goal, five steps, two requirements, a deadline, and a portal link. Use
              Try the sample above to load it.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
