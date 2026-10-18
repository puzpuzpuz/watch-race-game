// The game loop and the glue between the page and the game: a setTimeout
// chain aiming at 40 ms frames (the watch has no requestAnimationFrame), taps,
// pausing, the best score in storage, and keep-screen-on during a race. The
// page and the desktop harness both drive the game through this.
//
// host: {
//   vm            the page, or the harness's stand-in
//   folme         @system.folme, or null
//   loadBest(cb)  calls cb(string or null) with the saved best score
//   saveBest(s)   saves it, as a string: the score, then the best run's
//                 distance in tenths of a km ('32320 81'). Older saves have
//                 the score alone.
//   keepScreenOn(on)
// }

import { DEBUG } from './config.js'
import { COUNTDOWN, CRASHING, Game, LOAD } from './game.js'
import { Renderer } from './renderer.js'
import { Scene } from './scene.js'

const FRAME_MS = 40 // 25 fps
const IDLE_MS = 100 // menus and pause
const MAX_DT = 0.1 // after a stall, logic advances at most this much

export class Runner {
  constructor(host) {
    this.host = host
    this.game = new Game()
    this.scene = new Scene()
    this.renderer = new Renderer(host.vm, host.folme)
    this.tickFn = this.tick.bind(this)
    this.timer = 0
    this.running = false
    this.last = 0
    this.screenOn = false
    // fps readout: frames and the longest frame over the last second.
    this.frames = 0
    this.worst = 0
    this.prevFrame = 0
    this.statAt = 0
  }

  start() {
    this.renderer.init()
    this.host.loadBest((value) => {
      const parts = String(value || '').split(' ')
      const tenths = parseInt(parts[1], 10)
      this.game.setBest(parseInt(parts[0], 10) || 0, tenths >= 0 ? tenths : -1)
    })
    this.resume()
  }

  resume() {
    if (this.running) return
    this.running = true
    this.last = Date.now()
    this.prevFrame = 0
    this.timer = setTimeout(this.tickFn, 1)
  }

  halt() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = 0
  }

  // The app went to the background or the screen turned off: pause the run,
  // draw the pause overlay once, and stop the loop until the app is back.
  hide() {
    this.game.pause()
    this.scene.build(this.game)
    this.renderer.apply(this.scene)
    this.halt()
    this.keepScreenOn(false)
  }

  show() {
    this.resume()
  }

  destroy() {
    this.halt()
    this.keepScreenOn(false)
  }

  touch(x, y) {
    this.game.tap(x, y)
  }

  tick() {
    this.timer = 0
    if (!this.running) return
    const now = Date.now()
    const dt = Math.min(MAX_DT, (now - this.last) / 1000)
    this.last = now
    const game = this.game
    game.update(dt, now)
    this.scene.build(game)
    this.renderer.apply(this.scene)

    if (game.bestDirty) this.saveBest()
    const racing = !game.paused && game.state >= COUNTDOWN && game.state <= CRASHING
    this.keepScreenOn(racing)
    if (DEBUG) this.stats(now, racing)

    const fast = racing || game.state === LOAD
    const spent = Date.now() - now
    this.timer = setTimeout(this.tickFn, Math.max(1, (fast ? FRAME_MS : IDLE_MS) - spent))
  }

  // Once per run that sets a new best.
  saveBest() {
    const game = this.game
    game.bestDirty = false
    this.host.saveBest(game.best + ' ' + game.bestTenths)
  }

  keepScreenOn(on) {
    if (on === this.screenOn) return
    this.screenOn = on
    this.host.keepScreenOn(on)
  }

  // Once a second during a race: frames per second and the longest frame,
  // where a garbage collection shows as a spike.
  stats(now, racing) {
    if (!racing) {
      this.prevFrame = 0
      return
    }
    if (this.prevFrame) {
      this.frames++
      if (now - this.prevFrame > this.worst) this.worst = now - this.prevFrame
    } else {
      this.statAt = now
      this.frames = 0
      this.worst = 0
    }
    this.prevFrame = now
    if (now - this.statAt >= 1000) {
      const fps = Math.round((this.frames * 10000) / (now - this.statAt)) / 10
      this.host.vm.fpsText = fps + ' fps · max ' + this.worst + ' ms'
      this.statAt = now
      this.frames = 0
      this.worst = 0
    }
  }
}
