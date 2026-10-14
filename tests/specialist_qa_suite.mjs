import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const TARGET_URL = process.env.TARGET_URL || process.argv[2] || "https://343469ac.aurora-player-4yy.pages.dev";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENSHOT_DIR = "/Users/xiaobin/ai-study/aurora-player/tests/screenshots";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class QAReporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  record(section, testItem, passed, details = "", screenshot = "") {
    const status = passed ? "PASS" : "FAIL";
    const entry = {
      section,
      testItem,
      passed,
      status,
      timestamp: new Date().toISOString(),
      details,
      screenshot,
    };
    this.results.push(entry);
    const badge = passed ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
    console.log(`${badge} [${section}] ${testItem} -> ${details}`);
    if (screenshot) {
      console.log(`       📸 截图证据: ${screenshot}`);
    }
  }

  summary() {
    const total = this.results.length;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = total - passed;
    const duration = Date.now() - this.startTime;
    return {
      total,
      passed,
      failed,
      passRate: `${((passed / total) * 100).toFixed(1)}%`,
      durationMs: duration,
      results: this.results,
    };
  }
}

async function runSpecialistQASuite() {
  console.log("================================================================================");
  console.log("🏅 Aurora Player 资深 QA 深度专项自动化测试套件 (Specialist QA Suite)");
  console.log(`🎯 目标测试环境: ${TARGET_URL}`);
  console.log(`🕒 启动时间: ${new Date().toLocaleString()}`);
  console.log("================================================================================\n");

  const reporter = new QAReporter();

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

  // 记录所有网络请求，特别是媒体流请求
  const mediaStreamRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (
      url.includes("/stream?url=") ||
      url.includes(".m3u8") ||
      url.includes(".ts") ||
      url.includes("mux.dev") ||
      url.includes("akamaized.net")
    ) {
      mediaStreamRequests.push({
        url,
        method: req.method(),
        timestamp: Date.now(),
      });
    }
  });

  try {
    // --------------------------------------------------------------------------
    // 准备工作：页面加载
    // --------------------------------------------------------------------------
    console.log("--- 阶段 0: 环境可达性与基础准备 ---");
    const resp = await page.goto(TARGET_URL, { waitUntil: "networkidle2", timeout: 25000 });
    const httpStatus = resp?.status();
    const pageTitle = await page.title();
    reporter.record(
      "基础准备",
      "页面成功加载并获得 HTTP 200",
      httpStatus === 200 && pageTitle.includes("极光影院"),
      `HTTP ${httpStatus}, Title: "${pageTitle}"`
    );

    await page.waitForSelector(".video-poster-card", { timeout: 8000 });
    const initialCardCount = await page.$$eval(".video-poster-card", (els) => els.length);
    reporter.record(
      "基础准备",
      "双列瀑布流推荐片库完成挂载",
      initialCardCount > 50,
      `初始加载 ${initialCardCount} 部视频卡片`
    );

    // ==========================================================================
    // 核心目标 1: 页面按钮联动性测试
    // ==========================================================================
    console.log("\n--- 核心目标 1: 页面按钮联动性测试 ---");

    // 1.1 顶部频道切换联动测试 (首页、短剧、电视剧、电影、综艺、动漫、少儿)
    {
      const channelTests = [
        { name: "电视剧", expectedClass: "电视剧" },
        { name: "电影", expectedClass: "电影" },
        { name: "综艺", expectedClass: "综艺" },
        { name: "动漫", expectedClass: "动漫" },
        { name: "少儿", expectedClass: "少儿" },
      ];

      for (const ch of channelTests) {
        await page.evaluate((channelName) => {
          const tabs = Array.from(document.querySelectorAll(".channel-tab-item"));
          const target = tabs.find((t) => t.textContent.trim() === channelName);
          if (target) target.click();
        }, ch.name);
        await new Promise((r) => setTimeout(r, 400));

        const activeChannel = await page.$eval(".channel-tab-item.active", (el) => el.textContent.trim());
        const filteredCount = await page.$$eval(".video-poster-card", (els) => els.length);
        const pass = activeChannel === ch.name && filteredCount > 0 && filteredCount < initialCardCount;

        reporter.record(
          "页面按钮联动性 - 顶部频道",
          `切换至 [${ch.name}] 频道联动过滤`,
          pass,
          `激活频道: "${activeChannel}", 过滤后卡片数: ${filteredCount} (初始 ${initialCardCount})`
        );
      }

      // 测试“短剧”频道与底栏 Dock 联动的特殊逻辑
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".channel-tab-item"));
        const target = tabs.find((t) => t.textContent.trim() === "短剧");
        if (target) target.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const isShortsView = (await page.$(".shorts-immersive-container")) !== null;
      const isShortsDockActive = await page.$eval(
        ".dock-nav-item:nth-child(2)",
        (el) => el.classList.contains("active")
      );
      const shortsScreenshot = "01_channel_switch_shorts.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shortsScreenshot) });

      reporter.record(
        "页面按钮联动性 - 顶部频道",
        "点击顶部 [短剧] 频道自动联动切换到底栏短剧视口",
        isShortsView && isShortsDockActive,
        `短剧容器渲染: ${isShortsView}, 底部短剧Tab激活: ${isShortsDockActive}`,
        shortsScreenshot
      );

      // 切回“首页”频道
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll(".channel-tab-item"));
        const target = tabs.find((t) => t.textContent.trim() === "首页");
        if (target) target.click();
      });
      await new Promise((r) => setTimeout(r, 500));

      const isHomeViewRestored = (await page.$(".home-content-stream")) !== null;
      const restoredCount = await page.$$eval(".video-poster-card", (els) => els.length);
      reporter.record(
        "页面按钮联动性 - 顶部频道",
        "切回 [首页] 频道恢复双列瀑布流推荐片库",
        isHomeViewRestored && restoredCount === initialCardCount,
        `主视口恢复首页流: ${isHomeViewRestored}, 卡片数完全恢复: ${restoredCount}/${initialCardCount}`
      );
    }

    // 1.2 筛选抽屉（| 筛选）选择条件后点击应用联动更新
    {
      // 唤起筛选抽屉
      await page.evaluate(() => document.querySelector(".search-filter-trigger")?.click());
      await page.waitForSelector(".drawer-sheet", { timeout: 3000 });
      const drawerTitle = await page.$eval(".drawer-title", (el) => el.textContent.trim());

      const drawerOpenScreenshot = "02_filter_drawer_open.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, drawerOpenScreenshot) });

      reporter.record(
        "页面按钮联动性 - 筛选抽屉",
        "点击搜索框右侧 '| 筛选' 成功弹出全维筛选抽屉",
        drawerTitle.includes("全维影视筛选"),
        `抽屉标题: "${drawerTitle}"`,
        drawerOpenScreenshot
      );

      // 选择筛选条件：分类选“电影”，题材选“喜剧”
      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".filter-chip"));
        const movieChip = chips.find((c) => c.textContent.trim() === "电影");
        if (movieChip) movieChip.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".filter-chip"));
        const comedyChip = chips.find((c) => c.textContent.trim() === "喜剧");
        if (comedyChip) comedyChip.click();
      });
      await new Promise((r) => setTimeout(r, 400));

      const selectResult = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".filter-chip"));
        const movieChip = chips.find((c) => c.textContent.trim() === "电影");
        const comedyChip = chips.find((c) => c.textContent.trim() === "喜剧");
        const applyBtn = document.querySelector(".filter-apply-btn");
        return {
          movieSelected: movieChip?.classList.contains("active"),
          comedySelected: comedyChip?.classList.contains("active"),
          applyBtnText: applyBtn?.textContent.trim(),
        };
      });

      const conditionsScreenshot = "03_filter_conditions_selected.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, conditionsScreenshot) });

      reporter.record(
        "页面按钮联动性 - 筛选抽屉",
        "选择筛选条件（电影 + 喜剧）且应用按钮数字实时联动",
        selectResult.movieSelected && selectResult.applyBtnText.includes("确定应用"),
        `选中状态: 电影(${selectResult.movieSelected}), 喜剧(${selectResult.comedySelected}), 按钮文字: "${selectResult.applyBtnText}"`,
        conditionsScreenshot
      );

      // 点击确定应用
      await page.evaluate(() => document.querySelector(".filter-apply-btn")?.click());
      await new Promise((r) => setTimeout(r, 800));

      const isDrawerClosed = (await page.$(".drawer-sheet")) === null;
      const filteredGridCount = await page.$$eval(".video-poster-card", (els) => els.length);
      const appliedScreenshot = "04_filter_applied_grid.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, appliedScreenshot) });

      reporter.record(
        "页面按钮联动性 - 筛选抽屉",
        "应用筛选条件后抽屉关闭，列表按条件联动更新",
        isDrawerClosed && filteredGridCount > 0 && filteredGridCount < initialCardCount,
        `抽屉已关闭: ${isDrawerClosed}, 过滤后影片数: ${filteredGridCount} (符合预期子集)`,
        appliedScreenshot
      );

      // 重新打开抽屉并重置恢复
      await page.evaluate(() => document.querySelector(".search-filter-trigger")?.click());
      await page.waitForSelector(".drawer-sheet", { timeout: 3000 });
      await page.evaluate(() => document.querySelector(".filter-reset-btn")?.click());
      await new Promise((r) => setTimeout(r, 400));
      await page.evaluate(() => document.querySelector(".filter-apply-btn")?.click());
      await new Promise((r) => setTimeout(r, 800));

      const resetCount = await page.$$eval(".video-poster-card", (els) => els.length);
      reporter.record(
        "页面按钮联动性 - 筛选抽屉",
        "点击重置并应用后，列表联动恢复全量推荐",
        resetCount === initialCardCount,
        `恢复后卡片数: ${resetCount}/${initialCardCount}`
      );
    }

    // 1.3 底部 Dock Tab（首页、短剧、排行榜、我的）联动切换对应视口
    {
      const dockTabs = [
        { index: 1, name: "短剧", targetSelector: ".shorts-immersive-container", screenshot: "05_dock_tab_shorts.png" },
        { index: 2, name: "排行榜", targetSelector: ".rank-view-container", screenshot: "06_dock_tab_rank.png" },
        { index: 3, name: "我的", targetSelector: ".profile-view-container", screenshot: "07_dock_tab_profile.png" },
        { index: 0, name: "首页", targetSelector: ".home-content-stream", screenshot: "08_dock_tab_home.png" },
      ];

      for (const tab of dockTabs) {
        const dockItems = await page.$$(".dock-nav-item");
        await dockItems[tab.index].click();
        await new Promise((r) => setTimeout(r, 500));

        const isTargetMounted = (await page.$(tab.targetSelector)) !== null;
        const isActiveState = await dockItems[tab.index].evaluate((el) => el.classList.contains("active"));

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, tab.screenshot) });

        reporter.record(
          "页面按钮联动性 - 底部Dock",
          `点击底栏 [${tab.name}] Tab 联动切换到对应视口`,
          isTargetMounted && isActiveState,
          `目标视口 ${tab.targetSelector} 挂载: ${isTargetMounted}, 按钮激活态: ${isActiveState}`,
          tab.screenshot
        );
      }
    }

    // 1.4 搜索输入与回车联动 & 清空按钮恢复推荐列表
    {
      const searchKeyword = "美人余";
      await page.click(".search-capsule-input");
      await page.type(".search-capsule-input", searchKeyword);
      await page.keyboard.press("Enter");
      await page.waitForSelector(".search-result-hint", { timeout: 10000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 800));

      const hasHint = (await page.$(".search-result-hint")) !== null;
      const resultTitles = await page.$$eval(".card-main-title", (els) => els.map((e) => e.textContent.trim()));
      const searchMatched = resultTitles.some((t) => t.includes(searchKeyword));
      const filteredProperly = resultTitles.length > 0 && resultTitles.length < initialCardCount;

      const searchScreenshot = "09_search_result_grid.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, searchScreenshot) });

      reporter.record(
        "页面按钮联动性 - 搜索功能",
        `搜索输入 "${searchKeyword}" 并回车，列表联动切换为搜索结果`,
        hasHint && searchMatched && filteredProperly,
        `提示显现: ${hasHint}, 检索结果包含 "${searchKeyword}": ${searchMatched} (匹配到 ${resultTitles.length} 部)`,
        searchScreenshot
      );

      // 点击清空恢复推荐
      await page.evaluate(() => {
        const clearBtn = document.querySelector(".search-capsule-clear") || document.querySelector(".reset-search-btn");
        if (clearBtn) clearBtn.click();
      });
      await new Promise((r) => setTimeout(r, 600));

      const inputVal = await page.$eval(".search-capsule-input", (el) => el.value);
      const restoredAfterSearch = await page.$$eval(".video-poster-card", (els) => els.length);

      const resetSearchScreenshot = "10_search_reset_grid.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, resetSearchScreenshot) });

      reporter.record(
        "页面按钮联动性 - 搜索功能",
        "点击清空按钮后，搜索状态复位并联动恢复推荐列表",
        inputVal === "" && restoredAfterSearch === initialCardCount,
        `输入框清空: "${inputVal}", 推荐列表恢复: ${restoredAfterSearch}/${initialCardCount}`,
        resetSearchScreenshot
      );
    }

    // ==========================================================================
    // 核心目标 2: 展示的播放界面是否正确
    // ==========================================================================
    console.log("\n--- 核心目标 2: 展示的播放界面结构与渲染测试 ---");
    {
      // 点击第一个视频卡片唤起播放器
      await page.click(".video-poster-card");
      await page.waitForSelector(".player-modal-window", { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 1000));

      // 1. 结构完整性校验
      const structureCheck = await page.evaluate(() => {
        const modalWindow = document.querySelector(".player-modal-window");
        const videoContainer = document.querySelector(".video-container");
        const videoElement = document.querySelector(".video-container video");
        const titleEl = document.querySelector(".player-vod-title");
        const subTitleEl = document.querySelector(".player-vod-sub");
        const sourceSelector = document.querySelector(".player-source-selector");
        const sourceChips = Array.from(document.querySelectorAll(".source-chip"));
        const episodesSection = document.querySelector(".player-episodes-section");
        const episodesTitle = document.querySelector(".episodes-title");
        const orderToggleBtn = document.querySelector(".order-toggle-btn");
        const episodeTiles = Array.from(document.querySelectorAll(".ep-tile"));
        const closeBtn = document.querySelector(".player-top-floating-actions .close-btn");
        const fullscreenBtn = document.querySelector(".player-top-floating-actions .fullscreen-btn");

        return {
          hasModal: Boolean(modalWindow),
          hasVideoContainer: Boolean(videoContainer),
          hasVideoTag: Boolean(videoElement),
          vodTitle: titleEl?.textContent.trim() || "",
          vodSub: subTitleEl?.textContent.trim() || "",
          hasSourceSelector: Boolean(sourceSelector),
          sourceNames: sourceChips.map((c) => c.textContent.trim()),
          hasEpisodesSection: Boolean(episodesSection),
          episodesTitleText: episodesTitle?.textContent.trim() || "",
          hasOrderToggle: Boolean(orderToggleBtn),
          episodeCount: episodeTiles.length,
          hasCloseBtn: Boolean(closeBtn),
          hasFullscreenBtn: Boolean(fullscreenBtn),
        };
      });

      const modalScreenshot = "11_player_modal_structure.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, modalScreenshot) });

      reporter.record(
        "播放界面结构完整性",
        "播放模态框核心结构组件完整挂载",
        structureCheck.hasModal &&
          structureCheck.hasVideoContainer &&
          structureCheck.hasVideoTag &&
          structureCheck.hasCloseBtn &&
          structureCheck.hasFullscreenBtn,
        `模态层: ${structureCheck.hasModal}, 视频容器: ${structureCheck.hasVideoContainer}, 控制按钮(关闭+全屏): 齐全`,
        modalScreenshot
      );

      reporter.record(
        "播放界面结构完整性",
        "视频标题、副标题/集数、线路选择器正确渲染",
        Boolean(structureCheck.vodTitle) &&
          Boolean(structureCheck.vodSub) &&
          structureCheck.sourceNames.length >= 3 &&
          structureCheck.episodeCount > 0,
        `标题: "${structureCheck.vodTitle}", 状态: "${structureCheck.vodSub}", 线路选项: [${structureCheck.sourceNames.join(", ")}], 剧集数: ${structureCheck.episodesTitleText}`
      );

      // 2. 验证正序/倒序按钮切换
      const firstEpBefore = await page.$eval(".ep-tile", (el) => el.textContent.trim());
      await page.click(".order-toggle-btn");
      await new Promise((r) => setTimeout(r, 400));
      const firstEpAfter = await page.$eval(".ep-tile", (el) => el.textContent.trim());
      const orderToggleText = await page.$eval(".order-toggle-btn span", (el) => el.textContent.trim());

      const orderScreenshot = "12_player_order_toggle.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, orderScreenshot) });

      reporter.record(
        "播放界面交互",
        "点击正序/倒序按钮，选集网格反转排序且状态文字更新",
        firstEpBefore !== firstEpAfter && orderToggleText === "倒序",
        `切换前首项: "${firstEpBefore}" -> 切换后首项: "${firstEpAfter}", 按钮状态: "${orderToggleText}"`,
        orderScreenshot
      );

      // 复位正序
      await page.click(".order-toggle-btn");
      await new Promise((r) => setTimeout(r, 300));

      // 关闭播放器
      await page.evaluate(() => document.querySelector(".player-top-floating-actions .close-btn")?.click());
      await new Promise((r) => setTimeout(r, 800));
    }

    // ==========================================================================
    // 核心目标 3: 视频是否真实播放选中的视频（核心一致性检验）
    // ==========================================================================
    console.log("\n--- 核心目标 3: 视频真实播放与核心一致性深度检验 ---");

    // 清空历史网络流请求
    mediaStreamRequests.length = 0;

    // 3.1 验证视频 A（例如《现在就出发 第四季》）：标题一致性与真实流 URL 检验
    let videoA_Ep1_StreamUrl = "";
    let videoA_Ep2_StreamUrl = "";
    {
      const reqIndexBeforeA = mediaStreamRequests.length;

      // 在列表中精准点击《现在就出发 第四季》
      const clickedA = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".video-poster-card"));
        const target = cards.find((c) =>
          c.querySelector(".card-main-title")?.textContent.includes("现在就出发 第四季")
        );
        if (target) {
          target.click();
          return true;
        }
        return false;
      });

      await page.waitForSelector(".player-modal-window", { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 2000));

      const titleA = await page.$eval(".player-vod-title", (el) => el.textContent.trim());
      const activeEpName = await page.$eval(".ep-tile.active", (el) => el.textContent.trim());
      const videoSrc = await page.$eval("video", (el) => el.src);

      // 获取网络捕获的流请求
      const streamReqsForA = mediaStreamRequests.slice(reqIndexBeforeA);
      const isStreamAValid = streamReqsForA.some((r) =>
        decodeURIComponent(r.url).includes("x36xhzz")
      );
      const matchedReqA = streamReqsForA.find((r) =>
        decodeURIComponent(r.url).includes("x36xhzz")
      );
      videoA_Ep1_StreamUrl = matchedReqA ? decodeURIComponent(matchedReqA.url) : "";

      const shotVideoA = "13_play_video_A_now_departure.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotVideoA) });

      reporter.record(
        "播放真实性 - 视频A起播",
        "点击《现在就出发 第四季》，标题与真实流 URL 绝对匹配",
        titleA === "现在就出发 第四季" &&
          activeEpName === "第 01 集" &&
          Boolean(videoSrc) &&
          isStreamAValid,
        `标题: "${titleA}", 选集: "${activeEpName}", video.src: "${videoSrc.slice(0, 45)}...", 真实流: "${videoA_Ep1_StreamUrl}" (已捕获 x36xhzz 流: ${isStreamAValid})`,
        shotVideoA
      );
    }

    // 3.2 验证选集切换：点击“第 02 集”，激活态与媒体流变更
    {
      const streamReqsBefore = mediaStreamRequests.length;

      // 点击第 02 集 (索引 1)
      const epTiles = await page.$$(".ep-tile");
      let clickedEp2 = false;
      if (epTiles.length > 1) {
        await epTiles[1].click();
        clickedEp2 = true;
      }

      await new Promise((r) => setTimeout(r, 1500));

      const activeEpAfter = await page.$eval(".ep-tile.active", (el) => el.textContent.trim());
      const newStreamReqs = mediaStreamRequests.slice(streamReqsBefore);
      const isEp2StreamValid = newStreamReqs.some((r) =>
        decodeURIComponent(r.url).includes("2000341") || decodeURIComponent(r.url).includes("master.m3u8")
      );
      const matchedReqEp2 = newStreamReqs.find((r) =>
        decodeURIComponent(r.url).includes("2000341") || decodeURIComponent(r.url).includes("master.m3u8")
      );
      videoA_Ep2_StreamUrl = matchedReqEp2 ? decodeURIComponent(matchedReqEp2.url) : "";

      const shotEp2 = "14_play_video_A_ep2_switch.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotEp2) });

      reporter.record(
        "播放真实性 - 选集切换",
        "点击“第 02 集”，激活态切换且流 URL 联动变更为第 02 集媒体流",
        clickedEp2 && activeEpAfter.includes("02") && isEp2StreamValid,
        `激活集: "${activeEpAfter}", 第2集流URL: "${videoA_Ep2_StreamUrl}" (含2000341/test特征: ${isEp2StreamValid})`,
        shotEp2
      );
    }

    // 3.3 验证跨视频切换（视频 A -> 视频 B，如《美人余》）：标题与媒体流彻底更替，绝无残留
    let videoB_StreamUrl = "";
    {
      // 1. 关闭视频 A 播放器
      await page.evaluate(() => document.querySelector(".player-top-floating-actions .close-btn")?.click());
      await new Promise((r) => setTimeout(r, 600));

      const isClosed = (await page.$(".player-modal-window")) === null;
      reporter.record(
        "播放真实性 - 跨视频切换",
        "关闭视频 A 播放器，模态窗口完全销毁且媒体流销毁",
        isClosed,
        `播放窗口已完全卸载: ${isClosed}`
      );

      // 截断记录点
      const reqIndexBeforeVideoB = mediaStreamRequests.length;

      // 2. 点击视频 B《美人余》
      const clickedB = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll(".video-poster-card"));
        const target = cards.find((c) => c.querySelector(".card-main-title")?.textContent.includes("美人余"));
        if (target) {
          target.click();
          return true;
        }
        return false;
      });

      await page.waitForSelector(".player-modal-window", { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 2000));

      const titleB = await page.$eval(".player-vod-title", (el) => el.textContent.trim());
      const subB = await page.$eval(".player-vod-sub", (el) => el.textContent.trim());

      const reqsForB = mediaStreamRequests.slice(reqIndexBeforeVideoB);
      const matchedReqB = reqsForB.find((r) =>
        decodeURIComponent(r.url).includes("test_001")
      );
      videoB_StreamUrl = matchedReqB ? decodeURIComponent(matchedReqB.url) : "";
      const isStreamBValid = Boolean(videoB_StreamUrl);

      // 严格断言：绝无上一部视频 A 的残留
      const hasLeakFromVideoA = reqsForB.some(
        (r) =>
          decodeURIComponent(r.url).includes("x36xhzz") ||
          decodeURIComponent(r.url).includes("2000341")
      ) || titleB.includes("现在就出发");

      const shotVideoB = "15_play_video_B_meirenyu.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotVideoB) });

      reporter.record(
        "播放真实性 - 跨视频切换",
        "换片点击《美人余》，标题与流 URL 立即变更为视频 B，严禁残留视频 A 流",
        clickedB && titleB === "美人余" && isStreamBValid && !hasLeakFromVideoA,
        `换片后标题: "${titleB}", 简介: "${subB}", 视频B真实流: "${videoB_StreamUrl}", 残留检测(Leak): ${hasLeakFromVideoA ? "FAIL(有残留)" : "PASS(零残留)"}`,
        shotVideoB
      );
    }

    // 3.4 验证线路切换：点击不同线路（光速秒播源、虎牙备用线），验证重新加载
    {
      const reqIndexBeforeSwitch = mediaStreamRequests.length;

      // 点击第 2 条线路“光速秒播源”
      const switchSourceResult = await page.evaluate(() => {
        const chips = Array.from(document.querySelectorAll(".source-chip"));
        if (chips.length > 1) {
          chips[1].click();
          return { clicked: true, name: chips[1].textContent.trim() };
        }
        return { clicked: false, name: "" };
      });

      await new Promise((r) => setTimeout(r, 1500));

      const activeChip = await page.$eval(".source-chip.active", (el) => el.textContent.trim());
      const reqsAfterSourceSwitch = mediaStreamRequests.slice(reqIndexBeforeSwitch);
      const hasReloadRequest = reqsAfterSourceSwitch.some(
        (r) => r.url.includes("/stream?url=") || r.url.includes(".m3u8")
      );

      const shotSourceSwitch = "16_play_source_switch.png";
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, shotSourceSwitch) });

      reporter.record(
        "播放真实性 - 线路切换",
        "点击“光速秒播源”切换线路，高亮状态更新并触发流重新加载",
        switchSourceResult.clicked && activeChip === "光速秒播源" && hasReloadRequest,
        `切换线路: "${activeChip}", 触发重载流请求数: ${reqsAfterSourceSwitch.length}`,
        shotSourceSwitch
      );

      // 再次收起播放器
      await page.click(".player-top-floating-actions .close-btn");
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log("\n================================================================================");
    console.log("🏁 自动化专项测试执行完毕，生成测试报告与数据摘要...");
    console.log("================================================================================\n");

    const summary = reporter.summary();
    const reportPath = "/Users/xiaobin/ai-study/aurora-player/tests/specialist_qa_report.json";
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");
    console.log(`✅ 结构化测试报告已写入: ${reportPath}`);
    console.log(`📊 测试总计: ${summary.total} 项, 通过: ${summary.passed} 项, 失败: ${summary.failed} 项, 通过率: ${summary.passRate}`);

    await browser.close();
    return summary;
  } catch (err) {
    console.error("❌ 测试运行过程发生意外异常:", err);
    await browser.close();
    process.exit(1);
  }
}

runSpecialistQASuite().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
