// The track generator's fairness rules and the sprite cap (see the spec's
// Track generation), checked over 40 km of road for several seeds.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BILLBOARD, BLOCK, GAS, LIFEGUARD, REPAIR, RIVAL, SEGS_PER_KM } from '../src/common/js/track.js'
import { SEEDS, generate } from './helpers.mjs'

// The spec's numbers, written out rather than imported from the generator.
const ROW_GAP = 14
const TWO_GAP = 20
const FIRST = 40
const RIVAL_KEEP = 40
const GAS_MAX_GAP = 360
const CAP = 4
const CAP_SPAN = 64

const SEGMENTS = 40 * SEGS_PER_KM
const runs = SEEDS.map((seed) => ({ seed, ...generate(seed, SEGMENTS) }))

function rows(objects) {
  const bySeg = new Map()
  for (const o of objects) {
    if (o.kind !== BLOCK && o.kind !== GAS && o.kind !== REPAIR) continue
    if (!bySeg.has(o.p)) bySeg.set(o.p, { p: o.p, blocks: [], bonuses: [] })
    const row = bySeg.get(o.p)
    if (o.kind === BLOCK) row.blocks.push(o.lane)
    else row.bonuses.push(o.lane)
  }
  return [...bySeg.values()].sort((a, b) => a.p - b.p)
}

test('the same seed builds the same road', () => {
  const a = generate(77, 4000)
  const b = generate(77, 4000)
  assert.deepEqual(a.objects, b.objects)
  assert.deepEqual(a.curve, b.curve)
})

test('every kind of object appears', () => {
  for (const { seed, objects } of runs) {
    for (const kind of [BLOCK, GAS, REPAIR, RIVAL, BILLBOARD, LIFEGUARD]) {
      assert.ok(objects.some((o) => o.kind === kind), `seed ${seed}: kind ${kind} never placed`)
    }
  }
})

test('rule 1: rows are at least 14 segments apart', () => {
  for (const { seed, objects } of runs) {
    const list = rows(objects)
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].p - list[i - 1].p
      assert.ok(gap >= ROW_GAP, `seed ${seed}: rows at ${list[i - 1].p} and ${list[i].p}`)
    }
  }
})

test('rule 1: a bonus sharing a block row takes a free lane', () => {
  let shared = 0
  for (const { seed, objects } of runs) {
    for (const row of rows(objects)) {
      for (const lane of row.bonuses) {
        assert.ok(!row.blocks.includes(lane), `seed ${seed}: bonus on a block at ${row.p}`)
      }
      if (row.blocks.length && row.bonuses.length) shared++
    }
  }
  assert.ok(shared > 0, 'no bonus ever shares a block row')
})

test('rule 2: no row blocks all three lanes', () => {
  for (const { seed, objects } of runs) {
    for (const row of rows(objects)) {
      assert.ok(row.blocks.length <= 2, `seed ${seed}: row at ${row.p}`)
      assert.equal(new Set(row.blocks).size, row.blocks.length)
    }
  }
})

test('two-lane rows: none before 5 km, about a quarter to 40% later', () => {
  for (const { seed, objects } of runs) {
    const blockRows = rows(objects).filter((r) => r.blocks.length)
    const early = blockRows.filter((r) => r.p < 5 * SEGS_PER_KM)
    assert.ok(early.every((r) => r.blocks.length === 1), `seed ${seed}: two-lane row before 5 km`)
    const late = blockRows.filter((r) => r.p >= 20 * SEGS_PER_KM)
    const share = late.filter((r) => r.blocks.length === 2).length / late.length
    assert.ok(share > 0.2 && share < 0.55, `seed ${seed}: two-lane share ${share}`)
  }
})

test('rule 3: block rows keep 20 segments around a two-lane row', () => {
  for (const { seed, objects } of runs) {
    const blockRows = rows(objects).filter((r) => r.blocks.length)
    for (let i = 1; i < blockRows.length; i++) {
      const a = blockRows[i - 1]
      const b = blockRows[i]
      if (a.blocks.length === 2 || b.blocks.length === 2) {
        assert.ok(b.p - a.p >= TWO_GAP, `seed ${seed}: block rows at ${a.p} and ${b.p}`)
      }
    }
  }
})

test('rule 4: no objects in the first 40 segments', () => {
  for (const { seed, objects } of runs) {
    for (const o of objects) assert.ok(o.p >= FIRST, `seed ${seed}: kind ${o.kind} at ${o.p}`)
  }
})

test('rule 5: a rival keeps its lane clear and allows no two-lane rows', () => {
  for (const { seed, objects } of runs) {
    const list = rows(objects)
    const rivals = objects.filter((o) => o.kind === RIVAL)
    assert.ok(rivals.every((r) => r.p >= SEGS_PER_KM), `seed ${seed}: rival before 1 km`)
    for (const r of rivals) {
      for (const row of list) {
        if (row.p < r.p || row.p > r.p + RIVAL_KEEP) continue
        assert.ok(row.blocks.length < 2, `seed ${seed}: two-lane row at ${row.p} near rival ${r.p}`)
        assert.ok(!row.blocks.includes(r.lane), `seed ${seed}: block in rival lane at ${row.p}`)
        assert.ok(!row.bonuses.includes(r.lane), `seed ${seed}: bonus in rival lane at ${row.p}`)
      }
    }
    for (let i = 1; i < rivals.length; i++) {
      assert.ok(rivals[i].p - rivals[i - 1].p >= 100, `seed ${seed}: two rivals on the road at ${rivals[i].p}`)
    }
  }
})

test('rule 6: gas cans are never more than 360 segments apart', () => {
  for (const { seed, objects } of runs) {
    const gas = objects.filter((o) => o.kind === GAS).map((o) => o.p)
    let last = 0
    for (const p of gas) {
      assert.ok(p - last <= GAS_MAX_GAP, `seed ${seed}: gas gap ${p - last} at ${p}`)
      last = p
    }
    assert.ok(SEGMENTS - last <= GAS_MAX_GAP)
  }
})

test('rule 7: at most 4 objects on screen from any camera position', () => {
  for (const { seed, objects } of runs) {
    const count = new Int16Array(SEGMENTS + 100)
    for (const o of objects) {
      // A rival appears at S and stays on screen until about S + 30.
      const hi = o.kind === RIVAL ? o.p + 30 : o.p
      for (let c = Math.max(0, o.p - CAP_SPAN + 1); c <= hi && c < count.length; c++) count[c]++
    }
    let worst = 0
    for (let c = 0; c < SEGMENTS; c++) worst = Math.max(worst, count[c])
    assert.ok(worst <= CAP, `seed ${seed}: ${worst} objects on screen`)
  }
})

test('gaps tighten with distance', () => {
  for (const { seed, objects } of runs) {
    const blocks = rows(objects).filter((r) => r.blocks.length)
    const perKm = (from, to) => blocks.filter((r) => r.p >= from * SEGS_PER_KM && r.p < to * SEGS_PER_KM).length / (to - from)
    assert.ok(perKm(15, 25) > perKm(0, 5) * 1.5, `seed ${seed}: block rows don't get denser`)
  }
})

test('curves: an opening straight, then values within the 7 levels', () => {
  for (const { seed, curve } of runs) {
    for (let s = 0; s < 50; s++) assert.equal(curve[s], 0, `seed ${seed}: curve at ${s}`)
    let curved = 0
    for (let s = 0; s < SEGMENTS; s++) {
      assert.ok(Math.abs(curve[s]) <= 6, `seed ${seed}: curve ${curve[s]} at ${s}`)
      if (curve[s]) curved++
    }
    assert.ok(curved > SEGMENTS * 0.2 && curved < SEGMENTS * 0.8, `seed ${seed}: ${curved} curved segments`)
  }
})

test('curves: never three the same way in a row', () => {
  for (const { seed, curve } of runs) {
    const dirs = []
    let inCurve = false
    for (let s = 0; s < SEGMENTS; s++) {
      if (curve[s] && !inCurve) dirs.push(Math.sign(curve[s]))
      inCurve = curve[s] !== 0
    }
    assert.ok(dirs.length > 20, `seed ${seed}: only ${dirs.length} curves`)
    for (let i = 2; i < dirs.length; i++) {
      assert.ok(!(dirs[i] === dirs[i - 1] && dirs[i] === dirs[i - 2]), `seed ${seed}: three curves one way`)
    }
  }
})
