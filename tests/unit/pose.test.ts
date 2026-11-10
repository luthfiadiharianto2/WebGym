import { describe, expect, it } from "vitest";
import { angle3, angleFromVertical, signedLineDeviation, tiltDeg } from "@/lib/pose/math";
import { OneEuroFilter, MovingAverage } from "@/lib/pose/smoothing";
import { RepCounter } from "@/lib/pose/repCounter";
import { ExerciseTracker } from "@/lib/pose/tracker";
import { PROFILES } from "@/lib/pose/profiles";
import {
  frontViewPose,
  makeSequence,
  pushupPose,
  seededNoise,
  sideViewPose,
  squatSequence,
  toImage,
} from "@/lib/pose/synthetic";
import { LM, type PoseFrame } from "@/lib/pose/landmarks";
import { assessQuality } from "@/lib/pose/quality";
import { analyzeFront, analyzeSide, estimateProportions, postureScore } from "@/lib/pose/posture";
import { scoreOverheadSquat, scoreShoulderReach, scoreToeTouch } from "@/lib/pose/mobility";

const p = (x: number, y: number, z = 0) => ({ x, y, z });

describe("matematika sudut", () => {
  it("menghitung sudut 90° dan 180°", () => {
    expect(angle3(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90, 5);
    expect(angle3(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180, 5);
    expect(angle3(p(1, 0, 1), p(0, 0, 0), p(1, 0, 0))).toBeCloseTo(45, 5);
  });
  it("sudut dari vertikal & kemiringan", () => {
    expect(angleFromVertical(p(0, 1), p(0, 0))).toBeCloseTo(0, 5);
    expect(angleFromVertical(p(0, 1), p(1, 0))).toBeCloseTo(45, 5);
    expect(tiltDeg(p(0, 0), p(1, 0))).toBeCloseTo(0, 5);
    expect(tiltDeg(p(0, 0), p(1, Math.tan((5 * Math.PI) / 180)))).toBeCloseTo(5, 3);
  });
  it("deviasi garis bertanda", () => {
    expect(signedLineDeviation(p(0, 0), p(0.5, 0.1), p(1, 0))).toBeCloseTo(0.1, 5);
    expect(signedLineDeviation(p(0, 0), p(0.5, -0.1), p(1, 0))).toBeCloseTo(-0.1, 5);
  });
  it("pose sintetis menghasilkan sudut lutut yang diminta", () => {
    const lm = sideViewPose({ knee: 100 });
    expect(angle3(lm[LM.LEFT_HIP], lm[LM.LEFT_KNEE], lm[LM.LEFT_ANKLE])).toBeCloseTo(100, 0);
    const e = sideViewPose({ elbow: 60 });
    expect(angle3(e[LM.LEFT_SHOULDER], e[LM.LEFT_ELBOW], e[LM.LEFT_WRIST])).toBeCloseTo(60, 0);
  });
});

describe("smoothing", () => {
  it("One Euro mengurangi varians noise pada sinyal diam", () => {
    const f = new OneEuroFilter(1, 0.01);
    const rnd = seededNoise(1);
    const raw: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 200; i++) {
      const x = 100 + rnd() * 10;
      raw.push(x);
      out.push(f.filter(x, i * 33));
    }
    const variance = (xs: number[]) => {
      const m = xs.reduce((s, v) => s + v, 0) / xs.length;
      return xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length;
    };
    expect(variance(out.slice(20))).toBeLessThan(variance(raw.slice(20)) / 3);
  });
  it("moving average", () => {
    const m = new MovingAverage(3);
    m.push(3);
    m.push(6);
    expect(m.push(9)).toBe(6);
    expect(m.push(12)).toBe(9);
  });
});

describe("RepCounter (state machine + hysteresis)", () => {
  const cfg = { rest: 165, peak: 105, target: 85 };

  it("menghitung rep lengkap dan tempo", () => {
    const c = new RepCounter(cfg);
    let t = 0;
    const feed = (v: number) => c.update(v, (t += 33));
    for (let i = 0; i < 10; i++) feed(170);
    for (let v = 170; v >= 90; v -= 2.5) feed(v);
    for (let v = 90; v <= 170; v += 2.5) feed(v);
    expect(c.count).toBe(1);
    const rep = c.reps[0];
    expect(rep.tempoDownMs).toBeGreaterThan(800);
    expect(rep.tempoUpMs).toBeGreaterThan(800);
    expect(rep.romPct).toBeGreaterThan(0.9);
  });

  it("jitter di sekitar ambang istirahat tidak menghitung rep", () => {
    const c = new RepCounter(cfg);
    for (let i = 0; i < 300; i++) c.update(i % 2 ? 150 : 168, i * 33);
    expect(c.count).toBe(0);
  });

  it("jitter di dasar gerakan tidak menyebabkan hitungan ganda", () => {
    const c = new RepCounter(cfg);
    let t = 0;
    const feed = (v: number) => c.update(v, (t += 33));
    for (let v = 170; v >= 100; v -= 3) feed(v);
    for (let i = 0; i < 40; i++) feed(i % 2 ? 98 : 112); // memantul di sekitar ambang puncak
    for (let v = 100; v <= 170; v += 3) feed(v);
    expect(c.count).toBe(1);
  });

  it("rep parsial dilaporkan tetapi tidak dihitung", () => {
    const c = new RepCounter(cfg);
    let t = 0;
    let partial = 0;
    const feed = (v: number) => {
      const ev = c.update(v, (t += 33));
      if (ev?.type === "partial") partial++;
    };
    for (let r = 0; r < 3; r++) {
      for (let v = 170; v >= 130; v -= 2) feed(v);
      for (let v = 130; v <= 170; v += 2) feed(v);
    }
    expect(c.count).toBe(0);
    expect(partial).toBe(3);
  });

  it("arah naik (overhead press) juga didukung", () => {
    const c = new RepCounter({ rest: 95, peak: 150, target: 170 });
    let t = 0;
    for (let v = 90; v <= 172; v += 2) c.update(v, (t += 33));
    for (let v = 172; v >= 90; v -= 2) c.update(v, (t += 33));
    expect(c.count).toBe(1);
  });
});

describe("ExerciseTracker dengan landmark sintetis", () => {
  it("menghitung 5 squat ber-noise dengan form baik", () => {
    const tr = new ExerciseTracker(PROFILES.squat);
    for (const f of squatSequence({ reps: 5, noise: 0.004 })) tr.process(f);
    const s = tr.summary();
    expect(s.reps).toBe(5);
    expect(s.formScore).toBeGreaterThanOrEqual(85);
    expect(s.symmetry).toBeGreaterThanOrEqual(90);
    expect(s.consistency).toBeGreaterThanOrEqual(80);
    expect(s.tempoDownMs).toBeGreaterThan(500);
  });

  it("squat dangkal tidak dihitung", () => {
    const tr = new ExerciseTracker(PROFILES.squat);
    let partial = 0;
    for (const f of squatSequence({ reps: 4, minKnee: 135 })) if (tr.process(f).partialRep) partial++;
    expect(tr.summary().reps).toBe(0);
    expect(partial).toBe(4);
  });

  it("mendeteksi lutut masuk ke dalam (valgus) dari tampak depan", () => {
    const tr = new ExerciseTracker(PROFILES.squat);
    // world: sudut 3D dari tampak samping; landmarks gambar: tampak depan dengan lutut masuk.
    const frames: PoseFrame[] = [];
    let t = 0;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i <= 60; i++) {
        const s = (1 - Math.cos((i / 60) * 2 * Math.PI)) / 2;
        const world = sideViewPose({ knee: 172 - 87 * s });
        frames.push({ world, landmarks: toImage(frontViewPose({ kneeRatio: 1 - 0.5 * s })), t: (t += 33) });
      }
      for (let i = 0; i < 15; i++) {
        frames.push({ world: sideViewPose({ knee: 172 }), landmarks: toImage(frontViewPose()), t: (t += 33) });
      }
    }
    let sawValgus = false;
    for (const f of frames) {
      const st = tr.process(f);
      if (st.activeIssues.includes("form.knee_valgus")) {
        sawValgus = true;
        expect(st.jointStatus[LM.LEFT_KNEE]).toBeGreaterThan(0);
      }
    }
    const s = tr.summary();
    expect(sawValgus).toBe(true);
    expect(s.reps).toBe(3);
    expect(s.issues).toContain("form.knee_valgus");
    expect(s.formScore).toBeLessThan(90);
  });

  it("menghitung push-up dan mendeteksi pinggul turun", () => {
    const good = new ExerciseTracker(PROFILES.pushup);
    for (const f of makeSequence((s) => pushupPose(165 - 85 * s, 0), { reps: 4 })) good.process(f);
    expect(good.summary().reps).toBe(4);
    expect(good.summary().issues).not.toContain("form.hip_sag");

    const bad = new ExerciseTracker(PROFILES.pushup);
    for (const f of makeSequence((s) => pushupPose(165 - 85 * s, 0.2), { reps: 4 })) bad.process(f);
    const sb = bad.summary();
    expect(sb.reps).toBe(4);
    expect(sb.issues).toContain("form.hip_sag");
    expect(sb.formScore).toBeLessThan(good.summary().formScore);
  });

  it("menghitung bicep curl", () => {
    const tr = new ExerciseTracker(PROFILES.curl);
    for (const f of makeSequence((s) => sideViewPose({ elbow: 170 - 130 * s }), { reps: 6, repSec: 1.6 })) tr.process(f);
    expect(tr.summary().reps).toBe(6);
  });

  it("plank menghitung durasi tahan", () => {
    const tr = new ExerciseTracker(PROFILES.plank);
    let t = 0;
    for (let i = 0; i < 150; i++) {
      const w = pushupPose(170, 0);
      tr.process({ landmarks: toImage(w), world: w, t: (t += 33) });
    }
    const s = tr.summary();
    expect(s.holdSec).toBeGreaterThanOrEqual(4);
    expect(s.formScore).toBeGreaterThan(80);
  });
});

describe("kualitas frame", () => {
  it("tubuh utuh lolos", () => {
    expect(assessQuality(toImage(sideViewPose())).ok).toBe(true);
  });
  it("tanpa orang / landmark tak terlihat / terlalu jauh", () => {
    expect(assessQuality(null).issues).toContain("no_person");
    const lm = toImage(sideViewPose());
    lm[LM.LEFT_ANKLE].visibility = 0.1;
    expect(assessQuality(lm).issues).toContain("not_full_body");
    expect(assessQuality(toImage(sideViewPose(), { scale: 0.15 })).issues).toContain("too_far");
    expect(assessQuality(toImage(sideViewPose()), { brightness: 0.1 }).issues).toContain("low_light");
  });
});

describe("postur & proporsi", () => {
  it("mendeteksi kemiringan bahu dan menurunkan skor", () => {
    const level = analyzeFront(toImage(frontViewPose()));
    const tilted = analyzeFront(toImage(frontViewPose({ shoulderTiltDeg: 6 })));
    expect(Math.abs(level.shoulderTiltDeg)).toBeLessThan(0.5);
    expect(Math.abs(tilted.shoulderTiltDeg)).toBeGreaterThan(4);
    expect(postureScore(tilted, null)).toBeLessThan(postureScore(level, null));
  });
  it("mendeteksi forward head dari tampak samping", () => {
    const normal = analyzeSide(toImage(sideViewPose()));
    const forward = analyzeSide(toImage(sideViewPose({ headForward: 0.12 })));
    expect(forward.forwardHeadRatio).toBeGreaterThan(normal.forwardHeadRatio + 0.15);
  });
  it("proporsi dari landmark dan dari mask segmentasi", () => {
    const lm = toImage(frontViewPose({ shoulderHalfWidth: 0.2, hipHalfWidth: 0.15 }));
    const byLandmarks = estimateProportions(lm);
    expect(byLandmarks.method).toBe("landmarks");
    expect(byLandmarks.shoulderToHip).toBeCloseTo(1.33, 1);
    // Mask buatan: siluet berbentuk jam pasir.
    const W = 200, H = 200;
    const data = new Float32Array(W * H);
    const shY = lm[LM.LEFT_SHOULDER].y, hipY = lm[LM.LEFT_HIP].y;
    for (let y = 0; y < H; y++) {
      const yn = y / (H - 1);
      const t = (yn - shY) / (hipY - shY);
      let half = 0;
      if (t >= 0 && t < 0.4) half = 36;
      else if (t >= 0.4 && t < 0.9) half = 26;
      else if (t >= 0.9 && t < 1.4) half = 32;
      for (let x = 100 - half; x < 100 + half; x++) data[y * W + x] = 1;
    }
    const seg = estimateProportions(lm, { width: W, height: H, data });
    expect(seg.method).toBe("segmentation");
    expect(seg.waistToHip!).toBeLessThan(0.9);
    expect(seg.shoulderToWaist!).toBeGreaterThan(1.2);
  });
});

describe("tes mobilitas", () => {
  it("overhead squat dalam mendapat skor lebih tinggi", () => {
    const deep = scoreOverheadSquat([toImage(sideViewPose({ knee: 85, torsoLean: 25, shoulderFlex: 170, elbow: 178 }))]);
    const shallow = scoreOverheadSquat([toImage(sideViewPose({ knee: 140, torsoLean: 50, shoulderFlex: 120, elbow: 178 }))]);
    expect(deep.score).toBeGreaterThan(shallow.score + 30);
  });
  it("shoulder reach & toe touch", () => {
    expect(scoreShoulderReach([toImage(sideViewPose({ shoulderFlex: 170 }))]).score).toBeGreaterThan(85);
    expect(scoreShoulderReach([toImage(sideViewPose({ shoulderFlex: 110 }))]).score).toBe(0);
    const reach = scoreToeTouch([toImage(sideViewPose({ torsoLean: 120, shoulderFlex: 10 }))]);
    const stiff = scoreToeTouch([toImage(sideViewPose({ torsoLean: 30 }))]);
    expect(reach.score).toBeGreaterThan(stiff.score);
  });
});
