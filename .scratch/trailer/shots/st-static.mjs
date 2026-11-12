// Survival Town with nobody in it: the opening, the mannequin, the sign, the siren, and the bomb.
export default {
  map: 'survival-town',
  settle: 8,
  takes: [
    { name: 'road', warm: 1, seconds: 7, camera: `(t, c) => {
        const k = c.smoother(t / 7);
        return c.handheld(c.shot(c.v.lerp([104, 1.15, -1.2], [84, 1.35, -1.6], k), [0, 5.5, -2], 24), t, 0.35);
      }` },
    { name: 'mannequin', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smooth(t / 6);
        return c.handheld(c.shot(c.v.lerp([5.0, 1.62, -26.0], [4.0, 1.66, -23.4], k), c.v.lerp([2.6, 1.45, -16], [3.1, 1.5, -16], k), 34), t, 0.3);
      }` },
    { name: 'window', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smooth(t / 6);
        return c.handheld(c.shot(c.v.lerp([3.0, 1.55, -11.8], [3.4, 1.6, -13.2], k), [3.6, 1.45, -21], 30), t, 0.3);
      }` },
    { name: 'sign', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smooth(t / 6);
        return c.handheld(c.shot(c.v.lerp([16.5, 1.35, -2.4], [14.2, 1.55, -3.2], k), [13, 1.85, -7.17], 30), t, 0.3);
      }` },
    { name: 'siren', warm: 1, seconds: 5, camera: `(t, c) => {
        const k = c.smooth(t / 5);
        return c.handheld(c.shot(c.v.lerp([-36, 1.2, 6], [-38, 1.3, 9], k), [-46, 19.5, 14], 34, -0.05), t, 0.4);
      }` },
    { name: 'crane', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smoother(t / 6);
        return c.shot(c.v.lerp([-16, 4, 26], [-10, 16, 20], k), c.v.lerp([0, 1.5, 0], [3, 1, -4], k), 40);
      }` },
    { name: 'nuke-wide', warm: 1, seconds: 8,
      drive: `(t) => { duty.game.previewEnding = t >= -0.5 ? 0.6 + t : null; }`,
      camera: `(t, c) => c.handheld(c.shot(c.v.lerp([-30, 6, 12], [-31, 6.3, 13], c.smooth(t / 8)), [420, 45 + t * 4, -160], 38), t, 0.4)` },
    { name: 'nuke-street', warm: 1, seconds: 7,
      drive: `(t) => { duty.game.previewEnding = t >= -0.5 ? 2.2 + t : null; }`,
      camera: `(t, c) => c.handheld(c.shot(c.v.lerp([-4, 1.5, 1.5], [-6, 1.5, 2.2], c.smooth(t / 7)), [420, 50 + t * 6, -160], 46), t, 0.7)` },
  ],
};
