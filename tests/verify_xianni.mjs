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

server.listen(51739, async () => {
  console.log('Static server listening on 51739');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:51739', { waitUntil: 'networkidle0' });

  console.log('Page loaded. Searching for 仙逆 card...');
  const cards = await page.$$('.video-poster-card');
  let xianniCard = null;
  for (const card of cards) {
    const text = await card.evaluate(el => el.textContent);
    if (text.includes('仙逆')) {
      xianniCard = card;
      console.log('Found 仙逆 card text:', text.replace(/\s+/g, ' '));
      break;
    }
  }

  if (xianniCard) {
    await xianniCard.click();
    await new Promise(r => setTimeout(r, 2000));

    const modalTitle = await page.$eval('.player-vod-title', el => el.textContent);
    const episodesTitle = await page.$eval('.episodes-title', el => el.textContent);
    const tilesCount = await page.$$eval('.ep-tile', els => els.length);
    const firstEpText = await page.$eval('.ep-tile.active', el => el.textContent);
    const pagerButtons = await page.$$eval('.page-num-btn', els => els.map(b => b.textContent));
    const sources = await page.$$eval('.source-chip', els => els.map(b => b.textContent));

    console.log('--- 仙逆播放界面验证结果 ---');
    console.log('模态框标题:', modalTitle);
    console.log('剧集列表标题:', episodesTitle);
    console.log('首页展示剧集数:', tilesCount);
    console.log('当前激活剧集:', firstEpText);
    console.log('分页按键组:', pagerButtons);
    console.log('可用真实线路:', sources);

    // 检查 HLS 或 video 流
    const videoSrc = await page.$eval('video', el => el.src);
    console.log('播放器流地址:', videoSrc);

    // 截图保存证据
    await page.screenshot({ path: '/Users/xiaobin/ai-study/aurora-player/tests/screenshots/xianni_verified.png' });
    console.log('截图已保存至 tests/screenshots/xianni_verified.png');
  } else {
    console.error('未在页面找到 仙逆 卡片！');
  }

  await browser.close();
  server.close();
  process.exit(0);
});
