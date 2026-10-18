// Desktop harness: runs the game's own modules (runner, game, scene,
// renderer) at 432x514 with plain DOM pictures, for quick tuning. The page
// data is a stand-in for the Vela page: assigning a field updates its element,
// and lists hand back observed copies, as the framework does. Folme is
// imitated with CSS transitions. The page's styles are read from game.ux.

import { DEBUG } from '/common/js/config.js'
import { COASTING, COUNTDOWN, CRASHING, LOAD, RACING, RESULTS, TITLE } from '/common/js/game.js'
import { initialData } from '/common/js/renderer.js'
import { Runner } from '/common/js/runner.js'

const STATE_NAMES = {
  [LOAD]: 'loading',
  [TITLE]: 'title',
  [COUNTDOWN]: 'countdown',
  [RACING]: 'racing',
  [COASTING]: 'coasting',
  [CRASHING]: 'crashing',
  [RESULTS]: 'results',
}
const A = '/common/assets/'
const stage = document.getElementById('stage')
const frame = document.getElementById('frame')

const ux = await (await fetch('/pages/game/game.ux')).text()
const css = document.createElement('style')
css.textContent = ux.match(/<style>([\s\S]*)<\/style>/)[1]
document.head.appendChild(css)

// ------------------------------------------------------------------ page DOM

function el(tag, cls, parent = stage, src) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (src) e.src = src
  e.draggable = false
  parent.appendChild(e)
  return e
}

function show(e, on) {
  e.style.display = on ? '' : 'none'
}

function place(e, s) {
  if (s.left !== undefined) e.style.left = s.left
  if (s.top !== undefined) e.style.top = s.top
}

const anchors = {}
function list(name, parent = stage) {
  anchors[name] = el('span', null, parent)
  anchors[name].style.display = 'none'
}

// Same order as the template in src/pages/game/game.ux.
const E = {}
el('img', 'sky', stage, A + 'bg/bg_sky.png')
E.city = el('img', 'city', stage, A + 'bg/bg_city.png')
E.road = el('img', 'road')
E.road.id = 'road'
list('back')
E.carg = el('div', 'carg')
E.carg.id = 'carg'
E.carj = el('div', 'carj', E.carg)
E.carj.id = 'carj'
E.car = el('img', 'car', E.carj)
E.flame = el('img', 'flame', E.carj)
E.smoke = el('img', 'smoke', E.carj)
E.spark = el('img', 'spark', E.carj)
list('front')
E.popup = el('img', 'obj')
E.popup.id = 'popup'
el('img', 'hud score-label', stage, A + 'hud/words_score.png')
list('score')
list('speed')
el('img', 'hud kmh', stage, A + 'hud/words_kmh.png')
el('img', 'pump', stage, A + 'hud/hud_icons_0.png')
list('fuel')
list('lives')
list('dist')
el('img', 'hud km', stage, A + 'hud/words_km.png')
E.boost = el('img', 'boost')
E.head = el('img', 'obj')
E.dim = el('div', 'dim')
E.paused = el('img', 'hud paused', stage, A + 'hud/words_paused.png')
E.tapGo = el('img', 'hud tap-go', stage, A + 'hud/words_taptogo.png')

E.title = el('div', 'layer')
el('img', 'full', E.title, A + 'screens/title_bg.jpg')
el('img', 'logo', E.title, A + 'screens/logo.png')
el('img', 'hud title-best', E.title, A + 'hud/words_best.png')
list('titleBest', E.title)
E.titleTap = el('img', 'hud title-tap', E.title, A + 'hud/words_taptostart.png')
E.corners = el('img', 'full', E.title, A + 'screens/corners.png')
E.info = el('div', 'info text', E.title)

E.results = el('div', 'layer')
el('img', 'full', E.results, A + 'screens/results_bg.jpg')
E.resHead = el('img', 'obj', E.results)
el('img', 'hud res-score', E.results, A + 'hud/words_score.png')
list('resScore', E.results)
el('img', 'hud res-distance', E.results, A + 'hud/words_distance.png')
list('resDist', E.results)
el('img', 'hud res-km', E.results, A + 'hud/words_km.png')
el('img', 'hud res-best', E.results, A + 'hud/words_best.png')
list('resBest', E.results)
E.resNew = el('img', 'hud res-new', E.results, A + 'hud/words_newbest.png')
E.resTap = el('img', 'hud res-tap', E.results, A + 'hud/words_taptostart.png')

E.load = el('div', 'layer')
el('div', 'cover', E.load)
el('img', 'logo load-logo', E.load, A + 'screens/logo.png')
E.fps = el('div', 'fps text')

// A list assignment builds its pictures and hands back observed items.
function makeList(name, items, cls) {
  const anchor = anchors[name]
  for (const old of anchor.items || []) old.remove()
  anchor.items = []
  return items.map((item) => {
    const img = document.createElement('img')
    img.className = cls
    img.draggable = false
    anchor.parentNode.insertBefore(img, anchor)
    anchor.items.push(img)
    img.src = item.src
    place(img, item.s)
    if ('on' in item) show(img, item.on)
    return new Proxy(item, {
      set(target, key, value) {
        target[key] = value
        if (key === 'src') img.src = value
        else if (key === 's') place(img, value)
        else if (key === 'on') show(img, value)
        return true
      },
    })
  })
}

const LIST_CLASS = {
  back: 'obj',
  front: 'obj',
  score: 'digit',
  speed: 'digit',
  dist: 'digit',
  fuel: 'gauge',
  lives: 'heart',
  titleBest: 'digit',
  resScore: 'digit',
  resDist: 'digit',
  resBest: 'digit',
}

const data = Object.assign(initialData(), { debug: DEBUG, build: 'harness' })
const SETTERS = {
  view(v) {
    show(E.title, v === 'title')
    show(E.results, v === 'results')
    show(E.load, v === 'load')
    show(E.fps, data.debug && v === 'race')
  },
  paused(v) {
    show(E.dim, v)
    show(E.paused, v)
    show(E.tapGo, v)
  },
  roadSrc: (v) => (E.road.src = v),
  cityStyle: (v) => place(E.city, v),
  carStyle: (v) => place(E.carg, v),
  carSrc: (v) => (E.car.src = v),
  carOn: (v) => show(E.car, v),
  flameSrc: (v) => (E.flame.src = v),
  flameOn: (v) => show(E.flame, v),
  smokeSrc: (v) => (E.smoke.src = v),
  smokeOn: (v) => show(E.smoke, v),
  sparkSrc: (v) => (E.spark.src = v),
  sparkOn: (v) => show(E.spark, v),
  popSrc: (v) => (E.popup.src = v),
  popStyle: (v) => place(E.popup, v),
  popOn: (v) => show(E.popup, v),
  boostSrc: (v) => (E.boost.src = v),
  headSrc: (v) => (E.head.src = v),
  headStyle: (v) => place(E.head, v),
  headOn: (v) => show(E.head, v),
  tapOn(v) {
    show(E.titleTap, v)
    show(E.resTap, v)
  },
  resHeadSrc: (v) => (E.resHead.src = v),
  resHeadStyle: (v) => place(E.resHead, v),
  newBestOn: (v) => show(E.resNew, v),
  fpsText: (v) => (E.fps.textContent = v),
  debug(v) {
    show(E.corners, v)
    show(E.info, v)
  },
  build: (v) => (E.info.textContent = v),
}

const vm = new Proxy(data, {
  set(target, key, value) {
    if (LIST_CLASS[key]) value = makeList(key, value, LIST_CLASS[key])
    else if (SETTERS[key]) SETTERS[key](value)
    target[key] = value
    return true
  },
})
for (const key in data) vm[key] = data[key]

// --------------------------------------------------------- Folme stand-in

const QUAD_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const motion = {}
const folme = {
  to({ id, toState, config }) {
    const e = document.getElementById(id)
    if (!e) throw new Error('folme: no element ' + id)
    const m = (motion[id] = motion[id] || { x: 0, y: 0, o: 1 })
    if ('translateX' in toState) m.x = parseFloat(toState.translateX)
    if ('translateY' in toState) m.y = parseFloat(toState.translateY)
    if ('opacity' in toState) m.o = Number(toState.opacity)
    const ease = config.ease ? QUAD_OUT : 'linear'
    e.style.transition = `transform ${config.duration}s ${ease}, opacity ${config.duration}s ${ease}`
    e.style.transform = `translate(${m.x}px, ${m.y}px)`
    e.style.opacity = m.o
  },
  cancel() {},
}

// ------------------------------------------------------------------ running

const params = new URLSearchParams(location.search)
const runner = new Runner({
  vm,
  folme: params.has('nofolme') ? null : folme,
  loadBest(done) {
    let v = null
    try {
      v = localStorage.getItem('miamiRushBest')
    } catch (e) {
      v = null
    }
    setTimeout(() => done(v), 50)
  },
  saveBest(value) {
    try {
      localStorage.setItem('miamiRushBest', value)
    } catch (e) {
      // Private windows may refuse; the best score just isn't kept.
    }
  },
  keepScreenOn() {},
})
const seedParam = parseInt(params.get('seed'), 10)
if (seedParam) {
  runner.game.fixedSeed = seedParam
  document.getElementById('seed').value = seedParam
}
runner.start()

// ------------------------------------------------------------------- input

function scale() {
  return stage.getBoundingClientRect().width / 432
}

stage.addEventListener('mousedown', (e) => {
  const r = stage.getBoundingClientRect()
  const k = scale()
  runner.touch(Math.round((e.clientX - r.left) / k), Math.round((e.clientY - r.top) / k))
  e.preventDefault()
})

const KEYS = {
  ArrowLeft: [100, 250],
  ArrowRight: [330, 250],
  ' ': [320, 480],
  ArrowUp: [320, 480],
  Enter: [216, 250],
}
let hidden = false
function toggleHidden() {
  hidden = !hidden
  if (hidden) runner.hide()
  else runner.show()
  document.getElementById('pause').textContent = hidden ? 'Show app' : 'Hide app'
}
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return
  if (e.key === 'p' || e.key === 'P') toggleHidden()
  else if (KEYS[e.key]) runner.touch(...KEYS[e.key])
  else return
  e.preventDefault()
})

let zoom = 1
document.getElementById('zoom').onclick = (e) => {
  zoom = zoom === 1 ? 2 : 1
  frame.style.transform = `scale(${zoom})`
  frame.style.width = 432 * zoom + 'px'
  frame.style.height = 514 * zoom + 'px'
  e.target.textContent = zoom === 1 ? 'Zoom 2x' : 'Zoom 1x'
}
document.getElementById('round').onclick = () => stage.classList.toggle('round')
document.getElementById('pause').onclick = toggleHidden
document.getElementById('useSeed').onclick = () => {
  runner.game.fixedSeed = parseInt(document.getElementById('seed').value, 10) || 0
}

// -------------------------------------------------------------------- info

const info = document.getElementById('info')
setInterval(() => {
  const g = runner.game
  let live = 0
  for (let i = 0; i < g.track.state.length; i++) if (g.track.state[i]) live++
  const visible = runner.scene.back.on.reduce((a, b) => a + b, 0) + runner.scene.front.on.reduce((a, b) => a + b, 0)
  info.textContent = [
    `state     ${STATE_NAMES[g.state]}${g.paused ? ' (paused)' : ''}`,
    `seed      ${g.seed}`,
    `distance  ${g.km.toFixed(2)} km`,
    `speed     ${g.kmh.toFixed(0)} km/h`,
    `lives     ${g.lives}   fuel ${g.fuel.toFixed(1)}`,
    `score     ${g.score}   best ${g.best}`,
    `boost     ${g.boosting ? 'on' : g.coolT > 0 ? 'cooling ' + g.coolT.toFixed(1) + ' s' : 'ready'}`,
    `curve     level ${g.level}`,
    `objects   ${visible} on screen, ${live} alive`,
    `fps       ${data.fpsText || '-'}`,
  ].join('\n')
}, 250)

window.runner = runner
