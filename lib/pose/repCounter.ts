// State machine penghitung repetisi berbasis sudut sendi dengan hysteresis.
//
// Nilai metrik (mis. sudut lutut) dinormalisasi menjadi "progres" p:
//   p = 0  → posisi istirahat (mis. berdiri tegak, lutut 165°)
//   p = 1  → posisi puncak gerakan (mis. dasar squat, lutut 100°)
// Ambang masuk/keluar tiap state dibuat berbeda (hysteresis) sehingga jitter di
// sekitar satu ambang tidak menghasilkan hitungan ganda.

export type RepPhase = "rest" | "eccentric" | "peak" | "concentric";

export interface RepCounterConfig {
  /** Nilai metrik pada posisi istirahat. */
  rest: number;
  /** Nilai metrik yang harus dicapai agar rep dihitung. */
  peak: number;
  /** Nilai ideal (lebih dalam dari `peak`) untuk skor range of motion. */
  target?: number;
  /** Durasi rep minimum (ms) — mencegah noise terhitung sebagai rep. */
  minRepMs?: number;
  /** Progres untuk meninggalkan state rest. */
  leaveRest?: number;
  /** Progres untuk kembali dianggap rest. */
  enterRest?: number;
  /** Progres untuk meninggalkan state peak. */
  leavePeak?: number;
  /** Progres minimal agar gerakan dianggap "rep parsial". */
  partialMin?: number;
}

export interface RepResult {
  index: number;
  startT: number;
  bottomT: number;
  endT: number;
  tempoDownMs: number;
  tempoUpMs: number;
  /** Nilai metrik ekstrem yang dicapai. */
  extremeValue: number;
  romDeg: number;
  /** 0..1 terhadap target. */
  romPct: number;
}

export type RepEvent =
  | { type: "rep"; rep: RepResult }
  | { type: "partial"; maxProgress: number };

export class RepCounter {
  phase: RepPhase = "rest";
  count = 0;
  reps: RepResult[] = [];

  private cfg: Required<RepCounterConfig>;
  private startT = 0;
  private startValue = 0;
  private extremeP = 0;
  private extremeValue = 0;
  private extremeT = 0;
  private lastRepEnd = -Infinity;
  private lastValue = 0;

  constructor(cfg: RepCounterConfig) {
    this.cfg = {
      target: cfg.peak,
      minRepMs: 400,
      leaveRest: 0.15,
      enterRest: 0.1,
      leavePeak: 0.85,
      partialMin: 0.4,
      ...cfg,
    };
  }

  /** Progres ternormalisasi untuk sebuah nilai metrik. */
  progress(value: number): number {
    const { rest, peak } = this.cfg;
    return (value - rest) / (peak - rest);
  }

  update(value: number, t: number): RepEvent | null {
    const p = this.progress(value);
    this.lastValue = value;
    switch (this.phase) {
      case "rest":
        if (p > this.cfg.leaveRest) {
          this.phase = "eccentric";
          this.startT = t;
          this.startValue = this.cfg.rest;
          this.extremeP = p;
          this.extremeValue = value;
          this.extremeT = t;
        }
        return null;
      case "eccentric":
        this.trackExtreme(p, value, t);
        if (p >= 1) {
          this.phase = "peak";
        } else if (p < this.cfg.enterRest) {
          this.phase = "rest";
          if (this.extremeP >= this.cfg.partialMin) {
            return { type: "partial", maxProgress: this.extremeP };
          }
        }
        return null;
      case "peak":
        this.trackExtreme(p, value, t);
        if (p < this.cfg.leavePeak) this.phase = "concentric";
        return null;
      case "concentric":
        this.trackExtreme(p, value, t);
        if (p >= 1) {
          this.phase = "peak";
          return null;
        }
        if (p <= this.cfg.enterRest) {
          this.phase = "rest";
          if (t - this.startT < this.cfg.minRepMs || t - this.lastRepEnd < this.cfg.minRepMs / 2) {
            return null;
          }
          return { type: "rep", rep: this.completeRep(t) };
        }
        return null;
    }
  }

  private trackExtreme(p: number, value: number, t: number): void {
    if (p > this.extremeP) {
      this.extremeP = p;
      this.extremeValue = value;
      this.extremeT = t;
    }
  }

  private completeRep(t: number): RepResult {
    this.count += 1;
    this.lastRepEnd = t;
    const { target, rest } = this.cfg;
    const romDeg = Math.abs(this.extremeValue - this.startValue);
    const romPct = Math.min(1, Math.abs(this.extremeValue - rest) / Math.max(1e-6, Math.abs(target - rest)));
    const rep: RepResult = {
      index: this.count,
      startT: this.startT,
      bottomT: this.extremeT,
      endT: t,
      tempoDownMs: this.extremeT - this.startT,
      tempoUpMs: t - this.extremeT,
      extremeValue: this.extremeValue,
      romDeg,
      romPct,
    };
    this.reps.push(rep);
    return rep;
  }

  get currentProgress(): number {
    return this.progress(this.lastValue);
  }

  reset(): void {
    this.phase = "rest";
    this.count = 0;
    this.reps = [];
    this.extremeP = 0;
    this.lastRepEnd = -Infinity;
  }
}
