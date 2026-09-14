import { useState, useRef } from "react";

// Microphone capture plus live on-screen transcription.
//
// Two things run at once while an agent answers: a MediaRecorder collecting the
// blob that gets sent for transcription, and the browser's Web Speech API
// driving the words that appear on screen as they talk. Lifted out of the phase
// machine unchanged.
//
// onError is called with a human-readable message when the mic is refused.
export function useAudioRecorder({ onError } = {}) {
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // MediaRecorder — captures audio blob for ElevenLabs fallback
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;

      // Web Speech API — live transcription shown on screen as they speak
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        let finalText = "";
        recognition.onresult = (e) => {
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              finalText += e.results[i][0].transcript + " ";
            } else {
              interim += e.results[i][0].transcript;
            }
          }
          setLiveTranscript(finalText + interim);
        };
        recognition.onerror = (e) => console.warn("Live STT error:", e.error);
        recognition.start();
        recognitionRef.current = recognition;
      }

      setLiveTranscript("");
      setIsRecording(true);
    } catch {
      onError?.("Microphone access denied. Please allow mic access.");
    }
  };

  const stopRecording = () => {
    // Stop Web Speech recognition
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current) return resolve(null);
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        resolve(blob);
      };
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      setIsRecording(false);
    });
  };

  return { isRecording, liveTranscript, setLiveTranscript, startRecording, stopRecording };
}
