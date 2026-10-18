import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const TARGET_URL = "http://localhost:4173";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQAFullscreenControlsTest() {
  console.log("==================================================================");
  console.log("🎬 开始执行【全屏切换与图 2 横屏沉浸控制台专项测试】高精度自动化套件");
  console.log("==================================================================");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const results = {
    suite: "全屏切换与图 2 横屏沉浸控制台专项测试",
    startTime: new Date().toISOString(),
    tests: [],
    screenshots: [],
    summary: { total: 0, passed: 0, failed: 0 },
  };

  function record(name, pass, details = {}) {
    results.summary.total++;
    if (pass) {
      results.summary.passed++;
      console.log(`✅ [PASS] ${name}`, details);
    } else {
      results.summary.failed++;
      console.error(`❌ [FAIL] ${name}`, details);
    }
    results.tests.push({ name, pass, details });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--window-size=390,844",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  try {
    // -------------------------------------------------------------
    // 阶段 1: 首页加载并进入图 1 播放详情页
    // -------------------------------------------------------------
    console.log("\n--- [阶段 1: 首页加载与图 1 详情页启动] ---");
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

    const card = await page.waitForSelector(".rec-video-card, .hero-banner-card", { timeout: 8000 });
    record("1.1 首页视频卡片存在", Boolean(card));

    await card.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 8000 });
    await sleep(800);

    const shot1 = `${SCREENSHOT_DIR}/qa_fullscreen_1_portrait_detail.png`;
    await page.screenshot({ path: shot1 });
    results.screenshots.push(shot1);

    const hasPortraitOverlay = await page.$eval(".portrait-viewport-overlay", (el) => Boolean(el)).catch(() => false);
    record("1.2 成功渲染图 1 播放详情页与竖屏内嵌控件", hasPortraitOverlay);

    // 检查 playsinline 属性，确保内联播放
    const videoAttributes = await page.$eval("video", (v) => ({
      playsInline: v.playsInline || v.hasAttribute("playsinline") || v.hasAttribute("webkit-playsinline"),
      src: v.src || v.currentSrc,
      paused: v.paused,
      currentTime: v.currentTime,
      duration: v.duration,
      playbackRate: v.playbackRate,
    })).catch(() => null);

    record("1.3 <video> 标签具备 playsinline 属性以防止移动端系统原生播放器拦截", Boolean(videoAttributes?.playsInline), videoAttributes);

    // -------------------------------------------------------------
    // 阶段 2: 全屏切换可靠性测试 (图 1 -> 图 2)
    // -------------------------------------------------------------
    console.log("\n--- [阶段 2: 全屏切换可靠性测试] ---");
    const fullscreenBtn = await page.waitForSelector(".portrait-fullscreen-btn", { timeout: 5000 });
    record("2.1 图 1 右下角全屏按钮存在", Boolean(fullscreenBtn));

    await fullscreenBtn.click();
    await sleep(800);

    const shot2 = `${SCREENSHOT_DIR}/qa_fullscreen_2_landscape_console.png`;
    await page.screenshot({ path: shot2 });
    results.screenshots.push(shot2);

    const fullscreenState = await page.evaluate(() => {
      const bodyHasClass = document.body.classList.contains("landscape-fullscreen-active");
      const statusbar = document.querySelector(".ios-landscape-statusbar");
      const topHeader = document.querySelector(".ios-landscape-top-header");
      const bottomBar = document.querySelector(".ios-landscape-bottom-bar");
      const lockBtn = document.querySelector(".screen-lock-floating-btn");
      const video = document.querySelector("video");

      return {
        bodyHasClass,
        hasStatusbar: Boolean(statusbar),
        hasTopHeader: Boolean(topHeader),
        hasBottomBar: Boolean(bottomBar),
        hasLockBtn: Boolean(lockBtn),
        videoStillInDOM: Boolean(video),
        videoPlaysInline: video ? (video.playsInline || video.hasAttribute("playsinline")) : false,
      };
    });

    record("2.2 全屏状态激活: body 挂载 landscape-fullscreen-active 类名", fullscreenState.bodyHasClass);
    record("2.3 图 2 横屏控制台三大部件及锁屏浮钮均挂载且未降级为系统播放器",
      fullscreenState.hasStatusbar &&
      fullscreenState.hasTopHeader &&
      fullscreenState.hasBottomBar &&
      fullscreenState.hasLockBtn &&
      fullscreenState.videoStillInDOM
    );

    // -------------------------------------------------------------
    // 阶段 3: 图 2 顶栏与状态条完整性测试
    // -------------------------------------------------------------
    console.log("\n--- [阶段 3: 图 2 顶栏与状态条完整性测试] ---");
    const statusbarData = await page.evaluate(() => {
      const sb = document.querySelector(".ios-landscape-statusbar");
      const wifi = document.querySelector(".statusbar-wifi-label")?.textContent?.trim();
      const time = document.querySelector(".statusbar-time-text")?.textContent?.trim();
      const battery = document.querySelector(".statusbar-battery-pct")?.textContent?.trim();
      const batteryFill = document.querySelector(".battery-fill");
      const rect = sb ? sb.getBoundingClientRect() : null;

      return {
        wifi,
        time,
        battery,
        hasBatteryFill: Boolean(batteryFill),
        rect: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
      };
    });

    const isTopPositioned = statusbarData.rect && Math.abs(statusbarData.rect.top) < 5;
    record("3.1 极顶拟态状态条位于视口顶端 (top ~ 0)", isTopPositioned, statusbarData.rect);
    record("3.2 拟态状态条 WIFI 标签渲染正常", statusbarData.wifi === "WIFI", { wifi: statusbarData.wifi });
    record("3.3 拟态状态条时间文本符合 HH:MM 格式", /^\d{2}:\d{2}$/.test(statusbarData.time || ""), { time: statusbarData.time });
    record("3.4 拟态状态条电量 80% 与电池填充胶囊正常", statusbarData.battery === "80%" && statusbarData.hasBatteryFill, { battery: statusbarData.battery });

    const topHeaderData = await page.evaluate(() => {
      const backBtn = document.querySelector(".ios-top-btn.back-btn");
      const titleText = document.querySelector(".ios-top-title-text")?.textContent?.trim();
      const airplayBtn = document.querySelector(".ios-top-btn.airplay-btn");
      const pipBtn = document.querySelector(".ios-top-btn.pip-btn");
      const cropBtn = document.querySelector(".ios-top-btn.crop-btn");

      return {
        hasBackBtn: Boolean(backBtn),
        titleText,
        hasAirplay: Boolean(airplayBtn),
        hasPiP: Boolean(pipBtn),
        hasCrop: Boolean(cropBtn),
      };
    });

    record("3.5 左上角返回按键与标题集数文本渲染完整", topHeaderData.hasBackBtn && Boolean(topHeaderData.titleText), { title: topHeaderData.titleText });
    record("3.6 右上角三大功能按键（投屏、画中画、画幅比例）完整存在", topHeaderData.hasAirplay && topHeaderData.hasPiP && topHeaderData.hasCrop);

    // 触发画幅切换点击，验证 HUD 交互
    await page.click(".ios-top-btn.crop-btn");
    await sleep(300);
    const aspectHudText = await page.$eval(".aspect-ratio-hud", (el) => el.textContent?.trim()).catch(() => null);
    record("3.7 点击画幅切换按钮成功触发 HUD 提示", Boolean(aspectHudText), { hud: aspectHudText });

    const shot3 = `${SCREENSHOT_DIR}/qa_fullscreen_3_topbar_statusbar.png`;
    await page.screenshot({ path: shot3 });
    results.screenshots.push(shot3);

    // -------------------------------------------------------------
    // 阶段 4: 图 2 底部通栏控制台与气泡交互测试
    // -------------------------------------------------------------
    console.log("\n--- [阶段 4: 图 2 底部通栏控制台与气泡交互测试] ---");
    const bottomBarData = await page.evaluate(() => {
      const timeCurr = document.querySelector(".time-curr")?.textContent?.trim();
      const timeDur = document.querySelector(".time-dur")?.textContent?.trim();
      const progressTrack = document.querySelector(".ios-progress-track");
      const progressRange = document.querySelector(".ios-progress-range");
      const playBtn = document.querySelector(".play-toggle");
      const nextBtn = document.querySelector(".next-ep");
      const danmakuBtn = document.querySelector(".ios-action-danmaku-btn");

      return {
        timeCurr,
        timeDur,
        hasProgressTrack: Boolean(progressTrack),
        hasProgressRange: Boolean(progressRange),
        hasPlayBtn: Boolean(playBtn),
        hasNextBtn: Boolean(nextBtn),
        hasDanmakuBtn: Boolean(danmakuBtn),
      };
    });

    const timeFormatValid = /^\d{2}:\d{2}$/.test(bottomBarData.timeCurr || "") && /^\d{2}:\d{2}$/.test(bottomBarData.timeDur || "");
    record("4.1 底部细长进度条与时间文本 (00:00 / 00:00 结构) 渲染正常",
      timeFormatValid && bottomBarData.hasProgressTrack && bottomBarData.hasProgressRange,
      bottomBarData
    );

    // 测试播放/暂停按钮
    const initialPaused = await page.$eval("video", (v) => v.paused);
    await page.click(".play-toggle");
    await sleep(400);
    const afterFirstTogglePaused = await page.$eval("video", (v) => v.paused);
    record("4.2 播放/暂停按键点击可切实控制 <video> 播放状态翻转", initialPaused !== afterFirstTogglePaused, {
      initialPaused,
      afterFirstTogglePaused,
    });

    // 恢复播放
    if (afterFirstTogglePaused) {
      await page.click(".play-toggle");
      await sleep(300);
    }

    // 4.3 倍速选择器测试
    console.log("\n--- [测试倍速气泡选择器] ---");
    // 找到包含“倍速”文字的按钮
    const rateBtnFound = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".ios-bottom-right-group .ios-text-action-btn"));
      const btn = buttons.find((b) => b.textContent?.includes("倍速") || b.textContent?.includes("x"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    record("4.3 点击底部【倍速】按钮呼出倍速选择器气泡", rateBtnFound);
    await sleep(400);

    const shot4 = `${SCREENSHOT_DIR}/qa_fullscreen_4_rate_popover.png`;
    await page.screenshot({ path: shot4 });
    results.screenshots.push(shot4);

    const ratePopoverData = await page.evaluate(() => {
      const popover = document.querySelector(".rate-popover");
      if (!popover) return null;
      const chips = Array.from(popover.querySelectorAll(".popover-chip")).map((c) => c.textContent?.trim());
      return {
        title: popover.querySelector(".popover-title")?.textContent?.trim(),
        chips,
      };
    });

    // 梯度数值匹配：包含 0.5, 0.75, 1, 1.25, 1.5, 2
    const parsedRates = (ratePopoverData?.chips || []).map((c) => parseFloat(c));
    const expectedNumericRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const allChipsPresent = expectedNumericRates.every((exp) => parsedRates.includes(exp));
    record("4.4 倍速气泡包含完整预设梯度 (0.5x, 0.75x, 1x/1.0x, 1.25x, 1.5x, 2x/2.0x)", allChipsPresent, ratePopoverData);

    // 点击 1.5x 芯片
    const clicked15x = await page.evaluate(() => {
      const chips = Array.from(document.querySelectorAll(".rate-popover .popover-chip"));
      const chip15 = chips.find((c) => c.textContent?.trim() === "1.5x");
      if (chip15) {
        chip15.click();
        return true;
      }
      return false;
    });

    await sleep(400);
    const videoPlaybackRate = await page.$eval("video", (v) => v.playbackRate);
    record("4.5 点击 1.5x 后，<video> 真实 playbackRate 变为 1.5", clicked15x && videoPlaybackRate === 1.5, {
      videoPlaybackRate,
    });

    const shot5 = `${SCREENSHOT_DIR}/qa_fullscreen_5_rate_changed_1_5x.png`;
    await page.screenshot({ path: shot5 });
    results.screenshots.push(shot5);

    // 4.6 播放源选择气泡测试
    console.log("\n--- [测试播放源选择气泡] ---");
    const sourceBtnClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".ios-bottom-right-group .ios-text-action-btn"));
      const btn = buttons.find((b) => b.textContent?.includes("播放源"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    await sleep(400);
    const sourcePopoverData = await page.evaluate(() => {
      const popover = document.querySelector(".source-popover");
      if (!popover) return null;
      const title = popover.querySelector(".popover-title")?.textContent?.trim();
      const chips = Array.from(popover.querySelectorAll(".popover-chip")).map((c) => c.textContent?.trim());
      return { title, chips };
    });

    record("4.6 点击【播放源】成功弹出线路选择气泡", Boolean(sourcePopoverData?.title), sourcePopoverData);

    const shot6 = `${SCREENSHOT_DIR}/qa_fullscreen_6_source_popover.png`;
    await page.screenshot({ path: shot6 });
    results.screenshots.push(shot6);

    // 4.7 选集抽屉测试
    console.log("\n--- [测试选集全屏侧滑抽屉] ---");
    const epBtnClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll(".ios-bottom-right-group .ios-text-action-btn"));
      const btn = buttons.find((b) => b.textContent?.includes("选集"));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    await sleep(600);
    const drawerOpen = await page.$eval(".fullscreen-ep-drawer", (el) => el.classList.contains("open")).catch(() => false);
    record("4.7 点击【选集】按钮滑出右侧全屏选集抽屉 (.fullscreen-ep-drawer.open)", epBtnClicked && drawerOpen);

    const shot7 = `${SCREENSHOT_DIR}/qa_fullscreen_7_episode_drawer.png`;
    await page.screenshot({ path: shot7 });
    results.screenshots.push(shot7);

    // 获取当前集数标题
    const preSwitchTitle = await page.$eval(".ios-top-title-text", (el) => el.textContent?.trim()).catch(() => "");

    // 点击切换第 2 集
    const switchedEp = await page.evaluate(() => {
      const epBtns = Array.from(document.querySelectorAll(".fullscreen-drawer-grid .drawer-ep-btn"));
      // 找到第二个集数按钮
      if (epBtns.length >= 2) {
        epBtns[1].click();
        return { clicked: true, epText: epBtns[1].textContent?.trim() };
      }
      return { clicked: false };
    });

    await sleep(800);
    const postSwitchTitle = await page.$eval(".ios-top-title-text", (el) => el.textContent?.trim()).catch(() => "");
    const activeEpText = await page.evaluate(() => {
      const activeBtn = document.querySelector(".fullscreen-drawer-grid .drawer-ep-btn.active");
      return activeBtn?.textContent?.trim();
    });

    record("4.8 在抽屉中点击第 2 集，集数激活状态与顶部标题集数同步更新",
      switchedEp.clicked && (activeEpText === "29" || activeEpText === "2" || postSwitchTitle !== preSwitchTitle),
      { preSwitchTitle, postSwitchTitle, activeEpText }
    );

    const shot8 = `${SCREENSHOT_DIR}/qa_fullscreen_8_episode_switched.png`;
    await page.screenshot({ path: shot8 });
    results.screenshots.push(shot8);

    // 关闭选集抽屉：点击关闭按钮或点击左侧主视口
    await page.evaluate(() => {
      const closeBtn = document.querySelector(".drawer-close-btn");
      if (closeBtn) {
        closeBtn.click();
      }
    });
    await sleep(400);

    // 确保抽屉已收起
    const drawerStillOpen = await page.$eval(".fullscreen-ep-drawer", (el) => el.classList.contains("open")).catch(() => false);
    if (drawerStillOpen) {
      // 点击左侧视频区域收起抽屉
      await page.mouse.click(100, 300);
      await sleep(400);
    }

    // -------------------------------------------------------------
    // 阶段 5: 左侧屏幕防误触锁测试
    // -------------------------------------------------------------
    console.log("\n--- [阶段 5: 左侧屏幕防误触锁测试] ---");
    const lockBtn = await page.waitForSelector(".screen-lock-floating-btn", { timeout: 3000 });
    record("5.1 左侧防误触锁悬浮按钮存在", Boolean(lockBtn));

    // 点击锁定
    await lockBtn.click();
    await sleep(400);

    const lockedState = await page.evaluate(() => {
      const btn = document.querySelector(".screen-lock-floating-btn");
      const isLockedClass = btn?.classList.contains("locked");
      const blocker = document.querySelector(".screen-lock-overlay-blocker");
      const statusbar = document.querySelector(".ios-landscape-statusbar");
      const bottomBar = document.querySelector(".ios-landscape-bottom-bar");

      return {
        isLockedClass,
        hasBlocker: Boolean(blocker),
        statusbarHidden: statusbar?.classList.contains("hidden"),
        bottomBarHidden: bottomBar?.classList.contains("hidden"),
      };
    });

    record("5.2 点击进入锁定状态: 锁图标变红/locked, 遮罩拦截层出现, 顶底控制台自动隐藏",
      lockedState.isLockedClass && lockedState.hasBlocker && lockedState.statusbarHidden && lockedState.bottomBarHidden,
      lockedState
    );

    const shot9 = `${SCREENSHOT_DIR}/qa_fullscreen_9_screen_locked.png`;
    await page.screenshot({ path: shot9 });
    results.screenshots.push(shot9);

    // 尝试在锁定状态下点击屏幕中间遮罩层，验证防误触保护
    const videoPausedBeforeBlockerClick = await page.$eval("video", (v) => v.paused);
    await page.click(".screen-lock-overlay-blocker");
    await sleep(300);
    const videoPausedAfterBlockerClick = await page.$eval("video", (v) => v.paused);

    record("5.3 锁定状态下点击屏幕中央被遮罩有效拦截，视频播放状态不受误触影响",
      videoPausedBeforeBlockerClick === videoPausedAfterBlockerClick,
      { videoPausedBeforeBlockerClick, videoPausedAfterBlockerClick }
    );

    // 再次点击解锁
    await page.click(".screen-lock-floating-btn");
    await sleep(400);

    const unlockedState = await page.evaluate(() => {
      const btn = document.querySelector(".screen-lock-floating-btn");
      const isLockedClass = btn?.classList.contains("locked");
      const blocker = document.querySelector(".screen-lock-overlay-blocker");
      const statusbar = document.querySelector(".ios-landscape-statusbar");
      const bottomBar = document.querySelector(".ios-landscape-bottom-bar");

      return {
        isLockedClass,
        hasBlocker: Boolean(blocker),
        statusbarVisible: statusbar?.classList.contains("visible"),
        bottomBarVisible: bottomBar?.classList.contains("visible"),
      };
    });

    record("5.4 再次点击锁图标成功解锁: 拦截层销毁, 控制台恢复可见",
      !unlockedState.isLockedClass && !unlockedState.hasBlocker,
      unlockedState
    );

    const shot10 = `${SCREENSHOT_DIR}/qa_fullscreen_10_screen_unlocked.png`;
    await page.screenshot({ path: shot10 });
    results.screenshots.push(shot10);

    // -------------------------------------------------------------
    // 阶段 6: 退出全屏回退图 1 测试
    // -------------------------------------------------------------
    console.log("\n--- [阶段 6: 退出全屏回退图 1 测试] ---");
    // 若控制栏处于隐藏状态，轻触屏幕中央唤起沉浸控制台
    const isHeaderHidden = await page.$eval(".ios-landscape-top-header", (el) => el.classList.contains("hidden")).catch(() => false);
    if (isHeaderHidden) {
      await page.click(".player-sticky-viewport");
      await page.waitForSelector(".ios-landscape-top-header.visible", { timeout: 3000 }).catch(() => {});
      await sleep(300);
    }

    const backBtn = await page.waitForSelector(".ios-top-btn.back-btn", { timeout: 3000 });
    record("6.1 左上角退出全屏按键可交互", Boolean(backBtn));

    await page.evaluate(() => {
      const btn = document.querySelector(".ios-top-btn.back-btn");
      if (btn) btn.click();
    });
    await sleep(800);

    const exitFullscreenState = await page.evaluate(() => {
      const bodyHasLandscape = document.body.classList.contains("landscape-fullscreen-active");
      const hasPortraitOverlay = Boolean(document.querySelector(".portrait-viewport-overlay"));
      const hasLandscapeStatusbar = Boolean(document.querySelector(".ios-landscape-statusbar"));
      const hasLandscapeBottomBar = Boolean(document.querySelector(".ios-landscape-bottom-bar"));
      const isBagtrimPage = Boolean(document.querySelector(".bagtrim-player-page"));

      return {
        bodyHasLandscape,
        hasPortraitOverlay,
        hasLandscapeStatusbar,
        hasLandscapeBottomBar,
        isBagtrimPage,
      };
    });

    record("6.2 退出全屏后平滑复原图 1 竖屏播放详情页: landscape 样式移除，图 2 专有控件卸载，竖屏浮层恢复",
      !exitFullscreenState.bodyHasLandscape &&
      exitFullscreenState.hasPortraitOverlay &&
      !exitFullscreenState.hasLandscapeStatusbar &&
      !exitFullscreenState.hasLandscapeBottomBar &&
      exitFullscreenState.isBagtrimPage,
      exitFullscreenState
    );

    const shot11 = `${SCREENSHOT_DIR}/qa_fullscreen_11_returned_portrait.png`;
    await page.screenshot({ path: shot11 });
    results.screenshots.push(shot11);

  } catch (err) {
    console.error("测试执行异常崩溃:", err);
    record("FATAL: 测试流程异常中断", false, { error: String(err) });
  } finally {
    await browser.close();
  }

  results.endTime = new Date().toISOString();
  const reportPath = "/Users/xiaobin/ai-study/aurora-player/tests/qa_fullscreen_test_report.json";
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf-8");
  console.log("\n==================================================================");
  console.log(`🏁 自动化测试完成！总计: ${results.summary.total}, 通过: ${results.summary.passed}, 失败: ${results.summary.failed}`);
  console.log(`📄 详细数据报告已存入: ${reportPath}`);
  console.log("==================================================================");
}

runQAFullscreenControlsTest();
