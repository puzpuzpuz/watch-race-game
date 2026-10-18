// The renderer's Folme calls. On the watch, the car stopped following lane
// changes once a lane's request object, made once and reused, was sent a
// second time, so every move must go out as a new request.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Game, RACING, TITLE } from '../src/common/js/game.js'
import { Renderer, initialData } from '../src/common/js/renderer.js'
import { Scene } from '../src/common/js/scene.js'

test('every Folme move is a new request, also back to a lane already visited', () => {
  const sent = []
  const game = new Game()
  game.fixedSeed = 5
  game.setBest(0)
  const scene = new Scene()
  const renderer = new Renderer(initialData(), { to: (req) => sent.push(req) })
  renderer.init()
  const frames = (n) => {
    for (let i = 0; i < n; i++) {
      game.update(0.04, 1)
      scene.build(game)
      renderer.apply(scene)
    }
  }
  frames(60) // the loading screen
  assert.equal(game.state, TITLE)
  game.tap(100, 100)
  frames(80) // the countdown
  assert.equal(game.state, RACING)
  // Right, left, left, right: the last move goes back to the middle lane.
  for (const x of [380, 60, 60, 380]) {
    game.tap(x, 200)
    frames(10)
  }
  const lanes = sent.filter((r) => r.id === 'carg')
  assert.deepEqual(
    lanes.slice(-4).map((r) => r.toState.translateX),
    ['133px', '0px', '-133px', '0px'],
  )
  assert.equal(new Set(sent).size, sent.length, 'a request object was sent twice')
})
