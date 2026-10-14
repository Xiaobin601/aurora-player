import puppeteer from "puppeteer-core";

const TARGET_URL = "https://319c8450.aurora-player-4yy.pages.dev";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function main() {
  console.log(`Starting probe on ${TARGET_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const consoleLogs = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on("pageerror", (err) => {
    pageErrors.push(err.toString());
  });

  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  const t0 = Date.now();
  const resp = await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 30000 });
  const loadTime = Date.now() - t0;

  console.log(`HTTP Status: ${resp?.status()}`);
  console.log(`Page Load Time: ${loadTime}ms`);
  console.log(`Title: ${await page.title()}`);

  console.log("\n--- Console Logs ---");
  consoleLogs.forEach((l) => console.log(`[${l.type}] ${l.text}`));

  console.log("\n--- Page Errors ---");
  pageErrors.forEach((e) => console.error(e));

  console.log("\n--- Failed Requests ---");
  failedRequests.forEach((f) => console.warn(`${f.url}: ${f.failure}`));

  await browser.close();
}

main().catch(console.error);
