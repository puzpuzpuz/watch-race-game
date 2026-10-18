// Road projection, shared with tools/road.py and tools/sprites.py. The tools
// read the plain `export const NAME = <number or [numbers]>` lines below, so
// keep those lines literal. Change the camera here, then rerun
// `npm run assets` so the pre-drawn road frames match.

export const W = 432
export const H = 514
export const HORIZON = 190
export const SEG = 200 // world units per segment, counted as 5 m
export const ROAD_HALF = 1000 // the road is 2,000 units wide
export const LANE_W = 667 // lane centres at -667, 0 and +667
export const CAM_H = 1050 // tuned so the road is 400 px wide at y 440
export const FOV_DEG = 100
export const Z_NEAR = 600 // camera to the near plane (d = 0), world units
export const DRAW = 60 // draw distance, segments
export const LEVELS = [-6, -4, -2, 0, 2, 4, 6] // curve value per level, hard left to hard right
export const STRAIGHT = 3 // index of the straight level
export const PHASES = 6 // the band pattern repeats every 6 segments
export const BAND = 3 // segments per light or dark band
export const PALM_X = 1600 // palms stand 1.6 road half-widths from the centre
export const PALM_H = 1150 // palm height, world units: below the horizon at any distance
export const CAR_Y = 440 // the car's rear bumper on screen
export const LANE_PX = 133 // lane centres on screen at the car's row: x 83, 216, 349

export const DEPTH = 1 / Math.tan(((FOV_DEG / 2) * Math.PI) / 180)

// A road point d segments past the near plane (d may be fractional) and worldX
// units from the centre line, on a road bent by curve value c. Fills `out`
// with its screen position and k, screen pixels per world unit there.
export function project(d, worldX, c, out) {
  const s = DEPTH / (Z_NEAR + d * SEG)
  out.k = (s * W) / 2
  out.x = W / 2 + ((c * d * (d - 1)) / 2 + worldX) * out.k
  out.y = HORIZON + (s * CAM_H * H) / 2
}

// The distance at which the road reaches screen row y.
export function distAtY(y) {
  const s = (y - HORIZON) / ((CAM_H * H) / 2)
  return (DEPTH / s - Z_NEAR) / SEG
}

// The car's rear bumper, in segments past the near plane (about 1.53).
export const CAR_D = distAtY(CAR_Y)
