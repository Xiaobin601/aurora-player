export interface Episode {
  name: string;
  url: string;
}

export interface VideoSource {
  sourceName: string;
  episodes: Episode[];
}

export interface VideoItem {
  id: string | number;
  title: string;
  category: string;
  remarks: string;
  pic: string;
  subTitle?: string;
  vodClass?: string;
  year?: string | number;
  hits?: string | number;
  area?: string;
  type?: string;
  sources: VideoSource[];
}

// 预设在线 MacCMS 开放采集接口 (精选国内高可用、鲜活流媒体线路)
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

/**
 * 规范化视频流 URL (对中文路径进行安全百分号编码)
 */
function normalizeMediaUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.toString();
  } catch {
    return url;
  }
}

export function cleanTitle(raw: string): string {
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

export function getSourceWeight(name: string): number {
  if (name.includes("虎牙秒播")) return 100;
  if (name.includes("光速高速")) return 90;
  if (name.includes("红牛极速")) return 80;
  if (name.includes("新浪超清")) return 70;
  if (name.includes("量子蓝光")) return 40;
  if (name.includes("非凡高速")) return 30;
  return 50;
}

/**
 * 解析 MacCMS V10 标准的 vod_play_from 和 vod_play_url 字符串
 */
export function parseMacCmsPlayUrls(playFrom: string, playUrl: string, apiPrefix: string = ""): VideoSource[] {
  const fromList = (playFrom || "默认线路").split("$$$");
  const urlGroupList = (playUrl || "").split("$$$");

  const sources: VideoSource[] = [];

  for (let i = 0; i < fromList.length; i++) {
    const rawGroupName = fromList[i] || `线路 ${i + 1}`;
    const rawUrls = urlGroupList[i] || "";

    const episodes: Episode[] = [];
    const epParts = rawUrls.split("#");

    for (const part of epParts) {
      if (!part.trim()) continue;
      if (part.includes("$")) {
        const [epName, epUrl] = part.split("$");
        if (epUrl && epUrl.trim()) {
          const trimmedUrl = epUrl.trim();
          episodes.push({
            name: epName.trim() || `第 ${episodes.length + 1} 集`,
            url: normalizeMediaUrl(trimmedUrl),
          });
        }
      } else {
        const trimmedUrl = part.trim();
        episodes.push({
          name: `第 ${episodes.length + 1} 集`,
          url: normalizeMediaUrl(trimmedUrl),
        });
      }
    }

    // 严苛过滤：只保留包含 .m3u8 的真实播放流，彻底过滤外部分享页与跳转页
    if (episodes.length > 0 && episodes.some(e => e.url.includes(".m3u8"))) {
      const lineLabel = apiPrefix 
        ? `${apiPrefix} · ${rawGroupName} (${episodes.length}集)`
        : `${rawGroupName} (${episodes.length}集)`;

      sources.push({
        sourceName: lineLabel,
        episodes,
      });
    }
  }

  return sources;
}

async function fetchRaw(url: string): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string>("fetch_remote_api", { url });
  } catch {
    // 降级为直接 fetch
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  }
}

/**
 * 在线聚合搜索视频 (并发检索、质量过滤、跨源同名归并)
 */
export async function searchOnlineVideos(keyword: string): Promise<VideoItem[]> {
  if (!keyword.trim()) return [];

  const encoded = encodeURIComponent(keyword.trim());

  // 如果处于 Web / iPhone PWA 局域网模式，优先使用 Mac 局域网服务的高速聚合搜索接口
  if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
    try {
      const res = await fetch(`/api/search?wd=${encoded}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      console.warn("局域网聚合搜索接口异常，降级到客户端并发检索:", e);
    }
  }

  const rawItems: VideoItem[] = [];

  // 并行请求开放接口
  const promises = ONLINE_APIS.map(async (api) => {
    try {
      const text = await fetchRaw(api.url + encoded);
      const data = JSON.parse(text);
      const list = data.list || [];

      return list.map((item: any) => {
        const sources = parseMacCmsPlayUrls(
          item.vod_play_from,
          item.vod_play_url,
          api.name
        );
        return {
          id: `online-${api.name}-${item.vod_id}`,
          title: item.vod_name?.trim() || "未命名影片",
          category: item.type_name || "影视",
          remarks: item.vod_remarks || "全集",
          pic: item.vod_pic || "",
          sources: sources.filter(s => s.episodes.length > 0),
        };
      }).filter((v: VideoItem) => v.sources.length > 0);
    } catch (e) {
      console.warn(`[VideoSearch] ${api.name} 查询异常:`, e);
      return [];
    }
  });

  const settled = await Promise.allSettled(promises);
  for (const item of settled) {
    if (item.status === "fulfilled") {
      rawItems.push(...item.value);
    }
  }

  // 智能跨源同名视频聚合归纳 (将同一部片在多个源中的线路合并，并优先精准匹配)
  const groupedMap = new Map<string, VideoItem>();

  for (const item of rawItems) {
    const canonicalTitle = cleanTitle(item.title);
    if (groupedMap.has(canonicalTitle)) {
      const existing = groupedMap.get(canonicalTitle)!;
      // 追增播放线路并按质量权重排序 (秒播源置顶)
      existing.sources.push(...item.sources);
      existing.sources.sort((a, b) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      if (!existing.pic && item.pic) existing.pic = item.pic;
      if (item.remarks && (!existing.remarks || item.remarks.length > existing.remarks.length)) {
        existing.remarks = item.remarks;
      }
    } else {
      item.title = canonicalTitle;
      item.sources.sort((a, b) => getSourceWeight(b.sourceName) - getSourceWeight(a.sourceName));
      groupedMap.set(canonicalTitle, { ...item });
    }
  }

  const mergedResults = Array.from(groupedMap.values());

  // 排序：完全匹配关键字的排在最前，集数最多的排在前面
  const lowerKw = keyword.trim().toLowerCase();
  mergedResults.sort((a, b) => {
    const aExact = a.title.toLowerCase() === lowerKw ? 1 : 0;
    const bExact = b.title.toLowerCase() === lowerKw ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const aTotalEps = a.sources.reduce((max, s) => Math.max(max, s.episodes.length), 0);
    const bTotalEps = b.sources.reduce((max, s) => Math.max(max, s.episodes.length), 0);
    return bTotalEps - aTotalEps;
  });

  return mergedResults;
}
