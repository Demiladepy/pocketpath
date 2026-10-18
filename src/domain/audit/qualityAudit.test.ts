import { describe, expect, it } from "vitest"
import { actionInstructionFor } from "../actionInstruction.ts"
import { selectNextAction } from "../focus.ts"
import { parseInstructions } from "../parseInstructions.ts"
import { cardProvenance, compareExtraction } from "../reextract.ts"
import { commitReview } from "../reviewCommit.ts"
import type { PathItem, Relationship } from "../types.ts"
import { createInitialState, sessionFromState, workspaceReducer, type WorkspaceState } from "../../state/workspaceReducer.ts"
import { loadAppState, saveAppState } from "../../storage/persistence.ts"
import { defaultPreferences, defaultSession } from "../validate.ts"
import {
  APPLICATION_EXCERPT,
  ASSIGNMENT_BRIEF,
  AUDIT_REFERENCE,
  CONFLICTING_DEADLINES,
  INSUFFICIENT_SOURCE,
  MESSY_EMAIL,
} from "./fixtures.ts"

function titles(items: PathItem[], type?: PathItem["type"]): string[] {
  return items.filter((item) => (type ? item.type === type : true)).map((item) => item.title)
}

function beforeCycle(relationships: Relationship[]): boolean {
  const edges = relationships.filter((relationship) => relationship.kind === "before")
  const graph = new Map<string, string[]>()
  for (const edge of edges) {
    graph.set(edge.fromId, [...(graph.get(edge.fromId) ?? []), edge.toId])
  }
  const seen = new Set<string>()
  const stack = new Set<string>()
  const walk = (id: string): boolean => {
    if (stack.has(id)) return true
    if (seen.has(id)) return false
    seen.add(id)
    stack.add(id)
    for (const next of graph.get(id) ?? []) {
      if (walk(next)) return true
    }
    stack.delete(id)
    return false
  }
  return [...graph.keys()].some((id) => walk(id))
}

function accept(items: PathItem[], relationships: Relationship[]) {
  return {
    items: items.map((item) => ({ ...item, reviewAccepted: true, reviewStatus: "accepted" as const })),
    relationships: relationships.map((relationship) => ({ ...relationship, reviewStatus: "accepted" as const })),
  }
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  }
}

function freshState(): WorkspaceState {
  return createInitialState({
    workspaces: [],
    activeId: null,
    preferences: defaultPreferences,
    session: { ...defaultSession, draftItems: null },
    history: { schemaVersion: 1, undo: [], redo: [] },
    notice: null,
  })
}

describe("quality audit fixtures", () => {
  it("turns a lecturer email into a lab path and keeps the relative deadline", () => {
    const result = parseInstructions(MESSY_EMAIL, AUDIT_REFERENCE)
    expect(result.status === "ready" || result.status === "partial").toBe(true)
    expect(result.title.toLowerCase()).toMatch(/week 4 lab/)
    expect(titles(result.items, "goal").join(" ").toLowerCase()).toContain("enzyme lab")
    expect(titles(result.items, "step")).toEqual([
      "Collect the absorbance readings from the shared sheet",
      "Write the discussion",
      "Upload the PDF to the portal at https://learn.university.edu/bio101/lab4",
    ])
    expect(titles(result.items, "step").some((title) => /\bis due\b/i.test(title))).toBe(false)
    expect(titles(result.items, "requirement").join(" ").toLowerCase()).toMatch(/methods|raw data/)
    expect(titles(result.items, "person")).toEqual(["patel@university.edu"])

    const deadline = result.items.find((item) => item.type === "deadline")
    expect(deadline?.dueDate).toBe("2026-10-23")
    expect(deadline?.dueTime).toBe("17:00")
    expect(deadline?.dateLabel?.toLowerCase()).toContain("friday")
    expect(deadline?.dateCertainty).toBe("resolved")
    expect(deadline?.basis).toBe("inferred")
    expect(deadline?.description.toLowerCase()).toContain("before friday")
    expect(deadline?.sourceExcerpt?.toLowerCase()).toContain("before friday")
    expect(beforeCycle(result.relationships)).toBe(false)
    expect(result.relationships.some((relationship) => relationship.kind === "before")).toBe(false)
    expect(result.relationships.filter((relationship) => relationship.kind === "order").length).toBeGreaterThan(0)

    const saved = accept(result.items, result.relationships)
    const plan = selectNextAction(saved.items, saved.relationships)
    const selected = saved.items.find((item) => item.id === plan.selectedId)
    expect(plan.state).toBe("ready")
    expect(selected?.type).toBe("step")
    expect(selected?.title).toBe("Collect the absorbance readings from the shared sheet")
    expect(actionInstructionFor(selected!).text).toBe("Collect the absorbance readings from the shared sheet.")
    expect(actionInstructionFor(selected!).authored).toBe(false)
  })

  it("keeps assignment requirements separate from ordered tasks", () => {
    const result = parseInstructions(ASSIGNMENT_BRIEF, AUDIT_REFERENCE)
    expect(result.title.toLowerCase()).toContain("research methods")
    expect(titles(result.items, "goal").join(" ").toLowerCase()).toContain("methods essay")
    expect(titles(result.items, "step")).toEqual([
      "Read the marking rubric",
      "Draft the literature review section",
      "Write the methods section",
      "Submit the essay through Turnitin at https://turnitin.university.edu/methods",
    ])
    for (const requirement of ["At least eight peer-reviewed sources", "A methods section", "A reference list in APA"]) {
      expect(titles(result.items, "requirement")).toContain(requirement)
      expect(titles(result.items, "step")).not.toContain(requirement)
    }
    expect(titles(result.items, "step").some((title) => /submit the essay by november/i.test(title))).toBe(false)
    const deadline = result.items.find((item) => item.type === "deadline" && item.dueDate === "2026-11-14")
    expect(deadline?.dateLabel).toBe("November 14, 2026")
    expect(deadline?.dateCertainty).toBe("exact")
    expect(deadline?.basis).toBe("stated")
    expect(beforeCycle(result.relationships)).toBe(false)
    const order = result.relationships.filter((relationship) => relationship.kind === "order")
    expect(order.length).toBeGreaterThanOrEqual(3)
    expect(result.relationships.filter((relationship) => relationship.kind === "before")).toEqual([])

    const saved = accept(result.items, result.relationships)
    const plan = selectNextAction(saved.items, saved.relationships)
    expect(saved.items.find((item) => item.id === plan.selectedId)?.title).toBe("Read the marking rubric")
    expect(actionInstructionFor(result.items.find((item) => item.title === "Read the marking rubric")!).text).toBe(
      "Read the marking rubric.",
    )
  })

  it("keeps internship rules and documents as requirements despite a Note: line", () => {
    const result = parseInstructions(APPLICATION_EXCERPT, AUDIT_REFERENCE)
    expect(result.status === "ready" || result.status === "partial").toBe(true)
    expect(result.title.toLowerCase()).toContain("summer internship")
    expect(result.items.length).toBeGreaterThan(5)
    expect(titles(result.items, "step")).toEqual(
      expect.arrayContaining(["Gather the official transcript", "Upload the statement of interest"]),
    )
    expect(titles(result.items, "requirement")).toEqual(
      expect.arrayContaining(["Official transcript", "A one-page statement of interest", "One recommendation letter"]),
    )
    expect(titles(result.items, "step").some((title) => /eligible|undergraduate|recommendation letter/i.test(title))).toBe(false)
    expect(titles(result.items, "note").some((title) => /05\/06\/2026/.test(title))).toBe(false)
    const deadline = result.items.find((item) => item.dueDate === "2026-12-01")
    expect(deadline?.type).toBe("deadline")
    expect(deadline?.dateCertainty).toBe("exact")
    const ambiguous = result.items.find((item) => item.type === "deadline" && item.description.includes("05/06/2026"))
    expect(ambiguous?.dueDate).toBeUndefined()
    expect(ambiguous?.dateCertainty).toBe("unresolved")
    expect(titles(result.items, "person")).toContain("internships@coastal.edu")
    expect(titles(result.items, "resource").join(" ").toLowerCase()).toContain("portal")
    expect(beforeCycle(result.relationships)).toBe(false)
    const transcript = result.items.find((item) => item.title === "Official transcript")
    const gather = result.items.find((item) => item.title === "Gather the official transcript")
    expect(
      result.relationships.some(
        (relationship) =>
          relationship.kind === "requires" &&
          relationship.fromId === gather?.id &&
          relationship.toId === transcript?.id,
      ),
    ).toBe(true)

    const plan = selectNextAction(result.items, result.relationships)
    expect(plan.state).toBe("ready")
    expect(result.items.find((item) => item.id === plan.selectedId)?.type).toBe("step")
  })

  it("preserves an ambiguous date and reports deadlines that disagree", () => {
    const result = parseInstructions(CONFLICTING_DEADLINES, AUDIT_REFERENCE)
    expect(result.status).toBe("partial")
    expect(result.title.toLowerCase()).toContain("scholarship")
    expect(titles(result.items, "step")).toEqual(expect.arrayContaining(["Read the eligibility notes", "Submit the form"]))
    const ambiguous = result.items.find((item) => item.type === "deadline" && item.description.includes("05/06/2026"))
    expect(ambiguous?.dueDate).toBeUndefined()
    expect(ambiguous?.dateCertainty).toBe("unresolved")
    expect(ambiguous?.dateLabel).toBe("05/06/2026")
    expect(ambiguous?.deadlineReview).toMatch(/2026-06-05/)
    expect(ambiguous?.deadlineReview).toMatch(/2026-05-06/)
    expect(result.items.some((item) => item.dueDate === "2026-11-20")).toBe(true)
    expect(result.items.some((item) => item.dueDate === "2026-12-01")).toBe(true)
    expect(result.warnings.some((warning) => warning.code === "conflicting-dates")).toBe(true)
    expect(result.warnings.some((warning) => warning.code === "ambiguous-date" || warning.code === "unresolved-deadline")).toBe(true)
    expect(beforeCycle(result.relationships)).toBe(false)
    expect(result.notice?.toLowerCase()).toMatch(/review/)
  })

  it("explains an under-specified note and does not invent a path", () => {
    const result = parseInstructions(INSUFFICIENT_SOURCE, AUDIT_REFERENCE)
    expect(result.items).toEqual([])
    expect(result.status).toBe("failed")
    expect(result.notice?.toLowerCase()).toMatch(/what to do|still in the box/)
    expect(result.error?.code).toBe("no-action")
    expect(result.relationships).toEqual([])
  })
})

describe("quality audit workflow", () => {
  it("rejects a card, keeps a manual edit through re-extraction, and restores the path after refresh", () => {
    const result = parseInstructions(MESSY_EMAIL, AUDIT_REFERENCE)
    const rejected = result.items.find((item) => item.title.startsWith("Upload the PDF"))
    expect(rejected).toBeTruthy()
    const keptItems = result.items.filter((item) => item.id !== rejected?.id)
    const keptLinks = result.relationships.filter(
      (relationship) => relationship.fromId !== rejected?.id && relationship.toId !== rejected?.id,
    )
    const accepted = accept(keptItems, keptLinks)
    let state = workspaceReducer(freshState(), {
      type: "create",
      title: result.title,
      sourceText: MESSY_EMAIL,
      items: accepted.items,
      relationships: accepted.relationships,
      sourceRef: { kind: "paste" },
    })
    const created = state.workspaces[0]
    expect(created?.items.some((item) => item.title.startsWith("Upload the PDF"))).toBe(false)
    expect(created?.sourceText).toBe(MESSY_EMAIL)

    const discussion = created?.items.find((item) => item.title === "Write the discussion")
    expect(discussion).toBeTruthy()
    state = workspaceReducer(state, {
      type: "update-item",
      id: discussion!.id,
      patch: { title: "Write the results discussion" },
      recordUndo: true,
    })
    const edited = state.workspaces[0]?.items.find((item) => item.id === discussion?.id)
    expect(edited?.title).toBe("Write the results discussion")
    expect(cardProvenance(edited!)).toBe("user-edited")

    state = workspaceReducer(state, { type: "reextract", sourceText: MESSY_EMAIL })
    const plan = state.reextractPlan
    expect(plan?.entries.find((entry) => entry.existingId === discussion?.id)?.change).toBe("conflicting")
    expect(plan?.entries.find((entry) => entry.existingId === discussion?.id)?.decision).toBe("pending")
    state = workspaceReducer(state, { type: "reextract-decision", id: discussion!.id, decision: "keep" })
    for (const entry of state.reextractPlan?.entries ?? []) {
      if (entry.decision !== "pending") continue
      const decision = entry.change === "new" ? "reject" : entry.change === "removed-from-source" ? "keep" : "keep"
      state = workspaceReducer(state, { type: "reextract-decision", id: entry.id, decision })
    }
    state = workspaceReducer(state, { type: "commit-reextract" })
    expect(state.workspaces[0]?.items.find((item) => item.id === discussion?.id)?.title).toBe("Write the results discussion")
    expect(state.workspaces[0]?.sourceText).toBe(MESSY_EMAIL)

    state = workspaceReducer(state, { type: "enter-focus" })
    const active = state.workspaces[0]
    const focus = selectNextAction(active?.items ?? [], active?.relationships ?? [])
    const next = active?.items.find((item) => item.id === focus.selectedId)
    expect(focus.state).toBe("ready")
    expect(next?.title).toBe("Collect the absorbance readings from the shared sheet")
    expect(actionInstructionFor(next!).authored).toBe(false)
    expect(actionInstructionFor(next!).text).toBe("Collect the absorbance readings from the shared sheet.")

    const storage = memoryStorage()
    saveAppState(storage, {
      workspaces: state.workspaces,
      activeId: state.activeId,
      preferences: { ...defaultPreferences, readAloudEnabled: true },
      session: sessionFromState(state),
      history: { schemaVersion: 1, undo: state.undoStack, redo: state.redoStack },
    })
    const restored = createInitialState(loadAppState(storage))
    expect(restored.workspaces[0]?.items.find((item) => item.id === discussion?.id)?.title).toBe("Write the results discussion")
    expect(restored.workspaces[0]?.sourceText).toBe(MESSY_EMAIL)
    expect(restored.activeId).toBe(state.activeId)
    const undone = workspaceReducer(restored, { type: "undo" })
    expect(undone.workspaces[0]?.items.find((item) => item.id === discussion?.id)?.title).toBe("Write the discussion")
  })

  it("leaves the insufficient source in the draft when extraction fails", () => {
    let state = workspaceReducer(freshState(), { type: "start-create", sourceText: "" })
    state = workspaceReducer(state, { type: "set-draft", sourceText: INSUFFICIENT_SOURCE, sourceRef: { kind: "paste" } })
    const result = parseInstructions(state.draftSource, AUDIT_REFERENCE)
    state = workspaceReducer(state, {
      type: "set-review",
      items: null,
      title: result.title,
      notice: result.notice,
      status: result.status,
      relationships: [],
      warnings: result.warnings,
    })
    expect(state.draftSource).toBe(INSUFFICIENT_SOURCE)
    expect(state.draftItems).toBeNull()
    expect(state.extractionStatus).toBe("failed")
    expect(state.extractionNotice?.toLowerCase()).toMatch(/what to do|still in the box/)
    expect(state.workspaces).toEqual([])
  })

  it("does not commit a rejected scholarship deadline", () => {
    const result = parseInstructions(CONFLICTING_DEADLINES, AUDIT_REFERENCE)
    const ambiguous = result.items.find((item) => item.description.includes("05/06/2026"))
    const kept = result.items.filter((item) => item.id !== ambiguous?.id && item.dueDate !== "2026-12-01")
    const committed = commitReview({
      existing: [],
      draft: kept.map((item) => ({ ...item, reviewAccepted: true, reviewStatus: "accepted" })),
      relationships: [],
    })
    expect(committed.items.some((item) => item.description.includes("05/06/2026"))).toBe(false)
    expect(committed.items.some((item) => item.dueDate === "2026-12-01")).toBe(false)
    expect(committed.items.some((item) => item.dueDate === "2026-11-20")).toBe(true)
    const again = compareExtraction({
      existing: committed.items,
      proposed: result.items,
      proposedRelationships: result.relationships,
      sourceText: CONFLICTING_DEADLINES,
    })
    expect(again.entries.some((entry) => entry.current?.dueDate === "2026-11-20" && entry.change === "unchanged")).toBe(true)
  })
})
