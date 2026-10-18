/**
 * Aurora Player - 阶段二至阶段五专项 QA 深度审计脚本
 * 
 * 严格按照 QA 专家要求执行，绝对不修改任何业务代码：
 * 1. 阶段二：追剧收藏 LocalStorage 真实存取审计、个人中心是否动态联动 vs 静态“12部”占位审计、抽屉真实渲染列表
 * 2. 阶段三：AirPlay 图标挂载与投屏唤起机制探测、画幅比例切换 (Contain/Fill/Cover) 与屏幕锁拦截审计
 * 3. 阶段四：真机离线缓存真实网络请求监控 (M3U8与切片)、IndexedDB 持久化审计、离线播放可行性与局限性分析
 * 4. 阶段五：设置页自定义源入口、采集源管理抽屉、Ping 测速、TVBox/CMS 规则导入输入框与 LocalStorage 存取审计
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const TARGET_PORT = 4173;
const TARGET_URL = `http://localhost:${TARGET_PORT}`;
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = path.join(__dirname, "screenshots");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function capture(page, filename, desc) {
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`  📸 [截图保存] ${filename} - ${desc}`);
  return filepath;
}

async function runAudit() {
  console.log("\n================================================================================");
  console.log("   🔬 Aurora Player 阶段二至阶段五 (Phases 2-5) 功能完整性与现状深度审计");
  console.log("================================================================================\n");

  const auditReport = {
    timestamp: new Date().toISOString(),
    environment: {
      url: TARGET_URL,
      viewport: "430x932 (iPhone 16 Pro Max 模拟)",
      browser: "Chrome Headless via Puppeteer-core"
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
      "--autoplay-policy=no-user-gesture-required",
      "--window-size=430,932",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });

  // 网络请求捕获器
  const interceptedRequests = [];
  await page.setRequestInterception(false);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(".m3u8") || url.includes(".ts") || url.includes("provide/vod") || url.includes("api.php")) {
      interceptedRequests.push({
        url,
        method: req.method(),
        resourceType: req.resourceType(),
        timestamp: Date.now()
      });
    }
  });

  try {
    console.log("🌐 访问服务并初始化页面...");
    await page.goto(TARGET_URL, { waitUntil: "networkidle0", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));

    // =========================================================================
    // 🌟 阶段二：追剧收藏系统专项审计
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ [阶段二审计] 追剧收藏系统 (LocalStorage 存取、个人中心联动、抽屉真实列表)");
    console.log("--------------------------------------------------------------------------------");

    // 清空以前的测试数据，确保从干净状态测试
    await page.evaluate(() => {
      localStorage.removeItem("aurora_favorites_library_v1");
    });
    await page.reload({ waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 800));

    // 检查初始状态下的 LocalStorage
    const initialStorage = await page.evaluate(() => localStorage.getItem("aurora_favorites_library_v1"));
    console.log(`  * 初始 LocalStorage (aurora_favorites_library_v1): ${initialStorage}`);

    // 点击首页第一个剧集卡片进入详情页
    await page.waitForSelector(".video-poster-card", { timeout: 8000 });
    const firstCard = await page.$(".video-poster-card");
    const videoTitle = await page.$eval(".video-poster-card .poster-title", el => el.textContent.trim()).catch(() => "未知片名");
    console.log(`  * 点击剧集卡片: 《${videoTitle}》`);
    await firstCard.click();
    await new Promise((r) => setTimeout(r, 1200));

    // 查找详情页收藏/心形按钮
    const heartBtn = await page.$(".action-trio-btn:first-child");
    const favBtnText = heartBtn ? await page.evaluate(el => el.textContent.trim(), heartBtn) : "未找到";
    console.log(`  * 找到详情页操作按钮: [${favBtnText}]`);

    // 点击收藏
    if (heartBtn) {
      await heartBtn.click();
      await new Promise((r) => setTimeout(r, 600));
    }
    await capture(page, "qa_phases2_5_fav_clicked.png", "点击详情页收藏按钮后的状态");

    const toastAfterFav = await page.$eval(".aurora-floating-toast", el => el.textContent.trim()).catch(() => null);
    console.log(`  * 点击后页面 Toast 提示: "${toastAfterFav}"`);

    // 检查 LocalStorage 是否存入数据
    const storageAfterFav = await page.evaluate(() => {
      const raw = localStorage.getItem("aurora_favorites_library_v1");
      return raw ? JSON.parse(raw) : null;
    });
    console.log(`  * 收藏后 LocalStorage 存入条目数: ${storageAfterFav ? storageAfterFav.length : 0}`);
    if (storageAfterFav && storageAfterFav.length > 0) {
      console.log(`  * 存入数据样例: vodId=${storageAfterFav[0].vodId}, vodName=${storageAfterFav[0].vodName}, collectTime=${storageAfterFav[0].collectTime}`);
    }

    // 关闭详情页
    const backBtn = await page.$(".bagtrim-floating-back-btn");
    if (backBtn) await backBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    // 切换到底部 Tab 4（个人中心「我的」）
    const dockItems = await page.$$(".dock-nav-item");
    if (dockItems.length >= 4) {
      await dockItems[3].click();
      await new Promise((r) => setTimeout(r, 600));
    }
    await capture(page, "qa_phases2_5_profile.png", "个人中心页面视图");

    // 检验个人中心「我的追剧」统计数据是真实展示还是写死“12部”
    const profileFavStat = await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const favBox = stats.find(s => s.textContent.includes("我的追剧"));
      if (!favBox) return null;
      const countEl = favBox.querySelector(".stat-count");
      return {
        fullText: favBox.textContent.trim(),
        countText: countEl ? countEl.textContent.trim() : null
      };
    });
    console.log(`  * 个人中心「我的追剧」统计DOM显示: "${profileFavStat?.fullText}" (数字: "${profileFavStat?.countText}")`);

    // 打开「我的追剧」抽屉
    await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const favBox = stats.find(s => s.textContent.includes("我的追剧"));
      if (favBox) favBox.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "qa_phases2_5_fav_drawer.png", "「我的追剧」抽屉面板视图");

    const favDrawerInfo = await page.evaluate(() => {
      const title = document.querySelector(".drawer-title")?.textContent.trim();
      const rows = Array.from(document.querySelectorAll(".favorite-item-row")).map(row => {
        const title = row.querySelector(".favorite-title")?.textContent.trim() || row.querySelector("span")?.textContent.trim();
        const sub = row.querySelector(".favorite-subtitle")?.textContent.trim();
        return { title, sub };
      });
      return { title, count: rows.length, rows };
    });
    console.log(`  * 抽屉标题: "${favDrawerInfo.title}", 渲染真实卡片数: ${favDrawerInfo.count}`);

    // 关闭追剧抽屉
    await page.evaluate(() => {
      const close = document.querySelector(".drawer-close-btn");
      if (close) close.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    auditReport.sections.phase2 = {
      localStorageSaved: Boolean(storageAfterFav && storageAfterFav.length === 1),
      storageDataSample: storageAfterFav ? storageAfterFav[0] : null,
      profileDynamicDisplay: profileFavStat?.countText === "1 部",
      profileStatic12StubFound: profileFavStat?.fullText.includes("12部") || false,
      profileActualText: profileFavStat?.fullText,
      drawerRealRendered: favDrawerInfo.count === 1,
      drawerTitle: favDrawerInfo.title,
      drawerItems: favDrawerInfo.rows
    };

    // =========================================================================
    // 📺 阶段三：AirPlay 电视投屏与多画幅比例专项审计
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ [阶段三审计] AirPlay 电视投屏与多画幅比例适配");
    console.log("--------------------------------------------------------------------------------");

    // 回到首页再次打开播放详情页
    await dockItems[0].click(); // 切回首页
    await new Promise((r) => setTimeout(r, 600));
    const cardAgain = await page.$(".video-poster-card");
    if (cardAgain) await cardAgain.click();
    await new Promise((r) => setTimeout(r, 1200));

    // 1. 检查控制栏 AirPlay 图标挂载
    const airplayBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.title && b.title.includes("AirPlay"));
    });
    console.log(`  * 播放器控制栏是否挂载 AirPlay 图标: ${airplayBtnExists ? "✅ 已挂载" : "❌ 未挂载"}`);

    // 点击 AirPlay 图标探测唤起机制
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(b => b.title && b.title.includes("AirPlay"));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "qa_phases2_5_airplay_triggered.png", "点击 AirPlay 投屏图标后的界面反应");

    const airplayModalVisible = await page.$eval(".airplay-modal-content", el => true).catch(() => false);
    const toastAirPlay = await page.$eval(".aurora-floating-toast", el => el.textContent.trim()).catch(() => null);
    const airplayModalText = await page.evaluate(() => {
      const m = document.querySelector(".airplay-modal-content");
      return m ? m.textContent.trim().substring(0, 100) : null;
    });
    console.log(`  * 点击 AirPlay 后的反应: 投屏弹窗展现=${airplayModalVisible}, Toast="${toastAirPlay}"`);
    console.log(`  * 投屏弹窗说明: "${airplayModalText}"`);

    // 关闭投屏弹窗
    if (airplayModalVisible) {
      await page.evaluate(() => {
        const close = document.querySelector(".airplay-modal-content .drawer-close-btn") ||
                      document.querySelector(".drawer-mask");
        if (close) close.click();
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    // 2. 检查画幅比例调节按键 (自适应 / 拉伸铺满 / 裁剪填充)
    const aspectBtnExists = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      return btns.some(b => b.title && b.title.includes("画幅"));
    });
    console.log(`  * 播放器是否具有画幅比例切换按键: ${aspectBtnExists ? "✅ 存在" : "❌ 不存在"}`);

    // 依次点击切换并记录
    const aspectModes = [];
    if (aspectBtnExists) {
      // 第一次点击: 切换为 Fill
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.title && b.title.includes("画幅"));
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      const fillClass = await page.$eval("video", v => v.className).catch(() => "");
      const fillHud = await page.$eval(".aspect-ratio-hud", el => el.textContent.trim()).catch(() => null);
      await capture(page, "qa_phases2_5_aspect_fill.png", "画幅切换为 Fill 拉伸铺满");
      aspectModes.push({ mode: "fill", className: fillClass, hud: fillHud });

      // 第二次点击: 切换为 Cover
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.title && b.title.includes("画幅"));
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      const coverClass = await page.$eval("video", v => v.className).catch(() => "");
      const coverHud = await page.$eval(".aspect-ratio-hud", el => el.textContent.trim()).catch(() => null);
      await capture(page, "qa_phases2_5_aspect_cover.png", "画幅切换为 Cover 裁剪填充");
      aspectModes.push({ mode: "cover", className: coverClass, hud: coverHud });

      // 第三次点击: 切换回 Contain
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(b => b.title && b.title.includes("画幅"));
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 400));
      const containClass = await page.$eval("video", v => v.className).catch(() => "");
      const containHud = await page.$eval(".aspect-ratio-hud", el => el.textContent.trim()).catch(() => null);
      aspectModes.push({ mode: "contain", className: containClass, hud: containHud });
    }
    console.log(`  * 画幅比例三态切换结果:`, aspectModes);

    // 3. 检查横屏全屏下的防误触屏幕锁
    const fullscreenBtn = await page.$(".bagtrim-floating-fullscreen-btn");
    let screenLockAudit = { exists: false, lockTested: false };
    if (fullscreenBtn) {
      await fullscreenBtn.click();
      await new Promise((r) => setTimeout(r, 1000));

      const lockBtn = await page.$(".screen-lock-floating-btn");
      screenLockAudit.exists = Boolean(lockBtn);
      console.log(`  * 横屏全屏模式下防误触锁按钮: ${lockBtn ? "✅ 存在" : "❌ 不存在"}`);

      if (lockBtn) {
        await lockBtn.click();
        await new Promise((r) => setTimeout(r, 600));
        await capture(page, "qa_phases2_5_screen_locked.png", "屏幕防误触锁定状态");

        const isLockedClass = await page.$eval(".screen-lock-floating-btn", el => el.className.includes("locked"));
        const blockerExists = Boolean(await page.$(".screen-lock-overlay-blocker"));

        // 模拟点击屏幕中间区域
        await page.mouse.click(200, 200);
        await new Promise((r) => setTimeout(r, 300));
        const lockToast = await page.$eval(".aurora-floating-toast", el => el.textContent.trim()).catch(() => null);

        // 解锁
        await lockBtn.click();
        await new Promise((r) => setTimeout(r, 400));

        screenLockAudit.lockTested = true;
        screenLockAudit.isLockedClass = isLockedClass;
        screenLockAudit.blockerExists = blockerExists;
        screenLockAudit.toast = lockToast;
        console.log(`  * 锁屏防误触拦截拦截层存在=${blockerExists}, 提示="${lockToast}"`);
      }

      // 退出横屏全屏
      await page.evaluate(() => {
        const closeFs = document.querySelector(".ios-top-btn.close-btn");
        if (closeFs) closeFs.click();
      });
      await new Promise((r) => setTimeout(r, 600));
    }

    auditReport.sections.phase3 = {
      airplayIconMounted: airplayBtnExists,
      airplayTriggerBehavior: {
        modalVisible: airplayModalVisible,
        toast: toastAirPlay,
        nativePickerSupportedOnWeb: false, // Chrome 不具备 webkitShowPlaybackTargetPicker
        fallbackModalHandled: airplayModalVisible
      },
      aspectRatioControl: {
        exists: aspectBtnExists,
        modesTested: aspectModes
      },
      screenLock: screenLockAudit
    };

    // =========================================================================
    // 💾 阶段四：真机离线缓存引擎专项审计
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ [阶段四审计] 真机离线缓存引擎 (M3U8下载请求监控、IndexedDB沙盒与离线起播)");
    console.log("--------------------------------------------------------------------------------");

    // 记录点击下载前已捕获的媒体请求数
    const requestsBeforeDownload = interceptedRequests.length;

    // 点击详情页中的“下载”按钮
    const downloadBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll(".action-trio-btn"));
      return btns.find(b => b.textContent.includes("下载"));
    });

    if (downloadBtn) {
      await downloadBtn.click();
      await new Promise((r) => setTimeout(r, 1200));
    }
    await capture(page, "qa_phases2_5_download_triggered.png", "点击下载按钮后的状态与提示");

    const dlToast = await page.$eval(".aurora-floating-toast", el => el.textContent.trim()).catch(() => null);
    console.log(`  * 点击下载后页面提示: "${dlToast}"`);

    // 检查网络请求中是否真有针对 M3U8 或切片 TS 的请求
    await new Promise((r) => setTimeout(r, 2000)); // 等待分片请求发出
    const requestsAfterDownload = interceptedRequests.slice(requestsBeforeDownload);
    console.log(`  * 点击下载后捕获的新媒体网络请求数量: ${requestsAfterDownload.length}`);
    requestsAfterDownload.forEach((r, idx) => {
      console.log(`    [${idx + 1}] ${r.method} ${r.url.substring(0, 80)}... (${r.resourceType})`);
    });

    // 检查 IndexedDB 中的任务与切片数据
    const idbData = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open("aurora_download_db_v1", 1);
        req.onsuccess = () => {
          const db = req.result;
          const tasksTx = db.transaction("tasks", "readonly");
          const tasksReq = tasksTx.objectStore("tasks").getAll();
          tasksReq.onsuccess = () => {
            const tasks = tasksReq.result || [];
            // 查询 chunks store 计数
            const chunksTx = db.transaction("chunks", "readonly");
            const countReq = chunksTx.objectStore("chunks").count();
            countReq.onsuccess = () => {
              resolve({
                dbExists: true,
                taskCount: tasks.length,
                tasks: tasks.map(t => ({
                  id: t.id,
                  vodName: t.vodName,
                  status: t.status,
                  progressPercent: t.progressPercent,
                  downloadSpeed: t.downloadSpeed,
                  totalSegments: t.totalSegments,
                  downloadedSegments: t.downloadedSegments
                })),
                chunkCount: countReq.result
              });
            };
            countReq.onerror = () => resolve({ dbExists: true, taskCount: tasks.length, tasks, chunkCount: 0 });
          };
          tasksReq.onerror = () => resolve({ dbExists: true, taskCount: 0, chunkCount: 0 });
        };
        req.onerror = () => resolve({ dbExists: false, taskCount: 0, chunkCount: 0 });
      });
    });
    console.log(`  * IndexedDB 检查结果:`, JSON.stringify(idbData));

    // 关闭详情页进入个人中心离线抽屉
    const backBtnAgain = await page.$(".bagtrim-floating-back-btn");
    if (backBtnAgain) await backBtnAgain.click();
    await new Promise((r) => setTimeout(r, 600));

    // 进入个人中心
    if (dockItems.length >= 4) {
      await dockItems[3].click();
      await new Promise((r) => setTimeout(r, 600));
    }

    // 点击个人中心「离线缓存」
    await page.evaluate(() => {
      const stats = Array.from(document.querySelectorAll(".stat-box"));
      const dlBox = stats.find(s => s.textContent.includes("离线缓存"));
      if (dlBox) dlBox.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "qa_phases2_5_download_drawer.png", "「离线沙盒缓存」抽屉面板视图");

    const dlDrawerInfo = await page.evaluate(() => {
      const title = document.querySelector(".drawer-title")?.textContent.trim();
      const taskItems = Array.from(document.querySelectorAll(".download-task-item")).map(t => {
        const title = t.querySelector(".download-title")?.textContent.trim();
        const progress = t.querySelector(".download-progress-text")?.textContent.trim();
        const speed = t.querySelector(".download-speed")?.textContent.trim();
        return { title, progress, speed };
      });
      return { title, count: taskItems.length, taskItems };
    });
    console.log(`  * 离线缓存抽屉标题: "${dlDrawerInfo.title}", 任务数: ${dlDrawerInfo.count}`);

    // 测试离线任务起播逻辑探测
    const offlinePlaybackCheck = await page.evaluate(async () => {
      // 检查 download-task-item 是否存在点击播放处理函数
      const playBtn = document.querySelector(".download-task-item");
      return {
        canClick: Boolean(playBtn)
      };
    });

    // 关闭离线抽屉
    await page.evaluate(() => {
      const close = document.querySelector(".drawer-close-btn");
      if (close) close.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    auditReport.sections.phase4 = {
      downloadTriggeredToast: dlToast,
      interceptedMediaRequestsCount: requestsAfterDownload.length,
      sampleRequests: requestsAfterDownload.slice(0, 5),
      isRealNetworkRequestTriggered: requestsAfterDownload.length > 0,
      indexedDBAudit: idbData,
      downloadDrawerRendered: dlDrawerInfo.count > 0,
      downloadDrawerInfo: dlDrawerInfo,
      offlinePlaybackTechnicalAudit: {
        mechanism: "将 IndexedDB 中的二进制 TS 分片通过 new Blob(blobs, { type: 'video/mp2t' }) 组装，并生成 URL.createObjectURL(combinedBlob)",
        browserCompatibilityLimit: "浏览器原生 <video> 标签仅在 Safari/macOS 上原生支持 HLS/TS，Chrome 与其他非 Safari 环境直接以 video.src=blob(video/mp2t) 起播时通常无法直接硬件解码（需 mux.js 转封装为 fMP4 或 Service Worker 本地流拦截），属于技术局限点"
      }
    };

    // =========================================================================
    // 🌐 阶段五：自定义源导入与生态扩展专项审计
    // =========================================================================
    console.log("\n--------------------------------------------------------------------------------");
    console.log("▶ [阶段五审计] 自定义源导入与生态扩展 (设置项、测速、TVBox/CMS 规则输入)");
    console.log("--------------------------------------------------------------------------------");

    // 检查个人中心设置列表中是否有自定义源入口
    const customSourceEntryInSettings = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".setting-row"));
      const row = rows.find(r => r.textContent.includes("自定义采集源管理"));
      return {
        exists: Boolean(row),
        text: row ? row.textContent.trim() : null
      };
    });
    console.log(`  * 设置列表中自定义源管理入口: ${customSourceEntryInSettings.exists ? "✅ 存在" : "❌ 不存在"} ("${customSourceEntryInSettings.text}")`);

    // 点击打开自定义采集源抽屉
    await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".setting-row"));
      const row = rows.find(r => r.textContent.includes("自定义采集源管理"));
      if (row) row.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await capture(page, "qa_phases2_5_custom_sources.png", "自定义采集源管理与测速抽屉");

    // 检查抽屉内部配置
    const sourceDrawerDetails = await page.evaluate(() => {
      const title = document.querySelector(".drawer-title")?.textContent.trim();
      const cards = Array.from(document.querySelectorAll(".source-item-card")).map(c => {
        const name = c.querySelector(".source-name-title span")?.textContent.trim();
        const api = c.querySelector(".source-api-url")?.textContent.trim();
        const checked = c.querySelector("input[type='checkbox']")?.checked;
        return { name, api, checked };
      });
      const toolBtns = Array.from(document.querySelectorAll(".source-tool-action-btn")).map(b => b.textContent.trim());
      return { title, count: cards.length, cards, toolBtns };
    });
    console.log(`  * 采集源抽屉标题: "${sourceDrawerDetails.title}", 内置/配置源数量: ${sourceDrawerDetails.count}`);
    console.log(`  * 工具条功能按键:`, sourceDrawerDetails.toolBtns);

    // 点击“并发测速 Ping”
    const pingBtn = await page.$(".source-tool-action-btn.primary");
    if (pingBtn) {
      await pingBtn.click();
      console.log("  * 正在执行多源并发测速 Ping...");
      await new Promise((r) => setTimeout(r, 2200));
      await capture(page, "qa_phases2_5_ping_results.png", "多源并发测速完成后的延迟胶囊");

      const pingPills = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".source-ping-pill")).map(p => p.textContent.trim());
      });
      console.log(`  * 测速延迟标签:`, pingPills);
    }

    // 点击“导入源 (TVBox/CMS)”按钮，检查是否弹出导入模态框与输入框
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".source-tool-action-btn"));
      const imp = btns.find(b => b.textContent.includes("导入源"));
      if (imp) imp.click();
    });
    await new Promise((r) => setTimeout(r, 600));
    await capture(page, "qa_phases2_5_import_modal.png", "TVBox/CMS 规则导入弹窗与输入框");

    const importModalAudit = await page.evaluate(() => {
      const modal = document.querySelector(".airplay-modal-content");
      const textarea = document.querySelector(".airplay-modal-content textarea");
      const btns = Array.from(document.querySelectorAll(".airplay-modal-content button")).map(b => b.textContent.trim());
      return {
        modalExists: Boolean(modal),
        textareaExists: Boolean(textarea),
        placeholder: textarea ? textarea.placeholder : null,
        buttons: btns
      };
    });
    console.log(`  * 导入模态框审计: textarea输入框存在=${importModalAudit.textareaExists}`);
    console.log(`  * 输入框占位提示: "${importModalAudit.placeholder?.substring(0, 60)}..."`);

    // 模拟在输入框中填入 TVBox 标准 JSON 规则并提交导入
    const testCustomSourceJson = JSON.stringify({
      sites: [
        {
          key: "qa_audit_test_source",
          name: "QA专线·极速测试源",
          type: 1,
          api: "https://qa-test-api.example.com/api.php/provide/vod/"
        }
      ]
    }, null, 2);

    await page.evaluate((val) => {
      const textarea = document.querySelector(".airplay-modal-content textarea");
      if (textarea) {
        const prototype = Object.getPrototypeOf(textarea);
        const valueDescriptor = Object.getOwnPropertyDescriptor(prototype, "value");
        if (valueDescriptor && valueDescriptor.set) {
          valueDescriptor.set.call(textarea, val);
        } else {
          textarea.value = val;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, testCustomSourceJson);
    await new Promise((r) => setTimeout(r, 400));
    await capture(page, "qa_phases2_5_import_filled.png", "输入 TVBox JSON 规则内容");

    // 点击确定导入
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll(".airplay-modal-content button"));
      const confirmBtn = btns.find(b => b.textContent.includes("确定导入") || b.textContent.includes("导入"));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const toastAfterImport = await page.$eval(".aurora-floating-toast", el => el.textContent.trim()).catch(() => null);
    console.log(`  * 导入提交后 Toast 提示: "${toastAfterImport}"`);

    // 检查 LocalStorage 中的自定义源是否持久化增加了新源
    const sourcesInStorage = await page.evaluate(() => {
      const raw = localStorage.getItem("aurora_custom_sources_v1");
      return raw ? JSON.parse(raw) : null;
    });
    const importedFound = sourcesInStorage ? sourcesInStorage.find(s => s.key === "qa_audit_test_source") : null;
    console.log(`  * LocalStorage (aurora_custom_sources_v1) 中是否成功存入新导入的源: ${importedFound ? "✅ 是" : "❌ 否"}`);

    auditReport.sections.phase5 = {
      settingsEntryExists: customSourceEntryInSettings.exists,
      settingsEntryText: customSourceEntryInSettings.text,
      sourceManagementDrawer: sourceDrawerDetails,
      importModal: importModalAudit,
      importExecution: {
        submittedJson: testCustomSourceJson,
        toastResult: toastAfterImport,
        savedToLocalStorage: Boolean(importedFound),
        importedItem: importedFound
      }
    };

  } catch (err) {
    console.error("❌ 审计执行遇到未捕获异常:", err);
    auditReport.error = err.message;
  } finally {
    await browser.close();

    const reportPath = path.join(__dirname, "qa_phases2_5_audit_result.json");
    fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2));
    console.log(`\n================================================================================`);
    console.log(`   🏁 审计全流程完成！审计数据与证据已写入: ${reportPath}`);
    console.log(`================================================================================\n`);
  }
}

runAudit();
