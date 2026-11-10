import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Halaman diperiksa dengan axe-core (WCAG 2.1 A/AA). Kanvas WebGL dikecualikan (konten visual murni,
// alternatif teksnya ada di aria-label wadah).
const PAGES = ["/", "/exercises", "/exercises/back_squat", "/scan", "/dashboard", "/plan", "/profile", "/login"];

for (const path of PAGES) {
  test(`aksesibilitas tanpa pelanggaran serius: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("canvas").analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
}

test("avatar 3D bisa diputar dengan keyboard", async ({ page }) => {
  await page.goto("/exercises/back_squat");
  const viewer = page.getByTestId("avatar-viewer");
  await viewer.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(viewer).toHaveAttribute("data-yaw", "30");
  await page.keyboard.press("Home");
  await expect(viewer).toHaveAttribute("data-yaw", "0");
  await page.getByRole("button", { name: "Putar kiri" }).click();
  await expect(viewer).toHaveAttribute("data-yaw", "-15");
});

test("MediaPipe Pose berjalan di Web Worker dengan kamera (palsu)", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scan");
  await page.getByRole("button", { name: /Nyalakan kamera/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Saya setuju/ }).click();
  // Model diunduh & diinisialisasi; label runtime menunjukkan worker + delegate.
  const runtime = page.getByText(/Web Worker · (GPU|CPU)|Main thread · (GPU|CPU)/);
  await expect(runtime).toBeVisible({ timeout: 90_000 });
  const label = await runtime.innerText();
  // FPS loop inferensi (kamera palsu tanpa orang → kualitas "tidak ada orang", tapi loop tetap berjalan).
  await expect.poll(async () => Number((await page.getByText(/\d+ FPS/).innerText()).replace(/\D/g, "")), { timeout: 20_000 }).toBeGreaterThan(3);
  const fps = Number((await page.getByText(/\d+ FPS/).innerText()).replace(/\D/g, ""));
  await expect(page.getByText(/Tidak ada orang terdeteksi/)).toBeVisible();
  console.log(`[inferensi] runtime="${label}" fps=${fps}`);
  expect(errors).toEqual([]);
});
