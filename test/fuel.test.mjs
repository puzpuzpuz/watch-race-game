// The fuel check: early on, collecting every gas can keeps the tank topped
// up; later, gaps grow faster than cans refill, so even a perfect run runs
// dry, around 30 km. That keeps endless runs finite.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GAS, SEGS_PER_KM } from '../src/common/js/track.js'
import { SEEDS, generate } from './helpers.mjs'

const BURN = 0.125
const FILL = 30
const TANK = 100

// Where a run that collects every can and never boosts runs dry, in km, and
// its lowest tank level in the first 5 km.
function perfectRun(seed) {
  const gas = generate(seed, 60 * SEGS_PER_KM)
    .objects.filter((o) => o.kind === GAS)
    .map((o) => o.p)
  let fuel = TANK
  let last = 0
  let lowEarly = TANK
  for (const p of gas) {
    fuel -= (p - last) * BURN
    if (fuel <= 0) return { dryKm: (last + (fuel + (p - last) * BURN) / BURN) / SEGS_PER_KM, lowEarly }
    if (p < 5 * SEGS_PER_KM) lowEarly = Math.min(lowEarly, fuel)
    fuel = Math.min(TANK, fuel + FILL)
    last = p
  }
  return { dryKm: Infinity, lowEarly }
}

test('a perfect run keeps its tank early on and runs dry around 30 km', () => {
  for (const seed of SEEDS) {
    const { dryKm, lowEarly } = perfectRun(seed)
    assert.ok(lowEarly > 40, `seed ${seed}: tank down to ${lowEarly} in the first 5 km`)
    assert.ok(dryKm > 18 && dryKm < 40, `seed ${seed}: runs dry at ${dryKm.toFixed(1)} km`)
  }
})
