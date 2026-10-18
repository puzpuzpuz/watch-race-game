// Shared test helpers: runs the track generator far ahead and records every
// object it places, with the curve value of every segment.

import { BANNER, POOL, Track } from '../src/common/js/track.js'

export function generate(seed, segments) {
  const track = new Track()
  const objects = []
  const spawn = track.spawn.bind(track)
  track.spawn = (kind, p, lane, x, frame) => {
    if (kind !== BANNER) objects.push({ kind, p, lane, x, frame })
    return spawn(kind, p, lane, x, frame)
  }
  track.reset(seed)
  const curve = new Float32Array(segments)
  let read = 0
  for (let seg = 0; seg < segments; seg += 10) {
    // Objects the car has passed go back to the pool, as in a race.
    for (let i = 0; i < POOL; i++) if (track.state[i] && track.pos[i] < seg - 5) track.state[i] = 0
    track.ensure(seg)
    // Read new curves before the ring overwrites them.
    while (read < segments && read < track.end) curve[read] = track.curveAt(read++)
  }
  return { objects, curve, track }
}

export const SEEDS = [1, 2, 3, 7, 42, 1234, 99999, 20261017, 0xdeadbeef]
