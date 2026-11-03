# When the graphics device is lost, the game freezes without a word

Status: resolved
Release: v2.114.6
Severity: S2
Found by: 35 (pass 2)

## Repro
Overload the GPU until its driver resets (pass 2 did it by accident with four Chromes on Zero Island, the Local bots worker page among them), or lose the WebGL context on the fallback.

Every page froze on its last frame. three.js's default `onDeviceLost` only logs `THREE.WebGPURenderer: WebGPU Device Lost` to the console, and the page kept its pointer lock, so a player sees a still picture and nothing to do.

## Comments
- Fix: the page sets `renderer.onDeviceLost` (`apps/range/src/main.ts`; three calls it on WebGPU device loss and on WebGL context loss). It keeps three's log, stops the frame loop, pauses the game, gives up the pointer, hides the lobby and Preparation pages, and puts up the error screen: "Graphics stopped. The graphics card stopped drawing the game: its driver reset, or it ran short of memory. Reload to carry on; in an online match you take your seat back." The only button is Reload, and Esc doesn't leave it. Reloading takes an online seat back through the seat token.
- Seen in the browser: headless Chrome has no way to lose its device on demand (`device.destroy()` is ignored by three on purpose, and `chrome://gpucrash` does nothing headless), so the hook was called as three's backend calls it. With the pointer locked, the lock is released, the notice stays up through Esc, and Reload reloads. `shots/bugs/t61/after-lost.jpg`.
- Test: `packages/fps-client/test/ui-model.test.ts` (the `gpu` error).
