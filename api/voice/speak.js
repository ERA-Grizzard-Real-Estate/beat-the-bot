// Vercel serverless function — ElevenLabs text-to-speech proxy.
//
// The ElevenLabs key lives ONLY here, read from the ELEVENLABS_API_KEY
// environment variable, and is NEVER shipped to the browser. This replaces the
// old public/config.js path, where the key was set on window.__EL_KEY__ and was
// readable by anyone who opened devtools.
//
// Set the key once with:  vercel env add ELEVENLABS_API_KEY production
// (or in the Vercel dashboard -> Project -> Settings -> Environment Variables)
//
// The client sends a voice ROLE ("rex" | "coach" | "character"), never a raw
// voice id. The ids live here and only here, so this endpoint cannot be used as
// an open proxy to arbitrary voices on the account, and the ids stay private.

const REX_VOICE_ID = "dHd5gvgSOzSfduK4CvEg";
const COACH_VOICE_ID = "nf3HWeYdCxC9WYfyDEDE";

// One challenger voice per pack. Pack 5 is vestigial — the library ships 4
// categories — but the entry is kept so pack numbering stays stable.
const CHALLENGER_VOICE_IDS = {
  1: "2tM0Teq5Piex0mNtlZnm",
  2: "SOYHLrjzK2X1ezoPC6cr",
  3: "K7W7zLWeGoxU9YqWoB7A",
  4: "pNInz6obpgDQGcFmaJgB",
  5: "FGY2WhTYpPnrIDTdsKH5",
};

// Rex's longest scripted lines run a few hundred characters; coaching blocks are
// the longest thing spoken. This is a generous ceiling that still stops someone
// from billing the account a novel at a time.
const MAX_TEXT_LENGTH = 5000;

// Exported for tests. This is the only copy of the role -> voice mapping.
export function resolveVoiceId(voice, packId) {
  if (voice === "coach") return COACH_VOICE_ID;
  if (voice === "character") return CHALLENGER_VOICE_IDS[packId] || REX_VOICE_ID;
  if (voice === "rex") return REX_VOICE_ID;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error("Voice speak: ELEVENLABS_API_KEY is not set");
    res.status(500).json({ error: "Server is missing ELEVENLABS_API_KEY" });
    return;
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const text = typeof body.text === "string" ? body.text.trim() : "";
    const voice = typeof body.voice === "string" ? body.voice : "rex";
    const packId = body.packId ?? null;
    const requestedSpeed = Number(body.speed);

    if (!text) {
      res.status(400).json({ error: "Missing text" });
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      res.status(413).json({ error: `Text exceeds ${MAX_TEXT_LENGTH} characters` });
      return;
    }

    const voiceId = resolveVoiceId(voice, packId);
    if (!voiceId) {
      res.status(400).json({ error: `Unknown voice "${voice}"` });
      return;
    }

    // Voice settings are carried over verbatim from the old client-side call so
    // Rex sounds exactly as he did on stage. Do not retune casually.
    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2",
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.6,
            use_speaker_boost: true,
            speed: Number.isFinite(requestedSpeed) ? requestedSpeed : 1.15,
          },
        }),
      }
    );

    if (!elRes.ok) {
      // Log the detail server-side; do not hand upstream account errors to the
      // browser.
      const detail = await elRes.text();
      console.error("ElevenLabs TTS error:", elRes.status, detail.slice(0, 300));
      res.status(502).json({ error: `ElevenLabs ${elRes.status}` });
      return;
    }

    const audio = Buffer.from(await elRes.arrayBuffer());
    res.setHeader("content-type", "audio/mpeg");
    res.setHeader("cache-control", "no-store");
    res.status(200).send(audio);
  } catch (err) {
    console.error("Voice speak function error:", err);
    res.status(500).json({ error: String((err && err.message) || err) });
  }
}
