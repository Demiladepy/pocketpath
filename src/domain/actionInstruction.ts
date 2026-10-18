import type { PathItem } from "./types.ts"

const VERBS = new Set([
  "add", "answer", "ask", "attach", "bring", "buy", "call", "check", "choose", "cite",
  "collect", "compare", "complete", "confirm", "create", "do", "download", "draft",
  "edit", "email", "fill", "find", "finish", "format", "gather", "get", "go", "include",
  "label", "list", "make", "meet", "note", "open", "outline", "pack", "pay", "pick",
  "practice", "prepare", "print", "proofread", "put", "read", "register", "review",
  "revise", "save", "schedule", "send", "set", "share", "sign", "start", "stop",
  "study", "submit", "take", "turn", "update", "upload", "work", "write",
])

export interface ActionInstruction {
  text: string
  authored: boolean
}

export function suggestActionInstruction(item: { title: string; description: string }): string {
  const title = normalize(item.title)
  const sentence = firstSentence(item.description)
  if (title && isImperative(title)) return finish(title)
  if (sentence && isImperative(sentence)) return finish(sentence)
  if (title) return finish(`Work on ${title.replace(/[.]+$/, "")}`)
  if (sentence) return finish(sentence)
  return "Add what to do for this step."
}

export function actionInstructionFor(item: Pick<PathItem, "title" | "description" | "actionInstruction">): ActionInstruction {
  const authored = item.actionInstruction?.trim()
  if (authored) return { text: authored, authored: true }
  return { text: suggestActionInstruction(item), authored: false }
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function firstSentence(text: string): string {
  const clean = normalize(text)
  if (!clean) return ""
  const match = clean.match(/^.*?[.!?](?=\s|$)/)
  return match?.[0]?.trim() ?? clean
}

function isImperative(text: string): boolean {
  const stripped = text.replace(/^\d+[.)]\s*/, "").replace(/^please\s+/i, "")
  const word = stripped.match(/[A-Za-z]+/)?.[0]?.toLowerCase() ?? ""
  return VERBS.has(word)
}

function finish(text: string): string {
  const clean = normalize(text)
  if (!clean) return "Add what to do for this step."
  const clipped = clean.length > 140 ? `${clean.slice(0, 137).trimEnd()}...` : clean
  if (/[.!?]$/.test(clipped) || clipped.endsWith("...")) return clipped
  return `${clipped}.`
}
