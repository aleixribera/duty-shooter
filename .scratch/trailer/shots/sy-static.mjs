// Switchyard at dusk with nobody in it: down the rails, the yard from the west, and the freight train.
export default {
  map: 'switchyard',
  settle: 8,
  takes: [
    { name: 'lane', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smoother(t / 6);
        return c.handheld(c.shot(c.v.lerp([-36, 0.5, -12], [-29, 0.65, -12], k), [30, 2, -12], 30), t, 0.3);
      }` },
    { name: 'wide', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smoother(t / 6);
        return c.shot(c.v.lerp([-76, 8, 1], [-69, 14, 5], k), c.v.lerp([0, 2, 0], [4, 1, -2], k), 38);
      }` },
    // Low beside the main line's near track, over the barrier: the train comes in with its lamps lit and roars past.
    { name: 'train-low', warm: 1, seconds: 7,
      drive: `(t) => { duty.game.previewEnding = t >= -0.5 ? 0.5 + t : null; }`,
      camera: `(t, c) => {
        const head = 132 - 26 * (0.5 + t);
        const near = c.clamp(1 - Math.abs(head + 6) / 40);
        return c.handheld(c.shot([-6, 0.9, -29.4], [80, 2.4, -32.5], 30), t, 0.4 + near * 4);
      }` },
    // From the lever room: the train passes behind its windows.
    { name: 'lever-train', warm: 1, seconds: 7,
      drive: `(t) => { duty.game.previewEnding = t >= -0.5 ? 1.2 + t : null; }`,
      camera: `(t, c) => {
        const k = c.smooth(t / 7);
        return c.handheld(c.shot(c.v.lerp([23.2, 4.6, -9.6], [23.6, 4.6, -10.6], k), [23.0, 4.2, -30], 46), t, 0.35);
      }` },
  ],
};
