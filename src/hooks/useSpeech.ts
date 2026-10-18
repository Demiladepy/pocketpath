import { useCallback, useEffect, useRef, useState } from "react"

export type SpeechPhase = "idle" | "speaking" | "paused"

function synthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !window.speechSynthesis) return null
  return window.speechSynthesis
}

export function useSpeech() {
  const synth = synthesis()
  const supported = synth !== null
  const pauseSupported = typeof synth?.pause === "function" && typeof synth.resume === "function"
  const [phase, setPhase] = useState<SpeechPhase>("idle")
  const [notice, setNotice] = useState<string | null>(null)
  const generation = useRef(0)
  const lastText = useRef("")

  const stop = useCallback(() => {
    generation.current += 1
    synthesis()?.cancel()
    setPhase("idle")
    setNotice(null)
  }, [])

  const speak = useCallback((text: string) => {
    const current = synthesis()
    const clean = text.trim()
    if (!current || !clean) return false
    try {
      generation.current += 1
      const id = generation.current
      current.cancel()
      const utterance = new SpeechSynthesisUtterance(clean)
      lastText.current = clean
      utterance.onend = () => {
        if (generation.current !== id) return
        setPhase("idle")
        setNotice(null)
      }
      utterance.onerror = () => {
        if (generation.current === id) setPhase("idle")
      }
      utterance.onpause = () => {
        if (generation.current === id) setPhase("paused")
      }
      utterance.onresume = () => {
        if (generation.current === id) setPhase("speaking")
      }
      current.speak(utterance)
      setPhase("speaking")
      setNotice(null)
      return true
    } catch {
      setPhase("idle")
      setNotice("Read aloud could not start. The instruction stays on screen.")
      return false
    }
  }, [])

  const pause = useCallback(() => {
    const current = synthesis()
    if (!current || typeof current.pause !== "function" || !current.speaking || current.paused) return false
    try {
      current.pause()
      setPhase("paused")
      setNotice(null)
      return true
    } catch {
      setNotice("Pause is not available in this browser. Stop ends reading, and Repeat starts the instruction again.")
      return false
    }
  }, [])

  const resume = useCallback(() => {
    const current = synthesis()
    if (!current) return false
    try {
      if (typeof current.resume === "function" && current.paused) {
        current.resume()
        if (!current.paused) {
          setPhase("speaking")
          setNotice(null)
          return true
        }
      }
    } catch {
      // Some browsers expose resume but cannot continue a paused utterance.
    }
    const restarted = speak(lastText.current)
    if (restarted) setNotice("Reading started again from the beginning.")
    return restarted
  }, [speak])

  useEffect(() => stop, [stop])

  return { supported, pauseSupported, phase, notice, speak, pause, resume, stop }
}
