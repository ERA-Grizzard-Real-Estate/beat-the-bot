// Vercel serverless function — ElevenLabs speech-to-text proxy.
//
// The ElevenLabs key lives ONLY here, read from the ELEVENLABS_API_KEY
// environment variable, and is NEVER shipped to the browser.
//
// Audio is transient. It is read into memory, forwarded to ElevenLabs for
// transcription, and dropped when the request ends. It is never written to
// disk, never stored, and never sent anywhere else. Only the transcript comes
// back. This is a deliberate constraint from the handover spec — see
// docs/PRODUCTION-HANDOVER.md section 5, principle 4.
//
// The client POSTs the raw recording as the request body with an audio
// content-type. Keeping it raw rather than multipart means there is no
// multipart parser to get wrong on this side.

export const config = { api: { bodyParser: false } };

// Vercel caps a serverless request body at 4.5 MB. Stay under it and fail with
// a clear message rather than letting the platform cut the connection. At webm
// opus rates this is many minutes of speech; a game answer is well under it.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
];

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_AUDIO_BYTES) {
        const err = new Error("Audio too large");
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Voice transcribe: ELEVENLABS_API_KEY is not set");
    res.status(500).json({ error: "Server is missing ELEVENLABS_API_KEY" });
    return;
  }

  try {
    const rawType = (req.headers["content-type"] || "audio/webm").split(";")[0].trim();
    const contentType = ALLOWED_AUDIO_TYPES.includes(rawType) ? rawType : "audio/webm";

    const audio = await readRawBody(req);
    if (!audio.length) {
      res.status(400).json({ error: "Empty audio body" });
      return;
    }

    // ElevenLabs wants the field named "file" with a real filename, and
    // model_id must be scribe_v1 or the transcript comes back unpunctuated.
    const form = new FormData();
    form.append("file", new Blob([audio], { type: contentType }), "recording.webm");
    form.append("model_id", "scribe_v1");

    const elRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!elRes.ok) {
      const detail = await elRes.text();
      console.error("ElevenLabs STT error:", elRes.status, detail.slice(0, 300));
      res.status(502).json({ error: `ElevenLabs ${elRes.status}` });
      return;
    }

    const data = await elRes.json();
    const text = (data?.text || data?.transcript || "").trim();
    res.status(200).json({ text });
  } catch (err) {
    if (err && err.statusCode === 413) {
      res.status(413).json({ error: "Audio too large" });
      return;
    }
    console.error("Voice transcribe function error:", err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
}
