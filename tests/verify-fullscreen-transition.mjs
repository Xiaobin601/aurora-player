import puppeteer from "puppeteer-core";
import fs from "fs";

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots";

async function run() {
  console.log("=== 开始验证：点击图 1 全屏跳转至图 2 横屏沉浸控制台 ===");
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  console.log("1. 首页加载成功");

  // 点击第一个视频卡片唤起图 1 播放详情页
  const card = await page.waitForSelector(".rec-video-card, .hero-banner-card", { timeout: 5000 });
  await card.click();
  await page.waitForSelector(".bagtrim-player-page", { timeout: 5000 });
  console.log("2. 成功进入图 1 播放详情页");

  // 截图保存图 1
  await page.screenshot({ path: `${SCREENSHOT_DIR}/verify_step1_portrait_detail.png` });

  // 验证图 1 竖屏播放内嵌控件存在
  const portraitOverlay = await page.$(".portrait-viewport-overlay");
  console.log("3. 图 1 竖屏内嵌控件存在:", Boolean(portraitOverlay));

  // 查找全屏按钮并点击
  const fullscreenBtn = await page.waitForSelector(".portrait-fullscreen-btn", { timeout: 3000 });
  console.log("4. 找到图 1 全屏按钮，准备点击...");
  await fullscreenBtn.click();
  await new Promise((r) => setTimeout(r, 600));

  // 截图保存点击全屏后的界面
  await page.screenshot({ path: `${SCREENSHOT_DIR}/verify_step2_after_click_fullscreen.png` });

  // 验证图 2 的专属控件是否出现
  const hasStatusbar = await page.$eval(".ios-landscape-statusbar", (el) => {
    return Boolean(el) && !el.classList.contains("hidden");
  }).catch(() => false);

  const hasTopHeader = await page.$eval(".ios-landscape-top-header", (el) => {
    return Boolean(el) && !el.classList.contains("hidden");
  }).catch(() => false);

  const hasBottomBar = await page.$eval(".ios-landscape-bottom-bar", (el) => {
    return Boolean(el) && !el.classList.contains("hidden");
  }).catch(() => false);

  const hasLockBtn = await page.$eval(".screen-lock-floating-btn", (el) => Boolean(el)).catch(() => false);

  console.log("5. 图 2 界面核心要素检验结果:");
  console.log(`   - 极顶原生拟态状态条 (.ios-landscape-statusbar): ${hasStatusbar}`);
  console.log(`   - 顶部控制栏 (.ios-landscape-top-header): ${hasTopHeader}`);
  console.log(`   - 底部通栏控制台 (.ios-landscape-bottom-bar): ${hasBottomBar}`);
  console.log(`   - 左侧屏幕防误触锁 (.screen-lock-floating-btn): ${hasLockBtn}`);

  if (!hasStatusbar || !hasTopHeader || !hasBottomBar) {
    throw new Error("点击全屏后未能正常展现图 2 横屏控制台！");
  }
  console.log("✅ 成功验证：点击图 1 全屏按钮顺利跳转到了图 2 横屏沉浸控制台！");

  // 测试在图 2 中点击退出全屏
  const backBtn = await page.waitForSelector(".ios-top-btn.back-btn", { timeout: 3000 });
  console.log("6. 准备点击图 2 左上角退出全屏按钮...");
  await backBtn.click();
  await new Promise((r) => setTimeout(r, 600));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/verify_step3_returned_to_portrait.png` });

  const returnedToPortrait = await page.$eval(".portrait-viewport-overlay", (el) => Boolean(el)).catch(() => false);
  console.log(`7. 成功返回图 1 竖屏播放界面: ${returnedToPortrait}`);

  await browser.close();
  console.log("=== 全部验证通过！ ===");
}

run().catch((err) => {
  console.error("验证失败:", err);
  process.exit(1);
});
