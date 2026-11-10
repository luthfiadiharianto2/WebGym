// Orkestrator per set: smoothing → metrik → rep counter → aturan form → metrik set.
import type { PoseFrame } from "./landmarks";
import { clamp, coefVar, mean } from "./math";
import { OneEuroFilter, LandmarkSmoother } from "./smoothing";
import { RepCounter, type RepPhase, type RepResult } from "./repCounter";
import type { FrameCtx, Severity, TrackingProfile } from "./profiles";

export interface RepMetrics extends RepResult {
  formScore: number;
  symmetry: number;
  issues: string[];
}

export interface TrackerState {
  reps: number;
  phase: RepPhase | "hold" | "out";
  progress: number;
  metricValue: number | null;
  formScoreLive: number;
  /** Status per indeks landmark: 0 hijau, 1 kuning, 2 merah. */
  jointStatus: Record<number, Severity>;
  /** Kunci i18n masalah form yang aktif saat ini. */
  activeIssues: string[];
  lastRep: RepMetrics | null;
  partialRep: boolean;
  holdSec: number;
}

export interface SetSummary {
  reps: number;
  formScore: number;
  romDeg: number;
  romPct: number;
  symmetry: number;
  tempoDownMs: number;
  tempoUpMs: number;
  consistency: number;
  holdSec: number;
  issues: string[];
  repDetails: RepMetrics[];
}

interface RepAccumulator {
  frames: number;
  violations: Record<string, number>;
  asymDiffs: number[];
}

export class ExerciseTracker {
  private smoother = new LandmarkSmoother();
  private metricFilter = new OneEuroFilter(1.5, 0.05);
  private counter: RepCounter;
  private acc: RepAccumulator = { frames: 0, violations: {}, asymDiffs: [] };
  private liveScore = 100;
  private repMetrics: RepMetrics[] = [];
  private lastPartial = false;
  private holdMs = 0;
  private lastT: number | null = null;
  private holdFrames = 0;
  private holdViolations: Record<string, number> = {};

  constructor(public readonly profile: TrackingProfile) {
    this.counter = new RepCounter(profile.counter);
  }

  process(raw: PoseFrame): TrackerState {
    const lm = this.smoother.smooth(raw.landmarks, raw.t);
    const frame: PoseFrame = { landmarks: lm, world: raw.world ?? null, t: raw.t };
    const dt = this.lastT === null ? 0 : Math.min(250, raw.t - this.lastT);
    this.lastT = raw.t;

    const metric = this.profile.metric(frame);
    if (!metric) {
      return this.state(null, "out", 0, {}, []);
    }
    const value = this.metricFilter.filter(metric.value, raw.t);
    const p = this.profile.hold ? 0 : this.counter.progress(value);
    const ctx: FrameCtx = { frame, lm, w: frame.world ?? lm, p };

    // Evaluasi aturan form yang relevan pada fase ini.
    const jointStatus: Record<number, Severity> = {};
    const activeIssues: string[] = [];
    let penalty = 0;
    for (const rule of this.profile.rules) {
      if (rule.minProgress !== undefined && !this.profile.hold && p < rule.minProgress) continue;
      const sev = rule.check(ctx);
      if (sev > 0) {
        activeIssues.push(rule.messageKey);
        penalty += (rule.weight * sev) / 2;
        for (const j of rule.joints) jointStatus[j] = Math.max(jointStatus[j] ?? 0, sev) as Severity;
      }
    }
    const frameScore = clamp(100 - penalty, 0, 100);
    this.liveScore = this.liveScore * 0.85 + frameScore * 0.15;

    // Mode tahan (plank).
    if (this.profile.hold) {
      const inPos = this.profile.hold.inPosition(ctx);
      if (inPos) {
        this.holdMs += dt;
        this.holdFrames += 1;
        for (const k of activeIssues) this.holdViolations[k] = (this.holdViolations[k] ?? 0) + 1;
      }
      return this.state(value, inPos ? "hold" : "out", 0, jointStatus, activeIssues);
    }

    // Akumulasi data rep yang sedang berjalan.
    if (this.counter.phase !== "rest") {
      this.acc.frames += 1;
      for (const k of activeIssues) this.acc.violations[k] = (this.acc.violations[k] ?? 0) + 1;
      if (metric.left !== null && metric.right !== null) this.acc.asymDiffs.push(Math.abs(metric.left - metric.right));
    }

    const ev = this.counter.update(value, raw.t);
    this.lastPartial = false;
    if (ev?.type === "rep") {
      this.repMetrics.push(this.finalizeRep(ev.rep));
    } else if (ev?.type === "partial") {
      this.lastPartial = true;
      this.resetAcc();
    }
    if (this.counter.phase === "rest" && ev === null && this.acc.frames > 0 && p < 0.05) {
      this.resetAcc();
    }
    return this.state(value, this.counter.phase, p, jointStatus, activeIssues);
  }

  private finalizeRep(rep: RepResult): RepMetrics {
    const frames = Math.max(1, this.acc.frames);
    let penalty = 0;
    const issues: string[] = [];
    for (const rule of this.profile.rules) {
      const frac = (this.acc.violations[rule.messageKey] ?? 0) / frames;
      if (frac > 0.15) {
        issues.push(rule.messageKey);
        penalty += rule.weight * Math.min(1, frac * 1.5);
      }
    }
    if (rep.romPct < 0.85) {
      penalty += (1 - rep.romPct) * 40;
      issues.push("form.shallow");
    }
    const symmetry = this.acc.asymDiffs.length ? clamp(100 - mean(this.acc.asymDiffs) * 3, 0, 100) : 100;
    this.resetAcc();
    return { ...rep, formScore: Math.round(clamp(100 - penalty, 0, 100)), symmetry: Math.round(symmetry), issues };
  }

  private resetAcc(): void {
    this.acc = { frames: 0, violations: {}, asymDiffs: [] };
  }

  private state(
    value: number | null,
    phase: TrackerState["phase"],
    p: number,
    jointStatus: Record<number, Severity>,
    activeIssues: string[],
  ): TrackerState {
    return {
      reps: this.counter.count,
      phase,
      progress: p,
      metricValue: value,
      formScoreLive: Math.round(this.liveScore),
      jointStatus,
      activeIssues,
      lastRep: this.repMetrics[this.repMetrics.length - 1] ?? null,
      partialRep: this.lastPartial,
      holdSec: Math.round(this.holdMs / 100) / 10,
    };
  }

  summary(): SetSummary {
    const reps = this.repMetrics;
    if (this.profile.hold) {
      const frames = Math.max(1, this.holdFrames);
      let penalty = 0;
      const issues: string[] = [];
      for (const rule of this.profile.rules) {
        const frac = (this.holdViolations[rule.messageKey] ?? 0) / frames;
        if (frac > 0.15) {
          issues.push(rule.messageKey);
          penalty += rule.weight * Math.min(1, frac * 1.5);
        }
      }
      return {
        reps: 0,
        formScore: this.holdFrames ? Math.round(clamp(100 - penalty, 0, 100)) : 0,
        romDeg: 0,
        romPct: 1,
        symmetry: 100,
        tempoDownMs: 0,
        tempoUpMs: 0,
        consistency: 100,
        holdSec: Math.round(this.holdMs / 1000),
        issues,
        repDetails: [],
      };
    }
    const durations = reps.map((r) => r.endT - r.startT);
    const roms = reps.map((r) => r.romDeg);
    const consistency = reps.length >= 2 ? clamp(100 - ((coefVar(durations) + coefVar(roms)) / 2) * 200, 0, 100) : 100;
    const issueCounts: Record<string, number> = {};
    for (const r of reps) for (const i of r.issues) issueCounts[i] = (issueCounts[i] ?? 0) + 1;
    const issues = Object.entries(issueCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    return {
      reps: reps.length,
      formScore: Math.round(mean(reps.map((r) => r.formScore))),
      romDeg: Math.round(mean(roms)),
      romPct: Math.round(mean(reps.map((r) => r.romPct)) * 100) / 100,
      symmetry: Math.round(mean(reps.map((r) => r.symmetry))),
      tempoDownMs: Math.round(mean(reps.map((r) => r.tempoDownMs))),
      tempoUpMs: Math.round(mean(reps.map((r) => r.tempoUpMs))),
      consistency: Math.round(consistency),
      holdSec: 0,
      issues,
      repDetails: reps,
    };
  }

  reset(): void {
    this.smoother.reset();
    this.metricFilter.reset();
    this.counter.reset();
    this.repMetrics = [];
    this.liveScore = 100;
    this.holdMs = 0;
    this.holdFrames = 0;
    this.holdViolations = {};
    this.lastT = null;
    this.resetAcc();
  }
}
