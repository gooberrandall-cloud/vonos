import { expect, test, type Page } from "@playwright/test";

import { installStoreMock } from "./fixtures/storeMock";

const GRID = "#shop-catalog .vg-catalog__grid .vg-pcard";
const META = ".vg-catalog__meta";

async function openShop(page: Page) {
  await page.goto("/shop", { waitUntil: "domcontentloaded" });
  await expect(page.locator(GRID).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(META)).toContainText(/part/, { timeout: 30_000 });
}

function trackSearchCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/public/store/catalog") && url.includes("search=")) {
      calls.push(url);
    }
  });
  return calls;
}

test.describe("shop: product search", () => {
  test("narrows the grid in memory without calling the API", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const searchCalls = trackSearchCalls(page);
    await installStoreMock(page);
    await openShop(page);

    await page.locator("#vg-catalog-search").fill("brake");

    await expect(page.locator(GRID)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(GRID)).toContainText("Front Brake Pads");
    await expect(page.locator(META)).toContainText("1 part");
    await expect(page.locator(META)).not.toContainText("full catalogue");

    // A local hit must never fall through to the server.
    await page.waitForTimeout(700);
    expect(searchCalls).toHaveLength(0);
  });

  test("falls back to the server when the local catalogue misses", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const searchCalls = trackSearchCalls(page);
    await installStoreMock(page);
    await openShop(page);

    // "zeta" exists on the server but not in the first page the app loaded.
    await page.locator("#vg-catalog-search").fill("zeta");

    await expect(page.locator(GRID)).toHaveCount(1, { timeout: 20_000 });
    await expect(page.locator(GRID)).toContainText("Zeta Shock Absorber");
    await expect(page.locator(META)).toContainText("1 part");
    await expect(page.locator(META)).toContainText("full catalogue");
    // The grid must settle, not hang on the skeleton.
    await expect(page.locator(META)).not.toContainText("Searching…");
    await expect(page.locator(".vg-skeleton")).toHaveCount(0);

    expect(searchCalls.length).toBeGreaterThan(0);
    expect(decodeURIComponent(searchCalls[0] ?? "")).toContain("search=zeta");
  });

  test("shows an empty state when nothing matches", async ({ page }) => {
    test.setTimeout(120_000);
    await installStoreMock(page);
    await openShop(page);

    await page.locator("#vg-catalog-search").fill("zzzqqq");

    const empty = page.locator(".vg-empty");
    await expect(empty).toBeVisible({ timeout: 20_000 });
    await expect(empty).toContainText("No parts found");
    await expect(empty).toContainText("zzzqqq");
    await expect(page.locator(GRID)).toHaveCount(0);
    await expect(page.locator(META)).not.toContainText("Searching…");
  });

  test("filters the grid by vehicle model", async ({ page }) => {
    test.setTimeout(120_000);
    await installStoreMock(page);
    await openShop(page);

    await page.locator("#vg-catalog-model").selectOption("Hilux");

    await expect(page.locator(GRID)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(GRID)).toContainText("Air Filter");
    await expect(page.locator(GRID)).toContainText("Fits Hilux");
    await expect(page.locator(META)).toContainText("1 part");
    await expect(page.locator(META)).not.toContainText("full catalogue");
  });

  test("reads ?q= from the URL", async ({ page }) => {
    test.setTimeout(120_000);
    await installStoreMock(page);

    await page.goto("/shop?q=brake#shop-catalog", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#vg-catalog-search")).toHaveValue("brake", {
      timeout: 30_000,
    });
    await expect(page.locator(GRID)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(GRID)).toContainText("Front Brake Pads");
  });
});
