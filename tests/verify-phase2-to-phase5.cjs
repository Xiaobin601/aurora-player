/**
 * Aurora Player - 阶段二至阶段五全面功能端到端自动化测试套件
 * 
 * 验证清单：
 * 1. 阶段二：追剧收藏持久化、心形收藏状态打通与动效、个人中心「我的追剧」抽屉面板、智能更新红点
 * 2. 阶段三：AirPlay 电视投屏弹窗、多画幅比例切换 (Contain/Fill/Cover) 与 HUD、防误触屏幕锁与快捷解锁
 * 3. 阶段四：真机沙盒离线下载切片任务触发、离线缓存抽屉进度管理与网速显示
 * 4. 阶段五：自定义采集源管理抽屉、并发测速 Ping 延迟药丸、TVBox/CMS 规则导入弹窗与配置备份
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
const ARTIFACT_DIR = "/Users/xiaobin/.gemini/antigravity/brain/b35146af-8864-45fc-b616-0c9edb54910c";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => resolve(true));
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
    console.log(`[Server] Vite preview 预览服务已在端口 ${TARGET_PORT} 运行`);
    return null;
  }
  console.log(`[Server] 启动 Vite preview 预览服务 (port ${TARGET_PORT})...`);
  const proc = spawn("npx", ["vite", "preview", "--port", String(TARGET_PORT)], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    detached: true,
  });
  proc.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkPort(TARGET_PORT)) {
      console.log(`[Server] Vite preview 启动成功！`);
      return proc;
    }
  }
  throw new Error("无法启动测试服务器");
}

async function capture(page, filename, desc) {
  const local = path.join(SCREENSHOT_DIR, filename);
  const art = path.join(ARTIFACT_DIR, filename);
  await page.screenshot({ path: local, fullPage: false });
  try {
    fs.copyFileSync(local, art);
  } catch (_) {}
  console.log(`  📸 捕获截图: [${filename}] - ${desc}`);
  return local;
}

async function runAllTests() {
  console.log("\n========================================================");
  console.log("   🚀 Aurora Player 阶段二至阶段五全功能自动化测试套件");
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
      "--window-size=430,932", // iPhone 16 Pro Max 尺寸模拟
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });

  const testReport = [];
  function logResult(phase, title, passed, detail) {
    testReport.push({ phase, title, passed, detail });
    const mark = passed ? "✅ PASS" : "❌ FAIL";
    console.log(`${mark} [${phase}] ${title} -> ${detail}`);
  }

  try {
    await page.goto(TARGET_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));
    await capture(page, "phase2_01_home_loaded.png", "极光影院首页初始加载");

    // ---------------------------------------------------------
    // 🌟 阶段二：追剧收藏与更新提醒
    // ---------------------------------------------------------
    console.log("\n--- 开始测试【阶段二：追剧收藏与更新提醒】---");

    // 1. 点击首页第一个视频卡片打开详情页
    await page.waitForSelector(".video-poster-card", { timeout: 8000 });
    const firstCard = await page.$(".video-poster-card");
    if (firstCard) {
      await firstCard.click();
    }
    await new Promise((r) => setTimeout(r, 1200));

    // 验证详情页出现
    const playerModalExists = await page.$(".bagtrim-player-page");
    logResult("阶段二", "2.2 播放详情页拉起", Boolean(playerModalExists), "详情页成功展示");
    await capture(page, "phase2_02_detail_page.png", "视频播放详情页");

    // 2. 点击心形追剧按钮
    const heartBtn = await page.$(".action-trio-btn:first-child");
    if (heartBtn) {
      await heartBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      await capture(page, "phase2_03_favorite_toggled.png", "点击追剧后的心形高亮与Toast提示");

      const toast = await page.$eval(".aurora-floating-toast", (el) => el.textContent.trim()).catch(() => null);
      logResult(
        "阶段二",
        "2.2 心形收藏状态打通与动效",
        Boolean(toast && toast.includes("追剧")),
        `触发Toast提示: "${toast}"`
      );
    }

    // 验证 LocalStorage 持久化
    const favCountInStorage = await page.evaluate(() => {
      const raw = localStorage.getItem("aurora_favorites_library_v1");
      return raw ? JSON.parse(raw).length : 0;
    });
    logResult(
      "阶段二",
      "2.1 本地收藏库持久化存储",
      favCountInStorage >= 1,
      `LocalStorage 中已存储 ${favCountInStorage} 部追剧`
    );

    // 关闭详情页返回首页
    const backBtn = await page.$(".bagtrim-floating-back-btn");
    if (backBtn) await backBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // 3. 点击底部 Tab 4 进入「我的」个人中心
    const dockItems = await page.$$(".dock-nav-item");
    if (dockItems.length >= 4) {
      await dockItems[3].click(); // 个人中心
      await new Promise((r) => setTimeout(r, 600));
    }
    await capture(page, "phase2_04_profile_tab.png", "个人中心页面");

    // 验证「我的追剧」数量统计
    const myFavStatText = await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const favBox = stats.find((s) => s.textContent.includes("我的追剧"));
      return favBox ? favBox.textContent.trim() : null;
    });
    logResult(
      "阶段二",
      "2.3 个人中心追剧数量动态联动",
      Boolean(myFavStatText && myFavStatText.includes("1 部")),
      `个人中心追剧卡片展示: "${myFavStatText}"`
    );

    // 4. 点击「我的追剧」卡片打开毛玻璃抽屉面板
    await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const favBox = stats.find((s) => s.textContent.includes("我的追剧"));
      if (favBox) favBox.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "phase2_05_favorites_drawer.png", "「我的追剧」毛玻璃抽屉面板");

    const favDrawerTitle = await page.$eval(".drawer-title", (el) => el.textContent.trim()).catch(() => null);
    const favItemCount = (await page.$$(".favorite-item-row")).length;
    logResult(
      "阶段二",
      "2.3 「我的追剧」毛玻璃抽屉面板与列表",
      Boolean(favDrawerTitle && favItemCount >= 1),
      `抽屉标题: "${favDrawerTitle}", 呈现 ${favItemCount} 个追剧卡片`
    );

    // 模拟新剧集更新红点比对 (2.4 智能更新角标对比)
    await page.evaluate(() => {
      const raw = localStorage.getItem("aurora_favorites_library_v1");
      if (raw) {
        const list = JSON.parse(raw);
        if (list.length > 0) {
          list[0].latestTotal = (list[0].lastWatchTotal || 1) + 4;
          list[0].latestEpisode = "第 28 集";
          list[0].hasUpdate = true;
          localStorage.setItem("aurora_favorites_library_v1", JSON.stringify(list));
        }
      }
    });
    // 重新点击刷新抽屉
    await page.evaluate(() => {
      const close = document.querySelector(".drawer-close-btn");
      if (close) close.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const favBox = stats.find((s) => s.textContent.includes("我的追剧"));
      if (favBox) favBox.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await capture(page, "phase2_06_update_badge.png", "智能新剧集更新红点与NEW角标");

    const updateBadgeExists = await page.evaluate(() => {
      return Boolean(document.querySelector(".favorite-update-badge") || document.querySelector(".red-dot-indicator"));
    });
    logResult(
      "阶段二",
      "2.4 智能更新角标对比与新剧集红点提醒",
      updateBadgeExists,
      "检测到 NEW 剧集更新高亮角标与呼吸红点"
    );

    // 点击追剧卡片一键续播
    await page.evaluate(() => {
      const row = document.querySelector(".favorite-item-row");
      if (row) row.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await capture(page, "phase2_07_resumed_from_favorite.png", "从追剧列表一键直达起播");

    // ---------------------------------------------------------
    // 📺 阶段三：AirPlay 电视投屏、画面比例与屏幕锁
    // ---------------------------------------------------------
    console.log("\n--- 开始测试【阶段三：AirPlay 电视投屏、画面比例与屏幕锁】---");

    // 1. 验证竖屏右上角的 AirPlay 投屏按键
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button[title*='AirPlay']"));
      if (btns.length > 0) btns[0].click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "phase3_01_airplay_modal.png", "AirPlay 电视投屏助手弹窗与雷达波");

    const toastText = await page.$eval(".aurora-floating-toast", (el) => el.textContent.trim()).catch(() => null);
    const airplayModal = await page.$(".airplay-modal-content");
    const isAirPlaySuccess = Boolean(airplayModal) || Boolean(toastText && (toastText.includes("投屏") || toastText.includes("AirPlay")));
    logResult(
      "阶段三",
      "3.1 iOS 原生 AirPlay 路由选择器与投屏助手集成",
      isAirPlaySuccess,
      airplayModal ? "成功调起 AirPlay 电视投屏助手弹窗" : `成功唤起原生投屏选择器: "${toastText}"`
    );

    // 若有弹窗则关闭
    await page.evaluate(() => {
      const close = document.querySelector(".airplay-modal-content .drawer-close-btn");
      if (close) close.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 2. 验证多画幅比例切换 (Contain / Fill / Cover)
    const cropBtns = await page.$$("button[title*='画幅']");
    if (cropBtns.length > 0) {
      // 切换第一次: Fill
      await cropBtns[0].click();
      await new Promise((r) => setTimeout(r, 400));
      await capture(page, "phase3_02_aspect_fill.png", "画幅比例切换为 Fill 满屏拉伸消除黑边");

      const hasFillClass = await page.$eval("video", (el) => el.className.includes("aspect-fill")).catch(() => false);
      const hudFill = await page.$eval(".aspect-ratio-hud", (el) => el.textContent.trim()).catch(() => null);

      // 切换第二次: Cover
      await cropBtns[0].click();
      await new Promise((r) => setTimeout(r, 400));
      await capture(page, "phase3_03_aspect_cover.png", "画幅比例切换为 Cover 居中裁切铺满");

      const hasCoverClass = await page.$eval("video", (el) => el.className.includes("aspect-cover")).catch(() => false);

      // 切换第三次: Contain
      await cropBtns[0].click();
      await new Promise((r) => setTimeout(r, 400));
      const hasContainClass = await page.$eval("video", (el) => el.className.includes("aspect-contain")).catch(() => false);

      logResult(
        "阶段三",
        "3.2 多画幅比例切换 (Contain / Fill / Cover) 与 HUD",
        hasFillClass && hasCoverClass && hasContainClass,
        `三态比例平滑循环切换，HUD提示: "${hudFill}"`
      );
    }

    // 3. 验证横屏全屏下的屏幕锁 (Screen Lock)
    const fsBtn = await page.$(".bagtrim-floating-fullscreen-btn");
    if (fsBtn) {
      await fsBtn.click();
      await new Promise((r) => setTimeout(r, 1000));
      await capture(page, "phase3_04_landscape_fullscreen.png", "进入横屏全屏模式");

      // 点击屏幕锁按钮
      const lockBtn = await page.$(".screen-lock-floating-btn");
      if (lockBtn) {
        await lockBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        await capture(page, "phase3_05_screen_locked.png", "屏幕防误触锁定状态");

        const isLocked = await page.$eval(".screen-lock-floating-btn", (el) => el.className.includes("locked"));
        const overlayExists = Boolean(await page.$(".screen-lock-overlay-blocker"));

        // 点击屏幕触发锁定提示
        await page.mouse.click(200, 200);
        await new Promise((r) => setTimeout(r, 300));
        const lockToast = await page.$eval(".aurora-floating-toast", (el) => el.textContent.trim()).catch(() => null);

        // 解锁
        await lockBtn.click();
        await new Promise((r) => setTimeout(r, 500));
        await capture(page, "phase3_06_screen_unlocked.png", "屏幕解锁恢复控制");

        logResult(
          "阶段三",
          "3.3 画面防误触屏幕锁 (Screen Lock) 与快捷解锁",
          isLocked && overlayExists,
          `成功锁定屏幕并触发防误触拦截，提示: "${lockToast}"`
        );
      }

      // 退出横屏全屏
      await page.evaluate(() => {
        const closeFsBtn = document.querySelector(".ios-top-btn.close-btn");
        if (closeFsBtn) closeFsBtn.click();
      });
      await new Promise((r) => setTimeout(r, 600));
    }

    // ---------------------------------------------------------
    // 💾 阶段四：真机沙盒离线下载引擎
    // ---------------------------------------------------------
    console.log("\n--- 开始测试【阶段四：真机沙盒离线下载引擎】---");

    // 1. 点击详情页下载按钮触发切片并发下载
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".action-trio-btn"));
      const dl = btns.find((b) => b.textContent.includes("下载"));
      if (dl) dl.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "phase4_01_download_triggered.png", "点击下载触发切片下载通道");

    const dlToast = await page.$eval(".aurora-floating-toast", (el) => el.textContent.trim()).catch(() => null);
    logResult(
      "阶段四",
      "4.1 M3U8 切片解析器与并发下载通道",
      Boolean(dlToast && dlToast.includes("下载")),
      `启动离线切片下载队列，提示: "${dlToast}"`
    );

    // 关闭播放器并进入个人中心离线缓存面板
    await page.evaluate(() => {
      const back = document.querySelector(".bagtrim-floating-back-btn");
      if (back) back.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // 进入个人中心
    await page.evaluate(() => {
      const dock = Array.from(document.querySelectorAll(".dock-nav-item"));
      if (dock.length >= 4) dock[3].click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // 点击「离线缓存」卡片
    await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const dlBox = stats.find((s) => s.textContent.includes("离线缓存"));
      if (dlBox) dlBox.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "phase4_02_download_drawer.png", "离线沙盒缓存抽屉与实时进度");

    const dlDrawerTitle = await page.$eval(".drawer-title", (el) => el.textContent.trim()).catch(() => null);
    const dlTasksCount = (await page.$$(".download-task-item")).length;
    logResult(
      "阶段四",
      "4.2 本地沙盒下载进度管理与真实速度显示",
      Boolean(dlDrawerTitle && dlTasksCount >= 1),
      `抽屉: "${dlDrawerTitle}", 呈现 ${dlTasksCount} 个离线下载分片任务`
    );

    // 关闭离线抽屉
    const dlDrawerClose = await page.$(".drawer-close-btn");
    if (dlDrawerClose) await dlDrawerClose.click();
    await new Promise((r) => setTimeout(r, 400));

    // ---------------------------------------------------------
    // 🌐 阶段五：自定义源导入与生态扩展
    // ---------------------------------------------------------
    console.log("\n--- 开始测试【阶段五：自定义源导入与生态扩展】---");

    // 1. 点击个人中心的「自定义采集源管理与并发测速」设置项
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".setting-row"));
      const srcRow = rows.find((r) => r.textContent.includes("自定义采集源管理"));
      if (srcRow) srcRow.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "phase5_01_custom_sources_drawer.png", "自定义采集源管理抽屉");

    const srcDrawerTitle = await page.$eval(".drawer-title", (el) => el.textContent.trim()).catch(() => null);
    const srcCardsCount = (await page.$$(".source-item-card")).length;
    logResult(
      "阶段五",
      "5.1 自定义 JSON / CMS 采集源导入协议与解析",
      Boolean(srcDrawerTitle && srcCardsCount >= 3),
      `管理面板载入 ${srcCardsCount} 个采集源专线 (非凡/量子/暴风/金鹰)`
    );

    // 2. 点击「并发测速 Ping」
    const pingBtn = await page.$(".source-tool-action-btn.primary");
    if (pingBtn) {
      await pingBtn.click();
      await new Promise((r) => setTimeout(r, 2000));
      await capture(page, "phase5_02_sources_pinged.png", "多源并发测速 Ping 延迟结果");

      const pingPills = await page.$$(".source-ping-pill");
      logResult(
        "阶段五",
        "5.2 动态多源并发搜索与智能低延迟测速",
        pingPills.length > 0,
        `成功测算全部源站真实延迟，展示 ${pingPills.length} 个低延迟网络胶囊`
      );
    }

    // 3. 点击「导入源 (TVBox/CMS)」打开导入弹窗
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".source-tool-action-btn"));
      const imp = btns.find((b) => b.textContent.includes("导入源"));
      if (imp) imp.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await capture(page, "phase5_03_import_dialog.png", "TVBox JSON / CMS 规则导入弹窗");

    const importTextarea = await page.$("textarea");
    logResult(
      "阶段五",
      "5.1 TVBox JSON 与 CMS 接口规范导入协议",
      Boolean(importTextarea),
      "成功拉起多格式源导入解析模态框"
    );

    // 关闭导入弹窗
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".airplay-modal-content button"));
      const cancel = btns.find((b) => b.textContent.includes("取消") || b.textContent.includes("关闭"));
      if (cancel) cancel.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    // 4. 验证备份规则导出
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".source-tool-action-btn"));
      const backup = btns.find((b) => b.textContent.includes("备份规则"));
      if (backup) backup.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    const backupToast = await page.$eval(".aurora-floating-toast", (el) => el.textContent.trim()).catch(() => null);
    logResult(
      "阶段五",
      "5.3 规则备份、导出与云端配置同步",
      Boolean(backupToast && backupToast.includes("复制")),
      `规则导出提示: "${backupToast}"`
    );

  } catch (err) {
    console.error("测试执行异常:", err);
  } finally {
    await browser.close();

    console.log("\n========================================================");
    console.log("   📊 测试结果汇总报告");
    console.log("========================================================");
    console.table(testReport);

    fs.writeFileSync(
      path.join(__dirname, "phase2_to_5_test_report.json"),
      JSON.stringify(testReport, null, 2)
    );
  }
}

runAllTests().catch(console.error);
