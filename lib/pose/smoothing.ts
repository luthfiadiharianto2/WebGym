import type { Landmark } from "./landmarks";

/**
 * One Euro Filter (Casiez dkk., 2012): low-pass adaptif yang halus saat diam
 * namun tetap responsif saat gerakan cepat.
 */
export class OneEuroFilter {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.007,
    private dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const dx = (x - this.xPrev) / dt;
    const aD = this.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = this.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.tPrev = null;
    this.dxPrev = 0;
  }
}

/** Rata-rata bergerak sederhana dengan jendela tetap. */
export class MovingAverage {
  private buf: number[] = [];
  constructor(private size = 5) {}
  push(x: number): number {
    this.buf.push(x);
    if (this.buf.length > this.size) this.buf.shift();
    return this.buf.reduce((s, v) => s + v, 0) / this.buf.length;
  }
  reset(): void {
    this.buf = [];
  }
}

/** Menghaluskan seluruh landmark (x, y, z) dengan One Euro per koordinat. */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][] = [];
  constructor(
    private minCutoff = 1.2,
    private beta = 0.02,
  ) {}

  smooth(landmarks: Landmark[], tMs: number): Landmark[] {
    return landmarks.map((l, i) => {
      if (!this.filters[i]) {
        this.filters[i] = [0, 1, 2].map(() => new OneEuroFilter(this.minCutoff, this.beta));
      }
      const [fx, fy, fz] = this.filters[i];
      return {
        x: fx.filter(l.x, tMs),
        y: fy.filter(l.y, tMs),
        z: fz.filter(l.z ?? 0, tMs),
        visibility: l.visibility,
      };
    });
  }

  reset(): void {
    this.filters = [];
  }
}
