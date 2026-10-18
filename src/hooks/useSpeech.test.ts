import { renderHook, act } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { useSpeech } from "./useSpeech.ts"

class FakeUtterance {
  text: string
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  onpause: (() => void) | null = null
  onresume: (() => void) | null = null

  constructor(text: string) {
    this.text = text
  }
}

function installSpeech(resumeClearsPause: boolean) {
  const spoken: FakeUtterance[] = []
  const synth = {
    speaking: false,
    paused: false,
    cancel() {
      this.speaking = false
      this.paused = false
    },
    pause() {
      this.paused = true
    },
    resume() {
      if (resumeClearsPause) this.paused = false
    },
    speak(utterance: FakeUtterance) {
      spoken.push(utterance)
      this.speaking = true
      this.paused = false
    },
  }
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: synth })
  Object.defineProperty(window, "SpeechSynthesisUtterance", { configurable: true, value: FakeUtterance })
  return { synth, spoken }
}

afterEach(() => {
  Reflect.deleteProperty(window, "speechSynthesis")
  Reflect.deleteProperty(window, "SpeechSynthesisUtterance")
})

describe("useSpeech", () => {
  it("starts, pauses, resumes, repeats, and stops an instruction", () => {
    const { spoken } = installSpeech(true)
    const { result } = renderHook(() => useSpeech())

    act(() => {
      expect(result.current.speak("Read the prompt.")).toBe(true)
    })
    expect(result.current.phase).toBe("speaking")
    expect(spoken.map((utterance) => utterance.text)).toEqual(["Read the prompt."])

    act(() => {
      expect(result.current.pause()).toBe(true)
    })
    expect(result.current.phase).toBe("paused")

    act(() => {
      expect(result.current.resume()).toBe(true)
    })
    expect(result.current.phase).toBe("speaking")
    expect(spoken).toHaveLength(1)

    act(() => {
      expect(result.current.speak("Read the prompt.")).toBe(true)
    })
    expect(spoken).toHaveLength(2)

    act(() => {
      result.current.stop()
    })
    expect(result.current.phase).toBe("idle")
  })

  it("starts again from the beginning when resume cannot continue", () => {
    installSpeech(false)
    const { result } = renderHook(() => useSpeech())
    act(() => {
      result.current.speak("Submit the form.")
    })
    act(() => {
      result.current.pause()
    })
    act(() => {
      expect(result.current.resume()).toBe(true)
    })
    expect(result.current.phase).toBe("speaking")
    expect(result.current.notice).toMatch(/beginning/i)
  })

  it("reports that speech is unavailable and does not invent audio", () => {
    const { result } = renderHook(() => useSpeech())
    expect(result.current.supported).toBe(false)
    expect(result.current.speak("Read the prompt.")).toBe(false)
    expect(result.current.phase).toBe("idle")
  })
})
