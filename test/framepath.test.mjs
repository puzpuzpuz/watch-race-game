// No allocating code on the frame path, since a garbage collection pause in
// QuickJS shows as a stutter: the source of every function a race frame runs
// is checked for object and array literals, closures, spread, template
// strings, string building, and the allocating array and JSON methods. V8
// can't measure this directly: its interpreter allocates for numbers that
// QuickJS doesn't.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Game } from '../src/common/js/game.js'
import { Renderer } from '../src/common/js/renderer.js'
import { Rng } from '../src/common/js/rng.js'
import { Runner } from '../src/common/js/runner.js'
import { Scene } from '../src/common/js/scene.js'
import { Track } from '../src/common/js/track.js'
import * as projection from '../src/common/js/projection.js'
import * as assets from '../src/common/js/assets.js'

const FORBIDDEN = [
  [/=>/, 'arrow function'],
  [/\bfunction\b/, 'function expression'],
  [/`/, 'template string'],
  [/\.\.\./, 'spread'],
  [/\.(map|filter|forEach|slice|concat|reduce|join|split)\(/, 'allocating array or string method'],
  [/\bJSON\./, 'JSON'],
  [/\bnew\s/, 'new'],
  [/[=(,:?]\s*[[{]/, 'object or array literal'],
  [/'\s*\+|\+\s*'/, 'string building'],
]

// Methods that a race frame runs. Left out on purpose: constructors and
// init(), Styles.at (its 'fresh' fallback allocates by design), and the debug
// fps readout, which builds one string a second.
const FRAME_PATH = {
  Game: [Game, ['update', 'tap', 'pause', 'setState', 'startRun', 'resetRun', 'stepRace', 'boostLevel', 'boost',
    'steer', 'startLane', 'stepLane', 'stepObjects', 'near', 'hitBlock', 'hitRival', 'hit', 'collect', 'popup',
    'coast', 'finish', 'km', 'boosting', 'boostReady']],
  Track: [Track, ['reset', 'ensure', 'curveAt', 'meanCurve', 'levelAt', 'chunk', 'placeGas', 'placeRepair',
    'bonusLane', 'addBonus', 'placeBlock', 'placeRival', 'placeScenery', 'sceneryClear', 'rowsNear', 'twoNear',
    'capOk', 'capAdd', 'pickLane', 'gap', 'between', 'spawn', 'nextCurve', 'nextCurvePhase', 'setPhase']],
  Rng: [Rng, ['seed', 'next', 'int']],
  Scene: [Scene, ['build', 'buildResults', 'buildCity', 'placeObjects', 'place', 'buildCar', 'buildHud']],
  Renderer: [Renderer, ['to', 'apply', 'applyResults', 'applyRace', 'applyMotion', 'stepJolt', 'setFlame', 'setSpark',
    'setPopup', 'setHead', 'list', 'slots']],
  Runner: [Runner, ['tick', 'touch', 'keepScreenOn']],
}

function source(cls, name) {
  const d = Object.getOwnPropertyDescriptor(cls.prototype, name)
  assert.ok(d, `${cls.name}.${name} not found`)
  return String(d.value || d.get)
}

// Comments and string contents can't allocate; drop them before matching.
function code(src) {
  return src
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "'s'")
}

function check(label, src) {
  const body = code(src).replace(/^[^{]*\{/, '') // skip the signature
  for (const [pattern, what] of FORBIDDEN) {
    const m = body.match(pattern)
    assert.ok(!m, `${label}: ${what} near "${m && body.slice(Math.max(0, m.index - 30), m.index + 30)}"`)
  }
}

for (const [label, [cls, names]] of Object.entries(FRAME_PATH)) {
  test(`${label}: frame-path methods allocate nothing`, () => {
    for (const name of names) check(`${label}.${name}`, source(cls, name))
  })
}

test('helpers on the frame path allocate nothing', () => {
  check('project', String(projection.project))
  check('px', String(assets.px))
})

test('the check itself catches allocations', () => {
  for (const bad of ['{ x = { a: 1 } }', '{ f(() => 1) }', '{ x = [1, 2] }', "{ s = 'a' + b }", '{ x = `a` }', '{ a.map(f) }']) {
    assert.throws(() => check('sample', bad))
  }
  check('sample', '{ if (a) { b[i] = c } else { d = e ? f : g } }')
})
