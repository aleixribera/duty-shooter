# Sunlight jitters when the Ring is around

Status: open
Blocked by: 35

Owner report: "The sun gets messed up with the ring, its light jitters in a very ugly way."

Reproduce it first on video or frame sequences: stand inside, near and outside the Ring at several distances, looking toward and away from the sun, while still and while moving. Suspects to separate by measurement: the Ring wall casting or receiving shadows, the sun shadow camera snapping as it follows the player (±45 m box, texel snapping), the Ring's transparent pass sorting against the sky or the sun glow, the sun glare's occlusion test flickering through the wall's lattice, and tone mapping or exposure reacting to the wall's brightness. Fix the cause, not the symptom, without adding draw calls. Then capture the same sequences after, and compare with the Ring hidden to prove the jitter is gone.

## Comments
