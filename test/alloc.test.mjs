// The allocation check: 5,000 race frames through game.js, scene.js and
// renderer.js (into a stand-in page) must not grow the heap by more than
// 64 KB after warm-up. npm test runs it with --expose-gc and --jitless: V8's
// optimizing compiler adds and drops compiled code as it goes, which would
// hide what the game itself keeps, and the watch's QuickJS has no JIT anyway.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Game, RACING, RESULTS, TITLE } from '../src/common/js/game.js'
import { Renderer, initialData } from '../src/common/js/renderer.js'
import { Scene } from '../src/common/js/scene.js'

const FRAMES = 5000
const LIMIT = 64 * 1024

// A player that changes lanes now and then, boosts when it can, and starts a
// new run from the results screen.
function makeFrame() {
  const game = new Game()
  game.fixedSeed = 99
  game.setBest(0)
  const scene = new Scene()
  const renderer = new Renderer(initialData(), null)
  renderer.init()
  let n = 0
  return {
    game,
    frame() {
      n++
      if (game.state === TITLE || game.state === RESULTS) game.tap(100, 100)
      else if (game.state === RACING) {
        if (n % 23 === 0) game.tap(n % 46 === 0 ? 60 : 380, 200)
        if (n % 211 === 0) game.tap(330, 480)
      }
      game.update(0.04, n)
      scene.build(game)
      renderer.apply(scene)
    },
  }
}

test('5,000 race frames grow the heap by less than 64 KB', { skip: !global.gc && 'needs --expose-gc' }, () => {
  if (!process.execArgv.includes('--jitless')) console.log('without --jitless, compiled code counts too')
  const { game, frame } = makeFrame()
  // Warm-up: long enough to crash, see the results and restart.
  for (let i = 0; i < FRAMES; i++) frame()
  global.gc()
  const before = process.memoryUsage().heapUsed
  let racing = 0
  for (let i = 0; i < FRAMES; i++) {
    frame()
    if (game.state === RACING) racing++
  }
  global.gc()
  const grown = process.memoryUsage().heapUsed - before
  console.log(`heap grew ${grown} bytes over ${FRAMES} frames (${racing} racing)`)
  assert.ok(racing > FRAMES / 2, 'the frames were mostly racing')
  assert.ok(grown < LIMIT, `heap grew ${grown} bytes`)
})
