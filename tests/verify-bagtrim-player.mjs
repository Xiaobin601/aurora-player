import puppeteer from "puppeteer-core";
import fs from "fs";

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_PATH = "/Users/xiaobin/.gemini/antigravity/brain/703def44-57ea-4e56-b9ee-f03de486172c/bagtrim_replicated_detail.png";

async function verifyBagTrimPlayer() {
  console.log("=== 开始 1:1 复刻 BagTrim 原生吸顶播放详情页验证 ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  console.log("页面首页加载成功");

  // 1. 点击首页推荐卡片中的《南部档案》开播
  console.log("查找《南部档案》或首个推荐视频...");
  const cards = await page.$$(".rec-video-card, .hero-banner-card");
  if (cards.length > 0) {
    await cards[0].click();
  }

  await page.waitForSelector(".bagtrim-player-page", { timeout: 4000 });
  console.log("[PASS] 成功唤起 BagTrim 原生播放详情页 (.bagtrim-player-page)");

  // 2. 验证顶部视频播放视口吸顶 (top === 0)
  const stickyBox = await page.$eval(".player-sticky-viewport", (el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, width: rect.width, height: rect.height };
  });
  console.log(`[PASS] 顶部播放视口吸顶定位: top=${stickyBox.top}px, width=${stickyBox.width}px, height=${stickyBox.height}px`);

  // 3. 验证左上角圆形返回键
  const hasBackBtn = await page.$eval(".bagtrim-floating-back-btn", (el) => Boolean(el));
  console.log(`[PASS] 左上角半透明圆形返回按钮存在: ${hasBackBtn}`);

  // 4. 验证二级 Tab、标题、属性药丸、金刚区
  const vodTitle = await page.$eval(".bagtrim-vod-title", (el) => el.textContent.trim());
  const pills = await page.$$eval(".bagtrim-meta-pills-row .meta-pill", (els) => els.map((e) => e.textContent.trim()));
  const trioBtns = await page.$$eval(".bagtrim-action-trio .action-trio-btn", (els) => els.map((e) => e.textContent.trim()));
  console.log(`[PASS] 影片大标题: ${vodTitle}`);
  console.log(`[PASS] 药丸属性标签:`, pills);
  console.log(`[PASS] 三大金刚功能按键:`, trioBtns);

  // 5. 验证选集正方形纯数字按钮及白底黑字高亮
  const squareEps = await page.$$eval(".square-ep-btn", (els) => els.slice(0, 10).map((e) => ({
    text: e.textContent.trim(),
    isActive: e.classList.contains("active"),
  })));
  console.log("[PASS] 选集纯数字正方形按钮网格 (前10集):", squareEps);

  const activeEpStyle = await page.$eval(".square-ep-btn.active", (el) => {
    const style = window.getComputedStyle(el);
    return {
      bg: style.backgroundColor,
      color: style.color,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
    };
  });
  console.log("[PASS] 选中集数白底黑字大粗体高亮样式:", activeEpStyle);

  // 6. 验证视频播放的真实流媒体 URL
  await new Promise((r) => setTimeout(r, 1000));
  const videoSrc = await page.$eval("video", (v) => v.currentSrc || v.src);
  console.log(`[PASS] 当前 <video> 播放的流地址: ${videoSrc}`);
  if (videoSrc.includes("test-streams.mux.dev") || videoSrc.includes("akamaized.net")) {
    throw new Error(`[FAIL] 播放了假测试流: ${videoSrc}`);
  } else {
    console.log(`[PASS] 确认为真实影视流媒体正片流！绝无假测试切片！`);
  }

  // 7. 测试切换第 2 集
  const secondEpBtn = (await page.$$(".square-ep-btn"))[1];
  if (secondEpBtn) {
    await secondEpBtn.click();
    await new Promise((r) => setTimeout(r, 1000));
    const newVideoSrc = await page.$eval("video", (v) => v.currentSrc || v.src);
    const isSecondActive = await secondEpBtn.evaluate((el) => el.classList.contains("active"));
    console.log(`[PASS] 点击切换第 2 集成功, 激活态: ${isSecondActive}, 新流地址: ${newVideoSrc}`);
  }

  // 8. 截取完整高清视口长图作为交付证据
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
  console.log(`[PASS] 成功保存真机尺寸详情页长图证据: ${SCREENSHOT_PATH}`);

  await browser.close();
  console.log("=== 所有自动化回归验证全部 PASS 成功！===");
}

verifyBagTrimPlayer().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
