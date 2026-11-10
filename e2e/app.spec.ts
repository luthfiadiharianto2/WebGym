import { expect, test } from "@playwright/test";

test.describe("IronVision 3D — alur utama", () => {
  test("beranda memuat hero & navigasi", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Masuki gym");
    await expect(page.getByRole("link", { name: "Latihan" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Zona Kekuatan" })).toBeAttached();
  });

  test("library latihan: filter alat & halaman detail", async ({ page }) => {
    await page.goto("/exercises?equipment=kettlebell");
    const cards = page.getByTestId("exercise-card");
    await expect(cards.first()).toBeVisible();
    await expect(page.getByText("Kettlebell Swing")).toBeVisible();
    await page.goto("/exercises");
    expect(await cards.count()).toBeGreaterThanOrEqual(30);
    await page.getByText("Kettlebell Swing").click();
    await expect(page.getByRole("heading", { name: "Kettlebell Swing", level: 1 })).toBeVisible();
    await expect(page.getByText("Cue teknik")).toBeVisible();
  });

  test("ganti bahasa ke English", async ({ page }) => {
    await page.goto("/exercises");
    await page.locator("#lang-select").selectOption("en");
    await expect(page.getByRole("heading", { name: "Exercise Library" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("kurangi gerakan menambahkan kelas reduce-motion", async ({ page }) => {
    await page.goto("/exercises");
    await page.getByRole("button", { name: /Kurangi gerakan/ }).first().click();
    await expect(page.locator("html")).toHaveClass(/reduce-motion/);
  });

  test("onboarding profil → rencana latihan dengan alasan", async ({ page }) => {
    await page.goto("/profile");
    await page.locator("#p-name").fill("Tester");
    await page.locator("#p-days").fill("4");
    for (let i = 1; i <= 7; i++) await page.locator(`input[name="parq-q${i}"]`).nth(1).check();
    await page.getByText("Saya memahami bahwa IronVision").click();
    await page.getByTestId("save-profile").click();
    await expect(page.getByText("Profil tersimpan")).toBeVisible();
    await page.goto("/plan");
    await expect(page.getByTestId("plan-day")).toHaveCount(4);
    await page.getByText("Kenapa ini?").first().click();
    await expect(page.getByText(/cocok untuk tujuan/).first()).toBeVisible();
  });

  test("scan mode demo: hitung rep → simpan sesi → dashboard", async ({ page }) => {
    await page.goto("/scan");
    await page.getByTestId("demo-button").click();
    await page.getByTestId("start-set").click();
    await expect.poll(async () => Number(await page.getByTestId("rep-count").innerText()), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
    await page.getByTestId("end-set").click();
    await expect(page.getByText(/Ringkasan set/)).toBeVisible();
    await page.getByTestId("finish-session").click();
    await expect(page.getByText(/Sesi tersimpan/)).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Riwayat sesi" })).toBeVisible();
    await expect(page.locator("table").last()).toContainText("Squat");
  });

  test("izin kamera meminta persetujuan eksplisit dan menampilkan indikator", async ({ page }) => {
    await page.goto("/scan");
    await page.getByRole("button", { name: /Nyalakan kamera/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("TIDAK PERNAH diunggah");
    await dialog.getByRole("button", { name: /Saya setuju/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Kamera aktif" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Matikan kamera/ }).click();
    await expect(page.getByText("Kamera aktif")).toHaveCount(0);
  });

  test("hapus semua data meminta konfirmasi ketik", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("delete-all").click();
    const del = page.getByRole("button", { name: "Hapus", exact: true });
    await expect(del).toBeDisabled();
    await page.locator("#del-confirm").fill("HAPUS");
    await del.click();
    await expect(page.getByText("Semua data telah dihapus")).toBeVisible();
  });

  test("API LLM menolak input tidak valid / tanpa konfigurasi", async ({ request }) => {
    const res = await request.post("/api/recommendation/explain", { data: { foo: 1 } });
    expect([400, 503]).toContain(res.status());
  });
});
