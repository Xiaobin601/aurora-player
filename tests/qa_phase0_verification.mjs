import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = path.resolve("tests/screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runPhase0QATest() {
  console.log("===============================================================");
  console.log("   极光影院 (Aurora Player) - 阶段零专项自动化测试与端到端UI校验");
  console.log("===============================================================");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--window-size=390,844",
      "--force-device-scale-factor=3", // 模拟 iPhone Retina @3x
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const report = {
    testTimestamp: new Date().toISOString(),
    metrics: {},
    checks: {},
    discrepancies: [],
  };

  // 1. 访问首页并测试封面图与高清化管线
  console.log("\n[Step 1] 加载首页，检查封面大图与高清化管线...");
  await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));

  // 检查首页 Hero Banner
  const heroBannerData = await page.evaluate(() => {
    const banner = document.querySelector(".hero-banner-card");
    const img = document.querySelector(".hero-banner-img");
    const title = document.querySelector(".hero-banner-title");
    if (!banner || !img) return null;
    const computed = window.getComputedStyle(img);
    return {
      title: title ? title.textContent.trim() : null,
      src: img.src,
      currentSrc: img.currentSrc,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: img.clientWidth,
      renderedHeight: img.clientHeight,
      imageRendering: computed.imageRendering,
      webkitOptimizeContrast: computed.getPropertyValue("-webkit-optimize-contrast"),
    };
  });

  console.log("Hero Banner 数据:", JSON.stringify(heroBannerData, null, 2));

  // 检查首页海报列表图片 URL
  const postersData = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll(".video-poster-card .poster-img"));
    return imgs.slice(0, 15).map((img, i) => {
      const computed = window.getComputedStyle(img);
      return {
        index: i,
        alt: img.alt,
        src: img.src,
        imageRendering: computed.imageRendering,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        hasLowRes260: img.src.includes("/260"),
        hasOssResize: img.src.includes("x-oss-process=image/resize"),
      };
    });
  });

  const lowRes260Count = postersData.filter((p) => p.hasLowRes260).length;
  const ossResizeCount = postersData.filter((p) => p.hasOssResize).length;
  console.log(`抽检 ${postersData.length} 张海报: /260 低清切片数=${lowRes260Count}, OSS resize压缩数=${ossResizeCount}`);

  const homeScreenshot = path.join(SCREENSHOT_DIR, "qa_phase0_01_home_hero_and_posters.png");
  await page.screenshot({ path: homeScreenshot, fullPage: false });
  console.log(`[Screenshot Saved] ${homeScreenshot}`);

  // 2. 点击进入《九门》详情页
  console.log("\n[Step 2] 进入《九门》竖屏播放详情页...");
  const heroCard = await page.$(".hero-banner-card");
  if (heroCard) {
    await heroCard.click();
  } else {
    // 降级：点击首个卡片
    const firstCard = await page.$(".video-poster-card");
    if (firstCard) await firstCard.click();
  }

  await page.waitForSelector(".bagtrim-player-page", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 1500));

  // 3. 检查返回按键
  console.log("\n[Step 3] 检查竖屏播放页返回按键微控件...");
  const backBtnData = await page.evaluate(() => {
    const btn = document.querySelector(".bagtrim-floating-back-btn");
    if (!btn) return null;
    const computed = window.getComputedStyle(btn);
    const svg = btn.querySelector("svg");
    return {
      exists: true,
      tagName: btn.tagName,
      className: btn.className,
      width: computed.width,
      height: computed.height,
      borderRadius: computed.borderRadius,
      backgroundColor: computed.backgroundColor,
      border: computed.border,
      backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter,
      hasSvg: !!svg,
      svgClass: svg ? svg.getAttribute("class") : null,
      isCircleBlackButton:
        computed.borderRadius.includes("50%") &&
        (computed.backgroundColor.includes("rgba(0, 0, 0") || computed.backgroundColor.includes("rgb(0, 0, 0)")),
    };
  });
  console.log("返回按键详情:", JSON.stringify(backBtnData, null, 2));

  // 4. 检查影视标题与属性药丸行
  console.log("\n[Step 4] 检查影视大标题《九门》与属性药丸行...");
  const titleAndPillsData = await page.evaluate(() => {
    const titleEl = document.querySelector(".bagtrim-vod-title");
    const pillsRow = document.querySelector(".bagtrim-meta-pills-row");
    const pills = Array.from(document.querySelectorAll(".bagtrim-meta-pills-row .meta-pill"));

    const titleStyle = titleEl ? window.getComputedStyle(titleEl) : null;

    return {
      titleText: titleEl ? titleEl.textContent.trim() : null,
      titleFontSize: titleStyle ? titleStyle.fontSize : null,
      titleFontWeight: titleStyle ? titleStyle.fontWeight : null,
      titleColor: titleStyle ? titleStyle.color : null,
      pillsCount: pills.length,
      pills: pills.map((p) => {
        const style = window.getComputedStyle(p);
        const icon = p.querySelector("svg");
        return {
          text: p.textContent.trim(),
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          borderRadius: style.borderRadius,
          hasIcon: !!icon,
          iconColor: icon ? window.getComputedStyle(icon).color : null,
        };
      }),
    };
  });
  console.log("标题与药丸行详情:", JSON.stringify(titleAndPillsData, null, 2));

  // 5. 检查三大按键（喜欢、下载、收藏）
  console.log("\n[Step 5] 检查三大按键（喜欢、下载、收藏）呈现结构...");
  const actionTrioData = await page.evaluate(() => {
    const container = document.querySelector(".bagtrim-action-trio");
    const btns = Array.from(document.querySelectorAll(".bagtrim-action-trio .action-trio-btn"));
    const containerStyle = container ? window.getComputedStyle(container) : null;

    return {
      containerDisplay: containerStyle ? containerStyle.display : null,
      containerGridTemplate: containerStyle ? containerStyle.gridTemplateColumns : null,
      containerGap: containerStyle ? containerStyle.gap : null,
      buttons: btns.map((btn, i) => {
        const style = window.getComputedStyle(btn);
        const svg = btn.querySelector("svg");
        const span = btn.querySelector("span");
        return {
          index: i,
          text: span ? span.textContent.trim() : btn.textContent.trim(),
          display: style.display,
          flexDirection: style.flexDirection,
          backgroundColor: style.backgroundColor,
          border: style.border,
          borderRadius: style.borderRadius,
          padding: style.padding,
          hasSvg: !!svg,
          isVerticalLayout: style.flexDirection === "column",
          isHorizontalLayout: style.flexDirection === "row" || style.display === "flex",
        };
      }),
    };
  });
  console.log("三大按键结构详情:", JSON.stringify(actionTrioData, null, 2));

  const playerTopScreenshot = path.join(SCREENSHOT_DIR, "qa_phase0_02_player_portrait_top.png");
  await page.screenshot({ path: playerTopScreenshot, fullPage: false });
  console.log(`[Screenshot Saved] ${playerTopScreenshot}`);

  // 6. 检查线路切换胶囊与选集网格
  console.log("\n[Step 6] 检查线路切换胶囊与选集网格...");
  const sourcesAndEpisodesData = await page.evaluate(() => {
    const sourceCapsules = Array.from(document.querySelectorAll(".bagtrim-source-capsule"));
    const episodesSubhead = document.querySelector(".bagtrim-episodes-subhead");
    const squareGrid = document.querySelector(".bagtrim-square-grid");
    const epBtns = Array.from(document.querySelectorAll(".square-ep-btn"));

    const gridStyle = squareGrid ? window.getComputedStyle(squareGrid) : null;

    const sources = sourceCapsules.map((c) => {
      const s = window.getComputedStyle(c);
      const isActive = c.classList.contains("active");
      return {
        text: c.textContent.trim(),
        isActive,
        backgroundColor: s.backgroundColor,
        color: s.color,
        fontWeight: s.fontWeight,
        borderRadius: s.borderRadius,
      };
    });

    const epButtonsSample = epBtns.slice(0, 10).map((btn) => {
      const s = window.getComputedStyle(btn);
      const isActive = btn.classList.contains("active");
      return {
        text: btn.textContent.trim(),
        isActive,
        width: s.width,
        height: s.height,
        backgroundColor: s.backgroundColor,
        color: s.color,
        fontWeight: s.fontWeight,
        borderRadius: s.borderRadius,
      };
    });

    return {
      sourcesCount: sourceCapsules.length,
      sources,
      hasEpisodesSubhead: !!episodesSubhead,
      episodesSubheadText: episodesSubhead ? episodesSubhead.textContent.trim() : null,
      gridColumns: gridStyle ? gridStyle.gridTemplateColumns : null,
      gridGap: gridStyle ? gridStyle.gap : null,
      totalRenderedEpButtons: epBtns.length,
      epButtonsSample,
    };
  });
  console.log("线路与选集网格数据:", JSON.stringify(sourcesAndEpisodesData, null, 2));

  // 滚动到选集区域截图
  await page.evaluate(() => {
    const el = document.querySelector(".bagtrim-episodes-module");
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  });
  await new Promise((r) => setTimeout(r, 600));

  const playerEpisodesScreenshot = path.join(SCREENSHOT_DIR, "qa_phase0_03_player_sources_episodes.png");
  await page.screenshot({ path: playerEpisodesScreenshot, fullPage: false });
  console.log(`[Screenshot Saved] ${playerEpisodesScreenshot}`);

  // 7. 检查底部「猜你喜欢」双列推荐卡片流
  console.log("\n[Step 7] 检查底部「猜你喜欢」双列推荐卡片流...");
  const recommendData = await page.evaluate(() => {
    const wrap = document.querySelector(".bagtrim-recommend-wrap");
    const title = document.querySelector(".recommend-title");
    const grid = document.querySelector(".bagtrim-recommend-grid");
    const cards = Array.from(document.querySelectorAll(".bagtrim-rec-card"));

    const gridStyle = grid ? window.getComputedStyle(grid) : null;

    const cardsDetails = cards.map((card, i) => {
      const img = card.querySelector(".rec-poster-box img");
      const titleEl = card.querySelector(".rec-title");
      const subTitleEl = card.querySelector(".rec-subtitle");
      const badgeEl = card.querySelector(".rec-badge");
      const box = card.querySelector(".rec-poster-box");
      const boxStyle = box ? window.getComputedStyle(box) : null;

      return {
        index: i,
        title: titleEl ? titleEl.textContent.trim() : null,
        subTitle: subTitleEl ? subTitleEl.textContent.trim() : null,
        badge: badgeEl ? badgeEl.textContent.trim() : null,
        imgSrc: img ? img.src : null,
        aspectRatio: boxStyle ? boxStyle.aspectRatio : null,
      };
    });

    return {
      hasWrap: !!wrap,
      title: title ? title.textContent.trim() : null,
      hasGrid: !!grid,
      gridTemplateColumns: gridStyle ? gridStyle.gridTemplateColumns : null,
      gridGap: gridStyle ? gridStyle.gap : null,
      totalCards: cards.length,
      cardsDetails,
    };
  });
  console.log("猜你喜欢数据:", JSON.stringify(recommendData, null, 2));

  // 滚动到底部推荐模块截图
  await page.evaluate(() => {
    const el = document.querySelector(".bagtrim-recommend-wrap");
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  });
  await new Promise((r) => setTimeout(r, 600));

  const playerRecommendScreenshot = path.join(SCREENSHOT_DIR, "qa_phase0_04_player_recommend_grid.png");
  await page.screenshot({ path: playerRecommendScreenshot, fullPage: false });
  console.log(`[Screenshot Saved] ${playerRecommendScreenshot}`);

  // 8. 完整详情页全景长截图
  await page.evaluate(() => {
    const el = document.querySelector(".bagtrim-detail-scroll-body");
    if (el) el.scrollTo({ top: 0, behavior: "instant" });
  });
  await new Promise((r) => setTimeout(r, 500));

  const playerFullScreenshot = path.join(SCREENSHOT_DIR, "qa_phase0_05_player_full_scroll.png");
  await page.screenshot({ path: playerFullScreenshot, fullPage: false });
  console.log(`[Screenshot Saved] ${playerFullScreenshot}`);

  // 9. 汇总所有数据并保存 JSON 报告
  report.metrics = {
    heroBanner: heroBannerData,
    postersData: {
      sampleCount: postersData.length,
      lowRes260Count,
      ossResizeCount,
      posters: postersData,
    },
    backButton: backBtnData,
    titleAndPills: titleAndPillsData,
    actionTrio: actionTrioData,
    sourcesAndEpisodes: sourcesAndEpisodesData,
    recommend: recommendData,
  };

  const reportPath = path.resolve("tests/qa_phase0_test_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\n[Report Generated] ${reportPath}`);

  await browser.close();
  console.log("\n================ 专项测试执行完毕 ================\n");
}

runPhase0QATest().catch((err) => {
  console.error("测试发生错误:", err);
  process.exit(1);
});
