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

    if (episodes.length > 0) {
      // 优先保留包含 M3U8 切片流的真实直链
      const hasM3u8 = episodes.some(e => e.url.includes(".m3u8"));
      const lineLabel = apiPrefix 
        ? `${apiPrefix} · ${rawGroupName} (${episodes.length}集)`
        : `${rawGroupName} (${episodes.length}集)`;

      // 如果有 m3u8 则优先保留；过滤掉非视频流的外部网页解析中间页
      if (hasM3u8 || !rawGroupName.includes("yun")) {
        sources.push({
          sourceName: lineLabel,
          episodes,
        });
      }
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
    const normTitle = item.title;
    if (groupedMap.has(normTitle)) {
      const existing = groupedMap.get(normTitle)!;
      // 追增播放线路
      existing.sources.push(...item.sources);
      if (!existing.pic && item.pic) existing.pic = item.pic;
      if (item.remarks && (!existing.remarks || item.remarks.length > existing.remarks.length)) {
        existing.remarks = item.remarks;
      }
    } else {
      groupedMap.set(normTitle, { ...item });
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
