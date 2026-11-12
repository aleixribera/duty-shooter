// Station Nine at dawn with nobody in it: down the trench into the sun, and the station from above.
export default {
  map: 'station-nine',
  settle: 8,
  takes: [
    { name: 'trench', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smoother(t / 6);
        return c.handheld(c.shot(c.v.lerp([-12, 0.5, -19], [-8.5, 0.55, -19], k), [40, 2.5, -19.5], 36), t, 0.35);
      }` },
    { name: 'crane', warm: 1, seconds: 6, camera: `(t, c) => {
        const k = c.smoother(t / 6);
        return c.shot(c.v.lerp([-52, 10, 40], [-42, 19, 32], k), c.v.lerp([0, 1, -4], [4, 0, -8], k), 38);
      }` },
  ],
};
