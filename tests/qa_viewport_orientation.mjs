import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE_URL = "http://localhost:4173";
const SCREENSHOT_DIR = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots";

// 保证截图目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runQaTests() {
  console.log("================================================================================");
  console.log("🚀 启动【移动端响应式与视口旋转专项 QA 自动化深度测试】");
  console.log("================================================================================");

  const testReport = {
    timestamp: new Date().toISOString(),
    environment: {
      url: BASE_URL,
      browser: "Chrome Headless (Puppeteer)",
      devicesTested: [
        "iPhone 11/12/13/14 Pro Max (414x896 / 896x414, DPR=3)",
        "Standard iPhone / iPhone 13/14/15 (390x844 / 844x390, DPR=3)"
      ]
    },
    sections: {}
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--enable-precise-memory-info"
    ]
  });

  try {
    // =========================================================================
    // 专项测试 1：多机型分辨率适配测试
    // =========================================================================
    console.log("\n▶ [测试 1/3] 执行多机型分辨率与旋转适配测试...");
    testReport.sections.multiDeviceOrientation = {};

    const deviceProfiles = [
      {
        name: "iPhone Pro Max (11/12/13/14)",
        prefix: "iphone_promax",
        portrait: { width: 414, height: 896, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
        landscape: { width: 896, height: 414, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      },
      {
        name: "Standard iPhone (13/14/15)",
        prefix: "iphone_standard",
        portrait: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
        landscape: { width: 844, height: 390, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      }
    ];

    for (const dev of deviceProfiles) {
      console.log(`\n  --- 检验设备: ${dev.name} ---`);
      const devResult = {};

      // 1.1 竖屏视口测试
      const page = await browser.newPage();
      await page.setViewport(dev.portrait);
      await page.goto(BASE_URL, { waitUntil: "networkidle2" });
      await sleep(1000);

      // 打开一个默认视频 (首页推荐卡片)
      const firstCard = await page.waitForSelector(".video-poster-card, .hero-banner-card", { timeout: 6000 });
      await firstCard.click();
      await page.waitForSelector(".bagtrim-player-page", { timeout: 6000 });
      await sleep(1200);

      // 检验图 1 竖屏吸顶与横向无溢出
      const portraitMetrics = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const bodyWidth = document.body.scrollWidth;
        const winWidth = window.innerWidth;
        const player = document.querySelector(".player-sticky-viewport");
        const rect = player ? player.getBoundingClientRect() : null;
        return {
          windowWidth: winWidth,
          windowHeight: window.innerHeight,
          docScrollWidth: docWidth,
          bodyScrollWidth: bodyWidth,
          hasHorizontalOverflow: docWidth > winWidth || bodyWidth > winWidth,
          playerRect: rect ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          } : null,
          isStickyTop: rect ? Math.abs(rect.top) <= 1 : false,
          isFullSpan: rect ? Math.abs(rect.width - winWidth) <= 1 : false
        };
      });

      const shotP1 = `${SCREENSHOT_DIR}/qa_orientation_${dev.prefix}_portrait_fig1.png`;
      await page.screenshot({ path: shotP1 });
      console.log(`    [图 1 竖屏] 视口: ${dev.portrait.width}x${dev.portrait.height}, 溢出: ${portraitMetrics.hasHorizontalOverflow}, 吸顶: ${portraitMetrics.isStickyTop}, 撑满: ${portraitMetrics.isFullSpan}`);
      devResult.portraitFig1 = {
        metrics: portraitMetrics,
        screenshot: shotP1,
        passed: !portraitMetrics.hasHorizontalOverflow && portraitMetrics.isStickyTop && portraitMetrics.isFullSpan
      };

      // 1.2 竖屏点击全屏进入 CSS 伪横屏模式 (图 2)
      const fullscreenBtn = await page.waitForSelector(".portrait-fullscreen-btn", { timeout: 4000 });
      await fullscreenBtn.click();
      await sleep(1200);

      const pseudoLandscapeMetrics = await page.evaluate(() => {
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const playerPage = document.querySelector(".bagtrim-player-page");
        const rect = playerPage ? playerPage.getBoundingClientRect() : null;
        const style = playerPage ? window.getComputedStyle(playerPage) : null;
        const transform = style ? style.transform : "";
        const isRotated = transform.includes("matrix") || transform.includes("rotate");

        // 检查图 2 专有控件状态
        const statusbar = document.querySelector(".ios-landscape-statusbar");
        const topHeader = document.querySelector(".ios-landscape-top-header");
        const bottomBar = document.querySelector(".ios-landscape-bottom-bar");
        const lockBtn = document.querySelector(".screen-lock-floating-btn");

        const statusbarRect = statusbar ? statusbar.getBoundingClientRect() : null;
        const topHeaderRect = topHeader ? topHeader.getBoundingClientRect() : null;
        const bottomBarRect = bottomBar ? bottomBar.getBoundingClientRect() : null;
        const lockBtnRect = lockBtn ? lockBtn.getBoundingClientRect() : null;

        // 检验是否有任何控件被截断 (在视口外)
        const isWithinViewport = (r) => {
          if (!r) return false;
          return r.top >= -1 && r.left >= -1 && r.bottom <= winHeight + 1 && r.right <= winWidth + 1;
        };

        return {
          windowWidth: winWidth,
          windowHeight: winHeight,
          playerPageRect: rect ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          } : null,
          cssTransform: transform,
          isRotated,
          // 容器是否严丝合缝撑满视口 (容差 2px)
          isSeamlessFullViewport: rect ? (
            Math.abs(rect.left) <= 2 &&
            Math.abs(rect.top) <= 2 &&
            Math.abs(rect.width - winWidth) <= 2 &&
            Math.abs(rect.height - winHeight) <= 2
          ) : false,
          controls: {
            hasStatusbar: Boolean(statusbar) && !statusbar.classList.contains("hidden"),
            hasTopHeader: Boolean(topHeader) && !topHeader.classList.contains("hidden"),
            hasBottomBar: Boolean(bottomBar) && !bottomBar.classList.contains("hidden"),
            hasLockBtn: Boolean(lockBtn),
            statusbarInViewport: isWithinViewport(statusbarRect),
            topHeaderInViewport: isWithinViewport(topHeaderRect),
            bottomBarInViewport: isWithinViewport(bottomBarRect),
            lockBtnInViewport: isWithinViewport(lockBtnRect)
          }
        };
      });

      const shotP2 = `${SCREENSHOT_DIR}/qa_orientation_${dev.prefix}_pseudo_landscape_fig2.png`;
      await page.screenshot({ path: shotP2 });
      console.log(`    [图 2 伪横屏] 旋转90度: ${pseudoLandscapeMetrics.isRotated}, 严丝合缝: ${pseudoLandscapeMetrics.isSeamlessFullViewport}, 控件完整在视口: ${pseudoLandscapeMetrics.controls.bottomBarInViewport}`);
      devResult.pseudoLandscapeFig2 = {
        metrics: pseudoLandscapeMetrics,
        screenshot: shotP2,
        passed: pseudoLandscapeMetrics.isRotated &&
                pseudoLandscapeMetrics.isSeamlessFullViewport &&
                pseudoLandscapeMetrics.controls.hasTopHeader &&
                pseudoLandscapeMetrics.controls.hasBottomBar &&
                pseudoLandscapeMetrics.controls.bottomBarInViewport
      };

      await page.close();

      // 1.3 物理横屏视口测试 (浏览器宽度 > 高度)
      const pagePhys = await browser.newPage();
      await pagePhys.setViewport(dev.landscape);
      await pagePhys.goto(BASE_URL, { waitUntil: "networkidle2" });
      await sleep(1000);

      const cardPhys = await pagePhys.waitForSelector(".video-poster-card, .hero-banner-card", { timeout: 6000 });
      await cardPhys.click();
      await pagePhys.waitForSelector(".bagtrim-player-page", { timeout: 6000 });
      await sleep(1200);

      const physLandscapeMetrics = await pagePhys.evaluate(() => {
        const winWidth = window.innerWidth;
        const winHeight = window.innerHeight;
        const docWidth = document.documentElement.scrollWidth;
        const docHeight = document.documentElement.scrollHeight;
        const player = document.querySelector(".player-sticky-viewport");
        const video = document.querySelector(".player-sticky-viewport video");
        const playerRect = player ? player.getBoundingClientRect() : null;
        const videoRect = video ? video.getBoundingClientRect() : null;
        const videoFit = video ? window.getComputedStyle(video).objectFit : "";

        return {
          windowWidth: winWidth,
          windowHeight: winHeight,
          docScrollWidth: docWidth,
          docScrollHeight: docHeight,
          hasHorizontalOverflow: docWidth > winWidth,
          playerRect: playerRect ? {
            left: playerRect.left,
            top: playerRect.top,
            width: playerRect.width,
            height: playerRect.height
          } : null,
          videoRect: videoRect ? {
            left: videoRect.left,
            top: videoRect.top,
            width: videoRect.width,
            height: videoRect.height
          } : null,
          videoObjectFit: videoFit,
          isPlayerFullSpan: playerRect ? (
            Math.abs(playerRect.width - winWidth) <= 2 &&
            Math.abs(playerRect.left) <= 2
          ) : false
        };
      });

      const shotPhys = `${SCREENSHOT_DIR}/qa_orientation_${dev.prefix}_physical_landscape.png`;
      await pagePhys.screenshot({ path: shotPhys });
      console.log(`    [物理横屏] 视口: ${dev.landscape.width}x${dev.landscape.height}, 溢出: ${physLandscapeMetrics.hasHorizontalOverflow}, 播放器满宽: ${physLandscapeMetrics.isPlayerFullSpan}, video fit: ${physLandscapeMetrics.videoObjectFit}`);
      devResult.physicalLandscape = {
        metrics: physLandscapeMetrics,
        screenshot: shotPhys,
        passed: !physLandscapeMetrics.hasHorizontalOverflow &&
                physLandscapeMetrics.isPlayerFullSpan &&
                physLandscapeMetrics.videoObjectFit === "contain"
      };

      await pagePhys.close();
      testReport.sections.multiDeviceOrientation[dev.prefix] = devResult;
    }

    // =========================================================================
    // 专项测试 2：快速反复横跳稳定性压力测试 (10 次循环)
    // =========================================================================
    console.log("\n▶ [测试 2/3] 执行 10 次图 1 ↔ 图 2 快速反复横跳稳定性压力测试...");
    testReport.sections.stressTest = {
      roundsTotal: 10,
      iterations: [],
      errorsDetected: []
    };

    const stressPage = await browser.newPage();
    await stressPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

    // 监听各类运行时异常
    const runtimeErrors = [];
    stressPage.on("pageerror", (err) => {
      runtimeErrors.push({ type: "pageerror", message: err.message });
      console.error("    ⚠️ 检测到页面未捕获异常:", err.message);
    });
    stressPage.on("error", (err) => {
      runtimeErrors.push({ type: "error", message: err.message });
      console.error("    ⚠️ 检测到浏览器崩溃/错误:", err.message);
    });

    await stressPage.goto(BASE_URL, { waitUntil: "networkidle2" });
    await sleep(800);

    const stressCard = await stressPage.waitForSelector(".video-poster-card, .hero-banner-card", { timeout: 6000 });
    await stressCard.click();
    await stressPage.waitForSelector(".bagtrim-player-page", { timeout: 6000 });
    await sleep(1000);

    const initialDomCount = await stressPage.evaluate(() => document.querySelectorAll("*").length);
    const initialMemory = await stressPage.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);

    console.log(`  基准环境数据: 初始 DOM 节点数=${initialDomCount}, 初始 HeapSize=${initialMemory ? (initialMemory / 1024 / 1024).toFixed(2) + "MB" : "N/A"}`);

    for (let i = 1; i <= 10; i++) {
      const iterStartTime = Date.now();

      // 1. 点击图 1 的全屏按钮 -> 进入图 2
      const fsBtn = await stressPage.waitForSelector(".portrait-fullscreen-btn", { timeout: 3000 });
      await fsBtn.click();
      await sleep(350); // 快速高频横跳模拟

      const fig2State = await stressPage.evaluate(() => {
        const topHeader = document.querySelector(".ios-landscape-top-header");
        const bottomBar = document.querySelector(".ios-landscape-bottom-bar");
        const page = document.querySelector(".bagtrim-player-page");
        const video = document.querySelector(".player-sticky-viewport video");
        return {
          isLandscapeClass: page ? page.classList.contains("is-landscape-fullscreen") : false,
          hasTopHeader: Boolean(topHeader),
          hasBottomBar: Boolean(bottomBar),
          videoReadyState: video ? video.readyState : -1,
          videoPaused: video ? video.paused : true,
          videoCurrentTime: video ? video.currentTime : 0
        };
      });

      if (i === 1) {
        await stressPage.screenshot({ path: `${SCREENSHOT_DIR}/qa_orientation_stress_round1_fig2.png` });
      }

      // 2. 点击图 2 的退出按钮 -> 返回图 1
      const backBtn = await stressPage.waitForSelector(".ios-top-btn.back-btn", { timeout: 3000 });
      await backBtn.click();
      await sleep(350); // 快速返回

      const fig1State = await stressPage.evaluate(() => {
        const portraitOverlay = document.querySelector(".portrait-viewport-overlay");
        const page = document.querySelector(".bagtrim-player-page");
        const domCount = document.querySelectorAll("*").length;
        const mem = performance.memory ? performance.memory.usedJSHeapSize : null;
        const video = document.querySelector(".player-sticky-viewport video");
        return {
          isLandscapeClass: page ? page.classList.contains("is-landscape-fullscreen") : false,
          hasPortraitOverlay: Boolean(portraitOverlay),
          domCount,
          usedHeap: mem,
          videoReadyState: video ? video.readyState : -1,
          videoPaused: video ? video.paused : true,
          videoCurrentTime: video ? video.currentTime : 0
        };
      });

      const roundDurationMs = Date.now() - iterStartTime;
      const roundPassed = fig2State.isLandscapeClass &&
                          fig2State.hasTopHeader &&
                          !fig1State.isLandscapeClass &&
                          fig1State.hasPortraitOverlay;

      console.log(`  [轮次 ${i}/10] 耗时: ${roundDurationMs}ms | 进图2: ${fig2State.isLandscapeClass} | 回图1: ${!fig1State.isLandscapeClass} | DOM数: ${fig1State.domCount} | 状态: ${roundPassed ? "✅正常" : "❌异常"}`);

      testReport.sections.stressTest.iterations.push({
        round: i,
        roundDurationMs,
        fig2State,
        fig1State,
        passed: roundPassed
      });
    }

    const finalDomCount = await stressPage.evaluate(() => document.querySelectorAll("*").length);
    const finalMemory = await stressPage.evaluate(() => performance.memory ? performance.memory.usedJSHeapSize : null);
    await stressPage.screenshot({ path: `${SCREENSHOT_DIR}/qa_orientation_stress_round10_fig1.png` });

    testReport.sections.stressTest.domCountDiff = finalDomCount - initialDomCount;
    testReport.sections.stressTest.memoryDiffBytes = (finalMemory && initialMemory) ? (finalMemory - initialMemory) : null;
    testReport.sections.stressTest.errorsDetected = runtimeErrors;
    testReport.sections.stressTest.allRoundsPassed = testReport.sections.stressTest.iterations.every(it => it.passed) && runtimeErrors.length === 0;

    console.log(`  压力测试结果: 10次全部通过=${testReport.sections.stressTest.allRoundsPassed}, DOM增量=${testReport.sections.stressTest.domCountDiff}, 运行时异常数=${runtimeErrors.length}`);

    await stressPage.close();

    // =========================================================================
    // 专项测试 3：跨多部影视剧全屏一致性测试
    // =========================================================================
    console.log("\n▶ [测试 3/3] 执行跨多部影视剧全屏一致性测试 (单集/30集/100+集)...");
    testReport.sections.crossDramaConsistency = {};

    const dramaTestTargets = [
      {
        type: "single_ep_movie",
        name: "深情触摸 (1集正片电影)",
        expectedEpisodes: 1,
        findTarget: async (p) => {
          // 首页就有深情触摸卡片
          const cards = await p.$$(".video-poster-card");
          for (let c of cards) {
            const title = await c.$eval(".card-main-title", el => el.textContent).catch(() => "");
            if (title.includes("深情触摸")) return c;
          }
          return null;
        }
      },
      {
        type: "mid_series_30ep",
        name: "九门 (30集热播电视剧)",
        expectedEpisodes: 30,
        findTarget: async (p) => {
          // 首页的 Hero Banner 就是九门
          const banner = await p.$(".hero-banner-card");
          if (banner) {
            const txt = await banner.evaluate(el => el.textContent);
            if (txt.includes("九门")) return banner;
          }
          // 或者通过热搜词/搜索
          const hotChips = await p.$$(".hot-keyword-chip");
          for (let chip of hotChips) {
            const t = await chip.evaluate(el => el.textContent);
            if (t.includes("南部档案") || t.includes("九门")) return chip;
          }
          return null;
        }
      },
      {
        type: "huge_series_100plus",
        name: "凡人修仙传 / 吞噬星空 (100+集超长动漫)",
        expectedEpisodesMin: 100,
        findTarget: async (p) => {
          // 切换到 动漫 Tab
          const tabs = await p.$$(".channel-tab-item");
          for (const t of tabs) {
            const text = await t.evaluate(el => el.textContent.trim());
            if (text === "动漫") {
              await t.click();
              await sleep(800);
              break;
            }
          }
          const cards = await p.$$(".video-poster-card");
          for (let c of cards) {
            const title = await c.$eval(".card-main-title", el => el.textContent).catch(() => "");
            if (title.includes("吞噬星空") || title.includes("凡人修仙传")) return c;
          }
          return null;
        }
      }
    ];

    for (const drama of dramaTestTargets) {
      console.log(`\n  --- 检验剧目类型: ${drama.name} ---`);
      const dramaResult = {};

      const dPage = await browser.newPage();
      await dPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      await dPage.goto(BASE_URL, { waitUntil: "networkidle2" });
      await sleep(1000);

      const targetEl = await drama.findTarget(dPage);
      if (!targetEl) {
        throw new Error(`无法找到目标测试剧集卡片: ${drama.name}`);
      }

      await targetEl.click();
      await dPage.waitForSelector(".bagtrim-player-page", { timeout: 6000 });
      await sleep(1200);

      // 进入图 2 横屏
      const fsBtn = await dPage.waitForSelector(".portrait-fullscreen-btn", { timeout: 4000 });
      await fsBtn.click();
      await sleep(1000);

      // 1. 检验图 2 顶部标题与集数显示
      const topTitleData = await dPage.evaluate(() => {
        const titleEl = document.querySelector(".ios-top-title-text");
        return {
          titleText: titleEl ? titleEl.textContent.trim() : "",
          exists: Boolean(titleEl)
        };
      });

      const shotFig2 = `${SCREENSHOT_DIR}/qa_orientation_${drama.type}_fig2.png`;
      await dPage.screenshot({ path: shotFig2 });
      console.log(`    [图 2 标题栏] 显示文本: "${topTitleData.titleText}"`);
      dramaResult.topTitle = topTitleData;
      dramaResult.fig2Screenshot = shotFig2;

      // 2. 唤起选集抽屉
      // 查找包含 "选集" 的按钮
      const epDrawerBtn = await dPage.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll(".ios-text-action-btn"));
        return btns.find(b => b.textContent.includes("选集")) || null;
      });

      if (epDrawerBtn) {
        await epDrawerBtn.click();
        await sleep(800);
      } else {
        console.warn("    ⚠️ 未能找到选集按钮！");
      }

      // 检验抽屉结构、标题、分页器与网格
      const drawerData = await dPage.evaluate(() => {
        const drawer = document.querySelector(".fullscreen-ep-drawer");
        const isOpen = drawer ? drawer.classList.contains("open") : false;
        const titleText = drawer ? drawer.querySelector(".drawer-title")?.textContent.trim() : "";
        const countText = drawer ? drawer.querySelector(".drawer-count")?.textContent.trim() : "";
        const pagerChips = Array.from(document.querySelectorAll(".fullscreen-drawer-pagers .drawer-pager-chip")).map(el => el.textContent.trim());
        const gridButtons = Array.from(document.querySelectorAll(".fullscreen-drawer-grid button")).map(el => el.textContent.trim());

        return {
          isOpen,
          titleText,
          countText,
          pagerCount: pagerChips.length,
          pagerChips,
          gridButtonsCount: gridButtons.length,
          firstGridItem: gridButtons[0] || "",
          lastGridItem: gridButtons[gridButtons.length - 1] || ""
        };
      });

      const shotDrawer = `${SCREENSHOT_DIR}/qa_orientation_${drama.type}_drawer.png`;
      await dPage.screenshot({ path: shotDrawer });
      console.log(`    [选集抽屉] 展开: ${drawerData.isOpen}, 标题集数: ${drawerData.countText}, 分页器数量: ${drawerData.pagerCount}, 网格第一页项数: ${drawerData.gridButtonsCount}`);

      dramaResult.drawer = drawerData;
      dramaResult.drawerScreenshot = shotDrawer;

      // 针对不同剧集类型的断言
      if (drama.type === "single_ep_movie") {
        // 单集电影：抽屉应显示 (1集全)，不应该有分页器
        dramaResult.passed = drawerData.isOpen &&
                             drawerData.countText.includes("1集全") &&
                             drawerData.pagerCount === 0 &&
                             drawerData.gridButtonsCount === 1;
        console.log(`    单集电影抽屉断言结果: ${dramaResult.passed ? "✅通过 (无多余分页器，单集适配完美)" : "❌不合规"}`);
      } else if (drama.type === "mid_series_30ep") {
        // 30集电视剧：抽屉应显示 (30集全)，分页器应该有 2 页 (1-25, 26-30)
        dramaResult.passed = drawerData.isOpen &&
                             drawerData.countText.includes("30集全") &&
                             drawerData.pagerCount === 2;
        console.log(`    30集电视剧抽屉断言结果: ${dramaResult.passed ? "✅通过 (分页器恰好2页: 1-25, 26-30)" : "❌不合规"}`);
      } else if (drama.type === "huge_series_100plus") {
        // 100+集长剧：抽屉分页器应 >= 4 个分页胶囊，且网格正常
        dramaResult.passed = drawerData.isOpen &&
                             drawerData.pagerCount >= 4 &&
                             drawerData.gridButtonsCount === 25;
        console.log(`    100+集超长剧抽屉断言结果: ${dramaResult.passed ? `✅通过 (分页器有 ${drawerData.pagerCount} 页，首页25集)` : "❌不合规"}`);
      }

      await dPage.close();
      testReport.sections.crossDramaConsistency[drama.type] = dramaResult;
    }

    // 保存详细 JSON 测试报告
    const reportPath = "/Users/xiaobin/ai-study/aurora-player/tests/qa_viewport_orientation_report.json";
    fs.writeFileSync(reportPath, JSON.stringify(testReport, null, 2), "utf8");
    console.log(`\n📄 测试数据与指标已保存至: ${reportPath}`);

  } catch (err) {
    console.error("执行测试失败:", err);
  } finally {
    await browser.close();
    console.log("================================================================================");
    console.log("🏁 专项测试执行完毕！");
    console.log("================================================================================");
  }
}

runQaTests();
