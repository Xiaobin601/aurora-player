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

    if (episodes.length > 0) {
      const hasM3u8 = episodes.some((e) => e.url.includes(".m3u8"));
      if (hasM3u8 || !groupName.includes("yun")) {
        sources.push({
          sourceName: `${prefix} · ${groupName} (${episodes.length}集)`,
          episodes,
        });
      }
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

  // 跨源同名归并
  const map = new Map<string, any>();
  for (const it of rawItems) {
    if (map.has(it.title)) {
      const ex = map.get(it.title);
      ex.sources.push(...it.sources);
      if (!ex.pic && it.pic) ex.pic = it.pic;
    } else {
      map.set(it.title, { ...it });
    }
  }

  const results = Array.from(map.values());
  const lowerKw = kw.toLowerCase();
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
