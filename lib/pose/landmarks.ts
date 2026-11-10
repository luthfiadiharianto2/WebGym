// Indeks 33 landmark MediaPipe Pose + koneksi kerangka untuk overlay.

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface PoseFrame {
  /** Landmark gambar ternormalisasi, sudah dikoreksi aspek (x * width/height). y mengarah ke bawah. */
  landmarks: Landmark[];
  /** Landmark dunia (meter, origin di tengah pinggul) bila tersedia. */
  world?: Landmark[] | null;
  /** Timestamp ms. */
  t: number;
}

export const LM = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT: 31,
  RIGHT_FOOT: 32,
} as const;

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
  [0, 7], [0, 8], [15, 19], [16, 20],
];

/** Landmark tubuh utama yang harus terlihat agar analisis seluruh tubuh valid. */
export const FULL_BODY_LANDMARKS = [0, 11, 12, 23, 24, 25, 26, 27, 28];

export function vis(l: Landmark | undefined): number {
  return l?.visibility ?? 1;
}
