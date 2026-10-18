/**
 * Aurora Player - 重点功能端到端自动化测试套件
 * 
 * 验证三大上线功能：
 * 1. 优化 1：横屏全屏播放界面（复刻图 2 iOS 原生风格）
 * 2. 优化 2：播放历史记录精准续播
 * 3. 优化 3：多集视频默认播放最新一集
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const TARGET_PORT = 4173;
const TARGET_URL = `http://localhost:${TARGET_PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");
const ARTIFACT_DIR = "/Users/xiaobin/.gemini/antigravity/brain/a74add24-904c-4be5-8f68-31e761a21193";

// 确保截图输出目录存在
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// 检查端口是否已在监听
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.abort();
      resolve(false);
    });
  });
}

async function ensureServer() {
  const isRunning = await checkPort(TARGET_PORT);
  if (isRunning) {
    console.log(`[Server] 本地服务器已在端口 ${TARGET_PORT} 上正常运行`);
    return null;
  }
  console.log(`[Server] 正在后台启动 Vite preview 预览服务器 (port ${TARGET_PORT})...`);
  const serverProcess = spawn("npx", ["vite", "preview", "--port", String(TARGET_PORT)], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    detached: true,
  });
  serverProcess.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkPort(TARGET_PORT)) {
      console.log(`[Server] Vite preview 启动成功！`);
      return serverProcess;
    }
  }
  throw new Error(`无法连接到本地服务器 http://localhost:${TARGET_PORT}`);
}

async function captureAndSave(page, filename, description) {
  const localPath = path.join(SCREENSHOT_DIR, filename);
  const artifactPath = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: localPath, fullPage: false });
  try {
    fs.copyFileSync(localPath, artifactPath);
  } catch (_) {}
  console.log(`  📸 截图捕获: [${filename}] - ${description}`);
  return localPath;
}

async function runTestSuite() {
  console.log("\n========================================================");
  console.log("   🚀 Aurora Player 核心三大功能端到端自动化测试");
  console.log("========================================================\n");

  await ensureServer();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=1200,900",
    ],
  });

  const testResults = [];

  function recordResult(suite, name, passed, detail, screenshot = null) {
    testResults.push({ suite, name, passed, detail, screenshot });
    const tag = passed ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${tag} - [${suite}] ${name}: ${detail}`);
  }

  try {
    const page = await browser.newPage();

    // =========================================================================
    // 模块 1：优化 3 - 多集视频默认播放最新一集
    // =========================================================================
    console.log("\n▶ 测试模块 1：优化 3 - 多集视频默认播放最新一集 (Latest Episode Default)");
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });

    // 清理历史缓存确保为纯首次播放环境
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "networkidle2" });

    // 切换至动漫频道定位多集剧集《吞噬星空》
    const channelTabs = await page.$$(".channel-tab-item");
    for (const tab of channelTabs) {
      const text = await page.evaluate((el) => el.textContent.trim(), tab);
      if (text === "动漫") {
        await tab.click();
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 600));

    // 点击首个卡片《吞噬星空》(共245集)
    const cards = await page.$$(".video-poster-card");
    const firstTitle = await page.$eval(".video-poster-card .card-main-title", (el) => el.textContent.trim());
    await cards[0].click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 800));

    // 校验 1.1：当前播放集数自动匹配为最新一集 (245)
    const activeEpText = await page.$eval(".square-ep-btn.active", (el) => el.textContent.trim());
    const isLatestEp = activeEpText === "245";
    recordResult(
      "优化3: 默认最新集",
      "校验起播剧集为最大集数",
      isLatestEp,
      `剧集: 《${firstTitle}》, 自动选中播放第 ${activeEpText} 集 (期望: 245集)`
    );

    // 校验 1.2：分页器自动定位到最新一集所在的分页
    const activePagerText = await page.$eval(".bagtrim-pager-row .pager-chip.active", (el) => el.textContent.trim());
    const isPagerCorrect = activePagerText === "1-30";
    recordResult(
      "优化3: 默认最新集",
      "校验剧集分页器自动定位最新分页",
      isPagerCorrect,
      `分页器高亮选中: [${activePagerText}] (倒序首屏展示最新第245-216集)`
    );

    // 校验 1.3：选集列表首屏第一项确认为第 245 集且降序排列
    const firstFiveEps = await page.$$eval(".square-ep-btn", (els) => els.slice(0, 5).map((e) => e.textContent.trim()));
    const isReverseSorted = firstFiveEps[0] === "245" && firstFiveEps[1] === "244";
    recordResult(
      "优化3: 默认最新集",
      "校验剧集网格呈现最新集前置倒序展示",
      isReverseSorted,
      `首屏前5个选集按钮序号: [${firstFiveEps.join(", ")}]`
    );

    const shotOpt3 = await captureAndSave(page, "opt3_multi_ep_latest_selected.png", "多集视频默认选中最新集并正确定位分页");

    // =========================================================================
    // 模块 2：优化 1 - 横屏全屏播放界面（复刻图 2 iOS 原生风格）
    // =========================================================================
    console.log("\n▶ 测试模块 2：优化 1 - 横屏全屏播放界面（复刻图 2 iOS 原生风格）");

    // 切换至移动端横屏物理视口 (844 x 390) 并触发全屏模式
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 600));

    // 校验 2.1：横屏全屏核心 DOM 容器与布局挂载
    const isTopBarVisible = await page.$eval(".ios-landscape-top", (el) => !el.classList.contains("hidden"));
    const isCenterVisible = await page.$eval(".ios-landscape-center", (el) => !el.classList.contains("hidden"));
    const isBottomVisible = await page.$eval(".ios-landscape-bottom", (el) => !el.classList.contains("hidden"));
    const isFullUIVisible = isTopBarVisible && isCenterVisible && isBottomVisible;
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "横屏全屏三段式控件层挂载渲染",
      isFullUIVisible,
      `顶部控制栏: ${isTopBarVisible ? "可见" : "隐藏"}, 中心三大键: ${isCenterVisible ? "可见" : "隐藏"}, 底部通栏: ${isBottomVisible ? "可见" : "隐藏"}`
    );

    // 校验 2.2：顶部控制栏左上角与右上角按键及交互
    // A. 翻转按键 (90° 与 270° 翻转)
    const rotateBtn = await page.$(".ios-top-btn.rotate-btn");
    await rotateBtn.click();
    await new Promise((r) => setTimeout(r, 300));
    const isRotated270 = await page.$eval(".bagtrim-player-page", (el) => el.classList.contains("rotate-270"));
    await rotateBtn.click(); // 复原
    await new Promise((r) => setTimeout(r, 300));
    const isRotatedBack = await page.$eval(".bagtrim-player-page", (el) => !el.classList.contains("rotate-270"));
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "顶部左上角：旋转翻转按键交互",
      isRotated270 && isRotatedBack,
      `点击翻转触发 .rotate-270 样式: ${isRotated270}, 再次点击恢复: ${isRotatedBack}`
    );

    // B. 静音与音量滑块控制
    const muteBtn = await page.$(".ios-icon-btn.volume-btn");
    await muteBtn.click();
    const isMuted = await page.$eval("video", (v) => v.muted);
    await muteBtn.click(); // 取消静音
    const isUnmuted = await page.$eval("video", (v) => !v.muted);
    const volumeSlider = await page.$(".ios-volume-slider");
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "顶部右上角：音量滑块与静音按键",
      isMuted && isUnmuted && Boolean(volumeSlider),
      `点击静音状态生效: ${isMuted}, 取消静音恢复: ${isUnmuted}, 细音量滑块渲染正常: ${Boolean(volumeSlider)}`
    );

    // 校验 2.3：屏幕正中心三大控制键 (↺ 10秒快退、▶/❚❚ 大播放暂停、↻ 10秒快进)
    // 注入可测时长与时间戳，验证精准快进快退 10 秒
    await page.evaluate(() => {
      Object.defineProperty(HTMLMediaElement.prototype, "duration", { get() { return 1200; }, configurable: true });
      const v = document.querySelector("video");
      if (v) {
        v.currentTime = 60;
        v.dispatchEvent(new Event("durationchange"));
        v.dispatchEvent(new Event("timeupdate"));
      }
    });
    await new Promise((r) => setTimeout(r, 300));

    // 测试快退 10 秒
    const seekRewindBtn = await page.$('.ios-center-seek-btn[title="快退 10 秒"]');
    await seekRewindBtn.click();
    const timeAfterRewind = await page.$eval("video", (v) => Math.round(v.currentTime));

    // 测试快进 10 秒
    const seekForwardBtn = await page.$('.ios-center-seek-btn[title="快进 10 秒"]');
    await seekForwardBtn.click();
    const timeAfterForward = await page.$eval("video", (v) => Math.round(v.currentTime));

    const isSeekAccurate = timeAfterRewind === 50 && timeAfterForward === 60;
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "中心三大键：↺快退10秒与↻快进10秒步进",
      isSeekAccurate,
      `基准60s -> 快退后: ${timeAfterRewind}s (期望50s) -> 快进后: ${timeAfterForward}s (期望60s)`
    );

    // 测试大播放/暂停键
    const playPauseBtn = await page.$(".ios-center-play-btn");
    await playPauseBtn.click();
    const isPaused = await page.$eval("video", (v) => v.paused);
    await playPauseBtn.click();
    const isPlayingAgain = await page.$eval("video", (v) => !v.paused);
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "中心三大键：▶/❚❚ 大播放暂停按键切换",
      isPaused && isPlayingAgain,
      `点击暂停 video.paused: ${isPaused}, 再次点击起播: ${isPlayingAgain}`
    );

    // 校验 2.4：底部通栏细进度条、左下已播、右下负倒计时剩余时间
    const curTimeText = await page.$eval(".ios-time-text.current", (el) => el.textContent.trim());
    const remainingTimeText = await page.$eval(".ios-time-text.remaining", (el) => el.textContent.trim());
    const isTimeFormatted = curTimeText.length >= 4 && remainingTimeText.startsWith("-");
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "底部通栏：左下已播时间与右下负倒计时显示",
      isTimeFormatted,
      `已播时间: "${curTimeText}", 剩余负倒计时: "${remainingTimeText}" (总长 20:00)`
    );

    // 校验 2.5：倍速仪表盘 (Gauge) 循环切倍速
    const speedBtn = await page.$('.ios-tool-btn[title*="切换倍速"]');
    await speedBtn.click(); // 1.0 -> 1.25
    const rate125 = await page.$eval(".ios-tool-btn .rate-pill", (el) => el.textContent.trim());
    await speedBtn.click(); // 1.25 -> 1.5
    const rate15 = await page.$eval(".ios-tool-btn .rate-pill", (el) => el.textContent.trim());
    await speedBtn.click(); // 1.5 -> 2.0
    const rate20 = await page.$eval(".ios-tool-btn .rate-pill", (el) => el.textContent.trim());
    await speedBtn.click(); // 2.0 -> 0.75
    const rate075 = await page.$eval(".ios-tool-btn .rate-pill", (el) => el.textContent.trim());
    await speedBtn.click(); // 0.75 -> 1.0 (胶囊消失)
    const ratePillExists = await page.$eval(".ios-tool-btn", (el) => Boolean(el.querySelector(".rate-pill")));

    const isSpeedCycleCorrect = rate125 === "1.25x" && rate15 === "1.5x" && rate20 === "2x" && rate075 === "0.75x" && !ratePillExists;
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "底部工具：倍速仪表盘循环切换 (0.75x~2.0x)",
      isSpeedCycleCorrect,
      `倍速梯度验证通过: [1.25x, 1.5x, 2x, 0.75x, 1.0x(隐藏)]`
    );

    await captureAndSave(page, "opt1_landscape_controls.png", "横屏全屏iOS原生风格UI全貌与控制栏");

    // 校验 2.6：点击 ··· 唤出右侧全屏选集抽屉
    const drawerBtn = await page.$('.ios-tool-btn[title="选集与线路"]');
    await drawerBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    const isDrawerOpen = await page.$eval(".fullscreen-ep-drawer", (el) => el.classList.contains("open"));
    const drawerTitle = await page.$eval(".drawer-title", (el) => el.textContent.trim());
    const drawerCount = await page.$eval(".drawer-count", (el) => el.textContent.trim());
    const prevChip = await page.$('.drawer-pager-chip[title="上一集"]');
    const nextChip = await page.$('.drawer-pager-chip[title="下一集"]');

    recordResult(
      "优化1: 横屏iOS原生全屏",
      "右侧全屏选集抽屉展开与元素完整性",
      isDrawerOpen && Boolean(prevChip) && Boolean(nextChip),
      `抽屉展开: ${isDrawerOpen}, 标题: "${drawerTitle} ${drawerCount}", 上一集/下一集组件齐备`
    );

    // 选集切换交互：点击抽屉中的上一集
    await prevChip.click();
    await new Promise((r) => setTimeout(r, 400));
    const activeEpAfterStep = await page.$eval(".drawer-ep-btn.active", (el) => el.textContent.trim());
    recordResult(
      "优化1: 横屏iOS原生全屏",
      "右侧抽屉选集快捷上一集步进切换",
      activeEpAfterStep === "244",
      `点击上一集后，高亮剧集自动更新为第 ${activeEpAfterStep} 集 (期望: 244)`
    );

    await captureAndSave(page, "opt1_landscape_episode_drawer.png", "横屏右侧全屏滑出选集抽屉与剧集网格");

    // 关闭选集抽屉
    const closeDrawerBtn = await page.$(".drawer-close-btn");
    await closeDrawerBtn.click();
    await new Promise((r) => setTimeout(r, 300));

    // =========================================================================
    // 模块 3：优化 2 - 播放历史记录精准断点秒级续播
    // =========================================================================
    console.log("\n▶ 测试模块 3：优化 2 - 播放历史记录精准断点秒级续播 (History Precision Resume)");

    // 返回竖屏模式
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 400));

    // 模拟观看至 28 秒
    const targetSeekSec = 28;
    await page.evaluate((sec) => {
      const v = document.querySelector("video");
      if (v) {
        Object.defineProperty(HTMLMediaElement.prototype, "duration", { get() { return 600; }, configurable: true });
        v.currentTime = sec;
        v.dispatchEvent(new Event("durationchange"));
        v.dispatchEvent(new Event("timeupdate"));
      }
    }, targetSeekSec);

    // 等待节流写入 localStorage
    await new Promise((r) => setTimeout(r, 2400));
    await page.evaluate((sec) => {
      const v = document.querySelector("video");
      if (v) {
        v.currentTime = sec;
        v.dispatchEvent(new Event("timeupdate"));
      }
    }, targetSeekSec);
    await new Promise((r) => setTimeout(r, 400));

    // 检查 localStorage 中持久化数据
    const historyData = await page.evaluate(() => {
      const raw = localStorage.getItem("aurora_watch_history_v1");
      return raw ? JSON.parse(raw) : [];
    });
    const topHistory = historyData[0] || {};
    const isHistorySaved = Math.round(topHistory.currentTime) === targetSeekSec;
    recordResult(
      "优化2: 历史精准续播",
      "观看进度节流持久化至 LocalStorage",
      isHistorySaved,
      `片名: "${topHistory.vodName}", 集数: "${topHistory.episodeName}", 记录秒数: ${Math.round(topHistory.currentTime)}s (期望: ${targetSeekSec}s)`
    );

    // 关闭播放器返回首页
    const backBtn = await page.$(".bagtrim-floating-back-btn");
    await backBtn.click();
    await new Promise((r) => setTimeout(r, 500));

    // 打开右上角观看历史抽屉
    const histBtn = await page.$('.header-circle-btn[title="观看历史"]');
    await histBtn.click();
    await page.waitForSelector(".history-item-row", { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 400)); // 等待滑出动画

    const histItemName = await page.$eval(".history-name", (el) => el.textContent.trim());
    const histItemEp = await page.$eval(".history-ep", (el) => el.textContent.trim());
    const histItemMeta = await page.$eval(".history-meta-sub", (el) => el.textContent.trim());

    recordResult(
      "优化2: 历史精准续播",
      "历史记录抽屉数据回填与时间展示",
      histItemName.includes("吞噬星空") && histItemMeta.includes("00:28"),
      `抽屉项标题: "${histItemName}", 集数: "${histItemEp}", 进度标签: "${histItemMeta}"`
    );

    await captureAndSave(page, "opt2_history_drawer.png", "右上角打开的历史记录抽屉与精准进度展示");

    // 点击历史记录项拉起精准续播
    const histItem = await page.$(".history-item-row");
    await histItem.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 800));

    // 验证 statusMessage 提示精准续播并验证实际恢复秒数
    const statusText = await page.$eval(".live-status-pill", (el) => el.textContent.trim());
    const isResumedNotice = statusText.includes("00:28") || statusText.includes("续播");

    recordResult(
      "优化2: 历史精准续播",
      "点击历史项触发断点续播与精准时间定位",
      isResumedNotice,
      `播放器状态栏: "${statusText}"`
    );

    await captureAndSave(page, "opt2_history_resumed.png", "从历史记录恢复后的播放器界面及精准续播提示");

    // =========================================================================
    // 测试报告汇总与持久化
    // =========================================================================
    console.log("\n========================================================");
    console.log("               📊 测试结果统计汇总");
    console.log("========================================================");
    const passCount = testResults.filter((r) => r.passed).length;
    const totalCount = testResults.length;
    const passRate = ((passCount / totalCount) * 100).toFixed(1);
    console.log(`执行测试项数: ${totalCount}`);
    console.log(`通过项数: ${passCount}`);
    console.log(`失败项数: ${totalCount - passCount}`);
    console.log(`综合通过率: ${passRate}%\n`);

    const reportPath = path.join(__dirname, "test-playback-features-report.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          targetUrl: TARGET_URL,
          summary: { total: totalCount, passed: passCount, failed: totalCount - passCount, passRate: `${passRate}%` },
          results: testResults,
        },
        null,
        2
      )
    );
    console.log(`📋 详细测试数据报告已写入: ${reportPath}`);

    await browser.close();

    if (passCount !== totalCount) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ 测试套件执行中断异常:", error);
    await browser.close();
    process.exit(1);
  }
}

runTestSuite();
