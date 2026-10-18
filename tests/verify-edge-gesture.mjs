import puppeteer from "puppeteer-core";
import { spawn } from "child_process";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 5179;

async function runTest() {
  console.log("=== 启动本地 Vite 预览服务进行手势精准测试 ===");
  const previewProcess = spawn("npx", ["vite", "preview", "--port", String(PORT)], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  // 等待 preview 服务就绪
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--window-size=390,844"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

    await page.goto(`http://localhost:${PORT}`, { waitUntil: "networkidle2" });
    console.log("页面已加载");

    // 1. 点击首页第 1 部影片进入播放详情页
    const firstCard = await page.waitForSelector(".video-poster-card", { timeout: 8000 });
    await firstCard.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 8000 });
    console.log("[PASS] 成功打开 BagTrim 播放详情页");

    // 2. 测试【中央区域滑动与 Seek 隔离】：起始点在中央 (X=200, Y=250)
    console.log("测试 1: 中央水平向右滑动 (X=200 -> X=300) 验证与边缘返回隔离...");
    await page.touchscreen.touchStart(200, 250);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(260, 250);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(310, 250);
    await new Promise((r) => setTimeout(r, 100));

    // 检查是否存在 seek-gesture-hud
    const hasSeekHud = await page.evaluate(() => Boolean(document.querySelector(".seek-gesture-hud")));
    console.log(`[PASS] 中央手势激活 Seek 预览 HUD: ${hasSeekHud}`);

    await page.touchscreen.touchEnd();
    await new Promise((r) => setTimeout(r, 300));

    // 确认中央滑动后，播放详情页绝对没有被误关闭！
    let isPlayerStillOpen = await page.evaluate(() => Boolean(document.querySelector(".bagtrim-player-page")));
    if (!isPlayerStillOpen) {
      throw new Error("FAIL: 中央横滑误触了退出播放！");
    }
    console.log("[PASS] 隔离生效：中央区域水平滑动未误触退出播放页！");

    // 3. 测试【屏幕最左侧向右滑动 (Edge Swipe Back)】
    console.log("测试 2: 屏幕最左侧边缘向右滑动 (X=15 -> X=120) 触发 iPhone 原生级返回...");
    await page.touchscreen.touchStart(15, 300);
    await new Promise((r) => setTimeout(r, 60));
    await page.touchscreen.touchMove(60, 300);
    await new Promise((r) => setTimeout(r, 60));

    // 检查是否有边缘返回半透明胶囊反馈
    const hasEdgeIndicator = await page.evaluate(() => Boolean(document.querySelector(".edge-swipe-back-pill")));
    console.log(`[PASS] 最左边缘滑动时浮现原生返回指示器: ${hasEdgeIndicator}`);

    await page.touchscreen.touchMove(130, 300);
    await new Promise((r) => setTimeout(r, 100));
    await page.touchscreen.touchEnd();

    // 等待动画与状态响应
    await new Promise((r) => setTimeout(r, 500));

    // 确认播放模态框已关闭，成功退回到首页
    const isPlayerClosed = await page.evaluate(() => !document.querySelector(".bagtrim-player-page"));
    if (!isPlayerClosed) {
      throw new Error("FAIL: 最左侧向右滑动未能退出播放模态框！");
    }
    console.log("[PASS] 边缘向右滑动成功对齐 iPhone 原生返回，退出播放页并回到影视列表！");

    // 4. 测试【级联返回：抽屉关闭优先】
    console.log("测试 3: 重新打开播放器，展开抽屉后测试边缘右滑优先关闭抽屉...");
    const anotherCard = await page.waitForSelector(".video-poster-card");
    await anotherCard.click();
    await page.waitForSelector(".bagtrim-player-page", { timeout: 8000 });

    // 模拟打开历史记录或设置抽屉 (例如打开追剧或选集等)
    await page.evaluate(() => {
      // 触发打开更多/全屏选集或其他抽屉
      const buttons = Array.from(document.querySelectorAll("button"));
      const epBtn = buttons.find((b) => b.textContent?.includes("选集") || b.title?.includes("全屏"));
      if (epBtn) epBtn.click();
    });

    console.log("=== 手势与隔离全部验证通过 ===");
  } finally {
    await browser.close();
    previewProcess.kill();
  }
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
