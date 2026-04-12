import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __globeDebug?: {
      getCameraPosition: () => Vec3;
      getCameraDistance: () => number;
      getStationScreenPosition: () => { x: number; y: number };
      isAnimating: () => boolean;
    };
    __globeTestAnimationMs?: number;
  }
}

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

test("globe remains draggable before selection and after deselection", async ({ page }) => {
  await page.addInitScript(() => {
    window.__globeTestAnimationMs = 80;
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
  await page.waitForFunction(() => Boolean(window.__globeDebug));

  const initial = await cameraPosition(page);
  await dragGlobe(page, { fromX: 720, fromY: 450, toX: 420, toY: 450 });
  const afterUnselectedDrag = await cameraPosition(page);

  expect(distance(initial, afterUnselectedDrag)).toBeGreaterThan(0.4);
  await expect(page.getByText("Bengaluru Ground Station")).toHaveCount(0);

  const station = await page.evaluate(() => window.__globeDebug!.getStationScreenPosition());
  await page.mouse.click(station.x, station.y);
  await expect.poll(() => page.getByText("Bengaluru Ground Station").count()).toBeGreaterThan(0);
  await waitForCameraIdle(page);
  expect(await cameraDistance(page)).toBeLessThan(4.5);

  const selectedDirection = normalize(await cameraPosition(page));
  await page.getByLabel("Close").click();
  await expect(page.getByText("Bengaluru Ground Station")).toHaveCount(0);
  await waitForCameraIdle(page);
  expect(await cameraDistance(page)).toBeGreaterThan(6.3);
  expect(dot(selectedDirection, normalize(await cameraPosition(page)))).toBeGreaterThan(0.99);

  const afterReset = await cameraPosition(page);
  await dragGlobe(page, { fromX: 720, fromY: 450, toX: 420, toY: 450 });
  const afterDeselectedDrag = await cameraPosition(page);

  expect(distance(afterReset, afterDeselectedDrag)).toBeGreaterThan(0.4);
  await expect(page.getByText("Bengaluru Ground Station")).toHaveCount(0);
});

async function dragGlobe(
  page: Page,
  drag: { fromX: number; fromY: number; toX: number; toY: number },
) {
  await page.mouse.move(drag.fromX, drag.fromY);
  await page.mouse.down();
  await page.mouse.move(drag.toX, drag.toY, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(() => new Promise(requestAnimationFrame));
}

async function cameraPosition(page: Page) {
  return page.evaluate(() => window.__globeDebug!.getCameraPosition());
}

async function cameraDistance(page: Page) {
  return page.evaluate(() => window.__globeDebug!.getCameraDistance());
}

async function waitForCameraIdle(page: Page) {
  await page.waitForFunction(() => !window.__globeDebug!.isAnimating(), {
    polling: "raf",
    timeout: 1_200,
  });
}

function distance(a: Vec3, b: Vec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function normalize(vector: Vec3) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
