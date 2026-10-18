// Copies each frame description (scene.js) into the page's data, following
// the watch's update rules: a binding is written only when its value changes,
// styles are objects of whole pixels, width and height are never set. Lane
// changes, jolts, wiggles and popups run as native Folme animations.
//
// `vm` is the page (or the harness's stand-in) and `fx` is @system.folme, or
// null, in which case the car moves by its style instead.

import {
  BLANK,
  BOOST,
  CAR,
  DIGIT,
  FLAME,
  GAUGE,
  G_GREEN,
  HEAD,
  ICONS,
  ROAD,
  SMOKE,
  SPARKLE,
  WORD,
  px,
} from './assets.js'
import { STYLE_MODE } from './config.js'
import { LANE_TIME } from './game.js'
import { LANE_PX, STRAIGHT } from './projection.js'
import { BACK, FRONT, POPUP_Y, V_RACE, V_RESULTS, V_TITLE } from './scene.js'

// Page layout, in screen pixels (see the spec's Screen layout).
export const LAYOUT = {
  city: { top: 80 },
  car: { left: 144, top: 330 }, // the car group: the car itself at y 360-440
  score: { left: 44, top: 58, step: 17 },
  speed: { left: 44, top: 90, step: 16 },
  dist: { lefts: [120, 136, 152, 164, 180], top: 478 },
  fuel: { left: 290, top: 39, step: 10 },
  lives: { left: 308, top: 68, step: 28 },
  head: { top: 122 },
  titleBest: { left: 196, top: 176, step: 17 },
  resScore: { left: 166, top: 184, step: 17 },
  resDist: { lefts: [162, 178, 194, 206, 222], top: 254 },
  resBest: { left: 166, top: 324, step: 17 },
  resHead: { top: 72 },
}

const JOLT_AT = [0, 0.06, 0.14, 0.22] // the hit jolt: 4 px down, 3 up, 2 down, still
const JOLT_Y = [4, -3, 2, 0]
const JOLT_MS = [0.06, 0.08, 0.08, 0.08]
const WIGGLE_AT = [0, 0.05, 0.1]
const WIGGLE_X = [2, -2, 0]
const POPUP_RISE = 0.6

// Two style objects used in turn, so a move allocates nothing. The page sees
// a different object each time, which is what makes it update.
class Styles {
  constructor(fresh) {
    this.fresh = fresh
    this.a = { left: '0px', top: '0px' }
    this.b = { left: '0px', top: '0px' }
    this.useA = true
  }

  at(left, top) {
    if (this.fresh) return { left: px(left), top: px(top) }
    const o = this.useA ? this.a : this.b
    this.useA = !this.useA
    o.left = px(left)
    o.top = px(top)
    return o
  }
}

// What the page shows in a row of sprite slots, so unchanged values aren't
// written again.
class Shown {
  constructor(n, fresh) {
    this.src = []
    this.styles = []
    for (let i = 0; i < n; i++) {
      this.src.push(BLANK)
      this.styles.push(new Styles(fresh))
    }
    this.x = new Int16Array(n).fill(-1000)
    this.y = new Int16Array(n).fill(-1000)
    this.on = new Uint8Array(n)
  }
}

function folmeReq(id, attr, value, duration, ease) {
  const toState = {}
  toState[attr] = value
  const config = { duration: duration }
  if (ease) config.ease = [ease, duration]
  return { id: id, toState: toState, config: config }
}

// A row of HUD pictures at fixed positions.
function row(prefix, count, src, layout) {
  const list = []
  for (let i = 0; i < count; i++) {
    const left = layout.lefts ? layout.lefts[i] : layout.left + i * layout.step
    list.push({ k: prefix + i, src: src, s: { left: px(left), top: px(layout.top) } })
  }
  return list
}

function slots(prefix, n) {
  const list = []
  for (let i = 0; i < n; i++) list.push({ k: prefix + i, src: BLANK, s: { left: '0px', top: '0px' }, on: false })
  return list
}

// The page data the renderer drives, with starting values. The page declares
// the same fields; the harness starts from this.
export function initialData() {
  return {
    view: 'load',
    paused: false,
    roadSrc: ROAD[STRAIGHT][0],
    cityStyle: { left: '0px', top: px(LAYOUT.city.top) },
    back: [],
    front: [],
    carStyle: { left: px(LAYOUT.car.left), top: px(LAYOUT.car.top) },
    carSrc: CAR[0],
    carOn: true,
    flameSrc: FLAME[0],
    flameOn: false,
    smokeSrc: SMOKE[0],
    smokeOn: false,
    sparkSrc: SPARKLE[0],
    sparkOn: false,
    popSrc: WORD.gas,
    popStyle: { left: '0px', top: px(POPUP_Y) },
    popOn: false,
    score: [],
    speed: [],
    dist: [],
    fuel: [],
    lives: [],
    boostSrc: BOOST[0],
    headSrc: HEAD['3'],
    headStyle: { left: '0px', top: px(LAYOUT.head.top) },
    headOn: false,
    titleBest: [],
    tapOn: true,
    resHeadSrc: HEAD.wrecked,
    resHeadStyle: { left: '0px', top: px(LAYOUT.resHead.top) },
    resScore: [],
    resDist: [],
    resBest: [],
    newBest: false,
    newBestOn: false,
    fpsText: '',
  }
}

export class Renderer {
  constructor(vm, fx) {
    this.vm = vm
    this.fx = fx
    this.fresh = STYLE_MODE === 'fresh'
    this.fxErrors = 0
    this.fade = true // Folme opacity works; turned off after a failure
  }

  // Creates the page's lists and the Folme requests, once.
  init() {
    const vm = this.vm
    vm.back = slots('b', BACK)
    vm.front = slots('f', FRONT)
    vm.score = row('s', 6, DIGIT[0], LAYOUT.score)
    vm.speed = row('v', 3, BLANK, LAYOUT.speed)
    vm.dist = row('d', 5, BLANK, LAYOUT.dist)
    vm.fuel = row('g', 10, GAUGE[G_GREEN], LAYOUT.fuel)
    vm.lives = row('h', 3, ICONS[1], LAYOUT.lives)
    vm.titleBest = row('t', 6, DIGIT[0], LAYOUT.titleBest)
    vm.resScore = row('rs', 6, DIGIT[0], LAYOUT.resScore)
    vm.resDist = row('rd', 5, BLANK, LAYOUT.resDist)
    vm.resBest = row('rb', 6, DIGIT[0], LAYOUT.resBest)
    // Read the lists back: the page may hand out observed copies.
    this.items = {
      back: vm.back,
      front: vm.front,
      score: vm.score,
      speed: vm.speed,
      dist: vm.dist,
      fuel: vm.fuel,
      lives: vm.lives,
      titleBest: vm.titleBest,
      resScore: vm.resScore,
      resDist: vm.resDist,
      resBest: vm.resBest,
    }
    this.shown = {}
    for (const key in this.items) {
      const list = this.items[key]
      const values = []
      for (let i = 0; i < list.length; i++) values.push(list[i].src)
      this.shown[key] = values
    }
    this.back = new Shown(BACK, this.fresh)
    this.front = new Shown(FRONT, this.fresh)

    this.view = vm.view
    this.paused = vm.paused
    this.roadSrc = vm.roadSrc
    this.cityLeft = 0
    this.cityStyles = new Styles(this.fresh)
    this.carLeft = 0
    this.carStyles = new Styles(this.fresh)
    this.carSrc = vm.carSrc
    this.carOn = vm.carOn
    this.flameSrc = vm.flameSrc
    this.flameOn = vm.flameOn
    this.smokeSrc = vm.smokeSrc
    this.smokeOn = vm.smokeOn
    this.sparkSrc = vm.sparkSrc
    this.sparkOn = vm.sparkOn
    this.boostSrc = vm.boostSrc
    this.headSrc = vm.headSrc
    this.headLeft = -1
    this.headOn = vm.headOn
    this.headStyles = new Styles(this.fresh)
    this.tapOn = vm.tapOn
    this.newBest = vm.newBest
    this.newBestOn = vm.newBestOn
    this.resHeadSrc = ''
    this.resHeadStyles = new Styles(this.fresh)

    this.laneSeq = -1
    this.joltSeq = 0
    this.joltStep = JOLT_AT.length
    this.joltAt = 0
    this.wiggleSeq = 0
    this.wiggleStep = WIGGLE_AT.length
    this.wiggleAt = 0
    this.wiggleDir = 0
    this.popSeq = 0
    this.popPhase = 0
    this.popAt = 0
    this.popOn = false
    this.popStyles = new Styles(this.fresh)

    const ease = 'quadOut'
    this.laneReq = []
    this.snapReq = []
    for (let l = 0; l < 3; l++) {
      const x = px((l - 1) * LANE_PX)
      this.laneReq.push(folmeReq('carg', 'translateX', x, LANE_TIME, ease))
      this.snapReq.push(folmeReq('carg', 'translateX', x, 0.01))
    }
    this.joltRoad = []
    this.joltCar = []
    for (let i = 0; i < JOLT_AT.length; i++) {
      this.joltRoad.push(folmeReq('road', 'translateY', px(JOLT_Y[i]), JOLT_MS[i]))
      this.joltCar.push(folmeReq('carj', 'translateY', px(JOLT_Y[i]), JOLT_MS[i]))
    }
    this.wiggleReq = [[], []]
    for (let i = 0; i < WIGGLE_AT.length; i++) {
      this.wiggleReq[0].push(folmeReq('carj', 'translateX', px(-WIGGLE_X[i]), 0.05))
      this.wiggleReq[1].push(folmeReq('carj', 'translateX', px(WIGGLE_X[i]), 0.05))
    }
    this.popReset = folmeReq('popup', 'translateY', '0px', 0.01)
    this.popRise = folmeReq('popup', 'translateY', px(-40), POPUP_RISE, ease)
    this.popShow = folmeReq('popup', 'opacity', 1, 0.01)
    this.popFade = folmeReq('popup', 'opacity', 0, POPUP_RISE)
  }

  to(req) {
    if (!this.fx) return false
    try {
      this.fx.to(req)
      return true
    } catch (e) {
      this.fxErrors++
      return false
    }
  }

  apply(s) {
    const vm = this.vm
    if (s.view !== this.view) {
      this.view = s.view
      vm.view = s.view
    }
    if (s.paused !== this.paused) {
      this.paused = s.paused
      vm.paused = s.paused
    }
    if (s.roadSrc !== this.roadSrc) {
      this.roadSrc = s.roadSrc
      vm.roadSrc = s.roadSrc
    }
    this.stepJolt(s)
    if (s.view === V_RACE) {
      this.applyRace(s)
    } else {
      // Effects stop on the menus; the last race frame stays underneath.
      this.setFlame(false)
      this.setSpark(false)
      this.setHead(s, false)
      this.setPopup(false)
      this.popPhase = 0
      if (s.view === V_TITLE) this.list('titleBest', s.best)
      else if (s.view === V_RESULTS) this.applyResults(s)
      if (s.tapOn !== this.tapOn) {
        this.tapOn = s.tapOn
        vm.tapOn = s.tapOn
      }
    }
  }

  applyResults(s) {
    const vm = this.vm
    if (s.resHeadSrc !== this.resHeadSrc) {
      this.resHeadSrc = s.resHeadSrc
      vm.resHeadSrc = s.resHeadSrc
      vm.resHeadStyle = this.resHeadStyles.at(s.resHeadLeft, LAYOUT.resHead.top)
    }
    this.list('resScore', s.resScore)
    this.list('resDist', s.resDist)
    this.list('resBest', s.best)
    if (s.newBest !== this.newBest) {
      this.newBest = s.newBest
      vm.newBest = s.newBest
    }
    const blink = s.newBest && s.blinkOn
    if (blink !== this.newBestOn) {
      this.newBestOn = blink
      vm.newBestOn = blink
    }
  }

  applyRace(s) {
    const vm = this.vm
    if (s.cityLeft !== this.cityLeft) {
      this.cityLeft = s.cityLeft
      vm.cityStyle = this.cityStyles.at(s.cityLeft, LAYOUT.city.top)
    }
    this.slots(this.items.back, this.back, s.back)
    this.slots(this.items.front, this.front, s.front)

    if (s.carSrc !== this.carSrc) {
      this.carSrc = s.carSrc
      vm.carSrc = s.carSrc
    }
    if (s.carOn !== this.carOn) {
      this.carOn = s.carOn
      vm.carOn = s.carOn
    }
    if (s.flameOn && s.flameSrc !== this.flameSrc) {
      this.flameSrc = s.flameSrc
      vm.flameSrc = s.flameSrc
    }
    this.setFlame(s.flameOn)
    if (s.smokeOn && s.smokeSrc !== this.smokeSrc) {
      this.smokeSrc = s.smokeSrc
      vm.smokeSrc = s.smokeSrc
    }
    if (s.smokeOn !== this.smokeOn) {
      this.smokeOn = s.smokeOn
      vm.smokeOn = s.smokeOn
    }
    if (s.sparkOn && s.sparkSrc !== this.sparkSrc) {
      this.sparkSrc = s.sparkSrc
      vm.sparkSrc = s.sparkSrc
    }
    this.setSpark(s.sparkOn)
    this.applyMotion(s)

    this.list('score', s.score)
    this.list('speed', s.speed)
    this.list('dist', s.dist)
    this.list('fuel', s.fuel)
    this.list('lives', s.hearts)
    if (s.boostSrc !== this.boostSrc) {
      this.boostSrc = s.boostSrc
      vm.boostSrc = s.boostSrc
    }
    this.setHead(s, s.headOn)
  }

  // Lane changes, the hit jolt, the edge wiggle and pickup popups.
  applyMotion(s) {
    const vm = this.vm
    if (s.laneSeq !== this.laneSeq) {
      this.laneSeq = s.laneSeq
      this.to(s.laneSnap ? this.snapReq[s.lane] : this.laneReq[s.lane])
    }
    if (!this.fx && s.carLeft !== this.carLeft) {
      this.carLeft = s.carLeft
      vm.carStyle = this.carStyles.at(LAYOUT.car.left + s.carLeft, LAYOUT.car.top)
    }
    if (s.wiggleSeq !== this.wiggleSeq) {
      this.wiggleSeq = s.wiggleSeq
      this.wiggleDir = s.wiggleDir > 0 ? 1 : 0
      this.wiggleStep = 0
      this.wiggleAt = s.time
    }
    if (this.wiggleStep < WIGGLE_AT.length && s.time - this.wiggleAt >= WIGGLE_AT[this.wiggleStep]) {
      this.to(this.wiggleReq[this.wiggleDir][this.wiggleStep])
      this.wiggleStep++
    }
    // Popups: put it in place at full opacity, start the rise and fade on
    // the next frame, hide it when done.
    if (s.popupSeq !== this.popSeq) {
      this.popSeq = s.popupSeq
      vm.popSrc = s.popupSrc
      vm.popStyle = this.popStyles.at(s.popupLeft, POPUP_Y)
      this.to(this.popReset)
      if (this.fade && !this.to(this.popShow)) this.fade = false
      this.setPopup(true)
      this.popPhase = 1
      this.popAt = s.time
    } else if (this.popPhase === 1) {
      this.to(this.popRise)
      if (this.fade && !this.to(this.popFade)) this.fade = false
      this.popPhase = 2
      this.popAt = s.time
    } else if (this.popPhase === 2 && s.time - this.popAt >= POPUP_RISE) {
      this.setPopup(false)
      this.popPhase = 0
    }
  }

  // The hit jolt runs to the end even if the race screen is gone, so the
  // road and the car settle back in place.
  stepJolt(s) {
    if (s.joltSeq !== this.joltSeq) {
      this.joltSeq = s.joltSeq
      this.joltStep = 0
      this.joltAt = s.time
    }
    if (this.joltStep < JOLT_AT.length && s.time - this.joltAt >= JOLT_AT[this.joltStep]) {
      this.to(this.joltRoad[this.joltStep])
      this.to(this.joltCar[this.joltStep])
      this.joltStep++
    }
  }

  setFlame(on) {
    if (on !== this.flameOn) {
      this.flameOn = on
      this.vm.flameOn = on
    }
  }

  setSpark(on) {
    if (on !== this.sparkOn) {
      this.sparkOn = on
      this.vm.sparkOn = on
    }
  }

  setPopup(on) {
    if (on !== this.popOn) {
      this.popOn = on
      this.vm.popOn = on
    }
  }

  setHead(s, on) {
    const vm = this.vm
    if (on) {
      if (s.headSrc !== this.headSrc) {
        this.headSrc = s.headSrc
        vm.headSrc = s.headSrc
      }
      if (s.headLeft !== this.headLeft) {
        this.headLeft = s.headLeft
        vm.headStyle = this.headStyles.at(s.headLeft, LAYOUT.head.top)
      }
    }
    if (on !== this.headOn) {
      this.headOn = on
      vm.headOn = on
    }
  }

  // A row of HUD pictures: only changed pictures are written.
  list(key, values) {
    const items = this.items[key]
    const shown = this.shown[key]
    for (let i = 0; i < items.length; i++) {
      if (values[i] !== shown[i]) {
        shown[i] = values[i]
        items[i].src = values[i]
      }
    }
  }

  slots(items, shown, slots) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (slots.on[i]) {
        if (slots.src[i] !== shown.src[i]) {
          shown.src[i] = slots.src[i]
          item.src = slots.src[i]
        }
        const x = slots.x[i]
        const y = slots.y[i]
        if (x !== shown.x[i] || y !== shown.y[i]) {
          shown.x[i] = x
          shown.y[i] = y
          item.s = shown.styles[i].at(x, y)
        }
        if (!shown.on[i]) {
          shown.on[i] = 1
          item.on = true
        }
      } else if (shown.on[i]) {
        shown.on[i] = 0
        item.on = false
      }
    }
  }
}
