// Game state and rules: the run's states, the car, speed, fuel, lives, boost,
// scoring, hit tests and pickups. Plain JavaScript with no Vela imports, so the
// desktop harness and the Node tests run it as is. update() allocates nothing.

import { PRELOAD } from './config.js'
import { CAR_D, DRAW, LANE_W, LEVELS, PHASES, STRAIGHT, W } from './projection.js'
import {
  BANNER,
  BLOCK,
  DEBRIS,
  DYING,
  FREE,
  GAS,
  LANE_X,
  LIVE,
  MOVING,
  PASSED,
  POOL,
  REPAIR,
  RIVAL,
  Track,
} from './track.js'

// States.
export const LOAD = 0
export const TITLE = 1
export const COUNTDOWN = 2
export const RACING = 3
export const COASTING = 4 // tank empty, slowing to a stop
export const CRASHING = 5 // last life lost, skidding to a stop
export const RESULTS = 6

// Run outcomes.
export const WRECKED = 1
export const OUT_OF_GAS = 2

// Pickup popups.
export const POP_GAS = 0
export const POP_LIFE = 1
export const POP_100 = 2
export const POP_1000 = 3

export const LIVES = 3
export const TANK = 100
const KMH_TO_SEGS = 1 / 18 // a segment is 5 m
export const LANE_TIME = 0.18 // a lane change, seconds
const HIT_HALF = LANE_W / 2 // hit test: within half a lane of its centre
const PICK_HALF = 400 // pickup test: more generous
export const CAR_HIT = CAR_D + 0.5 // the car's centre, segments past the near plane
export const GONE_D = -0.5 // objects nearer than this have left the screen
const BURN = 0.125 // fuel units per segment: a full tank lasts 4 km
const GAS_FILL = 30
export const BOOST_TIME = 3
const BOOST_IN = 0.3
const BOOST_OUT = 0.5
const BOOST_GAIN = 0.3
export const BOOST_COOL = 8
const BOOST_FUEL = 5
export const BOOST_MIN_FUEL = 10
export const BLINK_TIME = 1.5
const HIT_RECOVER = 1.5 // seconds from half speed back to full
const COAST_TIME = 2
const CRASH_TIME = 1
export const RESULTS_LOCK = 0.7 // taps ignored at first on the results screen
const RIVAL_SPEED = 0.3 // of the player's speed, boost not counted
const START_TIME = 2 // 0 to 150 km/h
export const COUNT_TIME = 3 // 3, 2, 1, then GO!
const SKY_DRIFT = 0.6 // skyline px per curve unit per segment driven

// Taps: the boost zone in the bottom-right corner, then left or right half.
export const BOOST_X = 256
export const BOOST_Y = 436
const TAPS = 4

// Target speed by distance: 150 km/h at the start, 250 at 10 km, 280 from 15.
export function targetKmh(km) {
  if (km < 10) return 150 + 10 * km
  if (km < 15) return 250 + 6 * (km - 10)
  return 280
}

function easeOut(t) {
  return t >= 1 ? 1 : 1 - (1 - t) * (1 - t)
}

export class Game {
  constructor() {
    this.track = new Track()
    this.state = LOAD
    this.stateT = 0
    this.time = 0
    this.paused = false
    this.best = 0
    this.bestTenths = -1 // the best run's distance in tenths of a km; -1 if not saved
    this.bestDirty = false
    this.loaded = false // the best score has been read
    this.preload = PRELOAD ? 0 : LEVELS.length * PHASES // road frames shown on the loading screen
    this.fixedSeed = 0 // when set, every run uses this seed
    this.tapX = new Int16Array(TAPS)
    this.tapY = new Int16Array(TAPS)
    this.taps = 0
    this.laneSeq = 0
    this.wiggleSeq = 0
    this.wiggleDir = 0
    this.joltSeq = 0
    this.popupSeq = 0
    this.popupKind = 0
    this.popupX = 0
    this.resetRun(1)
  }

  resetRun(seed) {
    this.seed = seed
    this.track.reset(seed)
    this.pos = -CAR_D // the car's rear bumper on segment 0
    this.scoreSeg = 0
    this.level = STRAIGHT
    this.skyX = 0
    this.kmh = 0
    this.baseKmh = 0 // without boost: what rivals follow
    this.hitF = 1 // speed factor after a hit, recovering to 1
    this.coastFrom = 0
    this.lives = LIVES
    this.fuel = TANK
    this.score = 0
    this.boostT = -1 // seconds since boost fired, -1 when off
    this.coolT = 0
    this.pressT = 0
    this.blinkT = 0
    this.raceT = 0
    this.sparkAt = -10
    this.outcome = 0
    this.newBest = false
    this.laneFrom = 1
    this.laneTo = 1
    this.laneT = -1 // seconds into a lane change, -1 when not changing
    this.laneDir = 0
    this.queued = 0 // one buffered tap: -1, 0 or 1
    this.carX = 0
    this.laneSeq++
  }

  setBest(best, tenths = -1) {
    this.best = best
    this.bestTenths = tenths
    this.loaded = true
  }

  // A touch at screen position (x, y); handled on the next update.
  tap(x, y) {
    if (this.taps >= TAPS) return
    this.tapX[this.taps] = x
    this.tapY[this.taps] = y
    this.taps++
  }

  // The app went to the background: freeze the run until a tap.
  pause() {
    if (this.state >= COUNTDOWN && this.state <= CRASHING) this.paused = true
  }

  get km() {
    return ((this.pos + CAR_D) * 5) / 1000
  }

  get boosting() {
    return this.boostT >= 0
  }

  // dt in seconds; wall is Date.now(), the seed of the next run.
  update(dt, wall) {
    if (this.paused) {
      if (this.taps) this.paused = false
      this.taps = 0
      return
    }
    this.time += dt
    this.stateT += dt
    const state = this.state
    if (state === LOAD) {
      this.preload++
      // On to the title once the road frames have shown and the best score
      // is read, or after 2 s if storage never answers.
      const ready = this.preload >= LEVELS.length * PHASES && this.stateT >= 0.6
      if (ready && (this.loaded || this.stateT >= 2)) this.setState(TITLE)
    } else if (state === TITLE) {
      if (this.taps) this.startRun(wall)
    } else if (state === COUNTDOWN) {
      if (this.stateT >= COUNT_TIME) {
        this.setState(RACING)
        this.raceT = 0
      }
    } else if (state === RESULTS) {
      if (this.taps && this.stateT >= RESULTS_LOCK) this.startRun(wall)
    } else {
      this.stepRace(dt)
    }
    this.taps = 0
  }

  setState(state) {
    this.state = state
    this.stateT = 0
  }

  startRun(wall) {
    this.resetRun(this.fixedSeed || wall >>> 0 || 1)
    this.setState(COUNTDOWN)
  }

  stepRace(dt) {
    const steering = this.state === RACING || this.state === COASTING
    for (let i = 0; i < this.taps; i++) {
      if (!steering) break
      if (this.tapX[i] >= BOOST_X && this.tapY[i] >= BOOST_Y) this.boost()
      else this.steer(this.tapX[i] < W / 2 ? -1 : 1)
    }
    this.stepLane(dt)

    if (this.boostT >= 0) {
      this.boostT += dt
      if (this.boostT >= BOOST_TIME) this.boostT = -1
    }
    if (this.coolT > 0) this.coolT = Math.max(0, this.coolT - dt)
    if (this.pressT > 0) this.pressT -= dt
    if (this.blinkT > 0) this.blinkT -= dt
    this.raceT += dt

    if (this.state === RACING) {
      const base = targetKmh(this.km) * Math.min(1, this.raceT / START_TIME)
      this.hitF = Math.min(1, this.hitF + dt / (2 * HIT_RECOVER))
      this.baseKmh = base * this.hitF
      this.kmh = this.baseKmh * (1 + BOOST_GAIN * this.boostLevel())
    } else if (this.state === COASTING) {
      this.kmh = Math.max(0, this.kmh - (this.coastFrom * dt) / COAST_TIME)
      this.baseKmh = this.kmh
    } else {
      this.kmh = Math.max(0, this.kmh - (this.coastFrom * dt) / CRASH_TIME)
      this.baseKmh = this.kmh
    }

    const prev = this.pos
    this.pos += this.kmh * KMH_TO_SEGS * dt
    if (this.state === RACING) {
      this.fuel -= BURN * (this.pos - prev)
      if (this.fuel <= 0) {
        this.fuel = 0
        this.coast()
      }
    }
    // 10 points a segment, 20 while boosting.
    const seg = Math.floor(this.pos + CAR_D)
    if (seg > this.scoreSeg) {
      this.score += (seg - this.scoreSeg) * (this.boostT >= 0 ? 20 : 10)
      this.scoreSeg = seg
    }

    this.track.ensure(seg)
    this.level = this.track.levelAt(Math.floor(this.pos))
    // A left curve slides the skyline right, so the world seems to turn.
    this.skyX += LEVELS[this.level] * (this.pos - prev) * SKY_DRIFT

    this.stepObjects(dt, prev)

    if (this.state === CRASHING && this.stateT >= CRASH_TIME) this.finish(WRECKED)
    else if (this.state === COASTING && this.kmh <= 0) this.finish(OUT_OF_GAS)
  }

  // Boost ramps in over 0.3 s and out over the last 0.5 s of its 3.
  boostLevel() {
    const t = this.boostT
    if (t < 0) return 0
    if (t < BOOST_IN) return t / BOOST_IN
    if (t < BOOST_TIME - BOOST_OUT) return 1
    return Math.max(0, (BOOST_TIME - t) / BOOST_OUT)
  }

  get boostReady() {
    return this.state === RACING && this.coolT <= 0 && this.fuel >= BOOST_MIN_FUEL
  }

  boost() {
    if (!this.boostReady) return
    this.fuel -= BOOST_FUEL
    this.boostT = 0
    this.coolT = BOOST_COOL
    this.pressT = 0.1
  }

  // ------------------------------------------------------------ lanes

  steer(dir) {
    if (this.laneT >= 0) {
      if (!this.queued) this.queued = dir
      return
    }
    this.startLane(dir, 0)
  }

  startLane(dir, t) {
    const to = this.laneTo + dir
    if (to < 0 || to > 2) {
      // Nowhere to go: a 2 px wiggle shows the tap landed.
      this.wiggleDir = dir
      this.wiggleSeq++
      return
    }
    this.laneFrom = this.laneTo
    this.laneTo = to
    this.laneDir = dir
    this.laneT = t
    this.laneSeq++
  }

  stepLane(dt) {
    if (this.laneT >= 0) {
      this.laneT += dt
      if (this.laneT >= LANE_TIME) {
        const over = this.laneT - LANE_TIME
        this.laneT = -1
        this.laneFrom = this.laneTo
        if (this.queued) {
          const dir = this.queued
          this.queued = 0
          this.startLane(dir, over)
        }
      }
    }
    if (this.laneT >= 0) {
      const from = LANE_X[this.laneFrom]
      this.carX = from + (LANE_X[this.laneTo] - from) * easeOut(this.laneT / LANE_TIME)
    } else {
      this.carX = LANE_X[this.laneTo]
    }
  }

  // ------------------------------------------------------------ objects

  // Moves rivals and dying objects, and sweeps every object the car passed
  // since `prev`, so a slow frame can't skip a block.
  stepObjects(dt, prev) {
    const tr = this.track
    const from = prev + CAR_HIT
    const to = this.pos + CAR_HIT
    const live = this.state === RACING || this.state === COASTING
    const carV = this.kmh * KMH_TO_SEGS
    const rivalV = RIVAL_SPEED * this.baseKmh * KMH_TO_SEGS
    for (let i = 0; i < POOL; i++) {
      const state = tr.state[i]
      if (state === FREE) continue
      const kind = tr.kind[i]
      if (state === DYING) {
        // Debris and spun rivals drift along just slower than the car.
        tr.t[i] += dt
        tr.pos[i] += carV * (kind === DEBRIS ? 0.85 : 0.9) * dt
        tr.x[i] += tr.vx[i] * dt
        if (tr.t[i] >= (kind === DEBRIS ? 0.7 : 0.8)) tr.state[i] = FREE
      } else if (kind === RIVAL) {
        const before = tr.pos[i]
        if (tr.flag[i] & MOVING || before - this.pos <= DRAW) {
          tr.flag[i] |= MOVING
          tr.pos[i] += rivalV * dt
        }
        if (live && !(tr.flag[i] & PASSED) && from < before && to >= tr.pos[i]) {
          tr.flag[i] |= PASSED
          if (this.near(tr.x[i], HIT_HALF)) {
            if (this.blinkT <= 0) this.hitRival(i)
          } else {
            this.score += 100
            this.popup(POP_100)
          }
        }
      } else if (kind === BLOCK || kind === GAS || kind === REPAIR) {
        const p = tr.pos[i]
        if (live && from < p && p <= to) {
          if (kind === BLOCK) {
            if (this.blinkT <= 0 && this.near(tr.x[i], HIT_HALF)) this.hitBlock(i)
          } else if (this.near(tr.x[i], PICK_HALF)) {
            this.collect(i, kind)
          }
        }
      } else if (kind === BANNER && tr.pos[i] - this.pos < CAR_D) {
        tr.state[i] = FREE // the car has driven under it
      }
      if (tr.state[i] !== FREE && tr.pos[i] - this.pos < GONE_D) tr.state[i] = FREE
    }
  }

  near(x, half) {
    return Math.abs(this.carX - x) < half
  }

  hitBlock(i) {
    const tr = this.track
    tr.kind[i] = DEBRIS
    tr.state[i] = DYING
    tr.t[i] = 0
    tr.vx[i] = tr.x[i] >= this.carX ? 1800 : -1800
    this.hit()
  }

  hitRival(i) {
    const tr = this.track
    tr.state[i] = DYING
    tr.t[i] = 0
    tr.frame[i] += 3 // spun
    tr.vx[i] = tr.x[i] > 0 || (tr.x[i] === 0 && this.laneDir < 0) ? 2500 : -2500
    this.hit()
  }

  hit() {
    this.lives--
    this.blinkT = BLINK_TIME
    this.hitF = 0.5
    this.joltSeq++
    if (this.lives <= 0) {
      this.lives = 0
      this.blinkT = 0
      this.coastFrom = this.kmh
      this.boostT = -1
      this.setState(CRASHING)
    }
  }

  collect(i, kind) {
    this.track.state[i] = FREE
    this.sparkAt = this.time
    if (kind === GAS) {
      this.fuel = Math.min(TANK, this.fuel + GAS_FILL)
      this.score += 250
      this.popup(POP_GAS)
      if (this.state === COASTING) {
        // The engine restarts and the car picks up speed again.
        this.setState(RACING)
        this.hitF = Math.max(0.1, Math.min(1, this.kmh / targetKmh(this.km)))
      }
    } else if (this.lives < LIVES) {
      this.lives++
      this.score += 500
      this.popup(POP_LIFE)
    } else {
      this.score += 1000
      this.popup(POP_1000)
    }
  }

  popup(kind) {
    this.popupKind = kind
    this.popupX = this.carX
    this.popupSeq++
  }

  coast() {
    this.coastFrom = this.kmh
    this.boostT = -1
    this.setState(COASTING)
  }

  finish(outcome) {
    this.outcome = outcome
    this.newBest = this.score > this.best
    if (this.newBest) {
      this.best = this.score
      this.bestTenths = Math.floor(this.km * 10 + 1e-6)
      this.bestDirty = true
    }
    this.setState(RESULTS)
  }
}

// Counts for tests and the harness.
export function liveObjects(track) {
  let n = 0
  for (let i = 0; i < POOL; i++) if (track.state[i] === LIVE) n++
  return n
}
