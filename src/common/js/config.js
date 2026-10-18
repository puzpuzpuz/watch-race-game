// Build-time switches for the first game build.

// Shows the fps readout (frames per second and the longest frame of the last
// second) during the race, and the corner-radius guides on the title screen.
export const DEBUG = true

// How a moved sprite gets its new {left, top} style object:
//   'alternate'  two preallocated objects per sprite, used in turn (no garbage)
//   'fresh'      a new object every move
// Switch to 'fresh' if sprites stop moving on the watch: that would mean the
// framework doesn't see a change when an object it has seen before comes back.
export const STYLE_MODE = 'alternate'

// Shows each road frame once, hidden, on the loading screen, so the first
// race doesn't stutter while they load.
export const PRELOAD = true
