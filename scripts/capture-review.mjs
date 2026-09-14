import { chromium } from "@playwright/test";
import path from "path";

async function shot(page, url, file, size) {
  await page.setViewportSize(size);
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.locator("nextjs-portal").evaluateAll((nodes) => nodes.forEach((n) => n.remove())).catch(() => undefined);
  await page.screenshot({
    path: file,
    fullPage: size.height > 800,
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const root = path.join("e:/Projects/Shipment-Tracker/.impeccable/review");

  await shot(page, "http://localhost:3000/track/ronin", path.join(root, "hero-repro.png"), {
    width: 1280,
    height: 720,
  });
  await shot(page, "http://localhost:3000/track/ronin", path.join(root, "desktop.png"), {
    width: 1440,
    height: 900,
  });
  await shot(page, "http://localhost:3000/track/ronin", path.join(root, "mobile.png"), {
    width: 390,
    height: 844,
  });
  await shot(page, "http://localhost:3000/login", path.join(root, "login.png"), {
    width: 1440,
    height: 900,
  });
  await shot(page, "http://localhost:3000/", path.join(root, "home.png"), {
    width: 1440,
    height: 900,
  });

  await page.goto("http://localhost:3000/login");
  await page.getByLabel("EMAIL").fill("admin@ronin.local");
  await page.getByLabel("PASSWORD").fill("change-me-admin");
  await page.getByRole("button", { name: "SIGN IN" }).click();
  await page.waitForURL(/admin/);
  await page.getByText("Ronin", { exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(root, "admin.png"), fullPage: true });

  await page.goto("http://localhost:3000/tracker");
  await page.getByText("Ronin").first().waitFor();
  await page.screenshot({ path: path.join(root, "tracker.png"), fullPage: true });

  const numbers = page.getByLabel("TRACKING NUMBERS");
  await numbers.fill("784931205581");
  await page.getByRole("button", { name: "ADD TO BOARD" }).click();
  await page.waitForTimeout(1500);
  await shot(page, "http://localhost:3000/track/ronin", path.join(root, "hero-repro.png"), {
    width: 1280,
    height: 720,
  });
  await shot(page, "http://localhost:3000/track/ronin", path.join(root, "desktop.png"), {
    width: 1440,
    height: 900,
  });

  await browser.close();
})();
