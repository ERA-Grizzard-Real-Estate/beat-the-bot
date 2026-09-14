import { postJsonForBlob, postBlobForJson } from "../lib/api";

// Voice playback and transcription, both proxied through /api/voice/*.
//
// There is no API key in this file and none in the browser. The ElevenLabs key
// lives server-side in the ELEVENLABS_API_KEY environment variable, read only
// by api/voice/speak.js and api/voice/transcribe.js.
//
// Voice IDS also live server-side. The client sends a ROLE — "rex", "coach", or
// "character" (plus a packId for "character") — and the server resolves it. If
// you need to change a voice, change it in api/voice/speak.js; there is no copy
// here to keep in sync.

// Module-level reference to the currently playing audio — allows external skip
let _currentAudio = null;
// Resolver for the in-flight speakText promise — lets skip advance the game flow
let _currentResolve = null;

export function stopSpeaking() {
  if (_currentAudio) {
    _currentAudio.pause();
    _currentAudio.currentTime = 0;
    _currentAudio = null;
  }
  // Resolve the pending promise so the awaiting game flow continues instead of hanging
  if (_currentResolve) {
    const resolve = _currentResolve;
    _currentResolve = null;
    resolve();
  }
}

// Roles the server will accept. Anything else is normalized to "rex", which
// matches how the old client-side mapping fell through to Rex.
const VOICE_ROLES = ["rex", "coach", "character"];

export async function speakText(text, voice = "rex", packId = null, speed = 1.15) {
  const role = VOICE_ROLES.includes(voice) ? voice : "rex";
  try {
    const audioBlob = await postJsonForBlob("/api/voice/speak", {
      text,
      voice: role,
      packId,
      speed,
    });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    _currentAudio = audio;

    // The promise must resolve on onended, on onerror, AND via stopSpeaking().
    // That third case is what makes the host's skip button work instead of
    // hanging the phase machine. Do not change this contract.
    return new Promise((resolve) => {
      _currentResolve = resolve;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        _currentAudio = null;
        _currentResolve = null;
        resolve();
      };
      audio.onerror = () => {
        _currentAudio = null;
        _currentResolve = null;
        resolve(); // resolve so game flow never hangs
      };
      audio.play();
    });
  } catch (err) {
    console.error("TTS Error:", err);
  }
}

export async function transcribeAudio(audioBlob) {
  // Try the server proxy first. Audio is sent as a raw body, transcribed, and
  // discarded server-side — it is never stored.
  try {
    const data = await postBlobForJson(
      "/api/voice/transcribe",
      audioBlob,
      audioBlob.type || "audio/webm"
    );
    const text = (data?.text || "").trim();
    if (text.length > 0) return text;
    console.warn("Transcription came back empty; falling back to browser STT.");
  } catch (err) {
    console.warn("Voice proxy STT error:", err);
  }

  // Fallback — browser Web Speech API.
  console.log("Falling back to browser speech recognition...");
  return await transcribeWithBrowser(audioBlob);
}

// Browser Web Speech API fallback — re-records a short confirmation prompt
// Actually: since we have the blob, convert and use recognition directly
function transcribeWithBrowser(audioBlob) {
  return new Promise((resolve) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      resolve("[Could not transcribe — no speech recognition available in this browser.]");
      return;
    }

    // Play back the audio and run speech recognition simultaneously
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript + " ";
      }
    };

    recognition.onend = () => {
      URL.revokeObjectURL(url);
      resolve(finalTranscript.trim() || "[No speech detected — check microphone permissions]");
    };

    recognition.onerror = (e) => {
      console.warn("Browser STT error:", e.error);
      URL.revokeObjectURL(url);
      resolve("[Transcription failed — check microphone permissions and try again]");
    };

    audio.onended = () => recognition.stop();
    audio.onerror = () => { recognition.stop(); resolve("[Audio playback failed]"); };

    recognition.start();
    audio.play();
  });
}
