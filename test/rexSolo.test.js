import { describe, it, expect } from 'vitest'
import {
  getRexRoundWinner,
  getRexChampion,
  getRexPlayerIntro,
  REX_CHAMPION_LINES,
  REX_ROUND_WINNER_LINES,
  REX_SOLO_FINISH_LINES,
  REX_SOLO_ROUND_LINES,
} from '../src/game/rexScript'

// Keyword matching is unreliable here — not every champion line contains the
// word "champion". Compare against the actual line sets instead.
const render = (lines, name, score) => lines.map((line) => line(name, score))

// With one agent there is nobody to beat. These guard against Rex declaring a
// "winner" or a "champion" of a field of one, which is what he did before the
// player-count picker allowed a solo game.
describe('Rex lines in solo mode', () => {
  it('never calls a solo agent the winner or champion', () => {
    for (let i = 0; i < 40; i++) {
      const round = getRexRoundWinner('Sam', 7, true).toLowerCase()
      expect(round).not.toContain('winner')
      expect(round).not.toContain('takes the round')
      expect(round).toContain('sam')

      const finish = getRexChampion('Sam', 21, true).toLowerCase()
      expect(finish).not.toContain('champion')
      expect(finish).toContain('sam')
    }
  })

  it('draws from the competition line sets when there is a field', () => {
    for (let i = 0; i < 40; i++) {
      expect(render(REX_ROUND_WINNER_LINES, 'Ana', 8)).toContain(
        getRexRoundWinner('Ana', 8, false)
      )
      expect(render(REX_CHAMPION_LINES, 'Ana', 24)).toContain(
        getRexChampion('Ana', 24, false)
      )
    }
  })

  it('draws from the solo line sets in solo mode', () => {
    for (let i = 0; i < 40; i++) {
      expect(render(REX_SOLO_ROUND_LINES, 'Sam', 7)).toContain(
        getRexRoundWinner('Sam', 7, true)
      )
      expect(render(REX_SOLO_FINISH_LINES, 'Sam', 21)).toContain(
        getRexChampion('Sam', 21, true)
      )
    }
  })

  it('defaults to competition mode when the flag is omitted', () => {
    expect(render(REX_CHAMPION_LINES, 'Ana', 24)).toContain(getRexChampion('Ana', 24))
  })

  it('introduces a lone agent without promising a champion', () => {
    const intro = getRexPlayerIntro([{ name: 'Sam' }]).toLowerCase()
    expect(intro).toContain('sam')
    expect(intro).not.toContain('one champion')
    expect(intro).not.toContain('competitors')
  })

  it('still introduces a field as competitors', () => {
    const intro = getRexPlayerIntro([{ name: 'Ana' }, { name: 'Ben' }]).toLowerCase()
    expect(intro).toContain('ana')
    expect(intro).toContain('ben')
    expect(intro).toContain('competitors')
  })
})
