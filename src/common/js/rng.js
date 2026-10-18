// mulberry32: a small seeded generator, so any run can be replayed from the
// seed it started with.

export class Rng {
  constructor(seed) {
    this.s = seed >>> 0
  }

  seed(seed) {
    this.s = seed >>> 0
  }

  // A float in [0, 1).
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  // An integer in [lo, hi], both included.
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1))
  }
}
