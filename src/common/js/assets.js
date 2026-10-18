// Every picture path and every '<n>px' string the game uses, built once at
// load: per-frame code picks strings from these tables and never builds them.

import { ART, SIZE_STEP } from './gen/art.js'
import { LEVELS, PHASES } from './projection.js'
import { BANNER, BILLBOARD, BLOCK, DEBRIS, GAS, LIFEGUARD, REPAIR, RIVAL } from './track.js'

const A = '/common/assets/'

function frames(dir, name, count, ext) {
  const list = []
  for (let i = 0; i < count; i++) list.push(A + dir + '/' + name + '_' + i + (ext || '.png'))
  return list
}

// Road frames by curve level and stripe phase, and all of them in a row.
export const ROAD = []
export const ROAD_ALL = []
for (let level = 0; level < LEVELS.length; level++) {
  const row = frames('road', 'road_' + level, PHASES)
  ROAD.push(row)
  for (let p = 0; p < PHASES; p++) ROAD_ALL.push(row[p])
}

// Road objects, indexed by track kind: SRC[kind][frame][size], their pixel
// sizes, and what the size picker needs.
const KIND_ART = []
KIND_ART[BLOCK] = 'block'
KIND_ART[GAS] = 'gas'
KIND_ART[REPAIR] = 'repair'
KIND_ART[RIVAL] = 'rivals'
KIND_ART[BILLBOARD] = 'billboard'
KIND_ART[LIFEGUARD] = 'lifeguard'
KIND_ART[BANNER] = 'banner'
KIND_ART[DEBRIS] = 'debris'

export const SRC = []
export const WPX = []
export const HPX = []
export const SIZES = [] // how many sizes each kind has
export const LOG_W0 = [] // log(size-0 width / world width): see Scene.place
export const LOG_STEP = Math.log(1 / SIZE_STEP)
for (let kind = 0; kind < KIND_ART.length; kind++) {
  const name = KIND_ART[kind]
  if (!name) continue
  const info = ART.objects[name]
  const byFrame = []
  for (let f = 0; f < info.frames; f++) {
    const bySize = []
    for (let n = 0; n < info.sizes.length; n++) bySize.push(A + 'obj/' + name + '_' + f + '_' + n + '.png')
    byFrame.push(bySize)
  }
  SRC[kind] = byFrame
  WPX[kind] = info.sizes.map((s) => s[0])
  HPX[kind] = info.sizes.map((s) => s[1])
  SIZES[kind] = info.sizes.length
  LOG_W0[kind] = Math.log(info.sizes[0][0] / info.world)
}

export const CAR = frames('car', 'car', 4) // straight, lean left, lean right, crash
export const FLAME = frames('car', 'flame', 2)
export const SMOKE = frames('car', 'smoke', 3)
export const SPARKLE = frames('car', 'sparkle', 3)

export const DIGIT = frames('hud', 'digits', 12) // 0-9, 10 the point, 11 blank
export const POINT = 10
export const BLANK = DIGIT[11]
export const GAUGE = frames('hud', 'gauge', 4) // red, orange, green, empty
export const G_RED = 0
export const G_ORANGE = 1
export const G_GREEN = 2
export const G_EMPTY = 3
export const ICONS = frames('hud', 'hud_icons', 3) // pump, heart full, heart empty
export const BOOST = frames('hud', 'boost_btn', 10) // ready, pressed, 8 cooling steps
export const BOOST_READY = 0
export const BOOST_PRESSED = 1
export const BOOST_COOLING = 2

export const WORD = {}
export const WORD_W = {}
for (const key in ART.words) {
  WORD[key] = A + 'hud/words_' + key + '.png'
  WORD_W[key] = ART.words[key][0]
}

export const HEAD = {}
export const HEAD_W = {}
for (const key in ART.headlines) {
  HEAD[key] = A + 'screens/headlines_' + key + '.png'
  HEAD_W[key] = ART.headlines[key][0]
}

export const SKY = A + 'bg/bg_sky.png'
export const CITY = A + 'bg/bg_city.png'
export const CITY_PERIOD = ART.cityPeriod
export const LOGO = A + 'screens/logo.png'
export const TITLE_BG = A + 'screens/title_bg.jpg'
export const RESULTS_BG = A + 'screens/results_bg.jpg'
export const CORNERS = A + 'screens/corners.png'

// '<n>px' for every whole pixel from -512 to 1024.
const PX_MIN = -512
const PX_MAX = 1024
const PX_TABLE = []
for (let n = PX_MIN; n <= PX_MAX; n++) PX_TABLE.push(n + 'px')

export function px(n) {
  if (n < PX_MIN) n = PX_MIN
  else if (n > PX_MAX) n = PX_MAX
  return PX_TABLE[n - PX_MIN]
}
