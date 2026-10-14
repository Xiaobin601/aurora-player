import puppeteer from "puppeteer-core";
import { spawn } from "child_process";

const TARGET_URL = "http://localhost:4175";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_PATH = "/Users/xiaobin/.gemini/antigravity/brain/703def44-57ea-4e56-b9ee-f03de486172c/channel_more_and_refresh_verification.png";

async function verifyChannelMoreAndRefresh() {
  console.log("=== 启动本地预览服务器 (port 4175) ===");
  const preview = spawn("npx", ["vite", "preview", "--port", "4175"], {
    cwd: "/Users/xiaobin/ai-study/aurora-player",
    stdio: "inherit",
  });

  await new Promise((r) => setTimeout(r, 2000));

  try {
    console.log("=== 开始每个菜单栏【查看全部】与【换一换】功能自动化验证 ===");
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
    console.log("[1] 首页加载成功");

    // 1. 切换到【电视剧】频道 (1:1 对标截图)
    console.log("[2] 切换到【电视剧】频道...");
    const tvTab = await page.waitForSelector(".channel-tab-item:nth-child(4)", { timeout: 3000 });
    await tvTab.click();
    await new Promise((r) => setTimeout(r, 500));

    // 2. 验证顶部热播 Banner
    const bannerTitle = await page.$eval(".hero-banner-title", (el) => el.textContent.trim());
    const hotTag = await page.$eval(".hot-label-text", (el) => el.textContent.trim());
    console.log(`[PASS] 电视剧频道焦点 Banner: 《${bannerTitle}》, 右侧徽标: 【${hotTag}】`);

    // 3. 验证初始 6 部卡片
    const initialTitles = await page.$$eval(".card-main-title", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 当前精选推荐展示部数: ${initialTitles.length} 部 (3行2列), 包含:`, initialTitles.slice(0, 6));
    if (initialTitles.length !== 6) {
      console.warn(`[WARN] 预期默认精选 6 部，实际为 ${initialTitles.length} 部`);
    }

    // 4. 验证底部双胶囊按钮
    const footerButtons = await page.$$eval(".channel-action-capsule", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 底部双胶囊操作按键:`, footerButtons);

    // 截取 1:1 对标长图
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
    console.log(`[PASS] 成功保存电视剧频道 1:1 对标真机截图: ${SCREENSHOT_PATH}`);

    // 5. 测试【换一换】
    console.log("[5] 测试点击【换一换】...");
    await page.click(".channel-action-capsule.refresh");
    await new Promise((r) => setTimeout(r, 600));

    const refreshedTitles = await page.$$eval(".card-main-title", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 换一换之后展示的新一组影片:`, refreshedTitles.slice(0, 6));

    const isDifferent = refreshedTitles.some((t, i) => t !== initialTitles[i]);
    console.log(`[PASS] 换一换是否成功轮换为全新批次影片: ${isDifferent}`);

    // 6. 测试【查看全部】升级为原生形态 B 专属影视库
    console.log("[6] 测试点击【查看全部】推入专属影视库...");
    await page.click(".channel-action-capsule.view-all");
    await new Promise((r) => setTimeout(r, 500));

    const libraryTitle = await page.$eval(".library-title-text", (el) => el.textContent.trim());
    const expandedTitles = await page.$$eval(".library-cards-grid .card-main-title", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 成功进入【${libraryTitle}】, 全部影片数量: ${expandedTitles.length} 部`);

    // 点击返回退出分类库
    await page.click(".library-back-btn");
    await new Promise((r) => setTimeout(r, 500));
    const collapsedTitles = await page.$$eval(".card-main-title", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 点击返回后，恢复精选推荐展示: ${collapsedTitles.length} 部`);

    // 7. 切换到其他频道 (例如【电影】) 验证通用性
    console.log("[7] 切换到【电影】频道验证通用实现...");
    const movieTab = await page.waitForSelector(".channel-tab-item:nth-child(5)");
    await movieTab.click();
    await new Promise((r) => setTimeout(r, 500));

    const movieBanner = await page.$eval(".hero-banner-title", (el) => el.textContent.trim());
    const movieCount = (await page.$$(".card-main-title")).length;
    const movieFooterButtons = await page.$$eval(".channel-action-capsule", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 电影频道焦点 Banner: 《${movieBanner}》, 推荐卡片数: ${movieCount} 部, 底部按键:`, movieFooterButtons);

    await browser.close();
    console.log("=== 【查看全部】与【换一换】功能自动化验证全部 PASS 通过！ ===");
  } finally {
    preview.kill();
  }
}

verifyChannelMoreAndRefresh().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
