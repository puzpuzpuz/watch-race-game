// Written by tools/sprites.py: picture sizes the game needs to place
// pictures, which are never resized at run time. Road objects list their
// width in world units and their pixel size at every size step, step 0
// the largest, each 0.75x the last.

export const SIZE_STEP = 0.75

export const ART = {
  objects: {
    "block": {"world": 600, "frames": 1, "sizes": [[160, 96], [120, 72], [90, 54], [68, 41], [51, 30], [38, 23], [28, 17], [21, 13], [16, 10], [12, 7], [9, 5], [7, 4]]},
    "gas": {"world": 300, "frames": 2, "sizes": [[80, 80], [60, 60], [45, 45], [34, 34], [25, 25], [19, 19], [14, 14], [11, 11], [8, 8], [6, 6], [5, 5], [3, 3]]},
    "repair": {"world": 300, "frames": 2, "sizes": [[80, 80], [60, 60], [45, 45], [34, 34], [25, 25], [19, 19], [14, 14], [11, 11], [8, 8], [6, 6], [5, 5], [3, 3]]},
    "rivals": {"world": 640, "frames": 6, "sizes": [[128, 80], [96, 60], [72, 45], [54, 34], [41, 25], [30, 19], [23, 14], [17, 11], [13, 8], [10, 6], [7, 5], [5, 3]]},
    "debris": {"world": 360, "frames": 2, "sizes": [[96, 64], [72, 48], [54, 36], [41, 27], [30, 20], [23, 15], [17, 11], [13, 9], [10, 6], [7, 5], [5, 4], [4, 3]]},
    "billboard": {"world": 1150, "frames": 1, "sizes": [[192, 144], [144, 108], [108, 81], [81, 61], [61, 46], [46, 34], [34, 26], [26, 19], [19, 14], [14, 11], [11, 8], [8, 6]]},
    "lifeguard": {"world": 770, "frames": 1, "sizes": [[128, 144], [96, 108], [72, 81], [54, 61], [41, 46], [30, 34], [23, 26], [17, 19], [13, 14], [10, 11], [7, 8], [5, 6]]},
    "banner": {"world": 2300, "frames": 1, "sizes": [[432, 264], [324, 198], [243, 149]]}
  },
  words: {
    "score": [63, 18],
    "best": [51, 18],
    "newbest": [99, 18],
    "paused": [75, 18],
    "taptostart": [147, 18],
    "taptogo": [111, 18],
    "km": [27, 18],
    "kmh": [51, 18],
    "gas": [51, 18],
    "life": [63, 18],
    "p100": [51, 18],
    "p1000": [63, 18],
    "distance": [99, 18]
  },
  headlines: {
    "3": [30, 46],
    "2": [30, 46],
    "1": [30, 46],
    "go": [86, 46],
    "wrecked": [206, 46],
    "outofgas": [282, 46]
  },
  cityPeriod: 864,
  cityWidth: 1296,
  logo: [360, 120]
}
