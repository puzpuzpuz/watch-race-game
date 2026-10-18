// The endless road: curves and road objects, generated in 200-segment chunks
// ahead of the car from a seeded generator, so any run can be replayed.
//
// Segments live in a ring buffer of 400, one typed array per field. Road
// objects live in a fixed pool, also one typed array per field. Nothing here
// allocates after construction.

import { Rng } from './rng.js'
import { DRAW, LANE_W, LEVELS, STRAIGHT as LEVEL_STRAIGHT } from './projection.js'

export const RING = 400
export const CHUNK = 200
export const AHEAD = 100 // segments always generated ahead of the car
const SPILL = 64 // how far a chunk's rival reservations reach into the next
export const POOL = 64
export const SEGS_PER_KM = 200

// Object kinds.
export const BLOCK = 1
export const GAS = 2
export const REPAIR = 3
export const RIVAL = 4
export const BILLBOARD = 5
export const LIFEGUARD = 6
export const BANNER = 7
export const DEBRIS = 8 // a block after a hit

// Object states.
export const FREE = 0
export const LIVE = 1
export const DYING = 2 // flying debris or a spun rival

// Rival flags.
export const MOVING = 1
export const PASSED = 2

export const LANE_X = [-LANE_W, 0, LANE_W]
// Scenery stands between the rumble strips and the palms. Beyond the palms,
// its sprite would cover nearer palms, which the road pictures draw beneath it.
export const BILLBOARD_X = -1620
export const LIFEGUARD_X = 1500
const SCENERY_FAR = 30 // see sceneryClear()
export const BANNER_SEG = 3 // the start gantry, just ahead of the car
export const CURVE_FROM = 2 // the road picture follows the mean curve over these
export const CURVE_SPAN = 20 // segments ahead of the camera

// Fairness rules (see the spec's Track generation).
export const CAP = 4 // objects on screen at once
export const CAP_SPAN = 64 // ... within any 64 segments
export const ROW_GAP = 14 // rows at least this far apart
export const TWO_GAP = 20 // around a two-lane block row
export const FIRST = 40 // no objects before this segment
export const RIVAL_KEEP = 40 // a rival keeps its lane clear from S to S + 40
const RIVAL_SEEN = 30 // and stays on screen until about S + 30
const RIVAL_FROM = 200 // no rivals before 1 km
const RIVAL_APART = 100 // one rival on the road at a time
export const GAS_MAX_GAP = 360

// Row bits per segment.
const BLOCK_BITS = 7 // bits 0-2: a block in lane 0, 1, 2
const BONUS_SHIFT = 3 // bits 3-5: a gas can or repair kit
const TWO_BIT = 64 // a two-lane block row
// Keep bits per segment.
const KEEP_ANY = 8 // bits 0-2: lanes kept for a rival; bit 3: any rival

// Gap ranges in segments at 0, 10 and 20 km: lo, hi for each. Gaps change
// linearly between the columns, then hold.
const GAPS = []
GAPS[BLOCK] = [60, 100, 30, 50, 24, 40]
GAPS[GAS] = [160, 280, 200, 320, 240, 360]
GAPS[RIVAL] = [200, 350, 150, 250, 120, 200]
GAPS[REPAIR] = [350, 550, 350, 550, 350, 550]
GAPS[BILLBOARD] = [120, 200, 120, 200, 120, 200]
GAPS[LIFEGUARD] = [150, 250, 150, 250, 150, 250]

// Curve phases.
const STRAIGHT = 0
const EASE_IN = 1
const HOLD = 2
const EASE_OUT = 3

function ring(s) {
  return s % RING
}

function gapAt(t, km, hi) {
  if (km <= 10) return t[hi] + ((t[2 + hi] - t[hi]) * km) / 10
  if (km <= 20) return t[2 + hi] + ((t[4 + hi] - t[2 + hi]) * (km - 10)) / 10
  return t[4 + hi]
}

// Share of block rows that block two lanes: none before 5 km, then 25%,
// rising to 40% at 20 km.
export function twoLaneShare(km) {
  if (km < 5) return 0
  return 0.25 + 0.15 * Math.min(1, (km - 5) / 15)
}

export class Track {
  constructor() {
    this.rng = new Rng(1)
    this.curve = new Float32Array(RING)
    this.row = new Uint8Array(RING)
    this.keep = new Uint8Array(RING)
    this.occ = new Uint8Array(RING) // objects on screen with the camera at this segment

    this.kind = new Uint8Array(POOL)
    this.state = new Uint8Array(POOL)
    this.lane = new Int8Array(POOL) // 0-2, or -1 and 3 beside the road
    this.frame = new Uint8Array(POOL) // picture: the rival model, spun +3
    this.flag = new Uint8Array(POOL)
    this.pos = new Float64Array(POOL) // segments
    this.x = new Float32Array(POOL) // world units
    this.t = new Float32Array(POOL) // seconds since dying
    this.vx = new Float32Array(POOL) // sideways speed while dying, units per second
    this.cursor = 0
    this.reset(1)
  }

  reset(seed) {
    this.seed = seed
    this.rng.seed(seed)
    this.curve.fill(0)
    this.row.fill(0)
    this.keep.fill(0)
    this.occ.fill(0)
    this.state.fill(FREE)
    this.cursor = 0
    this.end = 0
    this.objects = 0 // placed so far, for tests

    // The opening straight of 50 segments.
    this.cPhase = STRAIGHT
    this.cLeft = 50
    this.cLen = 50
    this.cValue = 0
    this.cHold = 0
    this.cOut = 0
    this.lastDir = 0
    this.dirRun = 0

    this.nextBlock = this.gap(BLOCK, 0)
    this.nextTwo = false
    this.nextGas = this.gap(GAS, 0)
    this.lastGas = 0
    this.nextRival = RIVAL_FROM + this.rng.int(0, 150)
    this.lastRival = -RIVAL_APART
    this.nextRepair = this.gap(REPAIR, 0)
    this.nextBill = this.between(FIRST + this.rng.int(0, 60))
    this.nextLife = this.between(FIRST + this.rng.int(30, 120))

    this.spawn(BANNER, BANNER_SEG, 1, 0, 0)
    this.ensure(0)
  }

  // Generates chunks until at least AHEAD segments are ready past `seg`.
  ensure(seg) {
    while (this.end - seg < AHEAD) this.chunk()
  }

  curveAt(seg) {
    return seg < 0 || seg >= this.end ? 0 : this.curve[ring(seg)]
  }

  // The mean curve value over `n` segments from `seg`.
  meanCurve(seg, n) {
    let sum = 0
    for (let s = seg; s < seg + n; s++) sum += this.curveAt(s)
    return sum / n
  }

  // The road picture's curve level, an index into LEVELS, with the camera at
  // segment `view`.
  levelAt(view) {
    const level = LEVEL_STRAIGHT + Math.round(this.meanCurve(view + CURVE_FROM, CURVE_SPAN) / 2)
    if (level < 0) return 0
    if (level >= LEVELS.length) return LEVELS.length - 1
    return level
  }

  chunk() {
    const from = this.end
    const to = from + CHUNK
    // The previous chunk cleared [from, from + SPILL) and may have kept lanes
    // there for a rival; clear the rest of this chunk and the next spill zone.
    for (let s = from + SPILL; s < to + SPILL; s++) {
      const i = ring(s)
      this.curve[i] = 0
      this.row[i] = 0
      this.keep[i] = 0
      this.occ[i] = 0
    }
    for (let s = from; s < to; s++) this.curve[ring(s)] = this.nextCurve()
    this.end = to

    // Gas cans first: their spacing is what keeps a run going. They go SPILL
    // segments into the next chunk as well: a can forced in there ignores the
    // sprite cap, and its window reaches back over this chunk's rows, which
    // must count it.
    while (this.nextGas < to + SPILL) this.placeGas(this.nextGas)
    // Then everything else, in order along the road. A row that breaks a rule
    // moves forward a segment and tries again.
    for (;;) {
      let kind = 0
      let p = to
      if (this.nextBlock < p) {
        p = this.nextBlock
        kind = BLOCK
      }
      if (this.nextRival < p) {
        p = this.nextRival
        kind = RIVAL
      }
      if (this.nextRepair < p) {
        p = this.nextRepair
        kind = REPAIR
      }
      if (this.nextBill < p) {
        p = this.nextBill
        kind = BILLBOARD
      }
      if (this.nextLife < p) {
        p = this.nextLife
        kind = LIFEGUARD
      }
      if (kind === BLOCK) this.placeBlock(p)
      else if (kind === RIVAL) this.placeRival(p)
      else if (kind === REPAIR) this.placeRepair(p)
      else if (kind === BILLBOARD || kind === LIFEGUARD) this.placeScenery(kind, p)
      else break
    }
  }

  // ------------------------------------------------------------ placement

  placeGas(p) {
    // Gaps never exceed GAS_MAX_GAP: when a can has moved that far, it goes in
    // regardless of row spacing and the sprite cap.
    const forced = p - this.lastGas >= GAS_MAX_GAP
    const lane = this.bonusLane(p, forced)
    if (lane < 0) {
      this.nextGas = p + 1
      return
    }
    this.addBonus(GAS, p, lane)
    this.lastGas = p
    this.nextGas = p + this.gap(GAS, p)
  }

  placeRepair(p) {
    const lane = this.bonusLane(p, false)
    if (lane < 0) {
      this.nextRepair = p + 1
      return
    }
    this.addBonus(REPAIR, p, lane)
    this.nextRepair = p + this.gap(REPAIR, p)
  }

  // A free lane for a bonus at p, or -1. A bonus may share a block row, in a
  // free lane, but not another bonus's row.
  bonusLane(p, forced) {
    if (p < FIRST) return -1
    const i = ring(p)
    const r = this.row[i]
    if (!forced) {
      if ((r >> BONUS_SHIFT) & 7) return -1
      if (this.rowsNear(p, ROW_GAP)) return -1
      if (!this.capOk(p - CAP_SPAN + 1, p, 1)) return -1
    }
    return this.pickLane((r & BLOCK_BITS) | ((r >> BONUS_SHIFT) & 7) | (this.keep[i] & 7))
  }

  addBonus(kind, p, lane) {
    this.spawn(kind, p, lane, LANE_X[lane], 0)
    this.row[ring(p)] |= 1 << (lane + BONUS_SHIFT)
    this.capAdd(p - CAP_SPAN + 1, p, 1)
  }

  placeBlock(p) {
    const two = this.nextTwo
    const count = two ? 2 : 1
    const i = ring(p)
    const r = this.row[i]
    const kept = this.keep[i]
    let a = -1
    let b = -1
    if (
      p >= FIRST &&
      !(r & BLOCK_BITS) &&
      !(two && kept & KEEP_ANY) &&
      !this.rowsNear(p, ROW_GAP) &&
      !this.twoNear(p, two) &&
      this.capOk(p - CAP_SPAN + 1, p, count)
    ) {
      // Lanes kept for a rival or holding a bonus are not blocked.
      const taken = (kept & 7) | ((r >> BONUS_SHIFT) & 7)
      a = this.pickLane(taken)
      if (two && a >= 0) b = this.pickLane(taken | (1 << a))
    }
    if (a < 0 || (two && b < 0)) {
      this.nextBlock = p + 1
      return
    }
    this.spawn(BLOCK, p, a, LANE_X[a], 0)
    let bits = 1 << a
    if (two) {
      this.spawn(BLOCK, p, b, LANE_X[b], 0)
      bits |= (1 << b) | TWO_BIT
    }
    this.row[i] |= bits
    this.capAdd(p - CAP_SPAN + 1, p, count)
    this.nextBlock = p + this.gap(BLOCK, p)
    this.nextTwo = this.rng.next() < twoLaneShare(this.nextBlock / SEGS_PER_KM)
  }

  // A rival that appears at S in lane L keeps lane L clear from S to S + 40,
  // with no two-lane block rows at all; it meets the car around S + 26.
  placeRival(p) {
    let taken = 0
    let ok = p >= RIVAL_FROM && p - this.lastRival >= RIVAL_APART && this.capOk(p - CAP_SPAN + 1, p + RIVAL_SEEN, 1)
    for (let s = p; ok && s <= p + RIVAL_KEEP; s++) {
      const r = this.row[ring(s)]
      if (r & TWO_BIT) ok = false
      taken |= (r & BLOCK_BITS) | ((r >> BONUS_SHIFT) & 7)
    }
    const lane = ok ? this.pickLane(taken) : -1
    if (lane < 0) {
      this.nextRival = p + 1
      return
    }
    this.spawn(RIVAL, p, lane, LANE_X[lane], this.rng.int(0, 2))
    for (let s = p; s <= p + RIVAL_KEEP; s++) this.keep[ring(s)] |= (1 << lane) | KEEP_ANY
    this.capAdd(p - CAP_SPAN + 1, p + RIVAL_SEEN, 1)
    this.lastRival = p
    this.nextRival = p + this.gap(RIVAL, p)
  }

  // Scenery never collides; when the sprite cap is reached, it's skipped.
  // Where the road bends too hard toward it, it waits for the next gap
  // between palms.
  placeScenery(kind, p) {
    if (!this.sceneryClear(p, kind === BILLBOARD ? -1 : 1)) {
      if (kind === BILLBOARD) this.nextBill = p + 6
      else this.nextLife = p + 6
      return
    }
    if (p >= FIRST && this.capOk(p - CAP_SPAN + 1, p, 1)) {
      if (kind === BILLBOARD) this.spawn(BILLBOARD, p, -1, BILLBOARD_X, 0)
      else this.spawn(LIFEGUARD, p, 3, LIFEGUARD_X, 0)
      this.capAdd(p - CAP_SPAN + 1, p, 1)
    }
    const next = this.between(p + this.gap(kind, p))
    if (kind === BILLBOARD) this.nextBill = next
    else this.nextLife = next
  }

  // ------------------------------------------------------------ rule checks

  // Whether scenery at p, on `side` (-1 left, 1 right), stays clear of the
  // palms. On a road bent 4 or more toward its side, far scenery slides in
  // behind nearer palms, from about SCENERY_FAR segments out; on gentler
  // bends it never does. The curve up to p is known when p is placed.
  sceneryClear(p, side) {
    for (let v = p - DRAW; v <= p - SCENERY_FAR; v++) {
      if (LEVELS[this.levelAt(v)] * side > 2) return false
    }
    return true
  }

  // Any row within gap - 1 segments of p, other than p itself.
  rowsNear(p, gap) {
    for (let s = Math.max(0, p - gap + 1); s < p + gap; s++) {
      if (s !== p && this.row[ring(s)]) return true
    }
    return false
  }

  // Two-lane rows need TWO_GAP segments to the next block row either way.
  twoNear(p, two) {
    for (let s = Math.max(0, p - TWO_GAP + 1); s < p + TWO_GAP; s++) {
      if (s === p) continue
      const r = this.row[ring(s)]
      if (two ? r & BLOCK_BITS : r & TWO_BIT) return true
    }
    return false
  }

  capOk(lo, hi, n) {
    for (let s = Math.max(0, lo); s <= hi; s++) {
      if (this.occ[ring(s)] + n > CAP) return false
    }
    return true
  }

  capAdd(lo, hi, n) {
    for (let s = Math.max(0, lo); s <= hi; s++) this.occ[ring(s)] += n
  }

  // A random lane whose bit isn't set in `taken`, or -1.
  pickLane(taken) {
    let free = 0
    for (let l = 0; l < 3; l++) if (!(taken & (1 << l))) free++
    if (!free) return -1
    let k = this.rng.int(0, free - 1)
    for (let l = 0; l < 3; l++) {
      if (!(taken & (1 << l)) && k-- === 0) return l
    }
    return -1
  }

  gap(kind, seg) {
    const t = GAPS[kind]
    const km = seg / SEGS_PER_KM
    return this.rng.int(Math.round(gapAt(t, km, 0)), Math.round(gapAt(t, km, 1)))
  }

  // The first segment from p that sits halfway between two palms (palms stand
  // on every 6th segment).
  between(p) {
    return p + ((((3 - (p % 6)) % 6) + 6) % 6)
  }

  spawn(kind, p, lane, x, frame) {
    for (let n = 0; n < POOL; n++) {
      const i = (this.cursor + n) % POOL
      if (this.state[i] !== FREE) continue
      this.cursor = (i + 1) % POOL
      this.state[i] = LIVE
      this.kind[i] = kind
      this.lane[i] = lane
      this.frame[i] = frame
      this.flag[i] = 0
      this.pos[i] = p
      this.x[i] = x
      this.t[i] = 0
      this.vx[i] = 0
      this.objects++
      return i
    }
    return -1
  }

  // ------------------------------------------------------------- curves

  nextCurve() {
    while (this.cLeft === 0) this.nextCurvePhase()
    this.cLeft--
    const done = this.cLen - this.cLeft
    if (this.cPhase === EASE_IN) return (this.cValue * done) / this.cLen
    if (this.cPhase === HOLD) return this.cValue
    if (this.cPhase === EASE_OUT) return this.cValue * (1 - done / this.cLen)
    return 0
  }

  // A straight of 20-100 segments, then a curve: a direction (never three the
  // same way in a row), a strength (2, 4 or 6, weighted 40/40/20), and ease-in,
  // hold and ease-out lengths of 10-25, 20-80 and 10-25 segments.
  nextCurvePhase() {
    if (this.cPhase === STRAIGHT) {
      let dir = this.rng.next() < 0.5 ? -1 : 1
      if (this.dirRun >= 2 && dir === this.lastDir) dir = -dir
      this.dirRun = dir === this.lastDir ? this.dirRun + 1 : 1
      this.lastDir = dir
      const r = this.rng.next()
      this.cValue = dir * (r < 0.4 ? 2 : r < 0.8 ? 4 : 6)
      this.cHold = this.rng.int(20, 80)
      this.cOut = this.rng.int(10, 25)
      this.setPhase(EASE_IN, this.rng.int(10, 25))
    } else if (this.cPhase === EASE_IN) {
      this.setPhase(HOLD, this.cHold)
    } else if (this.cPhase === HOLD) {
      this.setPhase(EASE_OUT, this.cOut)
    } else {
      this.setPhase(STRAIGHT, this.rng.int(20, 100))
    }
  }

  setPhase(phase, len) {
    this.cPhase = phase
    this.cLen = len
    this.cLeft = len
  }
}
