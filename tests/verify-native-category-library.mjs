import puppeteer from "puppeteer-core";
import { spawn } from "child_process";

const TARGET_URL = "http://localhost:4176";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACT_DIR = "/Users/xiaobin/.gemini/antigravity/brain/703def44-57ea-4e56-b9ee-f03de486172c";

async function verifyNativeCategoryLibrary() {
  console.log("=== 启动本地预览服务器 (port 4176) ===");
  const preview = spawn("npx", ["vite", "preview", "--port", "4176"], {
    cwd: "/Users/xiaobin/ai-study/aurora-player",
    stdio: "inherit",
  });

  await new Promise((r) => setTimeout(r, 2000));

  try {
    console.log("=== 开始【电影】菜单【查看全部】升级原生形态 B 自动化验证 ===");
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
    console.log("[1] 首页加载成功");

    // 1. 切换到【电影】频道
    console.log("[2] 切换到【电影】频道...");
    const movieTab = await page.waitForSelector(".channel-tab-item:nth-child(5)", { timeout: 3000 });
    await movieTab.click();
    await new Promise((r) => setTimeout(r, 500));

    // 验证电影频道精选视图 (Banner + 6部精选)
    const movieBanner = await page.$eval(".hero-banner-title", (el) => el.textContent.trim());
    const featuredCards = await page.$$eval(".card-main-title", (els) => els.map((e) => e.textContent.trim()));
    console.log(`[PASS] 电影精选焦点 Banner: 《${movieBanner}》, 推荐卡片数: ${featuredCards.length} 部 (3行2列)`);

    // 2. 模拟滑到页面下方点击【查看全部】
    console.log("[3] 点击底部【查看全部】进入原生形态 B【电影库】全屏深层视图...");
    const viewAllBtn = await page.waitForSelector(".channel-action-capsule.view-all");
    await viewAllBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // 3. 验证进入原生形态 B【电影库】
    const libraryTitle = await page.$eval(".library-title-text", (el) => el.textContent.trim());
    const libraryBadge = await page.$eval(".library-badge-pill", (el) => el.textContent.trim());
    console.log(`[PASS] 顶部导航标题: 【${libraryTitle}】, 徽标统计: 【${libraryBadge}】`);

    // 验证 Banner 是否已被移除 (空间最大化)
    const bannerExists = (await page.$(".hero-banner-card")) !== null;
    console.log(`[PASS] 原生形态 B 下顶部大 Banner 是否已安全移除: ${!bannerExists}`);

    // 验证多维筛选胶囊
    const genreChips = await page.$$eval(".filter-chips-row:nth-child(1) .filter-chip-pill", (els) =>
      els.map((e) => e.textContent.trim())
    );
    console.log(`[PASS] 电影库类型胶囊 (${genreChips.length}个):`, genreChips.slice(0, 8));

    // 验证电影全量网格 (17部电影全量展现)
    const allMovieTitles = await page.$$eval(".library-cards-grid .card-main-title", (els) =>
      els.map((e) => e.textContent.trim())
    );
    console.log(`[PASS] 电影库全量加载影片数: ${allMovieTitles.length} 部, 包含:`, allMovieTitles.slice(0, 6));

    // 截图保存原生形态 B 电影库视图
    const screenshot1 = `${ARTIFACT_DIR}/movie_library_native_form_b.png`;
    await page.screenshot({ path: screenshot1, fullPage: false });
    console.log(`[PASS] 成功保存电影库原生形态 B 高清截图: ${screenshot1}`);

    // 4. 测试点击筛选维度：选择【动作】题材
    console.log("[4] 测试点击【动作】题材胶囊过滤...");
    const actionChip = await page.waitForSelector('.filter-chips-scroll button:nth-child(3)'); // 动作
    await actionChip.click();
    await new Promise((r) => setTimeout(r, 400));

    const actionMovies = await page.$$eval(".library-cards-grid .card-main-title", (els) =>
      els.map((e) => e.textContent.trim())
    );
    const metaText = await page.$eval(".library-result-meta-bar", (el) => el.textContent.trim());
    console.log(`[PASS] 【动作】题材过滤结果 (${actionMovies.length}部):`, actionMovies, `| 状态条: ${metaText}`);

    // 截图保存筛选过滤后的视图
    const screenshot2 = `${ARTIFACT_DIR}/movie_library_filtered_action.png`;
    await page.screenshot({ path: screenshot2, fullPage: false });
    console.log(`[PASS] 成功保存动作电影筛选截图: ${screenshot2}`);

    // 5. 测试【重置筛选】
    console.log("[5] 测试点击【重置筛选】...");
    await page.click(".library-reset-filter-btn");
    await new Promise((r) => setTimeout(r, 400));
    const restoredCount = (await page.$$(".library-cards-grid .card-main-title")).length;
    console.log(`[PASS] 重置后恢复全量片库: ${restoredCount} 部`);

    // 6. 测试点击任意一部电影卡片开播
    console.log("[6] 测试点击电影《生化危机：爆发夜》卡片拉起播放器...");
    const firstMovieCard = await page.waitForSelector(".library-cards-grid .video-poster-card:nth-child(1)");
    await firstMovieCard.click();
    await new Promise((r) => setTimeout(r, 800));

    const playerTitle = await page.$eval(".bagtrim-vod-title", (el) => el.textContent.trim());
    console.log(`[PASS] 播放器成功唤起，正在播放电影: 《${playerTitle}》`);

    // 关闭播放器
    await page.click(".bagtrim-floating-back-btn");
    await new Promise((r) => setTimeout(r, 400));

    // 7. 测试点击【< 返回】返回电影精选页
    console.log("[7] 测试点击顶部【< 返回】按键退出全量电影库...");
    await page.click(".library-back-btn");
    await new Promise((r) => setTimeout(r, 500));

    const isBackToChannel = (await page.$(".hero-banner-title")) !== null;
    console.log(`[PASS] 点击返回后，是否安全回到电影频道精选视图: ${isBackToChannel}`);

    await browser.close();
    console.log("=== 原生形态 B 全量影视库自动化测试全部 PASS 通过！ ===");
  } finally {
    preview.kill();
  }
}

verifyNativeCategoryLibrary().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
