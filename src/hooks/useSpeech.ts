import { useCallback, useEffect, useState } from "react"

function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

export function useSpeech() {
  const supported = canSpeak()
  const [speaking, setSpeaking] = useState(false)

  const stop = useCallback(() => {
    if (canSpeak()) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string) => {
    if (!canSpeak()) return false
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(utterance)
      setSpeaking(true)
      return true
    } catch {
      setSpeaking(false)
      return false
    }
  }, [])

  useEffect(() => stop, [stop])

  return { supported, speaking, speak, stop }
}
