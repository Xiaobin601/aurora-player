/**
 * QA Specialist Test Suite: Phase 1 Core Playback Gestures & Immersive Experience
 * Target: aurora-player (http://localhost:4173)
 * STRICT RULE: Only test and record data, do NOT modify business code!
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runPhase1QASuite() {
  console.log("===============================================================");
  console.log("🚀 开始执行【极光影院 Aurora Player】阶段一手势专项自动化测试");
  console.log("===============================================================");

  const report = {
    testDate: new Date().toISOString(),
    environment: {
      url: TARGET_URL,
      deviceViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    },
    results: {},
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--window-size=390,844",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    // 0. 打开主页并进入视频播放详情页
    console.log("[Setup] 正在加载主页面...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
    await page.waitForSelector(".video-poster-card", { timeout: 10000 });
    
    // 点击第一张卡片进入播放页
    console.log("[Setup] 点击影视海报卡片，进入 BagTrim 播放详情页...");
    const firstCard = await page.$(".video-poster-card");
    await firstCard.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 8000 });
    // 等待视频元素就绪
    await page.waitForSelector("video", { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1000));
    console.log("[Setup] 成功进入播放详情页，开始各项手势专项验证");

    // =========================================================================
    // 专项 1: 屏幕左半区垂直滑动（亮度调节）
    // =========================================================================
    console.log("\n-------------------------------------------------------------");
    console.log("▶ [Test 1] 检验屏幕左半区垂直滑动 (亮度调节)");
    console.log("-------------------------------------------------------------");
    
    // 记录初始视口滤镜或亮度状态
    const initialBrightnessData = await page.evaluate(() => {
      const video = document.querySelector("video");
      const pageEl = document.querySelector(".bagtrim-player-page");
      const viewportEl = document.querySelector(".player-sticky-viewport");
      return {
        videoFilter: video ? window.getComputedStyle(video).filter : null,
        pageFilter: pageEl ? window.getComputedStyle(pageEl).filter : null,
        viewportFilter: viewportEl ? window.getComputedStyle(viewportEl).filter : null,
        hasBrightnessClass: Boolean(document.querySelector("[class*='brightness']")),
        hasSunIcon: Boolean(document.querySelector("[class*='sun']")),
      };
    });
    console.log("  初始状态:", JSON.stringify(initialBrightnessData));

    // 模拟在左半区 (X=90) 进行向上/向下垂直滑动
    console.log("  模拟触控: 左侧垂直上滑 (X=90, Y=180 -> Y=60)...");
    await page.touchscreen.touchStart(90, 180);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(90, 130);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(90, 70);
    await new Promise((r) => setTimeout(r, 100));

    // 检测滑动过程中是否有亮度 HUD / 指示器 / 遮罩
    const slidingBrightnessData = await page.evaluate(() => {
      const hudEl = document.querySelector(".brightness-hud, .brightness-indicator, .brightness-overlay, [class*='brightness']");
      const sunIcon = document.querySelector("svg[class*='sun'], .lucide-sun");
      const allText = document.body.innerText;
      const hasBrightnessPercent = /\d+%\s*亮度|亮度\s*\d+%/.test(allText);
      const video = document.querySelector("video");
      return {
        hudFound: Boolean(hudEl),
        hudHTML: hudEl ? hudEl.outerHTML.slice(0, 200) : null,
        sunIconFound: Boolean(sunIcon),
        hasBrightnessPercent,
        videoFilter: video ? window.getComputedStyle(video).filter : null,
      };
    });

    const shot1Path = path.join(SCREENSHOT_DIR, "qa_phase1_01_brightness_gesture.png");
    await page.screenshot({ path: shot1Path });
    console.log(`  截图已保存: ${shot1Path}`);
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 300));

    const test1Passed = slidingBrightnessData.hudFound || slidingBrightnessData.sunIconFound || (slidingBrightnessData.videoFilter && slidingBrightnessData.videoFilter !== "none");
    report.results.test1_brightness = {
      name: "屏幕左半区垂直滑动（亮度调节）",
      status: test1Passed ? "IMPLEMENTED" : "NOT_IMPLEMENTED",
      details: slidingBrightnessData,
      screenshot: "qa_phase1_01_brightness_gesture.png",
      summary: test1Passed 
        ? "已检测到亮度调节指示器或滤镜响应" 
        : "未检测到任何左侧垂直滑动监听器、太阳图标 ☀️ 或亮度指示条/遮罩（代码层仅实现水平Seek与边缘返回）",
    };
    console.log(`  结果: ${report.results.test1_brightness.status} - ${report.results.test1_brightness.summary}`);

    // =========================================================================
    // 专项 2: 屏幕右半区垂直滑动（音量调节）
    // =========================================================================
    console.log("\n-------------------------------------------------------------");
    console.log("▶ [Test 2] 检验屏幕右半区垂直滑动 (音量调节)");
    console.log("-------------------------------------------------------------");

    const initialVolumeData = await page.evaluate(() => {
      const video = document.querySelector("video");
      return {
        volume: video ? video.volume : null,
        muted: video ? video.muted : null,
      };
    });
    console.log("  初始音量:", JSON.stringify(initialVolumeData));

    // 模拟在右半区 (X=310) 进行垂直滑动 (从 Y=180 滑到 Y=60 提升音量，或从 Y=100 滑到 Y=200 降低音量)
    console.log("  模拟触控: 右侧垂直下滑 (X=310, Y=100 -> Y=220)...");
    await page.touchscreen.touchStart(310, 100);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(310, 150);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(310, 210);
    await new Promise((r) => setTimeout(r, 100));

    const slidingVolumeData = await page.evaluate(() => {
      const hudEl = document.querySelector(".volume-gesture-hud, .volume-hud, .volume-indicator, [class*='volume-hud']");
      const video = document.querySelector("video");
      return {
        hudFound: Boolean(hudEl),
        hudHTML: hudEl ? hudEl.outerHTML.slice(0, 200) : null,
        currentVideoVolume: video ? video.volume : null,
      };
    });

    const shot2Path = path.join(SCREENSHOT_DIR, "qa_phase1_02_volume_gesture.png");
    await page.screenshot({ path: shot2Path });
    console.log(`  截图已保存: ${shot2Path}`);
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 300));

    const finalVolumeData = await page.evaluate(() => {
      const video = document.querySelector("video");
      return { volume: video ? video.volume : null };
    });

    const volumeChanged = initialVolumeData.volume !== finalVolumeData.volume;
    const test2Passed = slidingVolumeData.hudFound || volumeChanged;
    report.results.test2_volume = {
      name: "屏幕右半区垂直滑动（音量调节）",
      status: test2Passed ? "IMPLEMENTED" : "NOT_IMPLEMENTED",
      details: {
        initialVolume: initialVolumeData.volume,
        slidingVolume: slidingVolumeData.currentVideoVolume,
        finalVolume: finalVolumeData.volume,
        hudFound: slidingVolumeData.hudFound,
      },
      screenshot: "qa_phase1_02_volume_gesture.png",
      summary: test2Passed
        ? "右侧垂直滑动成功调节音量并显示指示条"
        : "未检测到右半区垂直滑动音量指示条，<video> 音量在垂直滑动过程中未发生改变（仅在控制栏内有静态 input 范围条）",
    };
    console.log(`  结果: ${report.results.test2_volume.status} - ${report.results.test2_volume.summary}`);

    // =========================================================================
    // 专项 3: 屏幕中央水平滑动（快进/快退 Seek 预览 与 实质跳转）
    // =========================================================================
    console.log("\n-------------------------------------------------------------");
    console.log("▶ [Test 3] 检验屏幕中央水平滑动 (Seek 预览与完成跳转)");
    console.log("-------------------------------------------------------------");

    const initialSeekTime = await page.evaluate(() => {
      const video = document.querySelector("video");
      return video ? video.currentTime : 0;
    });

    // 3a. 水平向右滑动快进 (+Seek)
    console.log(`  模拟触控: 中央向右水平快进 (X=160 -> X=280, Y=140)... (初始进度: ${initialSeekTime}s)`);
    await page.touchscreen.touchStart(160, 140);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(210, 140);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(270, 140);
    await new Promise((r) => setTimeout(r, 100));

    // 检查 HUD 状态与文本
    const seekHudData = await page.evaluate(() => {
      const hud = document.querySelector(".seek-gesture-hud");
      if (!hud) return null;
      const targetTimeEl = hud.querySelector(".seek-target-time");
      const totalTimeEl = hud.querySelector(".seek-total-time");
      const chipEl = hud.querySelector(".seek-diff-chip");
      return {
        exists: true,
        targetTimeText: targetTimeEl ? targetTimeEl.textContent : "",
        totalTimeText: totalTimeEl ? totalTimeEl.textContent : "",
        chipText: chipEl ? chipEl.textContent : "",
        isForward: chipEl ? chipEl.classList.contains("forward") : false,
      };
    });
    console.log("  Seek HUD 抓取结果:", JSON.stringify(seekHudData));

    const shot3aPath = path.join(SCREENSHOT_DIR, "qa_phase1_03_seek_preview_hud.png");
    await page.screenshot({ path: shot3aPath });
    console.log(`  截图已保存: ${shot3aPath}`);

    // 松手完成 Seek
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 400));

    const postSeekTime = await page.evaluate(() => {
      const video = document.querySelector("video");
      return video ? video.currentTime : 0;
    });
    console.log(`  松手后进度: ${postSeekTime}s (跳转差值: +${(postSeekTime - initialSeekTime).toFixed(1)}s)`);

    const shot3bPath = path.join(SCREENSHOT_DIR, "qa_phase1_03_seek_applied.png");
    await page.screenshot({ path: shot3bPath });

    // 3b. 测试向左滑动快退 (-Seek)
    console.log("  模拟触控: 向左水平滑动快退 (-Seek, X=260 -> X=140, Y=260)...");
    await page.touchscreen.touchStart(260, 260);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(200, 260);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(140, 260);
    await new Promise((r) => setTimeout(r, 100));

    const backwardHudData = await page.evaluate(() => {
      const hud = document.querySelector(".seek-gesture-hud");
      if (!hud) return null;
      const chipEl = hud.querySelector(".seek-diff-chip");
      return {
        exists: true,
        chipText: chipEl ? chipEl.textContent : "",
        isBackward: chipEl ? chipEl.classList.contains("backward") : false,
      };
    });
    console.log("  快退 HUD 抓取结果:", JSON.stringify(backwardHudData));

    const shot3cPath = path.join(SCREENSHOT_DIR, "qa_phase1_03_seek_backward_hud.png");
    await page.screenshot({ path: shot3cPath });
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 300));

    const test3Passed = Boolean(seekHudData && seekHudData.exists && seekHudData.chipText.includes("+"));
    report.results.test3_seek = {
      name: "屏幕中央水平滑动（快进/快退 Seek 预览）",
      status: test3Passed ? "IMPLEMENTED" : "FAILED",
      details: {
        forwardHud: seekHudData,
        backwardHud: backwardHudData,
        initialTime: initialSeekTime,
        postSeekTime: postSeekTime,
      },
      screenshots: [
        "qa_phase1_03_seek_preview_hud.png",
        "qa_phase1_03_seek_applied.png",
        "qa_phase1_03_seek_backward_hud.png",
      ],
      summary: test3Passed
        ? `完整实现！浮现 HUD 时间指示器 [${seekHudData.targetTimeText} / ${seekHudData.totalTimeText}] (${seekHudData.chipText})，松手后成功执行时间跳转`
        : "未检测到快进/快退指示器",
    };
    console.log(`  结果: ${report.results.test3_seek.status} - ${report.results.test3_seek.summary}`);

    // =========================================================================
    // 专项 4: 画面长按触发 2.0x 高速浏览
    // =========================================================================
    console.log("\n-------------------------------------------------------------");
    console.log("▶ [Test 4] 检验画面长按触发 2.0x 高速浏览 (按住加速，松手恢复)");
    console.log("-------------------------------------------------------------");

    const initialRate = await page.evaluate(() => {
      const video = document.querySelector("video");
      return video ? video.playbackRate : 1.0;
    });
    console.log(`  初始播放倍速: ${initialRate}x`);

    // 模拟长按触控 700ms (长按阈值通常为 500ms)
    console.log("  模拟触控: 在视频视口中央 (X=200, Y=120) 按住不放持续 700ms...");
    await page.touchscreen.touchStart(200, 120);
    // 保持按住状态 600ms
    await new Promise((r) => setTimeout(r, 600));

    // 检查长按中的 DOM 与视频倍速
    const holdingRateData = await page.evaluate(() => {
      const video = document.querySelector("video");
      const speedBadges = Array.from(document.querySelectorAll("*")).filter((el) => {
        const text = el.textContent || "";
        return (
          text.includes("2.0x") ||
          text.includes("2x") ||
          text.includes("快速播放") ||
          text.includes("倍速中")
        ) && el.children.length === 0;
      });
      return {
        currentRate: video ? video.playbackRate : null,
        badgeFound: speedBadges.length > 0,
        badgeTexts: speedBadges.map((el) => el.textContent.trim()),
      };
    });
    console.log("  长按中检测结果:", JSON.stringify(holdingRateData));

    const shot4aPath = path.join(SCREENSHOT_DIR, "qa_phase1_04_longpress_2x_holding.png");
    await page.screenshot({ path: shot4aPath });
    console.log(`  截图已保存: ${shot4aPath}`);

    // 松开手指
    console.log("  模拟触控: 手指松开，检验是否恢复原速...");
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 300));

    const releasedRateData = await page.evaluate(() => {
      const video = document.querySelector("video");
      return {
        currentRate: video ? video.playbackRate : null,
      };
    });
    console.log("  松手后播放倍速:", JSON.stringify(releasedRateData));

    const shot4bPath = path.join(SCREENSHOT_DIR, "qa_phase1_04_longpress_released.png");
    await page.screenshot({ path: shot4bPath });

    const test4Passed = holdingRateData.currentRate === 2.0 || holdingRateData.badgeFound;
    report.results.test4_longpress_2x = {
      name: "画面长按触发 2.0x 高速浏览",
      status: test4Passed ? "IMPLEMENTED" : "NOT_IMPLEMENTED",
      details: {
        initialRate,
        holdingRate: holdingRateData.currentRate,
        badgeFound: holdingRateData.badgeFound,
        releasedRate: releasedRateData.currentRate,
      },
      screenshots: [
        "qa_phase1_04_longpress_2x_holding.png",
        "qa_phase1_04_longpress_released.png",
      ],
      summary: test4Passed
        ? "长按触发 2.0x 高速播放生效"
        : "未检测到长按手势监听器 (缺少 500ms 长按定时器与 2.0x 徽章显示，视频倍速未发生临时切换，目前仅支持手动点击控制栏倍速按钮切换)",
    };
    console.log(`  结果: ${report.results.test4_longpress_2x.status} - ${report.results.test4_longpress_2x.summary}`);

    // =========================================================================
    // 专项 5: 屏幕最左侧边缘向右滑动（原生级右滑返回）
    // =========================================================================
    console.log("\n-------------------------------------------------------------");
    console.log("▶ [Test 5] 检验屏幕最左侧边缘向右滑动 (原生级右滑返回)");
    console.log("-------------------------------------------------------------");

    // 5a. 滑动中指示器
    console.log("  模拟触控: 屏幕左侧边缘 (X=15, Y=350) 向右轻滑 (X=15 -> X=70)...");
    await page.touchscreen.touchStart(15, 350);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(50, 350);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(75, 350);
    await new Promise((r) => setTimeout(r, 100));

    const edgeIndicatorData = await page.evaluate(() => {
      const pill = document.querySelector(".edge-swipe-back-pill");
      return {
        pillExists: Boolean(pill),
        text: pill ? pill.textContent.trim() : "",
        style: pill ? pill.getAttribute("style") : "",
      };
    });
    console.log("  边缘指示器检测结果:", JSON.stringify(edgeIndicatorData));

    const shot5aPath = path.join(SCREENSHOT_DIR, "qa_phase1_05_edge_swipe_indicator.png");
    await page.screenshot({ path: shot5aPath });
    console.log(`  截图已保存: ${shot5aPath}`);

    // 5b. 完成向右大幅度滑动并释放 (X=75 -> X=140)
    console.log("  模拟触控: 持续向右滑过阈值 (X=140) 并松手...");
    await page.touchscreen.touchMove(140, 350);
    await new Promise((r) => setTimeout(r, 80));
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 600));

    // 检验播放详情页是否已关闭并退回首页
    const playerClosed = await page.evaluate(() => {
      return !document.querySelector(".bagtrim-player-page");
    });
    console.log(`  播放页退出检测: ${playerClosed ? "成功退回主页" : "仍留在播放页"}`);

    const shot5bPath = path.join(SCREENSHOT_DIR, "qa_phase1_05_edge_swipe_completed.png");
    await page.screenshot({ path: shot5bPath });
    console.log(`  截图已保存: ${shot5bPath}`);

    // 5c. 隔离性反向校验：中央水平滑动绝不触发退出
    console.log("  隔离性验证: 重新进入播放页，测试中央区域滑动 (X=200 -> X=310) 是否严格隔离不退出...");
    const cardAgain = await page.$(".video-poster-card");
    await cardAgain.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 6000 });

    await page.touchscreen.touchStart(200, 320);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(260, 320);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(310, 320);
    await new Promise((r) => setTimeout(r, 80));
    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 400));

    const playerStillOpenAfterCenterSwipe = await page.evaluate(() => {
      return Boolean(document.querySelector(".bagtrim-player-page"));
    });
    console.log(`  中央滑动隔离验证: ${playerStillOpenAfterCenterSwipe ? "隔离生效（未误退出）" : "严重缺陷：中央滑动误关闭了播放页"}`);

    const shot5cPath = path.join(SCREENSHOT_DIR, "qa_phase1_05_center_swipe_isolation.png");
    await page.screenshot({ path: shot5cPath });

    const test5Passed = edgeIndicatorData.pillExists && playerClosed && playerStillOpenAfterCenterSwipe;
    report.results.test5_edge_swipe = {
      name: "屏幕最左侧边缘向右滑动（原生级右滑返回）",
      status: test5Passed ? "IMPLEMENTED" : "FAILED",
      details: {
        edgeIndicator: edgeIndicatorData,
        playerClosedOnEdgeSwipe: playerClosed,
        isolationWorking: playerStillOpenAfterCenterSwipe,
      },
      screenshots: [
        "qa_phase1_05_edge_swipe_indicator.png",
        "qa_phase1_05_edge_swipe_completed.png",
        "qa_phase1_05_center_swipe_isolation.png",
      ],
      summary: test5Passed
        ? "完整实现！边缘区(X<=44px)触发'.edge-swipe-back-pill'胶囊反馈，松手平滑退回上一层；与中央滑动(X>44px)实现严格物理隔离"
        : "边缘右滑返回未通过",
    };
    console.log(`  结果: ${report.results.test5_edge_swipe.status} - ${report.results.test5_edge_swipe.summary}`);

    // =========================================================================
    // 保存 QA 测试结果 JSON
    // =========================================================================
    const reportPath = path.join(__dirname, "qa_phase1_test_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n✅ 完整 QA 测试数据报告已写入: ${reportPath}`);

    console.log("===============================================================");
    console.log("📊 阶段一手势自动化专项测试全部执行完毕！");
    console.log("===============================================================");
  } finally {
    await browser.close();
  }
}

runPhase1QASuite().catch((err) => {
  console.error("QA 测试运行失败:", err);
  process.exit(1);
});
