import { useState } from "react";
import { transcribeAudio } from "../hooks/useElevenLabs";

// The pre-game speaker and microphone check.
//
// Self-contained: it borrows speak() and the recorder from the phase machine
// rather than owning them, so there is only ever one recorder and one TTS path.
export function useSoundCheck({ speak, startRecording, stopRecording }) {
  const [scSpeakerStatus, setScSpeakerStatus] = useState("idle"); // idle | playing | pass | fail
  const [scMicStatus, setScMicStatus] = useState("idle");         // idle | recording | transcribing | pass | fail
  const [scMicTranscript, setScMicTranscript] = useState("");

  const handleTestSpeaker = async () => {
    setScSpeakerStatus("playing");
    await speak("Testing! Testing! One, two, three — if you can hear Rex loud and clear, your speakers are READY for the arena!", "rex");
    setScSpeakerStatus("pass");
  };

  const handleTestMicStart = async () => {
    setScMicStatus("recording");
    setScMicTranscript("");
    await startRecording();
  };

  const handleTestMicStop = async () => {
    const blob = await stopRecording();
    if (!blob) { setScMicStatus("fail"); return; }
    setScMicStatus("transcribing");
    const text = await transcribeAudio(blob);
    if (text && text.trim().length > 0) {
      setScMicTranscript(text);
      setScMicStatus("pass");
    } else {
      setScMicTranscript("");
      setScMicStatus("fail");
    }
  };

  const handleRetryMic = () => {
    setScMicStatus("idle");
    setScMicTranscript("");
  };

  return {
    scSpeakerStatus,
    scMicStatus,
    scMicTranscript,
    handleTestSpeaker,
    handleTestMicStart,
    handleTestMicStop,
    handleRetryMic,
  };
}
