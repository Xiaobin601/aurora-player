// Cloudflare Pages Functions: /api/search
// 在 Cloudflare 全球边缘节点并发请求 MacCMS 开放接口，彻底消除浏览器跨域与网络瓶颈

interface Env {}

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

function cleanTitle(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "未命名影片";

  // 保留特殊形态标识，以区分不同形式的同名作品
  let specialTag = "";
  if (t.includes("动态漫画")) specialTag = "动态漫画";
  else if (t.includes("解说")) specialTag = "解说";
  else if (t.includes("真人")) specialTag = "真人版";
  else if (t.includes("预告")) specialTag = "预告片";

  // 清理各种常见修饰词和括号
  t = t.replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, " ");
  t = t.replace(/(3D动漫版|3D动画版|3D版|动画版|动漫版|第一季|第1季|第二季|第2季|国语版|普通话版|4K修复版|4K超清|4K版|4K|1080P|HD|BD|TC)/gi, " ");
  t = t.replace(/\s+/g, " ").trim();

  if (specialTag && !t.includes(specialTag)) {
    t = `${t} (${specialTag})`;
  }
  return t || raw.trim();
}

function getSourceWeight(name: string): number {
  if (name.includes("虎牙秒播")) return 100;
  if (name.includes("光速高速")) return 90;
  if (name.includes("红牛极速")) return 80;
  if (name.includes("新浪超清")) return 70;
  if (name.includes("量子蓝光")) return 40;
  if (name.includes("非凡高速")) return 30;
  return 50;
}

function parsePlayUrls(playFrom: string, playUrl: string, prefix: string) {
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const kw = url.searchParams.get("wd") || "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Content-Type": "application/json; charset=utf-8",
  };

  if (!kw.trim()) {
    return new Response(JSON.stringify([]), { headers: corsHeaders });
  }

  const encoded = encodeURIComponent(kw.trim());
  const rawItems: any[] = [];

  const promises = ONLINE_APIS.map(async (api) => {
    try {
      const resp = await fetch(api.url + encoded, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const data: any = await resp.json();
      const list = data.list || [];

      return list
        .map((item: any) => {
          const sources = parsePlayUrls(item.vod_play_from, item.vod_play_url, api.name);
          return {
            id: `online-${api.name}-${item.vod_id}`,
            title: item.vod_name?.trim() || "未命名影片",
            category: item.type_name || "影视",
            remarks: item.vod_remarks || "全集",
            pic: item.vod_pic || "",
            sources: sources.filter((s: any) => s.episodes.length > 0),
          };
        })
        .filter((v: any) => v.sources.length > 0);
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

  // 跨源同名规范化归并与高可用线路排序
  const map = new Map<string, any>();
  for (const it of rawItems) {
    const canonicalTitle = cleanTitle(it.title);
    if (map.has(canonicalTitle)) {
      const ex = map.get(canonicalTitle);
      ex.sources.push(...it.sources);
      // 线路按质量权重排序 (虎牙/光速秒播源置顶)
      ex.sources.sort((a: any, b: any) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      if (!ex.pic && it.pic) ex.pic = it.pic;
      if (it.remarks && (!ex.remarks || ex.remarks === "全集")) ex.remarks = it.remarks;
    } else {
      it.title = canonicalTitle;
      it.sources.sort((a: any, b: any) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      map.set(canonicalTitle, { ...it });
    }
  }

  const results = Array.from(map.values());
  const lowerKw = kw.toLowerCase().trim();
  results.sort((a, b) => {
    const aEq = a.title.toLowerCase() === lowerKw ? 1 : 0;
    const bEq = b.title.toLowerCase() === lowerKw ? 1 : 0;
    if (aEq !== bEq) return bEq - aEq;
    const aEps = a.sources.reduce((m: number, s: any) => Math.max(m, s.episodes.length), 0);
    const bEps = b.sources.reduce((m: number, s: any) => Math.max(m, s.episodes.length), 0);
    return bEps - aEps;
  });

  return new Response(JSON.stringify(results), { headers: corsHeaders });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
};
