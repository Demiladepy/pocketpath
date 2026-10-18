import { describe, expect, it } from "vitest"
import { focusTarget, nextActionableStep, selectNextAction } from "./focus.ts"
import { createItem } from "./items.ts"
import type { Relationship } from "./types.ts"

function before(fromId: string, toId: string, reviewStatus: Relationship["reviewStatus"] = "accepted"): Relationship {
  return {
    id: `rel-${fromId}-${toId}`,
    fromId,
    toId,
    kind: "before",
    reason: "The text says to finish one before the other.",
    basis: "stated",
    confidence: "high",
    reviewStatus,
  }
}

function order(fromId: string, toId: string): Relationship {
  return {
    id: `order-${fromId}-${toId}`,
    fromId,
    toId,
    kind: "order",
    reason: "These steps are listed in this order.",
    basis: "inferred",
    confidence: "low",
    reviewStatus: "accepted",
  }
}

describe("next action", () => {
  it("skips a completed step and a step blocked by an open requirement", () => {
    const transcript = createItem({ id: "transcript", title: "Official transcript", type: "requirement", position: 0 })
    const read = createItem({
      id: "read",
      title: "Read the prompt",
      type: "step",
      status: "completed",
      position: 1,
    })
    const submit = createItem({
      id: "submit",
      title: "Submit the form",
      type: "step",
      position: 2,
      blockedByIds: ["transcript"],
    })
    const draft = createItem({ id: "draft", title: "Draft the answers", type: "step", position: 3 })
    const items = [transcript, read, submit, draft]

    expect(nextActionableStep(items, "read")?.id).toBe("draft")
    expect(focusTarget(items, "read").id).toBe("draft")
    expect(selectNextAction(items).waiting.map((entry) => entry.stepId)).toEqual(["submit"])
  })

  it("names the blockers when every remaining step is blocked", () => {
    const transcript = createItem({ id: "transcript", title: "Official transcript", type: "requirement" })
    const submit = createItem({
      id: "submit",
      title: "Submit the form",
      type: "step",
      blockedByIds: ["transcript"],
    })
    const plan = selectNextAction([transcript, submit])
    const target = focusTarget([transcript, submit], "submit")
    expect(plan.state).toBe("blocked")
    expect(plan.selectedId).toBeNull()
    expect(plan.waiting[0]?.blockers.map((blocker) => blocker.id)).toEqual(["transcript"])
    expect(target.id).toBe("submit")
    expect(target.reason).toBe("Every unfinished step is waiting. “Submit the form” waits on Official transcript.")
  })

  it("prefers an explicit high priority over an earlier card and an earlier deadline", () => {
    const early = createItem({
      id: "early",
      title: "File the receipt",
      type: "step",
      position: 0,
      priority: "low",
      dueDate: "2026-10-01",
    })
    const important = createItem({
      id: "important",
      title: "Email the advisor",
      type: "step",
      position: 4,
      priority: "high",
      dueDate: "2026-12-01",
    })
    const plan = selectNextAction([early, important])
    expect(plan.selectedId).toBe("important")
    expect(plan.alternatives.map((alternative) => alternative.id)).toEqual(["early"])
    expect(plan.reason).toMatch(/priority is high/)
  })

  it("offers the other ready step when priority and deadline do not decide", () => {
    const later = createItem({ id: "bravo", title: "Submit the form", type: "step", position: 0 })
    const earlier = createItem({ id: "alpha", title: "Submit the form", type: "step", position: 5 })
    const plan = selectNextAction([later, earlier])
    expect(plan.selectedId).toBe("alpha")
    expect(plan.alternatives.map((alternative) => alternative.id)).toEqual(["bravo"])
    expect(plan.reason).toMatch(/choose another/)
  })

  it("does not recommend a completed step", () => {
    const done = createItem({
      id: "done",
      title: "Read the prompt",
      type: "step",
      status: "completed",
      priority: "high",
      dueDate: "2026-01-01",
      position: 0,
    })
    const left = createItem({
      id: "left",
      title: "Submit the form",
      type: "step",
      priority: "low",
      dueDate: "2026-12-01",
      position: 1,
    })
    expect(selectNextAction([done, left]).selectedId).toBe("left")
  })

  it("keeps a step available when its predecessor is missing", () => {
    const write = createItem({
      id: "write",
      title: "Write the summary",
      type: "step",
      blockedByIds: ["missing-doc"],
    })
    const beforePlan = JSON.stringify(write)
    const plan = selectNextAction([write])
    expect(plan.state).toBe("ready")
    expect(plan.selectedId).toBe("write")
    expect(plan.missingDependencies).toEqual([
      { stepId: "write", stepTitle: "Write the summary", missingIds: ["missing-doc"] },
    ])
    expect(plan.reason).toMatch(/missing/)
    expect(JSON.stringify(write)).toBe(beforePlan)
    expect(write.dueDate).toBeUndefined()
  })

  it("reports completion when every step is complete", () => {
    const goal = createItem({ id: "goal", title: "Finish the lab", type: "goal", status: "not-started" })
    const step = createItem({ id: "step", title: "Submit the form", type: "step", status: "completed" })
    const plan = selectNextAction([goal, step])
    expect(plan.state).toBe("complete")
    expect(plan.selectedId).toBeNull()
    expect(plan.reason).toBe("All steps are complete.")
  })

  it("uses an earlier deadline when nothing waits on another step", () => {
    const first = createItem({
      id: "first",
      title: "Read the chapter",
      type: "step",
      position: 0,
      dueDate: "2026-12-01",
    })
    const second = createItem({
      id: "second",
      title: "Submit the form",
      type: "step",
      position: 9,
      dueDate: "2026-10-19",
      dateLabel: "October 19, 2026",
    })
    const plan = selectNextAction([first, second])
    expect(plan.selectedId).toBe("second")
    expect(plan.reason).toMatch(/October 19, 2026/)
    expect(first.position).toBe(0)
  })

  it("follows listed order when there is no dependency and no deadline", () => {
    const gather = createItem({ id: "gather", title: "Gather documents", type: "step", position: 0 })
    const read = createItem({ id: "read", title: "Read the prompt", type: "step", position: 3 })
    const plan = selectNextAction([gather, read], [order("read", "gather")])
    expect(plan.selectedId).toBe("read")
    expect(plan.reason).toMatch(/listed order/)
  })

  it("lets a deadline outrank listed order without changing either card", () => {
    const read = createItem({ id: "read", title: "Read the prompt", type: "step", position: 0 })
    const gather = createItem({
      id: "gather",
      title: "Gather documents",
      type: "step",
      position: 1,
      dueDate: "2026-10-02",
    })
    const relationships = [order("read", "gather")]
    const snapshot = JSON.stringify({ read, gather, relationships })
    const plan = selectNextAction([read, gather], relationships)
    expect(plan.selectedId).toBe("gather")
    expect(JSON.stringify({ read, gather, relationships })).toBe(snapshot)
  })

  it("recalculates after completion, a dependency, and a deadline edit", () => {
    const write = createItem({ id: "write", title: "Write the summary", type: "step", position: 0 })
    const submit = createItem({
      id: "submit",
      title: "Submit the form",
      type: "step",
      position: 1,
      dueDate: "2026-10-01",
    })
    expect(selectNextAction([write, submit]).selectedId).toBe("submit")

    const completed = [write, { ...submit, status: "completed" as const }]
    expect(selectNextAction(completed).selectedId).toBe("write")

    const blocked = selectNextAction([write, submit], [before("write", "submit")])
    expect(blocked.selectedId).toBe("write")
    expect(blocked.waiting.map((entry) => entry.stepId)).toEqual(["submit"])
    expect(submit.blockedByIds).toEqual([])

    const rejected = selectNextAction([write, submit], [before("write", "submit", "rejected")])
    expect(rejected.selectedId).toBe("submit")

    const sooner = { ...write, dueDate: "2026-09-01" }
    expect(selectNextAction([sooner, submit]).selectedId).toBe("write")
  })
})
