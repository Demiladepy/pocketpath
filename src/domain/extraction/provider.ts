import { extractDraft } from "./extractDraft.ts"
import { assessCards, providerFailure } from "./quality.ts"
import type { ExtractionDraft, ExtractionInput, ExtractionProvider } from "./types.ts"

/**
 * Deterministic extraction. A future model adapter can implement ExtractionProvider,
 * but it must run outside the browser and must not put an API key in client code.
 */
export const deterministicProvider: ExtractionProvider = {
  id: "deterministic",
  extract(input: ExtractionInput): ExtractionDraft {
    return extractDraft(input)
  },
}

export function extractWithProvider(
  input: ExtractionInput,
  provider: ExtractionProvider = deterministicProvider,
): ExtractionDraft {
  try {
    const draft = provider.extract(input)
    if (!draft || !Array.isArray(draft.items)) return providerFailure(input.text ?? "")
    if (draft.error?.code === "provider") return { ...draft, sourceText: draft.sourceText || input.text || "" }
    const assessed = assessCards({
      sourceText: input.text ?? draft.sourceText ?? "",
      title: draft.title,
      items: draft.items,
      warnings: Array.isArray(draft.warnings) ? draft.warnings : [],
    })
    return {
      ...draft,
      title: assessed.title,
      items: assessed.items,
      warnings: assessed.warnings,
      error: assessed.error,
      status: assessed.status,
      notice: assessed.notice,
      sourceText: input.text ?? draft.sourceText ?? "",
    }
  } catch {
    return providerFailure(input.text ?? "")
  }
}
