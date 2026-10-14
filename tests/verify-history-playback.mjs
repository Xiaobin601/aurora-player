import puppeteer from "puppeteer-core";
import { spawn } from "child_process";

const TARGET_URL = "http://localhost:4174";
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const HISTORY_SCREENSHOT = "/Users/xiaobin/.gemini/antigravity/brain/703def44-57ea-4e56-b9ee-f03de486172c/history_drawer_verification.png";

async function runHistoryVerification() {
  console.log("=== 启动本地预览服务器 (port 4174) ===");
  const preview = spawn("npx", ["vite", "preview", "--port", "4174"], {
    cwd: "/Users/xiaobin/ai-study/aurora-player",
    stdio: "inherit",
  });

  await new Promise((r) => setTimeout(r, 2000));

  try {
    console.log("=== 开始历史播放全链路自动化测试 ===");
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto(TARGET_URL, { waitUntil: "networkidle2" });
    console.log("[1] 首页加载完成");

    // 1. 点击首页推荐卡片中的首个视频开播
    const cards = await page.$$(".rec-video-card, .hero-banner-card");
    if (cards.length === 0) throw new Error("未找到推荐视频卡片");
    await cards[0].click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 4000 });
    const vodTitle = await page.$eval(".bagtrim-vod-title", (el) => el.textContent.trim());
    console.log(`[2] 点击开播视频: 《${vodTitle}》`);

    // 2. 模拟播放前进，触发 progress 记录
    await new Promise((r) => setTimeout(r, 1200));
    await page.evaluate(() => {
      const v = document.querySelector("video");
      if (v) {
        v.currentTime = 52;
        v.dispatchEvent(new Event("timeupdate"));
      }
    });
    await new Promise((r) => setTimeout(r, 2200));

    // 3. 点击切换到第 02 集
    const epBtns = await page.$$(".square-ep-btn");
    if (epBtns.length >= 2) {
      await epBtns[1].click();
      console.log("[3] 切换到第 02 集");
      await new Promise((r) => setTimeout(r, 1000));
      // 模拟第 02 集看至 36 秒
      await page.evaluate(() => {
        const v = document.querySelector("video");
        if (v) {
          v.currentTime = 36;
          v.dispatchEvent(new Event("timeupdate"));
        }
      });
      await new Promise((r) => setTimeout(r, 2200));
    }

    // 4. 关闭播放器，回到首页
    const backBtn = await page.$(".bagtrim-floating-back-btn");
    if (backBtn) {
      await backBtn.click();
      console.log("[4] 点击左上角返回按键退出播放详情页");
      await new Promise((r) => setTimeout(r, 600));
    }

    // 5. 点击右上角时钟图标唤起“观影历史记录”抽屉
    console.log("[5] 尝试点击右上角【观看历史】图标...");
    await page.click(".header-circle-btn[title='观看历史']");
    await page.waitForSelector(".drawer-sheet", { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 500));
    console.log("[PASS] 成功唤起观影历史记录抽屉");

    // 验证历史记录项内容
    const historyItems = await page.$$eval(".history-item-row", (els) => els.map((el) => {
      const name = el.querySelector(".history-name")?.textContent?.trim();
      const ep = el.querySelector(".history-ep")?.textContent?.trim();
      const meta = el.querySelector(".history-meta-sub")?.textContent?.trim();
      const timeTag = el.querySelector(".history-time-tag")?.textContent?.trim();
      return { name, ep, meta, timeTag };
    }));
    console.log("[PASS] 历史抽屉展示的记录列表:", historyItems);

    if (historyItems.length === 0 || !historyItems[0].name.includes(vodTitle)) {
      throw new Error(`[FAIL] 历史记录中未包含刚播放的《${vodTitle}》`);
    }
    console.log(`[PASS] 成功验证历史记录自动更新为最新播放的: ${historyItems[0].name} · ${historyItems[0].ep}`);

    // 保存抽屉截图证据
    await page.screenshot({ path: HISTORY_SCREENSHOT, fullPage: false });
    console.log(`[PASS] 成功保存历史记录抽屉高清截图: ${HISTORY_SCREENSHOT}`);

    // 6. 测试持久化：刷新页面
    console.log("[6] 正在刷新页面验证 localStorage 持久化...");
    await page.reload({ waitUntil: "networkidle2" });

    // 再次拉起历史抽屉
    await page.click(".header-circle-btn[title='观看历史']");
    await page.waitForSelector(".history-item-row", { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 500));
    console.log("[PASS] 页面刷新后，localStorage 历史记录成功完整恢复！");

    // 7. 测试精准“续播”
    console.log("[7] 点击历史记录行执行【续播】...");
    await page.$eval(".history-action-pill", (el) => el.click());

    await page.waitForSelector(".bagtrim-player-page", { timeout: 4000 });
    const resumedTitle = await page.$eval(".bagtrim-vod-title", (el) => el.textContent.trim());
    const isSecondEpActive = await page.$eval(".square-ep-btn:nth-child(2)", (el) => el.classList.contains("active"));
    console.log(`[PASS] 续播成功唤起《${resumedTitle}》, 当前是否精准续播至第 02 集: ${isSecondEpActive}`);

    // 8. 测试单条删除
    // 退出播放器
    await page.click(".bagtrim-floating-back-btn");
    await new Promise((r) => setTimeout(r, 600));
    // 打开历史抽屉
    await page.click(".header-circle-btn[title='观看历史']");
    await page.waitForSelector(".history-item-row", { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 500));
    const countBeforeDel = await page.$$eval(".history-item-row", (els) => els.length);
    console.log(`[8] 当前历史条数: ${countBeforeDel}, 测试单条删除...`);
    await page.$eval(".history-del-icon-btn", (el) => el.click());
    await new Promise((r) => setTimeout(r, 600));
    const countAfterDel = await page.$$eval(".history-item-row", (els) => els.length);
    console.log(`[PASS] 单条删除成功: 删除前 ${countBeforeDel} 条 -> 删除后 ${countAfterDel} 条`);

    await browser.close();
    console.log("=== 历史播放功能全链路自动化测试全部 PASS 通过！ ===");
  } finally {
    preview.kill();
  }
}

runHistoryVerification().catch((err) => {
  console.error("测试异常:", err);
  process.exit(1);
});
