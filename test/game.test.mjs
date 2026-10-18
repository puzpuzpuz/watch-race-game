// Game rules: speed, lanes, boost, hits, pickups, rivals, fuel, run endings
// and pausing (see the spec's Game rules and Controls).

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CAR_HIT,
  COASTING,
  COUNTDOWN,
  CRASHING,
  Game,
  LANE_TIME,
  OUT_OF_GAS,
  RACING,
  RESULTS,
  TITLE,
  WRECKED,
  targetKmh,
} from '../src/common/js/game.js'
import { BLOCK, DEBRIS, DYING, FREE, GAS, LANE_X, LIVE, POOL, REPAIR, RIVAL } from '../src/common/js/track.js'

const DT = 0.04
const LEFT = [60, 250] // a tap on the left half
const RIGHT = [380, 250]
const BOOST = [320, 480]

function run(g, seconds, dt = DT) {
  for (let t = 0; t < seconds - 1e-9; t += dt) g.update(dt, 1)
}

function tap(g, [x, y]) {
  g.tap(x, y)
  g.update(DT, 1)
}

// A game on the title screen.
function title() {
  const g = new Game()
  g.fixedSeed = 7
  g.setBest(0)
  run(g, 2)
  assert.equal(g.state, TITLE)
  return g
}

// Removes every road object and stops new ones, so a test places its own.
function emptyRoad(g) {
  const tr = g.track
  for (let i = 0; i < POOL; i++) tr.state[i] = FREE
  tr.nextBlock = tr.nextGas = tr.nextRival = tr.nextRepair = tr.nextBill = tr.nextLife = 1e9
}

// A game racing at full speed on an empty road.
function racing() {
  const g = title()
  tap(g, LEFT)
  assert.equal(g.state, COUNTDOWN)
  emptyRoad(g)
  run(g, 3)
  assert.equal(g.state, RACING)
  run(g, 2.5)
  return g
}

// Places an object `ahead` segments in front of the car's centre.
function place(g, kind, ahead, lane) {
  return g.track.spawn(kind, g.pos + CAR_HIT + ahead, lane, LANE_X[lane], 0)
}

test('target speed rises with distance, then holds', () => {
  assert.equal(targetKmh(0), 150)
  assert.equal(targetKmh(10), 250)
  assert.equal(targetKmh(15), 280)
  assert.equal(targetKmh(40), 280)
})

test('countdown: the car waits 3 s, then reaches 150 km/h in 2 s', () => {
  const g = title()
  tap(g, LEFT)
  assert.equal(g.state, COUNTDOWN)
  assert.equal(g.lives, 3)
  assert.equal(g.fuel, 100)
  run(g, 2.9)
  assert.equal(g.state, COUNTDOWN)
  assert.equal(g.kmh, 0)
  run(g, 0.2)
  assert.equal(g.state, RACING)
  run(g, 1)
  assert.ok(g.kmh > 60 && g.kmh < 90, `${g.kmh} km/h after 1 s`)
  run(g, 1.2)
  assert.ok(g.kmh >= 150 && g.kmh < 155, `${g.kmh} km/h after 2 s`)
})

test('lane change: one tap moves one lane in 180 ms', () => {
  const g = racing()
  assert.equal(g.carX, 0)
  tap(g, RIGHT)
  assert.equal(g.laneTo, 2)
  assert.ok(g.carX > 0 && g.carX < LANE_X[2])
  run(g, LANE_TIME)
  assert.equal(g.carX, LANE_X[2])
  tap(g, LEFT)
  run(g, LANE_TIME)
  assert.equal(g.carX, 0)
})

test('lane change: a tap during a change is queued, one at most', () => {
  const g = racing()
  tap(g, LEFT)
  run(g, 0.08)
  // Mid change from the centre to the left lane: double tap right.
  g.tap(...RIGHT)
  g.tap(...RIGHT)
  g.update(DT, 1)
  run(g, 2 * LANE_TIME)
  assert.equal(g.laneTo, 1, 'the second queued tap is dropped')
  assert.equal(g.carX, 0)
})

test('lane change: double tap from the left lane reaches the right lane in 360 ms', () => {
  const g = racing()
  tap(g, LEFT)
  run(g, LANE_TIME)
  const t0 = g.time
  g.tap(...RIGHT)
  g.update(0.001, 1)
  g.tap(...RIGHT)
  run(g, 0.36, 0.001)
  assert.equal(g.carX, LANE_X[2])
  assert.ok(g.time - t0 <= 0.362)
})

test('an edge tap wiggles the car instead', () => {
  const g = racing()
  tap(g, RIGHT)
  run(g, LANE_TIME)
  const seq = g.wiggleSeq
  tap(g, RIGHT)
  assert.equal(g.laneTo, 2)
  assert.equal(g.wiggleSeq, seq + 1)
})

test('boost: +30% for 3 s, costs 5 fuel, 8 s cooldown, never steers', () => {
  const g = racing()
  run(g, 3)
  const fuel = g.fuel
  const base = g.kmh
  tap(g, BOOST)
  assert.equal(g.laneTo, 1)
  assert.ok(g.boosting)
  assert.ok(fuel - g.fuel > 4.9 && fuel - g.fuel < 5.2)
  run(g, 1)
  assert.ok(g.kmh / g.baseKmh > 1.29 && g.kmh / g.baseKmh < 1.31, `boost ${g.kmh / g.baseKmh}`)
  assert.ok(g.kmh > base * 1.25)
  run(g, 2.1)
  assert.ok(!g.boosting)
  const before = g.fuel
  tap(g, BOOST)
  assert.ok(!g.boosting, 'cooldown')
  assert.ok(before - g.fuel < 1)
  run(g, 5)
  tap(g, BOOST)
  assert.ok(g.boosting, 'ready again after 8 s')
})

test('boost: unavailable below 10 fuel', () => {
  const g = racing()
  g.fuel = 9.5
  tap(g, BOOST)
  assert.ok(!g.boosting)
})

test('scoring: 10 points a segment, 20 while boosting', () => {
  const g = racing()
  g.score = 0
  g.scoreSeg = Math.floor(g.pos + 1.53)
  const seg = g.scoreSeg
  run(g, 1)
  assert.equal(g.score, (g.scoreSeg - seg) * 10)
  tap(g, BOOST)
  run(g, 0.5)
  const s0 = g.score
  const k0 = g.scoreSeg
  run(g, 1)
  assert.equal(g.score - s0, (g.scoreSeg - k0) * 20)
})

test('a block in the car lane costs a life, halves speed and turns into debris', () => {
  const g = racing()
  const i = place(g, BLOCK, 3, 1)
  const kmh = g.kmh
  run(g, 0.5)
  assert.equal(g.lives, 2)
  assert.equal(g.track.kind[i], DEBRIS)
  assert.equal(g.track.state[i], DYING)
  assert.ok(g.blinkT > 0)
  assert.ok(g.kmh < kmh * 0.7)
  run(g, 1.6)
  assert.ok(g.kmh > kmh * 0.97, 'speed recovers over 1.5 s')
})

test('a block in another lane is passed safely', () => {
  const g = racing()
  place(g, BLOCK, 3, 0)
  place(g, BLOCK, 3, 2)
  run(g, 0.5)
  assert.equal(g.lives, 3)
})

test('anything hit while blinking does nothing', () => {
  const g = racing()
  place(g, BLOCK, 3, 1)
  place(g, BLOCK, 8, 1)
  run(g, 1)
  assert.equal(g.lives, 2)
})

test('the hit test sweeps a slow frame', () => {
  const g = racing()
  place(g, BLOCK, 0.5, 1)
  g.update(0.1, 1) // more than a segment at speed
  assert.equal(g.lives, 2)
})

test('changing into a blocked lane hits the block', () => {
  const g = racing()
  place(g, BLOCK, 2, 2)
  tap(g, RIGHT)
  run(g, 0.5)
  assert.equal(g.lives, 2)
})

test('gas can: +30 fuel up to 100, 250 points, a popup', () => {
  const g = racing()
  g.fuel = 50
  const score = g.score
  const seq = g.popupSeq
  const i = place(g, GAS, 3, 1)
  run(g, 0.5)
  assert.equal(g.track.state[i], FREE)
  assert.ok(g.fuel > 78 && g.fuel <= 80)
  assert.ok(g.score - score >= 250)
  assert.equal(g.popupSeq, seq + 1)
  g.fuel = 90
  place(g, GAS, 3, 1)
  run(g, 0.5)
  assert.ok(g.fuel <= 100 && g.fuel > 99)
})

test('pickups are collected during a lane change', () => {
  const g = racing()
  g.fuel = 50
  place(g, GAS, 1.2, 2)
  tap(g, RIGHT)
  run(g, 0.3)
  assert.ok(g.fuel > 75)
})

test('repair kit: +1 life up to 3, else 1,000 points', () => {
  const g = racing()
  place(g, BLOCK, 2, 1)
  run(g, 2)
  assert.equal(g.lives, 2)
  place(g, REPAIR, 3, 1)
  run(g, 0.5)
  assert.equal(g.lives, 3)
  const score = g.score
  place(g, REPAIR, 3, 1)
  run(g, 0.5)
  assert.equal(g.lives, 3)
  assert.ok(g.score - score >= 1000)
})

test('rivals: slower traffic, a hit costs a life, an overtake 100 points', () => {
  const g = racing()
  const i = g.track.spawn(RIVAL, g.pos + 60, 0, LANE_X[0], 1)
  const seq = g.popupSeq
  const score = g.score
  let met = 0
  for (let t = 0; t < 10 && !met; t += DT) {
    g.update(DT, 1)
    if (g.track.flag[i] & 2) met = g.track.pos[i]
  }
  assert.ok(met > 0, 'the car catches up')
  assert.equal(g.lives, 3)
  assert.equal(g.popupSeq, seq + 1)
  assert.ok(g.score - score >= 100)

  const j = g.track.spawn(RIVAL, g.pos + 60, 1, LANE_X[1], 2)
  run(g, 10)
  assert.equal(g.lives, 2)
  assert.notEqual(g.track.state[j], LIVE)
})

test('a rival meets the car about 26 segments past where it appeared', () => {
  const g = racing()
  const start = g.pos + 60
  const i = g.track.spawn(RIVAL, start, 0, LANE_X[0], 0)
  for (let t = 0; t < 10 && !(g.track.flag[i] & 2); t += DT) g.update(DT, 1)
  const travelled = g.track.pos[i] - start
  assert.ok(travelled > 20 && travelled < 30, `met after ${travelled}`)
})

test('an empty tank: the car coasts to a stop in 2 s, OUT OF GAS', () => {
  const g = racing()
  g.fuel = 0.5
  run(g, 0.5)
  assert.equal(g.state, COASTING)
  assert.ok(!g.boostReady)
  run(g, 1.5)
  assert.equal(g.state, COASTING)
  run(g, 0.6)
  assert.equal(g.state, RESULTS)
  assert.equal(g.outcome, OUT_OF_GAS)
})

test('a gas can collected while coasting restarts the engine', () => {
  const g = racing()
  g.fuel = 0.2
  run(g, 0.2)
  assert.equal(g.state, COASTING)
  place(g, GAS, 2, 1)
  run(g, 0.5)
  assert.equal(g.state, RACING)
  const kmh = g.kmh
  run(g, 2)
  assert.ok(g.kmh > kmh)
})

test('a full tank lasts 800 segments', () => {
  const g = racing()
  g.fuel = 100
  const from = g.pos
  while (g.state === RACING) g.update(DT, 1)
  assert.ok(Math.abs(g.pos - from - 800) < 2, `ran dry after ${g.pos - from}`)
})

test('three hits: the crash plays 1 s, then WRECKED', () => {
  const g = racing()
  for (let n = 0; n < 2; n++) {
    place(g, BLOCK, 2, 1)
    run(g, 1.7)
  }
  assert.equal(g.lives, 1)
  place(g, BLOCK, 2, 1)
  while (g.lives) g.update(DT, 1)
  assert.equal(g.state, CRASHING)
  run(g, 0.9)
  assert.equal(g.state, CRASHING)
  run(g, 0.6)
  assert.equal(g.state, RESULTS)
  assert.equal(g.outcome, WRECKED)
  assert.ok(g.newBest)
  assert.ok(g.bestDirty)
  assert.equal(g.best, g.score)
})

test('results ignore taps for 700 ms, then start a new run', () => {
  const g = racing()
  g.fuel = 0.1
  while (g.state !== RESULTS) g.update(DT, 1)
  run(g, 0.4)
  tap(g, LEFT)
  assert.equal(g.state, RESULTS)
  run(g, 0.4)
  tap(g, LEFT)
  assert.equal(g.state, COUNTDOWN)
  assert.equal(g.lives, 3)
  assert.equal(g.score, 0)
})

test('a lower score is not a new best', () => {
  const g = racing()
  g.best = 1e6
  g.fuel = 0.1
  run(g, 3)
  assert.equal(g.state, RESULTS)
  assert.ok(!g.newBest)
  assert.equal(g.best, 1e6)
})

test('pause freezes the run; a tap resumes without steering', () => {
  const g = racing()
  g.pause()
  const pos = g.pos
  run(g, 1)
  assert.equal(g.pos, pos)
  tap(g, RIGHT)
  assert.ok(!g.paused)
  assert.equal(g.laneTo, 1)
  run(g, 0.2)
  assert.ok(g.pos > pos)
})

test('the title screen does not pause', () => {
  const g = title()
  g.pause()
  assert.ok(!g.paused)
})
