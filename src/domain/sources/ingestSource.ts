import type { SourceKind, SourceRef } from "../types.ts"

/** Plain-text imports stay small enough for the local organizer. */
export const MAX_IMPORT_BYTES = 100_000

export type SourceReadStatus = "ready" | "empty" | "failed" | "unsupported"

export interface IngestedSource {
  kind: SourceKind
  status: SourceReadStatus
  /** Extracted text. Empty when the contents were not read. */
  text: string
  filename?: string
  url?: string
  byteLength?: number
  message: string
  /** True only when text was actually taken from the source. */
  textAvailable: boolean
}

const TEXT_KINDS = new Set<SourceKind>(["text-file", "markdown", "email-file"])

export function ingestPastedText(text: string): IngestedSource {
  if (text.trim().length === 0) {
    return base("paste", "empty", "Paste instructions before organizing. Nothing was organized.")
  }
  return { ...base("paste", "ready", "Pasted text is ready to review."), text, textAvailable: true }
}

export function ingestUpload(input: {
  name: string
  mediaType: string
  byteLength: number
  text: string | null
}): IngestedSource {
  const filename = displayName(input.name)
  const kind = kindFor(input.name, input.mediaType)
  if (input.byteLength > MAX_IMPORT_BYTES) {
    return {
      ...base(
        kind === "unknown" ? "text-file" : kind,
        "failed",
        "That file is larger than 100 KB, so it was not loaded. Choose a smaller file to retry.",
      ),
      filename,
      byteLength: input.byteLength,
    }
  }
  if (kind === "unknown") {
    return {
      ...base("text-file", "unsupported", "That file type is not supported. Load a .txt, .md, or .eml file, or paste the text."),
      filename,
      byteLength: input.byteLength,
    }
  }
  if (!TEXT_KINDS.has(kind)) {
    return {
      ...base(kind, "unsupported", unsupportedMessage(kind)),
      filename,
      byteLength: input.byteLength,
    }
  }
  if (input.text === null) {
    return {
      ...base(kind, "failed", "That file could not be read. Paste the text instead, or choose the file again to retry."),
      filename,
      byteLength: input.byteLength,
    }
  }
  if (kind === "email-file") return ingestEmailFile(input.text, filename, input.byteLength)
  if (input.text.startsWith("%PDF")) {
    return {
      ...base("pdf", "unsupported", unsupportedMessage("pdf")),
      filename,
      byteLength: input.byteLength,
    }
  }
  if (input.text.trim().length === 0) {
    return {
      ...base(kind, "empty", "That document is empty, so nothing was organized. Choose another file to retry."),
      filename,
      byteLength: input.byteLength,
    }
  }
  return {
    ...base(kind, "ready", `Text from ${filename} is in the box below. Review it before organizing.`),
    filename,
    byteLength: input.byteLength,
    text: input.text,
    textAvailable: true,
  }
}

/**
 * Records a webpage address without fetching it.
 * Browsers block cross-origin reads, and this app has no server to fetch the page.
 */
export function ingestUrl(raw: string): IngestedSource {
  const trimmed = raw.trim()
  if (!trimmed) {
    return base("url", "failed", "Enter a webpage address. Nothing was loaded.")
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return {
      ...base("url", "unsupported", "That address is not a webpage. Paste the page text instead. Nothing was loaded."),
      url: trimmed.slice(0, 2000),
    }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ...base("url", "unsupported", "That address is not a webpage. Paste the page text instead. Nothing was loaded."),
      url: parsed.href.slice(0, 2000),
    }
  }
  return {
    ...base(
      "url",
      "unsupported",
      "This page was not loaded. Browsers block PocketPaths from reading other websites, and there is no server to fetch the page. Paste the page text instead.",
    ),
    url: parsed.href.slice(0, 2000),
  }
}

export function sourceRefFrom(source: IngestedSource): SourceRef | null {
  if (!source.textAvailable) return null
  const ref: SourceRef = { kind: source.kind }
  if (source.filename) ref.filename = source.filename
  if (source.url) ref.url = source.url
  return ref
}

export function describeSourceRef(ref: SourceRef | null | undefined): string | null {
  if (!ref?.filename && !ref?.url) return null
  if (ref.filename) return `Source file: ${ref.filename}`
  if (ref.url) return `Source address, not loaded: ${ref.url}`
  return null
}

function base(kind: SourceKind, status: SourceReadStatus, message: string): IngestedSource {
  return { kind, status, text: "", message, textAvailable: false }
}

function unsupportedMessage(kind: SourceKind): string {
  if (kind === "pdf") return "PDF files cannot be read in this browser. Paste the text instead."
  if (kind === "docx") return "Word documents cannot be read in this browser. Paste the text instead."
  if (kind === "image") return "Images and screenshots cannot be read here. Paste the words from the picture instead."
  if (kind === "email-file") return "This email file could not be read. Paste the message text instead."
  if (kind === "url") return "This page was not loaded. Paste the page text instead."
  return "That file type is not supported. Load a .txt, .md, or .eml file, or paste the text."
}

function ingestEmailFile(raw: string, filename: string, byteLength: number): IngestedSource {
  const extracted = extractEmailText(raw)
  if (!extracted.ok) {
    return { ...base("email-file", "failed", extracted.message), filename, byteLength }
  }
  if (extracted.text.trim().length === 0) {
    return {
      ...base("email-file", "empty", "That email has no message text, so nothing was organized. Choose another file to retry."),
      filename,
      byteLength,
    }
  }
  return {
    ...base("email-file", "ready", `Text from ${filename} is in the box below. Review it before organizing.`),
    filename,
    byteLength,
    text: extracted.text,
    textAvailable: true,
  }
}

function extractEmailText(raw: string): { ok: true; text: string } | { ok: false; message: string } {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const splitAt = normalized.indexOf("\n\n")
  if (splitAt < 0) {
    return { ok: false, message: "This file does not look like an exported email. Paste the message text instead." }
  }
  const headers = parseHeaders(normalized.slice(0, splitAt))
  const body = normalized.slice(splitAt + 2)
  if (!headers.has("from") && !headers.has("subject") && !headers.has("mime-version")) {
    return { ok: false, message: "This file does not look like an exported email. Paste the message text instead." }
  }
  const contentType = headers.get("content-type") ?? "text/plain"
  if (/multipart\//i.test(contentType)) {
    const boundary = /boundary="?([^";\s]+)"?/i.exec(contentType)?.[1]
    if (!boundary) {
      return { ok: false, message: "This email could not be read. Paste the message text instead." }
    }
    const part = plainTextPart(body, boundary)
    if (!part) {
      return { ok: false, message: "This email has no plain-text part. Paste the message text instead." }
    }
    return finishEmail(headers, part.headers, part.body)
  }
  if (/text\/html/i.test(contentType)) {
    return { ok: false, message: "This email has no plain-text part. Paste the message text instead." }
  }
  return finishEmail(headers, headers, body)
}

function finishEmail(
  messageHeaders: Map<string, string>,
  partHeaders: Map<string, string>,
  body: string,
): { ok: true; text: string } | { ok: false; message: string } {
  const decoded = decodeTransfer(partHeaders.get("content-transfer-encoding") ?? "", body)
  if (decoded === null) {
    return { ok: false, message: "This email could not be read. Paste the message text instead." }
  }
  if (decoded.trim().length === 0) return { ok: true, text: "" }
  const subject = messageHeaders.get("subject")
  const text = subject ? `Subject: ${subject}\n\n${decoded.replace(/^\n+/, "")}` : decoded.replace(/^\n+/, "")
  return { ok: true, text: text.replace(/\s+$/, "") }
}

function plainTextPart(body: string, boundary: string): { headers: Map<string, string>; body: string } | null {
  const marker = `--${boundary}`
  for (const chunk of body.split(marker)) {
    const trimmed = chunk.replace(/^\n/, "")
    if (trimmed.startsWith("--") || trimmed.trim().length === 0) continue
    const gap = trimmed.indexOf("\n\n")
    if (gap < 0) continue
    const headers = parseHeaders(trimmed.slice(0, gap))
    const type = (headers.get("content-type") ?? "text/plain").toLowerCase()
    if (!type.includes("text/plain")) continue
    return { headers, body: trimmed.slice(gap + 2) }
  }
  return null
}

function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>()
  let current = ""
  const store = (line: string) => {
    const index = line.indexOf(":")
    if (index <= 0) return
    const name = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim()
    if (name && !headers.has(name)) headers.set(name, value)
  }
  for (const line of block.split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      current = `${current} ${line.trim()}`
      continue
    }
    if (current) store(current)
    current = line
  }
  if (current) store(current)
  return headers
}

function decodeTransfer(encoding: string, body: string): string | null {
  const normalized = encoding.trim().toLowerCase()
  if (normalized === "base64") return decodeBase64(body)
  if (normalized === "quoted-printable") return decodeQuotedPrintable(body)
  return body
}

function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value.replace(/\s/g, ""))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function decodeQuotedPrintable(value: string): string {
  const unfolded = value.replace(/=\n/g, "")
  const bytes: number[] = []
  for (let index = 0; index < unfolded.length; index += 1) {
    const pair = unfolded.slice(index + 1, index + 3)
    if (unfolded[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(pair)) {
      bytes.push(Number.parseInt(pair, 16))
      index += 2
      continue
    }
    const code = unfolded.charCodeAt(index)
    bytes.push(code)
  }
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function kindFor(name: string, mediaType: string): SourceKind | "unknown" {
  const extension = fileExtension(name)
  const fromName = KIND_BY_EXTENSION[extension]
  if (fromName) return fromName
  const type = mediaType.toLowerCase().split(";")[0]?.trim() ?? ""
  if (type.startsWith("image/")) return "image"
  return KIND_BY_TYPE[type] ?? "unknown"
}

function fileExtension(name: string): string {
  const baseName = name.split(/[/\\]/).pop() ?? name
  const match = /\.([a-z0-9]+)$/i.exec(baseName.trim())
  return match?.[1]?.toLowerCase() ?? ""
}

function displayName(name: string): string {
  const baseName = (name.split(/[/\\]/).pop() ?? name).replace(/[\u0000-\u001f\u007f]/g, "").trim()
  return baseName.slice(0, 180) || "the file"
}

const KIND_BY_EXTENSION: Record<string, SourceKind> = {
  txt: "text-file",
  md: "markdown",
  markdown: "markdown",
  pdf: "pdf",
  doc: "docx",
  docx: "docx",
  eml: "email-file",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  heic: "image",
}

const KIND_BY_TYPE: Record<string, SourceKind> = {
  "text/plain": "text-file",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "docx",
  "message/rfc822": "email-file",
}
