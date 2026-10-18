import puppeteer from "puppeteer-core";
import fs from "fs";

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_PATH = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots/verify_category_library_safe_area.png";

async function verifyCategoryLibrarySafeArea() {
  console.log("=== 开始验证：查看全部（分类片库）Safe Area 安全区适配 ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=414,896"],
  });

  const page = await browser.newPage();
  // 模拟 iPhone 11 Pro Max 视口
  await page.setViewport({ width: 414, height: 896, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  console.log("1. 首页加载成功");

  // 1. 切换到“动漫”频道
  console.log("2. 切换到【动漫】频道...");
  const tabs = await page.$$(".channel-tab-item");
  let animeTab = null;
  for (const t of tabs) {
    const text = await t.evaluate(el => el.textContent.trim());
    if (text === "动漫") {
      animeTab = t;
      break;
    }
  }
  if (animeTab) {
    await animeTab.click();
    await new Promise(r => setTimeout(r, 600));
  }

  // 2. 滚动到底部找到【查看全部】按钮
  console.log("3. 滚动到页面底部点击【查看全部】...");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));

  const viewAllBtn = await page.waitForSelector(".channel-action-capsule.view-all", { timeout: 4000 });
  await viewAllBtn.click();
  await new Promise(r => setTimeout(r, 800));

  await page.waitForSelector(".category-library-header", { timeout: 5000 });
  console.log("4. 成功进入分类片库页面 (.category-library-header)");

  const headerMetrics = await page.evaluate(() => {
    const header = document.querySelector(".category-library-header");
    const backBtn = document.querySelector(".library-back-btn");
    const titleCenter = document.querySelector(".library-title-center");
    const searchBtn = document.querySelector(".library-search-btn");

    const headerRect = header.getBoundingClientRect();
    const backRect = backBtn.getBoundingClientRect();
    const titleRect = titleCenter.getBoundingClientRect();
    const searchRect = searchBtn.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(header);

    return {
      headerTop: headerRect.top,
      headerHeight: headerRect.height,
      paddingTop: computedStyle.paddingTop,
      backBtnTop: backRect.top,
      backBtnHeight: backRect.height,
      titleText: titleCenter.textContent.trim(),
      titleTop: titleRect.top,
      searchBtnTop: searchRect.top,
    };
  });

  console.log("5. Header 几何坐标与安全区数据:", headerMetrics);

  await page.screenshot({ path: SCREENSHOT_PATH });
  console.log(`6. 截图已保存至: ${SCREENSHOT_PATH}`);

  if (headerMetrics.backBtnTop < 10) {
    throw new Error(`[FAIL] 返回按钮贴顶严重: top=${headerMetrics.backBtnTop}px，未留出安全距离！`);
  }

  console.log("✅ 验证通过：分类片库顶部 Header 安全留白充足，避免与系统状态栏/刘海重合！");
  await browser.close();
}

verifyCategoryLibrarySafeArea().catch(err => {
  console.error("验证失败:", err);
  process.exit(1);
});
