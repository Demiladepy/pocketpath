import { Pause, Play, RotateCcw, Square } from "lucide-react"
import { useSpeech } from "../hooks/useSpeech.ts"
import { Button } from "./Button.tsx"

export function ReadAloudControls({
  text,
  speech,
}: {
  text: string
  speech: ReturnType<typeof useSpeech>
}) {
  const ready = text.trim().length > 0
  if (!speech.supported) {
    return (
      <p className="hint" role="status">
        Read aloud is not available in this browser. The words stay on screen, so you can read them yourself.
      </p>
    )
  }

  return (
    <div className="stack">
      <div className="action-row" role="group" aria-label="Read aloud">
        <Button variant="secondary" icon={Play} onClick={() => speech.speak(text)} disabled={!ready || speech.phase !== "idle"}>
          Start reading
        </Button>
        {speech.pauseSupported ? (
          <Button
            variant="secondary"
            icon={speech.phase === "paused" ? Play : Pause}
            onClick={() => (speech.phase === "paused" ? speech.resume() : speech.pause())}
            disabled={speech.phase === "idle"}
          >
            {speech.phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null}
        <Button variant="secondary" icon={RotateCcw} onClick={() => speech.speak(text)} disabled={!ready}>
          Repeat instruction
        </Button>
        <Button variant="secondary" icon={Square} onClick={speech.stop} disabled={speech.phase === "idle"}>
          Stop
        </Button>
      </div>
      {speech.supported && !speech.pauseSupported ? (
        <p className="hint">Pause is not available in this browser. Stop ends reading, and Repeat starts the instruction again.</p>
      ) : null}
      {speech.notice ? (
        <p className="hint" role="status">
          {speech.notice}
        </p>
      ) : null}
    </div>
  )
}
