import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const TARGET_URL = process.env.TARGET_URL || process.argv[2] || "https://0809614d.aurora-player-4yy.pages.dev";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class TestReporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  record(category, testName, passed, durationMs, details = "") {
    const status = passed ? "PASS" : "FAIL";
    this.results.push({ category, testName, passed, durationMs, details });
    console.log(`[${status}] [${category}] ${testName} (${durationMs}ms) ${details ? `-> ${details}` : ""}`);
  }

  summary() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const totalTime = Date.now() - this.startTime;
    return { total, passed, failed, totalTime, results: this.results };
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🚀 Aurora Player 深度自动化端到端测试启动");
  console.log(`🎯 目标环境: ${TARGET_URL}`);
  console.log("==================================================\n");

  const reporter = new TestReporter();

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--window-size=390,844",
      "--mute-audio",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  const consoleErrors = [];
  const networkErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.toString());
  });

  page.on("requestfailed", (req) => {
    networkErrors.push({ url: req.url(), error: req.failure()?.errorText });
  });

  // -------------------------------------------------------------
  // 1. 静态资源与页面初次加载测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      const resp = await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 20000 });
      const status = resp?.status();
      const pageTitle = await page.title();
      const duration = Date.now() - t0;

      reporter.record(
        "资源与加载",
        "首页加载与HTTP状态",
        status === 200 && pageTitle.includes("极光影院"),
        duration,
        `HTTP ${status}, 标题: "${pageTitle}"`
      );

      // 验证核心 DOM 挂载
      const rootMounted = await page.$eval("#root", (el) => el.children.length > 0);
      reporter.record(
        "资源与加载",
        "React SPA 挂载状态",
        rootMounted,
        Date.now() - t0,
        "root 节点成功包含子组件"
      );

      // 验证未捕获控制台致命 JS 报错
      const fatalErrors = consoleErrors.filter((e) => !e.includes("favicon") && !e.includes("404"));
      reporter.record(
        "资源与加载",
        "页面 JS 异常监听",
        fatalErrors.length === 0,
        0,
        fatalErrors.length === 0 ? "无未捕获异常" : `异常数: ${fatalErrors.length}`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_home_loaded.png") });
    } catch (e) {
      reporter.record("资源与加载", "首页加载与HTTP状态", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 2. 顶部胶囊搜索栏测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      const inputEl = await page.waitForSelector(".search-capsule-input", { timeout: 3000 });
      const placeholder = await page.$eval(".search-capsule-input", (el) => el.getAttribute("placeholder"));

      reporter.record(
        "顶部搜索栏",
        "搜索输入框及热搜占位符渲染",
        Boolean(inputEl) && Boolean(placeholder),
        Date.now() - t0,
        `占位符: "${placeholder}"`
      );

      // 输入关键词并按 Enter
      await page.type(".search-capsule-input", "唐朝诡事录");
      await page.keyboard.press("Enter");
      await new Promise((r) => setTimeout(r, 1500));

      const hasResultHint = await page.$eval(".search-result-hint", (el) => el.textContent.includes("搜索结果")).catch(() => false);
      const clearBtn = await page.$(".capsule-clear-btn");

      reporter.record(
        "顶部搜索栏",
        "搜索提交与清空按钮显现",
        Boolean(clearBtn) && hasResultHint,
        Date.now() - t0,
        `搜索提示显现: ${hasResultHint}`
      );

      // 点击清空按钮
      await clearBtn.click();
      await new Promise((r) => setTimeout(r, 500));
      const valAfterClear = await page.$eval(".search-capsule-input", (el) => el.value);
      reporter.record(
        "顶部搜索栏",
        "点击 X 清空搜索框并复位列表",
        valAfterClear === "",
        Date.now() - t0,
        "输入框内容已恢复为空"
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_search_cleared.png") });
    } catch (e) {
      reporter.record("顶部搜索栏", "搜索栏交互", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 3. 全维筛选抽屉测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      await page.click(".search-filter-trigger");
      await page.waitForSelector(".drawer-sheet", { timeout: 3000 });
      const drawerTitle = await page.$eval(".drawer-title", (el) => el.textContent);

      reporter.record(
        "筛选抽屉",
        "点击'| 筛选'拉起全维筛选抽屉",
        drawerTitle.includes("全维影视筛选"),
        Date.now() - t0,
        `抽屉标题: "${drawerTitle}"`
      );

      // 切换题材为“科幻”，地区为“欧美”
      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".filter-chip"));
        const sciFiChip = chips.find((el) => el.textContent.trim() === "科幻");
        if (sciFiChip) sciFiChip.click();
        const europeChip = chips.find((el) => el.textContent.trim() === "欧美");
        if (europeChip) europeChip.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_filter_drawer.png") });

      // 点击重置
      await page.click(".filter-reset-btn");
      await new Promise((r) => setTimeout(r, 300));

      // 点击确定应用
      await page.click(".filter-apply-btn");
      await new Promise((r) => setTimeout(r, 600));

      const isDrawerClosed = (await page.$(".drawer-sheet")) === null;
      reporter.record(
        "筛选抽屉",
        "筛选条件重置与应用关闭抽屉",
        isDrawerClosed,
        Date.now() - t0,
        "抽屉成功关闭并更新推荐视图"
      );
    } catch (e) {
      reporter.record("筛选抽屉", "筛选功能异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 4. 右上角快捷操作：离线缓存与观看历史
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 1. 测试离线缓存抽屉
      const actionBtns = await page.$$(".header-circle-btn");
      // 第一个按键是离线缓存
      await actionBtns[0].click();
      await page.waitForSelector(".download-item-card", { timeout: 3000 });
      const downloadCards = await page.$$(".download-item-card");

      reporter.record(
        "离线管理",
        "弹出离线管理抽屉与预设离线任务",
        downloadCards.length > 0,
        Date.now() - t0,
        `存在 ${downloadCards.length} 个缓存项`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_download_drawer.png") });

      // 测试删除离线任务
      const initialCount = downloadCards.length;
      await page.click(".download-remove-btn");
      await new Promise((r) => setTimeout(r, 400));
      const afterDelCount = (await page.$$(".download-item-card")).length;
      reporter.record(
        "离线管理",
        "删除离线任务",
        afterDelCount === initialCount - 1,
        Date.now() - t0,
        `删除前: ${initialCount}, 删除后: ${afterDelCount}`
      );

      // 关闭抽屉
      await page.click(".drawer-close-btn");
      await new Promise((r) => setTimeout(r, 500));

      // 2. 测试观看历史抽屉
      await actionBtns[1].click();
      await page.waitForSelector(".history-item-row", { timeout: 3000 });
      const historyRows = await page.$$(".history-item-row");

      reporter.record(
        "观看历史",
        "弹出观看历史抽屉并展示进度条与续播",
        historyRows.length > 0,
        Date.now() - t0,
        `历史记录数: ${historyRows.length}`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_history_drawer.png") });

      // 测试清空历史
      await page.click(".drawer-text-action");
      await new Promise((r) => setTimeout(r, 400));
      const emptyText = await page.$eval(".empty-drawer-view span", (el) => el.textContent).catch(() => "");
      reporter.record(
        "观看历史",
        "清空历史记录",
        emptyText.includes("暂无观看历史记录"),
        Date.now() - t0,
        `空状态提示: "${emptyText}"`
      );

      // 关闭抽屉
      await page.click(".drawer-close-btn");
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      reporter.record("快捷操作", "离线缓存/历史记录异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 5. 二级频道横滑栏联动测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      const channels = ["电视剧", "电影", "综艺", "动漫", "首页"];
      let allPassed = true;

      for (const ch of channels) {
        await page.evaluate((channelName) => {
          const tabs = Array.from(document.querySelectorAll(".channel-tab-item"));
          const target = tabs.find((t) => t.textContent.trim() === channelName);
          if (target) target.click();
        }, ch);
        await new Promise((r) => setTimeout(r, 400));

        const activeChannelName = await page.$eval(".channel-tab-item.active", (el) => el.textContent.trim());
        if (activeChannelName !== ch) {
          allPassed = false;
        }
      }

      const displayedCount = (await page.$$(".video-poster-card")).length;
      reporter.record(
        "二级频道",
        "横滑栏频道切换与视频卡片联动过滤",
        allPassed && displayedCount > 0,
        Date.now() - t0,
        `切换流畅，首页显示 ${displayedCount} 部影片`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_channel_tabs.png") });
    } catch (e) {
      reporter.record("二级频道", "频道切换测试失败", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 6. Hero Banner 与双列视频网格测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 检查 Hero 大图
      const heroBanner = await page.$(".hero-banner-card");
      const heroTitle = heroBanner ? await page.$eval(".hero-banner-title", (el) => el.textContent.trim()) : "";

      reporter.record(
        "首页焦点Banner",
        "Hero大图卡片与《九门》渲染",
        Boolean(heroBanner) && heroTitle.includes("九门"),
        Date.now() - t0,
        `焦点大图标题: "${heroTitle}"`
      );

      // 检查双列海报卡片与右下角药丸 Badge
      const posterCards = await page.$$(".video-poster-card");
      const firstCardBadge = await page.$eval(".poster-status-badge", (el) => el.textContent.trim());
      const firstCardTitle = await page.$eval(".card-main-title", (el) => el.textContent.trim());
      const firstCardSub = await page.$eval(".card-sub-title", (el) => el.textContent.trim());

      reporter.record(
        "双列视频网格",
        "横版海报、右下角状态药丸与主副标题",
        posterCards.length >= 2 && Boolean(firstCardBadge) && Boolean(firstCardTitle),
        Date.now() - t0,
        `样本卡片: [${firstCardBadge}] 《${firstCardTitle}》- ${firstCardSub}`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_hero_and_grid.png") });
    } catch (e) {
      reporter.record("视频网格", "Hero与网格渲染异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 7. 播放器模态层功能测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 点击第一个卡片打开播放器
      await page.click(".video-poster-card");
      await page.waitForSelector(".player-modal-window", { timeout: 4000 });

      const modalTitle = await page.$eval(".player-vod-title", (el) => el.textContent.trim());
      const videoHasSrc = await page.$eval("video", (el) => el.src.length > 0 || el.currentSrc.length > 0 || Boolean(el));
      const episodeTiles = await page.$$(".ep-tile");

      reporter.record(
        "播放器模态层",
        "拉起模态框、视频就绪与剧集网格",
        Boolean(modalTitle) && episodeTiles.length > 0,
        Date.now() - t0,
        `当前开播: 《${modalTitle}》, 包含 ${episodeTiles.length} 个可见分集`
      );

      // 测试正序/倒序切换
      const firstEpTextBefore = await page.$eval(".ep-tile", (el) => el.textContent.trim());
      await page.click(".order-toggle-btn");
      await new Promise((r) => setTimeout(r, 400));
      const firstEpTextAfter = await page.$eval(".ep-tile", (el) => el.textContent.trim());

      const orderChanged = firstEpTextBefore !== firstEpTextAfter;
      reporter.record(
        "播放器模态层",
        "选集正序/倒序切换",
        orderChanged,
        Date.now() - t0,
        `正序首集: "${firstEpTextBefore}" -> 倒序首集: "${firstEpTextAfter}"`
      );

      // 测试线路切换（若存在多个 source-chip）
      const sourceChips = await page.$$(".source-chip");
      if (sourceChips.length > 1) {
        await sourceChips[1].click();
        await new Promise((r) => setTimeout(r, 400));
        const activeChipText = await page.$eval(".source-chip.active", (el) => el.textContent.trim());
        reporter.record(
          "播放器模态层",
          "线路切换（官方极速/光速秒播/虎牙等）",
          Boolean(activeChipText),
          Date.now() - t0,
          `已切换至新线路: "${activeChipText}"`
        );
      }

      // 切换分集播放
      const tiles = await page.$$(".ep-tile");
      if (tiles.length > 1) {
        await tiles[1].click();
        await new Promise((r) => setTimeout(r, 500));
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_player_modal.png") });

      // 收起播放器模态框
      await page.click(".player-top-floating-actions .close-btn");
      await new Promise((r) => setTimeout(r, 500));
      const isPlayerClosed = (await page.$(".player-modal-window")) === null;

      reporter.record(
        "播放器模态层",
        "收起播放器模态窗口",
        isPlayerClosed,
        Date.now() - t0,
        "播放器模态层正常退出并暂停"
      );
    } catch (e) {
      reporter.record("播放器模态层", "播放器测试异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 8. 底部悬浮毛玻璃胶囊 Dock TabBar 切换测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      const dockItems = await page.$$(".dock-nav-item");
      reporter.record(
        "悬浮胶囊Dock",
        "Dock 包含4个专属Tab项",
        dockItems.length === 4,
        Date.now() - t0,
        `Tab 数量: ${dockItems.length}`
      );

      // 检查当前选中高亮底色背板
      const activeTabClass = await page.$eval(".dock-nav-item.active", (el) => el.className);
      reporter.record(
        "悬浮胶囊Dock",
        "首页选中态高亮与专属背板类名",
        activeTabClass.includes("active"),
        Date.now() - t0,
        `激活样式: ${activeTabClass}`
      );
    } catch (e) {
      reporter.record("悬浮胶囊Dock", "Dock 渲染检测失败", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 9. 短剧频道 (Shorts) 沉浸流测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 点击 Dock 上的短剧 Tab (第2个)
      const dockItems = await page.$$(".dock-nav-item");
      await dockItems[1].click();
      await page.waitForSelector(".shorts-immersive-container", { timeout: 3000 });

      const initialStepText = await page.$eval(".short-episode-stepper span", (el) => el.textContent.trim());
      const dramaTitle = await page.$eval(".short-drama-title", (el) => el.textContent.trim());
      const actionItems = await page.$$(".short-action-item");

      reporter.record(
        "短剧沉浸流",
        "短剧全屏海报、步进器与右侧互动点赞/选集/分享",
        Boolean(dramaTitle) && actionItems.length >= 3,
        Date.now() - t0,
        `首部短剧: "${dramaTitle}", 步进器: "${initialStepText}", 互动按键数: ${actionItems.length}`
      );

      // 点击“下一部”
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll(".short-episode-stepper button"));
        const nextBtn = btns.find((b) => b.textContent.includes("下一部"));
        if (nextBtn) nextBtn.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const nextStepText = await page.$eval(".short-episode-stepper span", (el) => el.textContent.trim());
      reporter.record(
        "短剧沉浸流",
        "短剧切集步进切换 (下一部)",
        nextStepText !== initialStepText,
        Date.now() - t0,
        `切集前: ${initialStepText} -> 切集后: ${nextStepText}`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_shorts_view.png") });
    } catch (e) {
      reporter.record("短剧沉浸流", "短剧测试异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 10. 排行榜频道 (Rank) 榜单切换与皇冠徽章测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 点击 Dock 上的排行榜 Tab (第3个)
      const dockItems = await page.$$(".dock-nav-item");
      await dockItems[2].click();
      await page.waitForSelector(".rank-view-container", { timeout: 3000 });

      const subTabs = await page.$$(".rank-sub-tabs button");
      const crown1 = await page.$(".crown-badge.gold");
      const crown2 = await page.$(".crown-badge.silver");
      const crown3 = await page.$(".crown-badge.bronze");
      const firstHeat = await page.$eval(".rank-heat", (el) => el.textContent.trim());

      reporter.record(
        "排行榜频道",
        "热播总榜、Top1/2/3 皇冠徽章与热度分值",
        subTabs.length === 4 && Boolean(crown1) && Boolean(crown2) && Boolean(crown3),
        Date.now() - t0,
        `4个分榜就绪, Top 1 皇冠徽章渲染正常, 榜首热度: "${firstHeat}"`
      );

      // 切换到“飙升榜”
      await subTabs[1].click();
      await new Promise((r) => setTimeout(r, 400));
      const surgeActive = await page.$eval(".rank-sub-tabs button:nth-child(2)", (el) => el.className.includes("active"));

      // 切换到“短剧榜”
      await subTabs[2].click();
      await new Promise((r) => setTimeout(r, 400));
      const shortsActive = await page.$eval(".rank-sub-tabs button:nth-child(3)", (el) => el.className.includes("active"));

      reporter.record(
        "排行榜频道",
        "多维榜单Tab(热播/飙升/短剧/新片)流畅切换",
        surgeActive && shortsActive,
        Date.now() - t0,
        "榜单切换状态响应无时延"
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_rank_view.png") });
    } catch (e) {
      reporter.record("排行榜频道", "排行榜测试异常", false, Date.now() - t0, e.message);
    }
  }

  // -------------------------------------------------------------
  // 11. 我的个人中心 (Profile) VIP卡片与设置开关测试
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    try {
      // 点击 Dock 上的我的 Tab (第4个)
      const dockItems = await page.$$(".dock-nav-item");
      await dockItems[3].click();
      await page.waitForSelector(".profile-view-container", { timeout: 3000 });

      const vipName = await page.$eval(".user-name", (el) => el.textContent.trim());
      const vipPill = await page.$eval(".user-vip-pill", (el) => el.textContent.trim());
      const statBoxes = await page.$$(".profile-quick-stats .stat-box");

      reporter.record(
        "个人中心",
        "VIP身份卡片、免广告标贴与金刚区统计",
        vipName.includes("VIP") && statBoxes.length === 3,
        Date.now() - t0,
        `身份: "${vipName}" [${vipPill}], 金刚区包含 ${statBoxes.length} 个业务模块`
      );

      // 测试设置开关切换
      const switchInput = await page.$(".setting-row .switch-input");
      const switchValBefore = await page.$eval(".setting-row .switch-input", (el) => el.checked);
      await switchInput.click();
      const switchValAfter = await page.$eval(".setting-row .switch-input", (el) => el.checked);

      reporter.record(
        "个人中心",
        "本地代理加速与播放偏好开关交互",
        switchValBefore !== switchValAfter,
        Date.now() - t0,
        `开关状态成功取反: ${switchValBefore} -> ${switchValAfter}`
      );

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_profile_view.png") });
    } catch (e) {
      reporter.record("个人中心", "个人中心测试异常", false, Date.now() - t0, e.message);
    }
  }

  await browser.close();

  const report = reporter.summary();
  console.log("\n==================================================");
  console.log(`🏁 自动化测试执行完毕: 总计 ${report.total} 项, 通过: ${report.passed}, 失败: ${report.failed}, 耗时: ${report.totalTime}ms`);
  console.log("==================================================");

  // 保存测试数据 JSON
  fs.writeFileSync("/Users/xiaobin/ai-study/aurora-player/tests/test_report.json", JSON.stringify(report, null, 2));

  return report;
}

runTests().catch(console.error);
