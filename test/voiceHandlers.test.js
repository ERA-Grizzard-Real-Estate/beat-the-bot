import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Readable } from 'node:stream'
import speak from '../api/voice/speak.js'
import transcribe from '../api/voice/transcribe.js'

// Minimal stand-in for the Vercel res object.
function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    send(payload) {
      this.body = payload
      return this
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
  }
  return res
}

const ORIGINAL_KEY = process.env.ELEVENLABS_API_KEY

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = 'test-key-not-real'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ELEVENLABS_API_KEY
  else process.env.ELEVENLABS_API_KEY = ORIGINAL_KEY
  vi.restoreAllMocks()
})

describe('POST /api/voice/speak', () => {
  it('returns audio and never leaks the key to the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('fake-mp3-bytes').buffer,
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await speak({ method: 'POST', body: { text: 'Welcome to Beat the Bot', voice: 'rex' } }, res)

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('audio/mpeg')
    expect(Buffer.isBuffer(res.body)).toBe(true)

    // The key goes upstream in a header, never back to the browser.
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['xi-api-key']).toBe('test-key-not-real')
    expect(JSON.stringify(res.body)).not.toContain('test-key-not-real')
  })

  it('preserves the speed the client asked for', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)

    await speak({ method: 'POST', body: { text: 'hi', voice: 'coach', speed: 1.0 } }, mockRes())
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.voice_settings.speed).toBe(1.0)
    expect(sent.model_id).toBe('eleven_turbo_v2')
  })

  it('rejects an unknown voice role', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = mockRes()
    await speak({ method: 'POST', body: { text: 'hi', voice: 'narrator' } }, res)
    expect(res.statusCode).toBe(400)
  })

  it('rejects empty text', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = mockRes()
    await speak({ method: 'POST', body: { text: '   ', voice: 'rex' } }, res)
    expect(res.statusCode).toBe(400)
  })

  it('fails loudly when the server has no key configured', async () => {
    delete process.env.ELEVENLABS_API_KEY
    const res = mockRes()
    await speak({ method: 'POST', body: { text: 'hi' } }, res)
    expect(res.statusCode).toBe(500)
  })

  it('hides upstream ElevenLabs detail from the browser', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'quota exceeded for account acct_secret_123',
      })
    )
    const res = mockRes()
    await speak({ method: 'POST', body: { text: 'hi', voice: 'rex' } }, res)
    expect(res.statusCode).toBe(502)
    expect(JSON.stringify(res.body)).not.toContain('acct_secret_123')
  })
})

function mockAudioReq(bytes, contentType = 'audio/webm') {
  const req = Readable.from([Buffer.from(bytes)])
  req.method = 'POST'
  req.headers = { 'content-type': contentType }
  return req
}

describe('POST /api/voice/transcribe', () => {
  it('returns the transcript and forwards scribe_v1', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'I understand your concern about price.' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = mockRes()
    await transcribe(mockAudioReq('pretend-webm-audio'), res)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ text: 'I understand your concern about price.' })

    const form = fetchMock.mock.calls[0][1].body
    expect(form.get('model_id')).toBe('scribe_v1')
    expect(form.get('file')).toBeInstanceOf(Blob)
  })

  it('rejects an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const res = mockRes()
    await transcribe(mockAudioReq(''), res)
    expect(res.statusCode).toBe(400)
  })

  it('does not disable the body parser by accident', async () => {
    const mod = await import('../api/voice/transcribe.js')
    expect(mod.config.api.bodyParser).toBe(false)
  })
})
