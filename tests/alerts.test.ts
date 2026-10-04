import { describe, expect, it } from 'vitest'

import { runSimulation } from '../src/engine/simulator'
import { TRIGGER_IDS } from '../src/engine/triggers'
import { JOURNEY_WEEK } from '../src/pages/Alerts'

describe('Daam Badlo — every demo alert carries its real journey week', () => {
  const sim = runSimulation()
  const firedIn = (id: string) =>
    sim.sahiDaam.weeks.filter((w) => w.alerts.some((a) => a.id === id)).map((w) => w.week)

  it('pre-loads the festive alert (T2) at week 16, when it fires in the journey', () => {
    expect(JOURNEY_WEEK.T2).toBe(16)
    expect(firedIn('T2')).toContain(16)
  })

  it('uses a week the trigger actually fires in, for every trigger that fires', () => {
    for (const id of TRIGGER_IDS) {
      const weeks = firedIn(id)
      if (JOURNEY_WEEK[id] > 0) expect(weeks).toContain(JOURNEY_WEEK[id])
      else expect(weeks).toEqual([]) // never fires in the journey: no week shown
    }
  })
})
