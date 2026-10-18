/**
 * 极光影院 (Aurora Player) - 追剧收藏与更新提醒持久化存储服务
 * 支持 LocalStorage 与未来 IndexedDB 平滑扩展，包含剧集对比与新剧集红点检测
 */

export interface FavoriteItem {
  vodId: string | number;
  vodName: string;
  vodPic: string;
  category?: string;
  type?: string;
  area?: string;
  year?: string | number;
  remarks?: string;
  latestEpisode: string; // 最新集数名称，如 "第36集" 或 "HD"
  latestTotal: number; // 当前已知的最新总集数
  lastWatchEpisode?: string; // 最近观看的集数名称
  lastWatchIndex?: number; // 最近观看的集数索引
  lastWatchTotal?: number; // 观看时该剧的总集数
  lastWatchProgress?: number; // 播放进度百分比
  lastWatchTime?: number; // 最近观看时间戳
  collectTime: number; // 收藏时间戳
  hasUpdate?: boolean; // 是否有新更新（比对 latestTotal 与 lastWatchTotal）
}

const STORAGE_KEY_FAVORITES = "aurora_favorites_library_v1";

// 内存中缓存与事件监听器
type FavoritesChangeListener = (favorites: FavoriteItem[]) => void;
const listeners = new Set<FavoritesChangeListener>();

/**
 * 读取本地收藏库
 */
export function getFavorites(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FAVORITES);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      return list.map((item) => ({
        ...item,
        // 自动计算是否有新更新：若源站最新集数多于用户已看/收藏时的集数，则提示有更新
        hasUpdate:
          Boolean(item.latestTotal && item.lastWatchTotal && item.latestTotal > item.lastWatchTotal) ||
          item.hasUpdate,
      }));
    }
  } catch (err) {
    console.warn("[FavoritesStorage] 读取收藏库异常:", err);
  }
  return [];
}

/**
 * 保存收藏列表到本地
 */
function saveFavorites(list: FavoriteItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_FAVORITES, JSON.stringify(list));
    // 通知所有观察者
    listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (e) {
        console.error(e);
      }
    });
  } catch (err) {
    console.warn("[FavoritesStorage] 写入本地收藏库失败:", err);
  }
}

/**
 * 检查某影片是否已在追剧库中
 */
export function isFavorite(vodId: string | number): boolean {
  if (!vodId && vodId !== 0) return false;
  const list = getFavorites();
  return list.some((item) => String(item.vodId) === String(vodId));
}

/**
 * 添加或更新收藏项
 */
export function toggleFavorite(video: {
  vodId: string | number;
  vodName: string;
  vodPic: string;
  category?: string;
  type?: string;
  area?: string;
  year?: string | number;
  remarks?: string;
  latestEpisode?: string;
  latestTotal?: number;
  currentEpisodeName?: string;
  currentEpisodeIndex?: number;
  currentProgress?: number;
}): { isFavorited: boolean; item?: FavoriteItem } {
  const list = getFavorites();
  const idStr = String(video.vodId);
  const existingIndex = list.findIndex((it) => String(it.vodId) === idStr);

  if (existingIndex >= 0) {
    // 已经收藏，触发取消收藏
    list.splice(existingIndex, 1);
    saveFavorites(list);
    return { isFavorited: false };
  }

  // 新增收藏
  const newItem: FavoriteItem = {
    vodId: video.vodId,
    vodName: video.vodName,
    vodPic: video.vodPic,
    category: video.category,
    type: video.type,
    area: video.area,
    year: video.year,
    remarks: video.remarks,
    latestEpisode: video.latestEpisode || video.remarks || "全集",
    latestTotal: video.latestTotal || 1,
    lastWatchEpisode: video.currentEpisodeName,
    lastWatchIndex: video.currentEpisodeIndex,
    lastWatchTotal: video.latestTotal || 1,
    lastWatchProgress: video.currentProgress || 0,
    lastWatchTime: Date.now(),
    collectTime: Date.now(),
    hasUpdate: false,
  };

  list.unshift(newItem);
  saveFavorites(list);
  return { isFavorited: true, item: newItem };
}

/**
 * 移出追剧收藏
 */
export function removeFavorite(vodId: string | number): void {
  const list = getFavorites();
  const filtered = list.filter((it) => String(it.vodId) !== String(vodId));
  saveFavorites(filtered);
}

/**
 * 清空所有追剧记录
 */
export function clearAllFavorites(): void {
  saveFavorites([]);
}

/**
 * 当用户观看了某一集时，同步更新追剧库中的已看进度，并清除更新红点
 */
export function recordWatchInFavorite(
  vodId: string | number,
  episodeName: string,
  episodeIndex: number,
  progress: number,
  totalEpisodes: number
): void {
  const list = getFavorites();
  const target = list.find((it) => String(it.vodId) === String(vodId));
  if (target) {
    target.lastWatchEpisode = episodeName;
    target.lastWatchIndex = episodeIndex;
    target.lastWatchProgress = progress;
    target.lastWatchTime = Date.now();
    target.lastWatchTotal = Math.max(target.lastWatchTotal || 0, totalEpisodes);
    // 用户看过了最新内容，清除更新提示红点
    if (target.lastWatchTotal >= (target.latestTotal || 0)) {
      target.hasUpdate = false;
    }
    saveFavorites(list);
  }
}

/**
 * 当检测到片源最新集数有更新时更新追剧元数据
 */
export function syncLatestEpisodeInfo(
  vodId: string | number,
  latestEpisodeName: string,
  latestTotal: number
): void {
  const list = getFavorites();
  const target = list.find((it) => String(it.vodId) === String(vodId));
  if (target) {
    if (latestTotal > (target.latestTotal || 0)) {
      target.latestTotal = latestTotal;
      target.latestEpisode = latestEpisodeName;
      // 如果最新集数大于用户最后看过的集数，标记有新更新
      if (latestTotal > (target.lastWatchTotal || 0)) {
        target.hasUpdate = true;
      }
      saveFavorites(list);
    }
  }
}

/**
 * 监听收藏库变动事件
 */
export function subscribeFavorites(callback: FavoritesChangeListener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
