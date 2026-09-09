import { describe, it, expect } from 'vitest'
import { resolveVoiceId } from '../api/voice/speak.js'

// The role -> voice id mapping used to live in the browser. It now lives only
// in the proxy, so this is the single place a bad edit would show up. These
// assertions pin the behavior the old client-side mapping had.
describe('resolveVoiceId', () => {
  it('maps the three roles the client can send', () => {
    expect(resolveVoiceId('rex', null)).toBeTruthy()
    expect(resolveVoiceId('coach', null)).toBeTruthy()
    expect(resolveVoiceId('character', 1)).toBeTruthy()
  })

  it('gives rex, coach, and the challenger distinct voices', () => {
    const rex = resolveVoiceId('rex', null)
    const coach = resolveVoiceId('coach', null)
    const challenger = resolveVoiceId('character', 1)
    expect(new Set([rex, coach, challenger]).size).toBe(3)
  })

  it('gives each pack its own challenger voice', () => {
    const ids = [1, 2, 3, 4].map((packId) => resolveVoiceId('character', packId))
    expect(new Set(ids).size).toBe(4)
  })

  it('falls back to rex for a character with no known pack', () => {
    // Matches the old client behavior: CHALLENGER_VOICE_IDS[packId] || REX.
    expect(resolveVoiceId('character', null)).toBe(resolveVoiceId('rex', null))
    expect(resolveVoiceId('character', 99)).toBe(resolveVoiceId('rex', null))
  })

  it('rejects an unknown role rather than guessing a voice', () => {
    expect(resolveVoiceId('narrator', null)).toBeNull()
    expect(resolveVoiceId('', null)).toBeNull()
  })
})
