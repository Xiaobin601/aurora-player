import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const distPath = '/Users/xiaobin/ai-study/aurora-player/dist';
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(distPath, reqPath);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml'
    };
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(distPath, 'index.html')));
  }
});

server.listen(51740, async () => {
  console.log('Server started on 51740');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:51740', { waitUntil: 'networkidle0' });

  // 1. 首页检查：是否有 Hero Banner
  const homeBanner = await page.$('.hero-banner-card');
  console.log('首页是否有 Hero Banner:', !!homeBanner);

  // 2. 点击 动漫 频道
  const tabs = await page.$$('.channel-tab-item');
  let animeTab = null;
  for (const t of tabs) {
    const text = await t.evaluate(el => el.textContent.trim());
    if (text === '动漫') {
      animeTab = t;
      break;
    }
  }

  if (animeTab) {
    await animeTab.click();
    await new Promise(r => setTimeout(r, 600));

    // 检查此时是否还有 Hero Banner
    const animeBanner = await page.$('.hero-banner-card');
    console.log('切换到动漫后是否有 Hero Banner (预期 false):', !!animeBanner);

    // 检查动漫频道的卡片列表
    const cardTitles = await page.$$eval('.card-main-title', els => els.map(e => e.textContent.trim()));
    console.log('动漫频道展示的所有片名:', cardTitles);

    // 严格检查是否有任何重复的片名
    const titleSet = new Set();
    const duplicates = [];
    for (const title of cardTitles) {
      if (titleSet.has(title)) {
        duplicates.push(title);
      }
      titleSet.add(title);
    }

    console.log('重复片名检测结果:', duplicates.length === 0 ? '【完全去重，无任何重复片名】' : `【有重复项: ${duplicates.join(', ')}】`);

    // 截图保存
    await page.screenshot({ path: '/Users/xiaobin/ai-study/aurora-player/tests/screenshots/anime_tab_fixed.png' });
    console.log('动漫切换后截图保存至 tests/screenshots/anime_tab_fixed.png');
  } else {
    console.error('未找到 动漫 Tab！');
  }

  await browser.close();
  server.close();
  process.exit(0);
});
