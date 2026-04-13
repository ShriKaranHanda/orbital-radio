import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __globeDebug?: {
      getCameraPosition: () => Vec3;
      getCameraDistance: () => number;
      getStationScreenPosition: () => { x: number; y: number };
      getEarthRotationY: () => number;
      getDisplayedUnixMs: () => number;
      isAnimating: () => boolean;
    };
    __simulationDebug?: {
      getPendingFrameIndex: () => number;
      getVisualFrameIndex: () => number;
      getCurrentUnixMs: () => number;
    };
    __globeTestAnimationMs?: number;
  }
}

type Vec3 = {
  x: number;
  y: number;
  z: number;
};

test("timeline scrub throttles renders and commits the final frame", async ({ page }) => {
  await page.addInitScript(() => {
    window.__globeTestAnimationMs = 80;
  });
  await openScene(page);

  const initial = await sceneState(page);
  const slider = page.getByRole("slider", { name: "Simulation timeline" });
  await page.evaluate(() => {
    window.__simulationDebug!.beginScrub();
  });
  await slider.evaluate((element) => {
    const input = element as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    setValue.call(input, String(input.max));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__simulationDebug!.getPendingFrameIndex() >
            window.__simulationDebug!.getVisualFrameIndex(),
        ),
      { timeout: 400 },
    )
    .toBe(true);

  await page.evaluate(() => {
    window.__simulationDebug!.endScrub();
  });

  await expect
    .poll(() => page.evaluate(() => window.__simulationDebug!.getVisualFrameIndex()))
    .toBe(179);

  const final = await sceneState(page);
  expect(final.unixMs).not.toBe(initial.unixMs);
  expect(final.earthRotationY).not.toBeCloseTo(initial.earthRotationY, 6);
  expect(distance2d(initial.stationScreenPosition, final.stationScreenPosition)).toBeGreaterThan(1);
});

test("globe remains draggable before selection and after deselection", async ({ page }) => {
  await page.addInitScript(() => {
    window.__globeTestAnimationMs = 80;
  });
  await openScene(page);

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

test("returning to the same timeline frame restores the same derived scene state", async ({
  page,
}) => {
  await openScene(page);

  await setTimelineFrame(page, 45);
  const first = await sceneState(page);

  await setTimelineFrame(page, 115);
  await setTimelineFrame(page, 45);
  const second = await sceneState(page);

  expect(second.unixMs).toBe(first.unixMs);
  expect(second.earthRotationY).toBeCloseTo(first.earthRotationY, 8);
  expect(distance2d(first.stationScreenPosition, second.stationScreenPosition)).toBeLessThan(1);
});

async function openScene(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("canvas");
  await page.waitForFunction(
    () => Boolean(window.__globeDebug) && Boolean(window.__simulationDebug),
  );
}

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

async function setTimelineFrame(page: Page, frameIndex: number) {
  await page
    .getByRole("slider", { name: "Simulation timeline" })
    .evaluate(
      (element, nextFrameIndex) => {
        const slider = element as HTMLInputElement;
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!;
        setValue.call(slider, String(nextFrameIndex));
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
      },
      frameIndex,
    );

  await expect
    .poll(() => page.evaluate(() => window.__simulationDebug!.getVisualFrameIndex()))
    .toBe(frameIndex);
}

async function sceneState(page: Page) {
  return page.evaluate(() => ({
    unixMs: window.__globeDebug!.getDisplayedUnixMs(),
    earthRotationY: window.__globeDebug!.getEarthRotationY(),
    stationScreenPosition: window.__globeDebug!.getStationScreenPosition(),
  }));
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

function distance2d(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
