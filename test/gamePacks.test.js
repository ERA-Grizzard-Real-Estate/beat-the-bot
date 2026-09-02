import { describe, it, expect } from 'vitest'
import { GAME_PACKS } from '../src/data/gamePacks'

// Smoke test. The objection library is the content the whole game reads from,
// and it is generated rather than hand-authored, so a shape regression here is
// silent until Rex reads an empty line on stage. Guard the shape, not the copy.
describe('GAME_PACKS', () => {
  it('has 4 categories holding 30 objections in total', () => {
    expect(GAME_PACKS).toHaveLength(4)
    const total = GAME_PACKS.reduce((sum, pack) => sum + pack.rounds.length, 0)
    expect(total).toBe(30)
  })

  it('gives every category the fields the category screen renders', () => {
    for (const pack of GAME_PACKS) {
      expect(pack.id, 'pack id').toBeTypeOf('number')
      expect(pack.name, `pack ${pack.id} name`).toBeTruthy()
      expect(pack.emoji, `pack ${pack.id} emoji`).toBeTruthy()
      expect(pack.color, `pack ${pack.id} color`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(Array.isArray(pack.rounds), `pack ${pack.id} rounds`).toBe(true)
    }
  })

  it('gives every objection the fields Rex and the scorer need', () => {
    for (const pack of GAME_PACKS) {
      for (const round of pack.rounds) {
        for (const field of ['id', 'persona', 'short', 'objection', 'objective', 'benchmark']) {
          expect(round[field], `${round.id} -> ${field}`).toBeTypeOf('string')
          expect(round[field].trim(), `${round.id} -> ${field} is non-empty`).not.toBe('')
        }
      }
    }
  })

  it('keeps objection ids unique across the whole library', () => {
    const ids = GAME_PACKS.flatMap((pack) => pack.rounds.map((round) => round.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
