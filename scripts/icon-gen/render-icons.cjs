const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUTPUT_DIR = path.join(__dirname, "output");
const ARTIFACT_DIR = "/Users/xiaobin/.gemini/antigravity/brain/703def44-57ea-4e56-b9ee-f03de486172c";

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 4 款高端 iOS App 图标设计方案 (1024x1024)
const DESIGNS = [
  {
    id: "design_a_aurora_stream",
    name: "方案 A: 极光光耀播放器 (Aurora Stream Prism)",
    desc: "深邃黑曜夜空背景上，绚丽流动的北极光（翡翠绿、极光青与紫罗兰）环绕交织，正中心浮现圆润纯白毛玻璃质感的立体播放三棱镜，科技感与流动光影兼具。",
    html: `
      <div class="icon-canvas" style="background: radial-gradient(circle at 50% 20%, #1e1b4b 0%, #090a0f 65%, #030408 100%);">
        <!-- 极光流动背景波纹 -->
        <svg class="bg-layer" viewBox="0 0 1024 1024" width="1024" height="1024">
          <defs>
            <linearGradient id="auroraGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00f2fe" stop-opacity="0.85" />
              <stop offset="50%" stop-color="#4facfe" stop-opacity="0.7" />
              <stop offset="100%" stop-color="#a855f7" stop-opacity="0.8" />
            </linearGradient>
            <linearGradient id="auroraGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.75" />
              <stop offset="60%" stop-color="#06b6d4" stop-opacity="0.8" />
              <stop offset="100%" stop-color="#6366f1" stop-opacity="0.9" />
            </linearGradient>
            <filter id="auroraBlur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="65" />
            </filter>
            <linearGradient id="prismGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#e0e7ff" />
            </linearGradient>
            <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="50%" stop-color="#818cf8" />
              <stop offset="100%" stop-color="#c084fc" />
            </linearGradient>
            <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 极光流带 1 -->
          <path d="M-100 480 C 150 200, 400 700, 650 350 C 850 100, 1050 500, 1150 350 L 1150 1150 L -100 1150 Z" 
                fill="url(#auroraGrad1)" filter="url(#auroraBlur)" opacity="0.85" />
          
          <!-- 极光流带 2 -->
          <path d="M-80 300 C 200 650, 480 200, 750 550 C 920 780, 1080 300, 1150 600 L 1150 1150 L -80 1150 Z" 
                fill="url(#auroraGrad2)" filter="url(#auroraBlur)" opacity="0.75" />

          <!-- 微光粒子点缀 -->
          <circle cx="280" cy="220" r="4" fill="#ffffff" opacity="0.8" />
          <circle cx="760" cy="240" r="5" fill="#38bdf8" opacity="0.9" />
          <circle cx="820" cy="680" r="4" fill="#c084fc" opacity="0.7" />
          <circle cx="220" cy="740" r="6" fill="#34d399" opacity="0.8" />
        </svg>

        <!-- 外层光晕光圈 -->
        <div class="ring-glow"></div>

        <!-- 玻璃拟态三棱镜播放三角容器 -->
        <div class="glass-plate">
          <div class="play-triangle-mesh">
            <svg viewBox="0 0 200 200" width="220" height="220" style="margin-left: 20px;">
              <polygon points="45,25 175,100 45,175" fill="url(#prismGrad)" filter="url(#neonGlow)" />
            </svg>
          </div>
        </div>
      </div>
    `
  },
  {
    id: "design_b_cinema_lens",
    name: "方案 B: 极光天穹视镜 (Aurora Cinema Aperture)",
    desc: "极致纯粹的电影镜头光阑（Aperture）与极光光圈碰撞，深空蓝黑底衬托出细腻的镜头镀膜反光与同心光环，象征探索无限视界的私人家庭影院。",
    html: `
      <div class="icon-canvas" style="background: radial-gradient(circle at 50% 50%, #0f172a 0%, #030712 80%, #020408 100%);">
        <svg viewBox="0 0 1024 1024" width="1024" height="1024">
          <defs>
            <radialGradient id="apertureCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3" />
              <stop offset="45%" stop-color="#6366f1" stop-opacity="0.2" />
              <stop offset="100%" stop-color="#000000" stop-opacity="0.9" />
            </radialGradient>
            <linearGradient id="lensRing1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#38bdf8" />
              <stop offset="50%" stop-color="#818cf8" />
              <stop offset="100%" stop-color="#f43f5e" />
            </linearGradient>
            <linearGradient id="lensRing2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#2dd4bf" />
              <stop offset="50%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
            <filter id="bloomSoft" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 背景电影胶片齿孔与同心律动弧线 -->
          <circle cx="512" cy="512" r="410" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="2" />
          <circle cx="512" cy="512" r="350" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" stroke-dasharray="16 12" />
          <circle cx="512" cy="512" r="280" fill="url(#apertureCore)" />

          <!-- 极光多重同心光圈切片 -->
          <circle cx="512" cy="512" r="280" fill="none" stroke="url(#lensRing1)" stroke-width="16" filter="url(#bloomSoft)" opacity="0.95" />
          <circle cx="512" cy="512" r="220" fill="none" stroke="url(#lensRing2)" stroke-width="10" opacity="0.85" />
          
          <!-- 悬浮微光镜头切面三角形播放器 -->
          <g transform="translate(512, 512)">
            <!-- 镜头光阑叶片旋转线条 -->
            <path d="M-140 -80 L 140 -120" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
            <path d="M120 -100 L 80 140" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
            <path d="M60 120 L -140 40" stroke="rgba(255,255,255,0.15)" stroke-width="2" />
            
            <!-- 核心纯净播放标志 -->
            <path d="M-40 -80 L 85 0 L -40 80 Z" fill="#ffffff" filter="url(#bloomSoft)" />
          </g>

          <!-- 镜头炫光横贯弧光 -->
          <path d="M 180 320 Q 512 400 844 320" fill="none" stroke="rgba(255, 255, 255, 0.45)" stroke-width="3" filter="url(#bloomSoft)" />
        </svg>
      </div>
    `
  },
  {
    id: "design_c_modern_minimal",
    name: "方案 C: 极致双弧“极”字印记 (Infinite Aurora Pulse)",
    desc: "将极光的 A 与无限符号（∞）解构为两条环环相扣的高光渐变纽带，内嵌纯白圆润播放核心，契合 Apple Design Awards 典范风格，在大道至简中释放无尽生机。",
    html: `
      <div class="icon-canvas" style="background: linear-gradient(145deg, #0b0f19 0%, #111827 50%, #030712 100%);">
        <svg viewBox="0 0 1024 1024" width="1024" height="1024">
          <defs>
            <linearGradient id="ribbonA" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00f2fe" />
              <stop offset="50%" stop-color="#4facfe" />
              <stop offset="100%" stop-color="#7c3aed" />
            </linearGradient>
            <linearGradient id="ribbonB" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#f59e0b" />
              <stop offset="40%" stop-color="#ec4899" />
              <stop offset="100%" stop-color="#8b5cf6" />
            </linearGradient>
            <linearGradient id="playCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#cbd5e1" />
            </linearGradient>
            <filter id="shadowDepth" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="24" stdDeviation="36" flood-color="#000000" flood-opacity="0.6" />
            </filter>
            <filter id="glowSubtle" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="28" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 莫比乌斯极光纽带上段 -->
          <path d="M 280 640 C 200 480, 260 280, 460 260 C 620 240, 720 380, 800 500 C 860 600, 840 760, 700 800 C 560 840, 460 740, 380 640 Z" 
                fill="none" stroke="url(#ribbonA)" stroke-width="72" stroke-linecap="round" filter="url(#glowSubtle)" opacity="0.95" />

          <!-- 极光纽带下段交织 -->
          <path d="M 744 384 C 824 544, 764 744, 564 764 C 404 784, 304 644, 224 524 C 164 424, 184 264, 324 224 C 464 184, 564 284, 644 384 Z" 
                fill="none" stroke="url(#ribbonB)" stroke-width="64" stroke-linecap="round" filter="url(#shadowDepth)" opacity="0.9" />

          <!-- 中心浮空白色播放多边形 -->
          <g filter="url(#shadowDepth)">
            <circle cx="512" cy="512" r="140" fill="rgba(255, 255, 255, 0.96)" />
            <polygon points="485,445 575,512 485,579" fill="#0f172a" />
          </g>
        </svg>
      </div>
    `
  },
  {
    id: "design_d_aurora_badge",
    name: "方案 D: 黄金罗盘光影徽章 (Golden Aurora Luminary)",
    desc: "将极光暖金与青翠翡翠融为一体，采用极富质感的微浮雕与光影切面，呈现高贵而典雅的沉浸式顶级影视殿堂气息，在浅色/深色桌面上识别度极高。",
    html: `
      <div class="icon-canvas" style="background: radial-gradient(circle at 30% 25%, #182234 0%, #0b111e 60%, #030712 100%);">
        <svg viewBox="0 0 1024 1024" width="1024" height="1024">
          <defs>
            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fde68a" />
              <stop offset="40%" stop-color="#f59e0b" />
              <stop offset="100%" stop-color="#b45309" />
            </linearGradient>
            <linearGradient id="emeraldGradient" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#059669" />
              <stop offset="60%" stop-color="#10b981" />
              <stop offset="100%" stop-color="#34d399" />
            </linearGradient>
            <linearGradient id="badgeBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="rgba(255, 255, 255, 0.16)" />
              <stop offset="100%" stop-color="rgba(255, 255, 255, 0.03)" />
            </linearGradient>
            <filter id="badgeShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="32" stdDeviation="40" flood-color="#000000" flood-opacity="0.7" />
            </filter>
            <filter id="goldGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="30" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- 翡翠光晕弧线 -->
          <circle cx="512" cy="512" r="380" fill="none" stroke="url(#emeraldGradient)" stroke-width="12" opacity="0.6" filter="url(#goldGlow)" />
          
          <!-- 核心高光外环 -->
          <circle cx="512" cy="512" r="320" fill="url(#badgeBodyGrad)" stroke="url(#goldGradient)" stroke-width="18" filter="url(#badgeShadow)" />
          
          <!-- 刻度与星芒线 -->
          <line x1="512" y1="150" x2="512" y2="180" stroke="url(#goldGradient)" stroke-width="6" stroke-linecap="round" />
          <line x1="512" y1="844" x2="512" y2="874" stroke="url(#goldGradient)" stroke-width="6" stroke-linecap="round" />
          <line x1="150" y1="512" x2="180" y2="512" stroke="url(#goldGradient)" stroke-width="6" stroke-linecap="round" />
          <line x1="844" y1="512" x2="874" y2="512" stroke="url(#goldGradient)" stroke-width="6" stroke-linecap="round" />

          <!-- 中心浮雕播放器黄金三角 -->
          <g filter="url(#goldGlow)">
            <polygon points="450,380 640,512 450,644" fill="url(#goldGradient)" />
          </g>

          <!-- 高光切角反射面 -->
          <path d="M 320 320 Q 512 240 704 320" fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="8" stroke-linecap="round" />
        </svg>
      </div>
    `
  }
];

// 全局容器与 CSS 样式模板
function createHtmlPage(design) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            width: 1024px;
            height: 1024px;
            overflow: hidden;
            background: #000;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .icon-canvas {
            width: 1024px;
            height: 1024px;
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .bg-layer {
            position: absolute;
            inset: 0;
          }
          .ring-glow {
            position: absolute;
            width: 620px;
            height: 620px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(56, 189, 248, 0.4) 0%, rgba(168, 85, 247, 0.2) 50%, transparent 75%);
            filter: blur(40px);
          }
          .glass-plate {
            position: relative;
            width: 440px;
            height: 440px;
            border-radius: 110px;
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(40px);
            -webkit-backdrop-filter: blur(40px);
            border: 2px solid rgba(255, 255, 255, 0.22);
            box-shadow: 0 40px 80px rgba(0, 0, 0, 0.7), inset 0 2px 10px rgba(255, 255, 255, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
          }
        </style>
      </head>
      <body>
        ${design.html}
      </body>
    </html>
  `;
}

// 预览集合多宫格展示页面 (用于生成直观对比海报)
function createShowcasePage(designs) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif; }
          body {
            width: 1920px;
            height: 1080px;
            background: #090b10;
            color: #ffffff;
            padding: 60px 80px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
          }
          .header-box {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 24px;
          }
          .title {
            font-size: 38px;
            font-weight: 800;
            background: linear-gradient(90deg, #ffffff 0%, #38bdf8 50%, #c084fc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.5px;
          }
          .subtitle {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.6);
            margin-top: 6px;
          }
          .cards-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 36px;
            margin: 40px 0;
          }
          .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 28px;
            padding: 30px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
          }
          .icon-preview-box {
            width: 240px;
            height: 240px;
            border-radius: 54px;
            overflow: hidden;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
            margin-bottom: 24px;
          }
          .icon-preview-box img {
            width: 100%;
            height: 100%;
            display: block;
          }
          .badge {
            background: rgba(56, 189, 248, 0.15);
            color: #38bdf8;
            font-size: 13px;
            font-weight: 700;
            padding: 4px 12px;
            border-radius: 20px;
            margin-bottom: 12px;
          }
          .card-name {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 10px;
            color: #ffffff;
          }
          .card-desc {
            font-size: 13px;
            line-height: 1.6;
            color: rgba(255, 255, 255, 0.55);
          }
        </style>
      </head>
      <body>
        <div class="header-box">
          <div>
            <div class="title">极光影院 (Aurora Player) App 图标设计提案</div>
            <div class="subtitle">针对 iOS 18 原生美学定制：1024×1024 超高分辨率、微质感光影与沉浸式影视符号</div>
          </div>
          <div style="font-size: 14px; color: rgba(255,255,255,0.4);">
            设计规范：Apple HIG App Icon Specification (1024x1024)
          </div>
        </div>

        <div class="cards-grid">
          ${designs.map((d) => `
            <div class="card">
              <div class="icon-preview-box">
                <img src="${d.id}.png" />
              </div>
              <div class="badge">${d.id.toUpperCase().replace("DESIGN_", "方案 ")}</div>
              <div class="card-name">${d.name.split(":")[1].trim()}</div>
              <div class="card-desc">${d.desc}</div>
            </div>
          `).join("")}
        </div>

        <div style="text-align: center; color: rgba(255,255,255,0.4); font-size: 13px;">
          选中您心仪的设计方案后，将直接自动替换 iOS Xcode 工程并重新编译安装到您的 iPhone
        </div>
      </body>
    </html>
  `;
}

async function renderIcons() {
  console.log("启动无头 Chrome 进行超高清图标渲染...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 });

  // 1. 逐个渲染 1024x1024 图标原图
  for (const design of DESIGNS) {
    console.log(`正在渲染 ${design.name}...`);
    const html = createHtmlPage(design);
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });
    // 稍微等待 100ms 保证 SVG 滤镜管线栅格化完成
    await new Promise((r) => setTimeout(r, 150));
    const imgPath = path.join(OUTPUT_DIR, `${design.id}.png`);
    await page.screenshot({ path: imgPath, type: "png" });

    // 复制一份到 artifact 目录便于用户在界面直接预览
    fs.copyFileSync(imgPath, path.join(ARTIFACT_DIR, `${design.id}.png`));
  }

  // 2. 渲染 1920x1080 综合展示海报
  console.log("正在渲染 4 款图标综合对比展示海报...");
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const showcaseHtml = createShowcasePage(DESIGNS);
  const showcaseHtmlPath = path.join(OUTPUT_DIR, "showcase.html");
  fs.writeFileSync(showcaseHtmlPath, showcaseHtml, "utf-8");
  await page.goto(`file://${showcaseHtmlPath}`, { waitUntil: "domcontentloaded", timeout: 10000 });
  await new Promise((r) => setTimeout(r, 300));

  const showcaseImgPath = path.join(OUTPUT_DIR, "aurora_icons_showcase.png");
  await page.screenshot({ path: showcaseImgPath, type: "png" });
  fs.copyFileSync(showcaseImgPath, path.join(ARTIFACT_DIR, "aurora_icons_showcase.png"));

  await browser.close();
  console.log("🎉 所有图标与对比海报渲染完成！");
}

renderIcons().catch((err) => {
  console.error("渲染图标出错:", err);
  process.exit(1);
});
