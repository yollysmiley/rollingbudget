import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const appPath = resolve(fileURLToPath(new URL("../rollover-budget-app.html", import.meta.url)));

test("production app renders its key account controls at desktop and mobile widths", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("https://cdn.jsdelivr.net/**", route => route.abort());
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("file://" + appPath, { waitUntil: "domcontentloaded" });
    await page.locator("#authEmail").waitFor({ state: "attached" });
    assert.equal(await page.title(), "Rolling Budget");
    assert.equal(await page.locator("#authPassword").count(), 1);
    assert.equal(await page.locator("#recurringDesktopView").count(), 1);
    assert.equal(await page.locator("#recurringMobileView").count(), 1);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("#authEmail").isVisible(), false);
    assert.equal(await page.locator("#recurringMobileView").count(), 1);
    assert.equal(await page.locator("header").isVisible(), true);
  } finally {
    await browser.close();
  }
});
