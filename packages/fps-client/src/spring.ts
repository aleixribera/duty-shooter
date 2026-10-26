/**
 * A damped spring toward zero: kick its velocity and it springs back. Used
 * for every procedural layer (recoil kick, landing dip, camera shake).
 */
export class Spring {
  value = 0;
  velocity = 0;

  constructor(
    /** Stiffness (1/s²). */
    readonly stiffness: number,
    /** Damping (1/s). */
    readonly damping: number,
  ) {}

  /** Semi-implicit Euler in sub-steps, stable at any frame rate. */
  update(dt: number, target = 0): number {
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (-(this.value - target) * this.stiffness - this.velocity * this.damping) * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
}
