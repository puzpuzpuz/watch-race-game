// Fills a preallocated frame description from the game state: which page,
// the road picture, the skyline offset, the sprite slots, the car and the HUD.
// renderer.js copies it to the page. build() allocates nothing.

import {
  BLANK,
  BOOST,
  BOOST_COOLING,
  BOOST_PRESSED,
  BOOST_READY,
  CAR,
  CITY_PERIOD,
  DIGIT,
  FLAME,
  GAUGE,
  G_EMPTY,
  G_GREEN,
  G_ORANGE,
  G_RED,
  HEAD,
  HEAD_W,
  HPX,
  ICONS,
  LOG_STEP,
  LOG_W0,
  POINT,
  ROAD,
  ROAD_ALL,
  SIZES,
  SMOKE,
  SPARKLE,
  SRC,
  WORD,
  WORD_W,
  WPX,
} from './assets.js'
import {
  BOOST_COOL,
  COASTING,
  COUNTDOWN,
  CRASHING,
  GONE_D,
  LOAD,
  RACING,
  RESULTS,
  RESULTS_LOCK,
  TITLE,
  WRECKED,
} from './game.js'
import { CAR_D, DRAW, LANE_PX, LANE_W, LEVELS, PHASES, STRAIGHT, W, project } from './projection.js'
import { DEBRIS, FREE, GAS, POOL, REPAIR, RIVAL } from './track.js'

export const V_LOAD = 'load'
export const V_TITLE = 'title'
export const V_RACE = 'race'
export const V_RESULTS = 'results'

export const BACK = 4 // sprite slots behind the car
export const FRONT = 2 // and in front of it
export const POPUP_Y = 330 // pickup popups start here and rise 40 px
const HUD_EVERY = 0.25 // HUD numbers and the skyline change at most 4 times a second
const POW10 = [1, 10, 100, 1000, 10000, 100000]
const COUNT_HEADS = ['3', '2', '1']
const POPUP_WORDS = ['gas', 'life', 'p100', 'p1000']

// A row of sprite slots: picture, position and visibility.
class Slots {
  constructor(n) {
    this.n = n
    this.src = []
    for (let i = 0; i < n; i++) this.src.push(BLANK)
    this.x = new Int16Array(n)
    this.y = new Int16Array(n)
    this.on = new Uint8Array(n)
  }
}

function strings(n, value) {
  const list = []
  for (let i = 0; i < n; i++) list.push(value)
  return list
}

// Writes `value` as digit pictures into list[at .. at + n), with leading
// zeros, or blanks when `blank` is set (the last digit always shows).
function digits(list, at, n, value, blank) {
  if (value >= POW10[n - 1] * 10) value = POW10[n - 1] * 10 - 1
  let shown = false
  for (let i = 0; i < n; i++) {
    const d = Math.floor(value / POW10[n - 1 - i]) % 10
    if (d || i === n - 1) shown = true
    list[at + i] = !shown && blank ? BLANK : DIGIT[d]
  }
}

// km with one decimal, "123.4": 3 digits, the point, 1 digit.
function distance(list, at, km) {
  const tenths = Math.floor(km * 10 + 1e-6)
  digits(list, at, 3, Math.floor(tenths / 10), true)
  list[at + 3] = DIGIT[POINT]
  list[at + 4] = DIGIT[tenths % 10]
}

export class Scene {
  constructor() {
    this.view = V_LOAD
    this.time = 0
    this.paused = false
    this.roadSrc = ROAD[STRAIGHT][0]
    this.cityLeft = 0

    this.back = new Slots(BACK)
    this.front = new Slots(FRONT)
    this.order = new Int16Array(POOL) // visible objects, far to near
    this.orderD = new Float64Array(POOL)
    this.p = { x: 0, y: 0, k: 0 }

    this.carSrc = CAR[0]
    this.carOn = true
    this.carLeft = 0 // the car group's offset, for pages without Folme
    this.flameOn = false
    this.flameSrc = FLAME[0]
    this.smokeOn = false
    this.smokeSrc = SMOKE[0]
    this.sparkOn = false
    this.sparkSrc = SPARKLE[0]
    this.lane = 1
    this.laneSeq = 0
    this.laneSnap = true // jump to the lane instead of sliding
    this.wiggleSeq = 0
    this.wiggleDir = 0
    this.joltSeq = 0
    this.popupSeq = 0
    this.popupSrc = WORD.gas
    this.popupLeft = 0

    this.score = strings(6, DIGIT[0])
    this.speed = strings(3, BLANK)
    this.dist = strings(5, BLANK)
    this.fuel = strings(10, GAUGE[G_GREEN])
    this.hearts = strings(3, ICONS[1])
    this.boostSrc = BOOST[BOOST_READY]
    this.headOn = false
    this.headSrc = HEAD['3']
    this.headLeft = 0
    this.nextHud = 0
    this.nextCity = 0

    this.best = strings(6, DIGIT[0])
    this.resHeadSrc = HEAD.wrecked
    this.resHeadLeft = 0
    this.resScore = strings(6, DIGIT[0])
    this.resDist = strings(5, BLANK)
    this.newBest = false
    this.blinkOn = true // NEW BEST blinks on the results screen
    this.tapOn = true // TAP TO START, blinking, once taps count
  }

  build(g) {
    this.time = g.time
    this.paused = g.paused
    this.joltSeq = g.joltSeq
    const state = g.state
    if (state === LOAD) {
      this.view = V_LOAD
      this.roadSrc = ROAD_ALL[g.preload % ROAD_ALL.length]
      return
    }
    this.blinkOn = Math.floor(g.time * 2) % 2 === 0
    this.tapOn = this.blinkOn && (state !== RESULTS || g.stateT >= RESULTS_LOCK)
    if (state === TITLE) {
      this.view = V_TITLE
      digits(this.best, 0, 6, g.best, false)
      return
    }
    if (state === RESULTS) {
      this.buildResults(g)
      return
    }
    this.view = V_RACE
    this.roadSrc = ROAD[g.level][(((Math.floor(g.pos) % PHASES) + PHASES) % PHASES)]
    this.buildCity(g)
    this.placeObjects(g)
    this.buildCar(g)
    this.buildHud(g)
  }

  buildResults(g) {
    if (this.view !== V_RESULTS) {
      this.view = V_RESULTS
      const key = g.outcome === WRECKED ? 'wrecked' : 'outofgas'
      this.resHeadSrc = HEAD[key]
      this.resHeadLeft = Math.round((W - HEAD_W[key]) / 2)
      digits(this.resScore, 0, 6, g.score, false)
      distance(this.resDist, 0, g.km)
      digits(this.best, 0, 6, g.best, false)
      this.newBest = g.newBest
    }
    // The last race frame stays underneath; freeze its HUD too.
    this.flameOn = false
    this.headOn = false
  }

  // The skyline catches up in steps, at most 4 times a second.
  buildCity(g) {
    if (g.time < this.nextCity) return
    let x = g.skyX % CITY_PERIOD
    if (x < 0) x += CITY_PERIOD
    const left = -Math.round(x)
    if (left !== this.cityLeft) {
      this.cityLeft = left
      this.nextCity = g.time + HUD_EVERY
    }
  }

  // Road objects within the draw distance, sorted far to near: those beyond
  // the car take the back slots (the nearest 4 if there are more), those
  // nearer than the car the front slots.
  placeObjects(g) {
    const tr = g.track
    const order = this.order
    const orderD = this.orderD
    let n = 0
    for (let i = 0; i < POOL; i++) {
      if (tr.state[i] === FREE) continue
      const d = tr.pos[i] - g.pos
      if (d > DRAW || d < GONE_D) continue
      let j = n++
      while (j > 0 && orderD[j - 1] < d) {
        orderD[j] = orderD[j - 1]
        order[j] = order[j - 1]
        j--
      }
      orderD[j] = d
      order[j] = i
    }
    let split = 0
    while (split < n && orderD[split] >= CAR_D) split++
    let s = 0
    for (let j = split > BACK ? split - BACK : 0; j < split; j++) this.place(this.back, s++, g, order[j], orderD[j])
    while (s < BACK) this.back.on[s++] = 0
    s = 0
    for (let j = n - split > FRONT ? n - FRONT : split; j < n; j++) this.place(this.front, s++, g, order[j], orderD[j])
    while (s < FRONT) this.front.on[s++] = 0
  }

  // Projects object i with the road picture's own curve, picks the
  // pre-drawn size nearest the projected width, anchored bottom-centre.
  place(slots, s, g, i, d) {
    const tr = g.track
    const p = this.p
    project(d, tr.x[i], LEVELS[g.level], p)
    const kind = tr.kind[i]
    let size = Math.round((LOG_W0[kind] - Math.log(p.k)) / LOG_STEP)
    if (size < 0) size = 0
    else if (size >= SIZES[kind]) size = SIZES[kind] - 1
    let frame = 0
    let lift = 0
    if (kind === GAS || kind === REPAIR) {
      // A glint every 0.6 s, and a 4 px bob.
      frame = Math.floor(g.time / 0.15) % 4 === 0 ? 1 : 0
      lift = Math.round(2 - 2 * Math.cos(g.time * 7.85))
    } else if (kind === RIVAL) {
      frame = tr.frame[i]
    } else if (kind === DEBRIS) {
      const t = tr.t[i]
      frame = Math.floor(t / 0.2) % 2
      lift = Math.round(260 * t - 400 * t * t)
    }
    const w = WPX[kind][size]
    const h = HPX[kind][size]
    slots.src[s] = SRC[kind][frame][size]
    slots.x[s] = Math.round(p.x - w / 2)
    slots.y[s] = Math.round(p.y - h) - lift
    slots.on[s] = 1
  }

  buildCar(g) {
    const state = g.state
    let car = 0
    if (state === CRASHING) car = 3
    else if (g.laneT >= 0) car = g.laneDir < 0 ? 1 : 2
    else if (g.level <= STRAIGHT - 2) car = 1 // lean into medium and hard curves
    else if (g.level >= STRAIGHT + 2) car = 2
    this.carSrc = CAR[car]
    this.carOn = !(g.blinkT > 0 && Math.floor(g.blinkT / 0.2) % 2 === 1)
    this.carLeft = Math.round((g.carX * LANE_PX) / LANE_W)
    this.flameOn = g.boostT >= 0
    if (this.flameOn) this.flameSrc = FLAME[Math.floor(g.time / 0.2) % 2]
    this.smokeOn = state === CRASHING || (g.lives === 1 && state !== COUNTDOWN)
    if (this.smokeOn) this.smokeSrc = SMOKE[Math.floor(g.time / 0.2) % 3]
    const spark = g.time - g.sparkAt
    this.sparkOn = spark >= 0 && spark < 0.45
    if (this.sparkOn) this.sparkSrc = SPARKLE[Math.floor(spark / 0.15)]
    this.lane = g.laneTo
    this.laneSeq = g.laneSeq
    this.laneSnap = state === COUNTDOWN
    this.wiggleSeq = g.wiggleSeq
    this.wiggleDir = g.wiggleDir
    if (g.popupSeq !== this.popupSeq) {
      this.popupSeq = g.popupSeq
      const key = POPUP_WORDS[g.popupKind]
      this.popupSrc = WORD[key]
      this.popupLeft = Math.round(W / 2 + (g.popupX * LANE_PX) / LANE_W - WORD_W[key] / 2)
    }
  }

  buildHud(g) {
    const state = g.state
    if (g.time >= this.nextHud || state !== RACING) {
      this.nextHud = g.time + HUD_EVERY
      digits(this.score, 0, 6, g.score, false)
      digits(this.speed, 0, 3, Math.round(g.kmh), true)
      distance(this.dist, 0, g.km)
    }
    // Fuel: 10 segments of 10 units, blinking red at 25 or less.
    const lit = Math.ceil(g.fuel / 10 - 1e-6)
    let colour = g.fuel > 50 ? G_GREEN : g.fuel > 25 ? G_ORANGE : G_RED
    if (colour === G_RED && Math.floor(g.time * 4) % 2 === 1) colour = G_EMPTY
    for (let i = 0; i < 10; i++) this.fuel[i] = GAUGE[i < lit ? colour : G_EMPTY]
    for (let i = 0; i < 3; i++) this.hearts[i] = ICONS[i < g.lives ? 1 : 2]

    if (g.pressT > 0) this.boostSrc = BOOST[BOOST_PRESSED]
    else if (g.coolT > 0) {
      const step = Math.min(7, Math.floor(((BOOST_COOL - g.coolT) / BOOST_COOL) * 8))
      this.boostSrc = BOOST[BOOST_COOLING + step]
    } else this.boostSrc = BOOST[g.boostReady ? BOOST_READY : BOOST_COOLING]

    let head = ''
    if (state === COUNTDOWN) head = COUNT_HEADS[Math.min(2, Math.floor(g.stateT))]
    else if (state === RACING && g.raceT < 1) head = 'go'
    else if (state === COASTING) head = 'outofgas'
    else if (state === CRASHING) head = 'wrecked'
    this.headOn = head !== ''
    if (this.headOn) {
      this.headSrc = HEAD[head]
      this.headLeft = Math.round((W - HEAD_W[head]) / 2)
    }
  }
}
