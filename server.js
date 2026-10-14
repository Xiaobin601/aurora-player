import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";

import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, "dist");
const PORT = 8080;

// 获取局域网 IP
function getLocalIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {}
  return "192.168.1.143";
}

// 优质 MacCMS 接口
const ONLINE_APIS = [
  {
    name: "虎牙秒播线",
    url: "https://www.huyaapi.com/api.php/provide/vod/?ac=detail&wd=",
  },
  {
    name: "光速高速线",
    url: "https://api.guangsuapi.com/api.php/provide/vod/?ac=detail&wd=",
  },
  {
    name: "红牛极速线",
    url: "https://www.hongniuzy2.com/api.php/provide/vod/?ac=detail&wd=",
  },
  {
    name: "新浪超清线",
    url: "http://api.xinlangapi.com/xinlangapi.php/provide/vod/?ac=detail&wd=",
  },
  {
    name: "量子蓝光线",
    url: "https://cj.lziapi.com/api.php/provide/vod/?ac=detail&wd=",
  },
  {
    name: "非凡高速线",
    url: "http://cj.ffzyapi.com/api.php/provide/vod/?ac=detail&wd=",
  },
];

function cleanTitle(raw) {
  let t = (raw || "").trim();
  if (!t) return "未命名影片";

  let specialTag = "";
  if (t.includes("动态漫画")) specialTag = "动态漫画";
  else if (t.includes("解说")) specialTag = "解说";
  else if (t.includes("真人")) specialTag = "真人版";
  else if (t.includes("预告")) specialTag = "预告片";

  t = t.replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, " ");
  t = t.replace(/(3D动漫版|3D动画版|3D版|动画版|动漫版|第一季|第1季|第二季|第2季|国语版|普通话版|4K修复版|4K超清|4K版|4K|1080P|HD|BD|TC)/gi, " ");
  t = t.replace(/\s+/g, " ").trim();

  if (specialTag && !t.includes(specialTag)) {
    t = `${t} (${specialTag})`;
  }
  return t || raw.trim();
}

function getSourceWeight(name) {
  if (name.includes("虎牙秒播")) return 100;
  if (name.includes("光速高速")) return 90;
  if (name.includes("红牛极速")) return 80;
  if (name.includes("新浪超清")) return 70;
  if (name.includes("量子蓝光")) return 40;
  if (name.includes("非凡高速")) return 30;
  return 50;
}

// 解析 MacCMS 播放列表
function parsePlayUrls(playFrom, playUrl, prefix) {
  const fromList = (playFrom || "默认线路").split("$$$");
  const urlGroups = (playUrl || "").split("$$$");
  const sources = [];

  for (let i = 0; i < fromList.length; i++) {
    const groupName = fromList[i] || `线路 ${i + 1}`;
    const rawUrls = urlGroups[i] || "";
    const episodes = [];

    for (const part of rawUrls.split("#")) {
      if (!part.trim()) continue;
      if (part.includes("$")) {
        const [epName, epUrl] = part.split("$");
        if (epUrl && epUrl.trim()) {
          episodes.push({
            name: epName.trim() || `第 ${episodes.length + 1} 集`,
            url: epUrl.trim(),
          });
        }
      } else {
        episodes.push({
          name: `第 ${episodes.length + 1} 集`,
          url: part.trim(),
        });
      }
    }

    // 严苛过滤：只保留包含 .m3u8 的真实播放流，彻底过滤外部分享页与跳转页
    if (episodes.length > 0 && episodes.some((e) => e.url.includes(".m3u8"))) {
      sources.push({
        sourceName: `${prefix} · ${groupName} (${episodes.length}集)`,
        episodes,
      });
    }
  }
  return sources;
}

// 聚合搜索处理
async function handleSearch(kw) {
  const encoded = encodeURIComponent(kw.trim());
  const rawItems = [];

  const promises = ONLINE_APIS.map(async (api) => {
    try {
      const resp = await fetch(api.url + encoded, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      const list = data.list || [];

      return list
        .map((item) => {
          const sources = parsePlayUrls(item.vod_play_from, item.vod_play_url, api.name);
          return {
            id: `online-${api.name}-${item.vod_id}`,
            title: item.vod_name?.trim() || "未命名影片",
            category: item.type_name || "影视",
            remarks: item.vod_remarks || "全集",
            pic: item.vod_pic || "",
            sources: sources.filter((s) => s.episodes.length > 0),
          };
        })
        .filter((v) => v.sources.length > 0);
    } catch {
      return [];
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const s of settled) {
    if (s.status === "fulfilled") {
      rawItems.push(...s.value);
    }
  }

  // 跨源同名归并并按权重排布
  const map = new Map();
  for (const it of rawItems) {
    const canonicalTitle = cleanTitle(it.title);
    if (map.has(canonicalTitle)) {
      const ex = map.get(canonicalTitle);
      ex.sources.push(...it.sources);
      ex.sources.sort((a, b) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      if (!ex.pic && it.pic) ex.pic = it.pic;
      if (it.remarks && (!ex.remarks || ex.remarks === "全集")) ex.remarks = it.remarks;
    } else {
      it.title = canonicalTitle;
      it.sources.sort((a, b) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      map.set(canonicalTitle, { ...it });
    }
  }

  const results = Array.from(map.values());
  const lowerKw = kw.toLowerCase().trim();
  results.sort((a, b) => {
    const aEq = a.title.toLowerCase() === lowerKw ? 1 : 0;
    const bEq = b.title.toLowerCase() === lowerKw ? 1 : 0;
    if (aEq !== bEq) return bEq - aEq;
    const aEps = a.sources.reduce((m, s) => Math.max(m, s.episodes.length), 0);
    const bEps = b.sources.reduce((m, s) => Math.max(m, s.episodes.length), 0);
    return bEps - aEps;
  });

  return results;
}

// 静态文件 MIME 字典
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".m3u8": "application/vnd.apple.mpegurl",
  ".ts": "video/mp2t",
};

const server = http.createServer(async (req, res) => {
  // 启用 CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // 1. 聚合搜索接口
  if (pathname === "/api/search") {
    const wd = parsedUrl.searchParams.get("wd") || "";
    try {
      const list = await handleSearch(wd);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify(list));
    } catch (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: String(err) }));
    }
  }

  // 2. 流媒体切片代理与图片伪装头剥离中转
  if (pathname === "/stream") {
    const targetUrl = parsedUrl.searchParams.get("url");
    if (!targetUrl) {
      res.statusCode = 400;
      return res.end("Missing ?url parameter");
    }

    try {
      let referer = "https://www.google.com/";
      try {
        const u = new URL(targetUrl);
        referer = `${u.protocol}//${u.host}/`;
      } catch {}

      const upstream = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          Referer: referer,
        },
      });

      const contentType = upstream.headers.get("content-type") || "application/octet-stream";
      const isM3u8 = targetUrl.includes(".m3u8") || contentType.includes("mpegurl");

      if (isM3u8) {
        const text = await upstream.text();
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

        const forceProxyAll = parsedUrl.searchParams.get("proxy_all") === "1";
        const rewritten = text
          .split("\n")
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith("#") && trimmed.length > 0) {
              const fullUrl = trimmed.startsWith("http") ? trimmed : baseUrl + trimmed;
              if (forceProxyAll || fullUrl.includes(".m3u8")) {
                return `/stream?url=${encodeURIComponent(fullUrl)}`;
              }
              return fullUrl;
            } else if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
              const startIdx = trimmed.indexOf('URI="');
              const after = trimmed.substring(startIdx + 5);
              const endIdx = after.indexOf('"');
              if (endIdx !== -1) {
                const keyUrl = after.substring(0, endIdx);
                const fullKeyUrl = keyUrl.startsWith("http") ? keyUrl : baseUrl + keyUrl;
                return `${trimmed.substring(0, startIdx)}URI="/stream?url=${encodeURIComponent(fullKeyUrl)}"${after.substring(endIdx + 1)}`;
              }
            }
            return line;
          })
          .join("\n");

        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-cache");
        return res.end(rewritten);
      }

      // 如果是 TS 视频切片，检查并清洗剥离图片头 (PNG / GIF / JPEG 伪装填充)
      const arrayBuffer = await upstream.arrayBuffer();
      let buffer = Buffer.from(arrayBuffer);

      if (buffer.length > 188 && buffer[0] !== 0x47) {
        const syncPos = buffer.indexOf(0x47);
        if (syncPos !== -1 && syncPos < 2048) {
          const isTs =
            (syncPos + 188 < buffer.length && buffer[syncPos + 188] === 0x47) ||
            (syncPos + 376 < buffer.length && buffer[syncPos + 376] === 0x47);
          if (isTs) {
            buffer = buffer.subarray(syncPos);
          }
        }
      }

      res.setHeader("Content-Type", contentType);
      return res.end(buffer);
    } catch (e) {
      res.statusCode = 502;
      return res.end(`Upstream error: ${e.message}`);
    }
  }

  // 3. 静态前端资源托管 (PWA / SPA)
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(DIST_DIR, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
    return res.end(content);
  } catch {
    res.statusCode = 404;
    return res.end("Not Found");
  }
});

// 启动服务器
const hostIp = getLocalIp();
server.listen(PORT, "0.0.0.0", () => {
  const localUrl = `http://${hostIp}:${PORT}/`;
  console.log("\n=======================================================");
  console.log("🚀 极光影院 (Aurora Player) 移动端服务已全速启动！");
  console.log(`📱 iPhone 访问地址: ${localUrl}`);
  console.log("💡 请确保 iPhone 与 Mac 连接同一 Wi-Fi 或处于同一局域网");
  console.log("📲 请使用 iPhone 相机 / 微信 / 浏览器 扫描下方二维码直接秒开：\n");
  qrcode.generate(localUrl, { small: true });
  console.log("=======================================================\n");
});
