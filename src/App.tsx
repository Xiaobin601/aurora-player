import { useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  X,
  Maximize,
  Play,
  List,
  ChevronLeft,
  Flame,
  Download,
  Clock,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
  Share2,
  Heart,
  Calendar,
  Star,
  Trash2,
  LayoutGrid,
  RefreshCw,
  ArrowUp,
  PictureInPicture,
  Volume2,
  VolumeX,
  Tv,
  Lock,
  Unlock,
  Crop,
  Radio,
  DownloadCloud,
  Pause,
  PlayCircle,
  UploadCloud,
  Sun,
  ChevronRight,
  SkipForward,
} from "lucide-react";
import presetData from "./data/presetLibrary.json";
import { searchOnlineVideos, getHighDefinitionPoster } from "./services/videoSearch";
import type { VideoItem, Episode } from "./services/videoSearch";
import {
  getFavorites,
  toggleFavorite,
  isFavorite,
  removeFavorite,
  clearAllFavorites,
  recordWatchInFavorite,
  syncLatestEpisodeInfo,
  subscribeFavorites,
} from "./services/favoritesStorage";
import type { FavoriteItem } from "./services/favoritesStorage";
import {
  initDownloadEngine,
  subscribeDownloadTasks,
  createDownloadTask,
  pauseDownloadTask,
  resumeDownloadTask,
  deleteDownloadTask,
  getOfflinePlayableUrl,
  formatBytes,
} from "./services/downloadEngine";
import type { DownloadTask } from "./services/downloadEngine";
import {
  getSavedSources,
  saveSources,
  importSourcesFromJson,
  exportSourcesConfig,
  pingAllSources,
  searchAcrossCustomSources,
} from "./services/customSourceService";
import type { CustomSourceSite } from "./services/customSourceService";
import "./App.css";

// 底部导航栏 Tab 定义
type BottomNavTab = "home" | "shorts" | "rank" | "profile";

// 二级分类频道定义
const CHANNELS = [
  "首页",
  "短剧",
  "直播",
  "电视剧",
  "电影",
  "综艺",
  "动漫",
  "少儿",
];

// 筛选维度定义
const FILTER_CATEGORIES = ["全部", "电视剧", "电影", "综艺", "动漫", "短剧"];
const FILTER_GENRES = ["全部", "动作", "喜剧", "科幻", "爱情", "悬疑", "古装", "都市", "热血", "奇幻"];
const FILTER_REGIONS = ["全部", "内地", "中国香港", "中国台湾", "欧美", "日韩"];
const FILTER_YEARS = ["全部", "2026", "2025", "2024", "2023", "2020-2022", "更早"];
const FILTER_SORTS = ["按热门推荐", "按最新更新", "按评分最高"];

// 辅助工具函数：根据地区精确/模糊匹配片源
export function matchVideoRegion(v: { area?: string; vodClass?: string }, region: string): boolean {
  if (!region || region === "全部") return true;
  const area = `${v.area || ""} ${v.vodClass || ""}`;
  if (region === "内地") {
    return ["大陆", "内地", "国产", "普通话"].some((k) => area.includes(k));
  }
  if (region === "中国香港") {
    return area.includes("香港");
  }
  if (region === "中国台湾") {
    return area.includes("台湾");
  }
  if (region === "日韩") {
    return ["日本", "韩国", "日韩"].some((k) => area.includes(k));
  }
  if (region === "欧美") {
    return [
      "美国", "英国", "法国", "德国", "欧美", "加拿大", "意大利",
      "西班牙", "俄罗斯", "澳大利亚", "新西兰", "丹麦", "波兰",
      "瑞典", "荷兰", "比利时", "爱尔兰", "乌克兰", "挪威", "奥地利",
      "罗马尼亚", "保加利亚", "塞尔维亚", "希腊", "斯洛伐克"
    ].some((k) => area.includes(k));
  }
  return area.includes(region);
}

// 辅助工具函数：根据年份精确/范围匹配片源
export function matchVideoYear(v: { year?: string | number; remarks?: string }, year: string): boolean {
  if (!year || year === "全部") return true;
  const yStr = String(v.year || "").trim();
  const yNum = parseInt(yStr, 10);
  const rem = String(v.remarks || "");
  if (year === "2026") return yStr.includes("2026") || rem.includes("2026");
  if (year === "2025") return yStr.includes("2025") || rem.includes("2025");
  if (year === "2024") return yStr.includes("2024") || rem.includes("2024");
  if (year === "2023") return yStr.includes("2023") || rem.includes("2023");
  if (year === "2020-2022") {
    return (yNum >= 2020 && yNum <= 2022) || ["2020", "2021", "2022"].some((yr) => rem.includes(yr));
  }
  if (year === "更早" || year === "2020之前") {
    return yNum > 1900 && yNum < 2020;
  }
  return yStr.includes(year) || rem.includes(year);
}


// 原生形态 B：各二级频道专属影视库细分题材胶囊列表
const CHANNEL_GENRES_MAP: Record<string, string[]> = {
  "电影": [
    "全部", "剧情", "动作", "喜剧", "爱情", "科幻", "奇幻", "恐怖", "犯罪", "战争", "冒险", "动画", "院线", "生活", "同性", "情色"
  ],
  "电视剧": [
    "全部", "古装", "都市", "悬疑", "爱情", "武侠", "犯罪", "历史", "年代", "谍战", "奇幻", "喜剧", "剧情"
  ],
  "动漫": [
    "全部", "热血", "玄幻", "修仙", "科幻", "冒险", "搞笑", "恋爱", "古装", "战斗", "机甲", "奇幻"
  ],
  "综艺": [
    "全部", "真人秀", "搞笑", "游戏", "音乐", "文化", "情感", "生活", "访谈", "益智"
  ],
  "短剧": [
    "全部", "逆袭", "甜宠", "都市", "豪门", "重生", "大女主", "战神", "复仇", "古风"
  ],
  "少儿": [
    "全部", "动画", "益智", "亲子", "搞笑", "冒险", "儿歌", "日常"
  ],
  "直播": [
    "全部", "卫视", "地方台", "央视"
  ],
};

// 观看历史接口
interface WatchHistoryItem {
  vodId: string | number;
  vodName: string;
  vodPic: string;
  episodeName: string;
  episodeUrl: string;
  progressPercent: number;
  currentTime?: number;
  duration?: number;
  sourceIndex?: number;
  timestamp: number;
}

const STORAGE_KEY_HISTORY = "aurora_watch_history_v1";

function loadInitialWatchHistory(): WatchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HISTORY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter(
          (item) => item && item.vodName && !item.episodeUrl?.includes("test-streams.mux.dev")
        );
      }
    }
  } catch (e) {
    console.warn("加载播放历史异常:", e);
  }
  return [];
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  if (diff < 86400000 * 3) return `${Math.floor(diff / 86400000)}天前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export default function App() {
  // 核心播放器引用与 HLS 实例
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // 导航与页面状态
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>("home");
  const [activeChannel, setActiveChannel] = useState<string>("首页");

  // 弹层抽屉与模态框状态
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showDownloadDrawer, setShowDownloadDrawer] = useState<boolean>(false);
  const [showFavoritesDrawer, setShowFavoritesDrawer] = useState<boolean>(false);
  const [showCustomSourceDrawer, setShowCustomSourceDrawer] = useState<boolean>(false);
  const [showAirPlayModal, setShowAirPlayModal] = useState<boolean>(false);
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false);
  const [showPlayerModal, setShowPlayerModal] = useState<boolean>(false);

  // 筛选器状态
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>("全部");
  const [selectedFilterGenre, setSelectedFilterGenre] = useState<string>("全部");
  const [selectedFilterRegion, setSelectedFilterRegion] = useState<string>("全部");
  const [selectedFilterYear, setSelectedFilterYear] = useState<string>("全部");
  const [selectedFilterSort, setSelectedFilterSort] = useState<string>("按热门推荐");

  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // 当前选中的视频详情与选集
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [currentSourceIndex, setCurrentSourceIndex] = useState<number>(0);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [isReverseOrder, setIsReverseOrder] = useState<boolean>(false);

  // 全屏与播放器控制状态
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isLandscapeFullscreen, setIsLandscapeFullscreen] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState<boolean>(false);
  const [rotationAngle, _setRotationAngle] = useState<90 | 270>(90);
  const [isPiPActive, setIsPiPActive] = useState<boolean>(false);
  const controlsTimerRef = useRef<any>(null);

  // 原版截图复刻新功能状态
  const [isDanmakuOn, setIsDanmakuOn] = useState<boolean>(true);
  const [skipIntroOutro, setSkipIntroOutro] = useState<boolean>(true);
  const [showIntroModal, setShowIntroModal] = useState<boolean>(false);
  const [showRatePicker, setShowRatePicker] = useState<boolean>(false);
  const [showSourcePicker, setShowSourcePicker] = useState<boolean>(false);

  // 阶段一：全链路手势状态上下文 (边缘返回、中央Seek、左侧亮度、右侧音量、长按2.0x)
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    type: "edge-back" | "potential" | "center-seek" | "vertical-brightness" | "vertical-volume" | "none";
    initialTime: number;
    targetTime: number;
    diffSeconds: number;
    initialBrightness: number;
    initialVolume: number;
  } | null>(null);

  const [seekGestureHud, setSeekGestureHud] = useState<{
    targetTime: number;
    duration: number;
    diffSeconds: number;
  } | null>(null);

  const [edgeSwipeIndicator, setEdgeSwipeIndicator] = useState<{
    active: boolean;
    distance: number;
  } | null>(null);

  // 阶段一：亮度调节 (0.1 ~ 1.0)
  const [brightness, setBrightness] = useState<number>(1.0);
  const [brightnessHud, setBrightnessHud] = useState<number | null>(null);
  const brightnessHudTimerRef = useRef<any>(null);

  // 阶段一：音量 HUD (0 ~ 100)
  const [volumeHud, setVolumeHud] = useState<number | null>(null);
  const volumeHudTimerRef = useRef<any>(null);

  // 阶段一：画面长按 2.0x 临时加速
  const [isLongPress2x, setIsLongPress2x] = useState<boolean>(false);
  const longPressTimerRef = useRef<any>(null);
  const originalPlaybackRateRef = useRef<number>(1.0);

  // 侦测物理横屏与全屏复合状态 (使物理横屏时自动切换为图2样式)
  const [isScreenLandscape, setIsScreenLandscape] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth > window.innerHeight;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsScreenLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  const isLandscapeMode = isLandscapeFullscreen || isFullscreen || isScreenLandscape;

  // 联动控制 iOS 状态栏显隐：全屏横屏播放时隐藏，其余所有界面（首页、短剧、片库、竖屏播放详情等）均显示系统时间、信号、WiFi与电量
  useEffect(() => {
    try {
      if (isLandscapeMode) {
        (window as any).webkit?.messageHandlers?.setStatusBar?.postMessage("hidden");
      } else {
        (window as any).webkit?.messageHandlers?.setStatusBar?.postMessage("visible");
      }
    } catch (_) {}
  }, [isLandscapeMode]);

  // 本地/云端代理状态 (默认直连原生流，避免移动端/Web端无代理时 404 导致线路异常)
  const [proxyPort, setProxyPort] = useState<number | null>(null);
  const [useProxy, setUseProxy] = useState<boolean>(false);
  const [statusMessage, setStatusMessageState] = useState<string>("就绪");
  const toastTimerRef = useRef<any>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  };

  const setStatusMessage = (msg: string) => {
    setStatusMessageState(msg);
    if (
      msg.includes("切换") ||
      msg.includes("受阻") ||
      msg.includes("同步") ||
      msg.includes("续播") ||
      msg.includes("失败")
    ) {
      showToast(msg);
    }
  };

  // 观看历史与下载列表
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(loadInitialWatchHistory);

  // 监听观看历史变动并持久化到本地存储
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(watchHistory));
    } catch (e) {
      console.warn("持久化播放历史异常:", e);
    }
  }, [watchHistory]);

  // =========================================================
  // 🌟 阶段二：追剧收藏库与更新提醒系统
  // =========================================================
  const [favorites, setFavorites] = useState<FavoriteItem[]>(getFavorites);
  const [heartAnimActive, setHeartAnimActive] = useState<boolean>(false);

  // 监听并订阅收藏库变动
  useEffect(() => {
    const unsubscribe = subscribeFavorites(setFavorites);
    return () => unsubscribe();
  }, []);

  // =========================================================
  // 📺 阶段三：AirPlay 投屏、多画幅比例与防误触屏幕锁
  // =========================================================
  const [aspectRatioMode, setAspectRatioMode] = useState<"contain" | "fill" | "cover">("contain");
  const [aspectRatioToast, setAspectRatioToast] = useState<string | null>(null);
  const [isScreenLocked, setIsScreenLocked] = useState<boolean>(false);
  const [showLockBtn, setShowLockBtn] = useState<boolean>(true);
  const lockBtnTimerRef = useRef<any>(null);

  // 触发锁屏按钮单独显示并在指定时长后自动淡出
  const triggerLockBtn = (duration: number = 3000) => {
    setShowLockBtn(true);
    if (lockBtnTimerRef.current) clearTimeout(lockBtnTimerRef.current);
    lockBtnTimerRef.current = setTimeout(() => {
      setShowLockBtn(false);
    }, duration);
  };

  // 切换画幅比例
  const cycleAspectRatio = () => {
    const nextMode: "contain" | "fill" | "cover" =
      aspectRatioMode === "contain" ? "fill" : aspectRatioMode === "fill" ? "cover" : "contain";
    setAspectRatioMode(nextMode);
    const labels = {
      contain: "自适应等比 (Contain)",
      fill: "拉伸满屏消除黑边 (Fill)",
      cover: "居中裁切满屏 (Cover)",
    };
    setAspectRatioToast(`画幅比例: ${labels[nextMode]}`);
    setTimeout(() => setAspectRatioToast(null), 1800);
  };

  // 切换屏幕锁
  const toggleScreenLock = () => {
    const target = !isScreenLocked;
    setIsScreenLocked(target);
    if (target) {
      // 锁定状态：立即隐藏常规顶底控制栏，锁按钮单独保持展示 3 秒后自动淡出沉浸
      setShowControls(false);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      triggerLockBtn(3000);
      showToast("🔒 屏幕已锁定，防误触生效");
    } else {
      // 解锁状态：清除锁按钮单独计时器，正常呼出顶底控制栏与开锁图标
      if (lockBtnTimerRef.current) clearTimeout(lockBtnTimerRef.current);
      triggerControls();
      showToast("🔓 屏幕已解锁");
    }
  };

  // 触发原生 AirPlay 或投屏引导
  const handleAirPlay = () => {
    const video = videoRef.current;
    if (video && (video as any).webkitShowPlaybackTargetPicker) {
      try {
        (video as any).webkitShowPlaybackTargetPicker();
        showToast("📺 正在调用 iOS 原生 AirPlay 路由选择器...");
        return;
      } catch (e) {
        console.warn("webkitShowPlaybackTargetPicker 异常:", e);
      }
    }
    if (video && (video as any).remote && typeof (video as any).remote.prompt === "function") {
      try {
        (video as any).remote.prompt();
        showToast("📺 正在搜寻无线投屏设备...");
        return;
      } catch (e) {
        console.warn("Remote Playback 异常:", e);
      }
    }
    // 弹层显示投屏助手
    setShowAirPlayModal(true);
  };

  // =========================================================
  // 💾 阶段四：真机沙盒离线下载引擎
  // =========================================================
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);

  useEffect(() => {
    initDownloadEngine().then((list) => {
      setDownloadTasks(list);
    });
    const unsubscribe = subscribeDownloadTasks(setDownloadTasks);
    return () => unsubscribe();
  }, []);

  // 启动当前选集的离线切片下载
  const handleStartDownload = () => {
    if (!selectedVideo) {
      showToast("未检测到有效视频");
      return;
    }
    const ep = currentEpisode || (activeRawEpisodes.length > 0 ? activeRawEpisodes[0] : null);
    if (!ep || !ep.url) {
      showToast("当前剧集无有效播放流，无法离线缓存");
      return;
    }
    const epIdx = activeRawEpisodes.findIndex((e) => e.name === ep.name);
    createDownloadTask({
      vodId: selectedVideo.id,
      vodName: selectedVideo.title,
      vodPic: selectedVideo.pic,
      episodeName: ep.name,
      episodeIndex: epIdx >= 0 ? epIdx : 0,
      url: ep.url,
    });
    showToast(`⚡ 已加入离线下载通道: ${ep.name}`);
  };

  // 从离线缓存中起播本地沙盒分片流
  const handlePlayDownloaded = async (task: DownloadTask) => {
    try {
      showToast(`💾 正在起播本地离线缓存: ${task.vodName}`);
      const localBlob = await getOfflinePlayableUrl(task.id);
      if (localBlob) {
        // 构建临时的 VideoItem 起播
        const localVideo: VideoItem = {
          id: task.vodId,
          title: task.vodName,
          pic: task.vodPic,
          remarks: task.episodeName,
          category: "离线缓存",
          sources: [
            {
              sourceName: "本地沙盒存储",
              episodes: [{ name: task.episodeName, url: localBlob }],
            },
          ],
        };
        setSelectedVideo(localVideo);
        setCurrentSourceIndex(0);
        setCurrentEpisode({ name: task.episodeName, url: localBlob });
        setShowPlayerModal(true);
        setShowDownloadDrawer(false);
        if (videoRef.current) {
          videoRef.current.src = localBlob;
          videoRef.current.play().catch(() => {});
        }
      } else {
        showToast("读取本地离线数据失败");
      }
    } catch (e) {
      showToast("播放离线切片异常");
    }
  };

  // =========================================================
  // 🌐 阶段五：自定义源生态扩展与多源并发测速
  // =========================================================
  const [customSources, setCustomSources] = useState<CustomSourceSite[]>(getSavedSources);
  const [isPingingSources, setIsPingingSources] = useState<boolean>(false);
  const [importInputText, setImportInputText] = useState<string>("");

  // 一键多源并发测速
  const handlePingAllSources = async () => {
    setIsPingingSources(true);
    showToast("⚡ 正在对全部源站并发测速中...");
    const updated = await pingAllSources(customSources);
    setCustomSources([...updated]);
    setIsPingingSources(false);
    showToast("✅ 全网测速完成，已按延迟优化排列");
  };

  // 导入自定义源规则
  const handleImportSources = () => {
    if (!importInputText.trim()) {
      showToast("请输入或粘贴源配置内容");
      return;
    }
    const res = importSourcesFromJson(importInputText);
    if (res.success) {
      setCustomSources(getSavedSources());
      setShowImportDialog(false);
      setImportInputText("");
      showToast(`🎉 成功导入 ${res.count} 个采集源！`);
    } else {
      showToast(`导入失败: ${res.error || "格式有误"}`);
    }
  };

  // 备份并导出规则
  const handleExportSources = () => {
    const configStr = exportSourcesConfig();
    try {
      navigator.clipboard.writeText(configStr);
      showToast("📋 规则配置已复制到剪贴板，可粘贴备份！");
    } catch {
      showToast("导出成功，请查看控制台日志");
      console.log("[Aurora Backup]", configStr);
    }
  };

  // 切换单个源的启用状态
  const toggleSourceEnabled = (key: string) => {
    const updated = customSources.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s));
    setCustomSources(updated);
    saveSources(updated);
  };

  // 排行榜 Tab
  const [activeRankTab, setActiveRankTab] = useState<"hot" | "surge" | "shorts" | "new">("hot");

  // 短剧当前选中的剧集索引
  const [currentShortIndex, setCurrentShortIndex] = useState<number>(0);

  // 1:1 BagTrim 原生详情页二级 Tab 与互动状态
  const [activeDetailTab, setActiveDetailTab] = useState<"detail" | "discuss">("detail");
  const [isCollected, setIsCollected] = useState<boolean>(false);

  // 点击心形/追剧按钮：添加/移出收藏，联动动效与持久化
  const handleToggleFavorite = () => {
    if (!selectedVideo) return;
    setHeartAnimActive(true);
    setTimeout(() => setHeartAnimActive(false), 500);

    const ep = currentEpisode || (activeRawEpisodes.length > 0 ? activeRawEpisodes[0] : null);
    const epIdx = ep ? activeRawEpisodes.findIndex((e) => e.name === ep.name) : 0;
    const progress = duration ? Math.round((currentTime / duration) * 100) : 0;

    const res = toggleFavorite({
      vodId: selectedVideo.id,
      vodName: selectedVideo.title,
      vodPic: selectedVideo.pic,
      category: selectedVideo.category,
      type: selectedVideo.type,
      area: selectedVideo.area,
      year: selectedVideo.year,
      remarks: selectedVideo.remarks,
      latestEpisode: activeRawEpisodes[activeRawEpisodes.length - 1]?.name || selectedVideo.remarks,
      latestTotal: activeRawEpisodes.length,
      currentEpisodeName: ep?.name,
      currentEpisodeIndex: epIdx >= 0 ? epIdx : 0,
      currentProgress: progress,
    });

    setIsCollected(res.isFavorited);
    showToast(
      res.isFavorited
        ? "❤️ 已加入我的追剧，有更新将为您提醒"
        : "已移出追剧列表"
    );
  };

  // 每个频道的【换一换】批次
  const [channelPageMap, setChannelPageMap] = useState<Record<string, number>>({});
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // 原生形态 B：专属分类影视全量库页面状态 (1:1 电影库等深度视图)
  const [activeCategoryLibrary, setActiveCategoryLibrary] = useState<string | null>(null);
  const [libraryGenre, setLibraryGenre] = useState<string>("全部");
  const [libraryRegion, setLibraryRegion] = useState<string>("全部");
  const [libraryYear, setLibraryYear] = useState<string>("全部");
  const [librarySort, setLibrarySort] = useState<string>("按热门推荐");
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);

  useEffect(() => {
    const handleWindowScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleWindowScroll);
  }, []);

  const selectedVideoRef = useRef<VideoItem | null>(null);
  const currentSourceIndexRef = useRef<number>(0);
  const currentEpisodeRef = useRef<Episode | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const lastSavedProgressRef = useRef<number>(0);
  const failoverTimeoutRef = useRef<any>(null);

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    currentSourceIndexRef.current = currentSourceIndex;
  }, [currentSourceIndex]);

  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
  }, [currentEpisode]);

  // 1. 初始化本地 Tauri 微型 HTTP 代理服务器 (端口探测)
  useEffect(() => {
    async function initTauriProxy() {
      try {
        if ((window as any).__TAURI_INTERNALS__) {
          const port = await invoke<number>("get_proxy_port");
          setProxyPort(port);
          setStatusMessage(`本地代理已加速 (端口: ${port})`);
        } else {
          setStatusMessage("极光云端代理就绪");
        }
      } catch (err) {
        console.warn("未处于 Tauri 原生容器或代理初始化中:", err);
        setStatusMessage("极光加速引擎就绪");
      }
    }
    initTauriProxy();
  }, []);

  // 2. 加载预设推荐片库 (去重唯一 key + 优先使用真实全量剧集与多线路)
  const presetVideos: VideoItem[] = useMemo(() => {
    return (presetData.videos || []).map((v: any, index: number) => {
      let realSources = v.sources && v.sources.length > 0 ? v.sources : null;
      if (!realSources) {
        const eps = v.episodes || [];
        realSources = [
          {
            sourceName: "官方极速源",
            episodes: eps,
          },
          {
            sourceName: "光速秒播源",
            episodes: eps,
          },
          {
            sourceName: "虎牙备用线",
            episodes: eps,
          },
        ];
      }

      const totalEps = realSources[0]?.episodes?.length || 0;
      const remarksText = v.vodRemarks || (totalEps > 1 ? `更新至${totalEps}集` : "HD超清");

      return {
        id: `${v.vodId || "vod"}-${index}`,
        title: v.vodName,
        category: v.category || "热门推荐",
        remarks: remarksText,
        pic: v.vodPic,
        subTitle: v.subTitle || (v.vodClass ? v.vodClass.split(",").slice(0, 2).join(" · ") : "超清极速播放"),
        vodClass: v.vodClass || "",
        area: v.vodArea || "",
        year: v.vodYear || "",
        sources: realSources,
      };
    });
  }, []);

  // 短剧精选库
  const shortsList = useMemo(() => {
    const list = presetVideos.filter(
      (v) =>
        v.category.includes("短剧") ||
        v.title.includes("无可替代") ||
        v.title.includes("兰香如故") ||
        v.title.includes("执笔") ||
        v.title.includes("玉簟秋")
    );
    return list.length > 0 ? list : presetVideos.slice(0, 6);
  }, [presetVideos]);

  // 各频道的全量候选去重视频列表
  const currentChannelFullVideos = useMemo(() => {
    let list = presetVideos;

    // 根据顶部频道过滤
    if (activeChannel === "短剧") {
      list = list.filter((v) => v.category.includes("短剧") || v.vodClass?.includes("短剧"));
    } else if (activeChannel === "电视剧") {
      list = list.filter((v) => (v.category.includes("电视剧") || v.vodClass?.includes("电视剧")) && !v.vodClass?.includes("动漫"));
    } else if (activeChannel === "电影") {
      list = list.filter((v) => (v.category.includes("电影") || v.vodClass?.includes("电影")) && !v.vodClass?.includes("电视剧"));
    } else if (activeChannel === "综艺") {
      list = list.filter((v) => v.category.includes("综艺") || v.vodClass?.includes("综艺"));
    } else if (activeChannel === "动漫") {
      list = list.filter((v) => v.category.includes("动漫") || v.vodClass?.includes("动漫") || v.vodClass?.includes("动画"));
    } else if (activeChannel === "少儿") {
      list = list.filter((v) => v.category.includes("少儿") || v.vodClass?.includes("少儿"));
    } else if (activeChannel === "直播") {
      list = list.filter((v) => v.category.includes("直播") || v.vodClass?.includes("直播"));
    }

    // 根据多维筛选过滤
    if (selectedFilterCategory !== "全部") {
      list = list.filter((v) => v.category.includes(selectedFilterCategory) || v.vodClass?.includes(selectedFilterCategory));
    }
    if (selectedFilterGenre !== "全部") {
      list = list.filter((v) => v.vodClass?.includes(selectedFilterGenre) || v.subTitle?.includes(selectedFilterGenre));
    }
    if (selectedFilterRegion !== "全部") {
      list = list.filter((v) => matchVideoRegion(v, selectedFilterRegion));
    }
    if (selectedFilterYear !== "全部") {
      list = list.filter((v) => matchVideoYear(v, selectedFilterYear));
    }

    // 核心去重：严格按照片名唯一性过滤
    const seenTitles = new Set<string>();
    let deduplicatedList: VideoItem[] = [];
    for (const item of list) {
      const cleanKey = item.title.trim();
      if (!seenTitles.has(cleanKey)) {
        seenTitles.add(cleanKey);
        deduplicatedList.push(item);
      }
    }

    if (selectedFilterSort === "按最新更新") {
      deduplicatedList = [...deduplicatedList].reverse();
    } else if (selectedFilterSort === "按评分最高") {
      deduplicatedList = [...deduplicatedList].sort((a, b) => b.title.localeCompare(a.title));
    }

    return deduplicatedList;
  }, [
    presetVideos,
    activeChannel,
    selectedFilterCategory,
    selectedFilterGenre,
    selectedFilterRegion,
    selectedFilterYear,
    selectedFilterSort,
  ]);

  // 各频道的焦点热播横幅 Banner (1:1 像素级复刻真机截图：如电视剧频道的《南部档案》等)
  const channelBannerVideo = useMemo(() => {
    if (hasSearched) return null;
    if (activeChannel === "电视剧") {
      return presetVideos.find((v) => v.title.includes("南部档案")) || currentChannelFullVideos[0] || null;
    }
    if (activeChannel === "首页") {
      return presetVideos.find((v) => v.title.includes("九门")) || presetVideos[0] || null;
    }
    if (activeChannel === "电影") {
      return currentChannelFullVideos.find((v) => v.title.includes("阿凡达") || v.title.includes("蜘蛛侠")) || currentChannelFullVideos[0] || null;
    }
    if (activeChannel === "动漫") {
      return currentChannelFullVideos.find((v) => v.title.includes("仙逆") || v.title.includes("吞噬星空")) || currentChannelFullVideos[0] || null;
    }
    if (activeChannel === "综艺") {
      return currentChannelFullVideos.find((v) => v.title.includes("现在就出发") || v.title.includes("密室大逃脱")) || currentChannelFullVideos[0] || null;
    }
    return currentChannelFullVideos[0] || null;
  }, [activeChannel, hasSearched, presetVideos, currentChannelFullVideos]);

  // 网格候选片池 (排除掉顶部已被选为 Banner 的片目，避免上下重复)
  const gridCandidateVideos = useMemo(() => {
    if (!channelBannerVideo) return currentChannelFullVideos;
    return currentChannelFullVideos.filter((v) => v.id !== channelBannerVideo.id);
  }, [currentChannelFullVideos, channelBannerVideo]);

  // 当前视口展示的精选推荐视频列表 (每批6部切片，支持换一换轮替)
  const displayedVideos = useMemo(() => {
    if (hasSearched && searchResults.length > 0) {
      return searchResults;
    }

    // 默认展示 6 部 (3 行 2 列，1:1 对齐 BagTrim 真机截图)
    const BATCH_SIZE = 6;
    if (gridCandidateVideos.length <= BATCH_SIZE) {
      return gridCandidateVideos;
    }

    const currentBatch = channelPageMap[activeChannel] || 0;
    const totalBatches = Math.ceil(gridCandidateVideos.length / BATCH_SIZE);
    const safeBatch = currentBatch % totalBatches;
    const start = safeBatch * BATCH_SIZE;
    const slice = gridCandidateVideos.slice(start, start + BATCH_SIZE);
    if (slice.length < BATCH_SIZE) {
      return slice.concat(gridCandidateVideos.slice(0, BATCH_SIZE - slice.length));
    }
    return slice;
  }, [hasSearched, searchResults, gridCandidateVideos, channelPageMap, activeChannel]);

  // 换一换操作 (带有平滑旋转动画反馈)
  const handleRefreshChannelVideos = () => {
    setIsRefreshing(true);
    setChannelPageMap((prev) => {
      const current = prev[activeChannel] || 0;
      return {
        ...prev,
        [activeChannel]: current + 1,
      };
    });
    setTimeout(() => {
      setIsRefreshing(false);
    }, 450);
  };

  // 原生形态 B：分类影视全量库的数据检索与多维筛选计算
  const filteredLibraryVideos = useMemo(() => {
    if (!activeCategoryLibrary) return [];

    let list = presetVideos.filter((v) => {
      if (activeCategoryLibrary === "电影") {
        return v.category.includes("电影") || v.vodClass?.includes("电影");
      } else if (activeCategoryLibrary === "电视剧") {
        return v.category.includes("电视剧") || v.vodClass?.includes("电视剧");
      } else if (activeCategoryLibrary === "动漫") {
        return v.category.includes("动漫") || v.vodClass?.includes("动漫");
      } else if (activeCategoryLibrary === "综艺") {
        return v.category.includes("综艺") || v.vodClass?.includes("综艺");
      } else if (activeCategoryLibrary === "短剧") {
        return v.category.includes("短剧") || v.vodClass?.includes("短剧");
      } else if (activeCategoryLibrary === "少儿") {
        return v.category.includes("少儿") || v.vodClass?.includes("少儿");
      } else if (activeCategoryLibrary === "直播") {
        return v.category.includes("直播") || v.vodClass?.includes("直播");
      }
      return true;
    });

    // 唯一去重 (按 id)
    const seenIds = new Set<string | number>();
    list = list.filter((v) => {
      if (seenIds.has(v.id)) return false;
      seenIds.add(v.id);
      return true;
    });

    // 1. 题材筛选
    if (libraryGenre !== "全部") {
      list = list.filter(
        (v) =>
          v.vodClass?.includes(libraryGenre) ||
          v.subTitle?.includes(libraryGenre) ||
          v.category.includes(libraryGenre)
      );
    }

    // 2. 地区筛选
    if (libraryRegion !== "全部") {
      list = list.filter((v) => matchVideoRegion(v, libraryRegion));
    }

    // 3. 年份筛选
    if (libraryYear !== "全部") {
      list = list.filter((v) => matchVideoYear(v, libraryYear));
    }

    // 4. 排序方式
    if (librarySort === "按最新更新") {
      list = [...list].reverse();
    } else if (librarySort === "按评分最高") {
      list = [...list].sort((a, b) => b.title.localeCompare(a.title));
    }

    return list;
  }, [
    activeCategoryLibrary,
    presetVideos,
    libraryGenre,
    libraryRegion,
    libraryYear,
    librarySort,
  ]);

  // 点击【查看全部】升级为【原生形态 B】：直接推入专属分类影视全量库
  const handleOpenCategoryLibrary = (channel?: string) => {
    const targetChannel = channel || activeChannel;
    setActiveCategoryLibrary(targetChannel);
    setLibraryGenre("全部");
    setLibraryRegion("全部");
    setLibraryYear("全部");
    setLibrarySort("按热门推荐");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCloseCategoryLibrary = () => {
    setActiveCategoryLibrary(null);
  };



  // 排行榜列表数据
  const rankVideos = useMemo(() => {
    const list = [...presetVideos];
    if (activeRankTab === "hot") {
      return list.sort((a, b) => (Number(b.id) % 100) - (Number(a.id) % 100));
    } else if (activeRankTab === "surge") {
      return list.reverse();
    } else if (activeRankTab === "shorts") {
      return shortsList;
    } else {
      return list.slice(3).concat(list.slice(0, 3));
    }
  }, [presetVideos, activeRankTab, shortsList]);

  // 执行全网多源并发在线搜索 (阶段五: 5.2 动态多源并发搜索与测速聚合)
  const handleSearch = async (kw: string) => {
    if (!kw.trim()) {
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setStatusMessage(`正在多源并发检索 "${kw}"...`);
    try {
      // 并发检索内置代理源与自定义多采集源
      const [onlineRes, customRes] = await Promise.allSettled([
        searchOnlineVideos(kw.trim()),
        searchAcrossCustomSources(kw.trim(), customSources),
      ]);

      const onlineList = onlineRes.status === "fulfilled" ? onlineRes.value || [] : [];
      const customList = customRes.status === "fulfilled" ? customRes.value || [] : [];
      const combined = [...onlineList, ...customList];

      if (combined.length > 0) {
        // 聚合去重与源合并
        const map = new Map<string, VideoItem>();
        combined.forEach((v) => {
          if (!map.has(v.title)) {
            map.set(v.title, v);
          } else {
            const existing = map.get(v.title)!;
            existing.sources = [...existing.sources, ...v.sources];
          }
        });
        const mergedList = Array.from(map.values());
        setSearchResults(mergedList);
        setHasSearched(true);
        setStatusMessage(`多源聚合找到 ${mergedList.length} 部关于 "${kw}" 的高清片源`);
      } else {
        // 匹配本地片库
        const localMatched = presetVideos.filter(
          (v) => v.title.includes(kw) || v.subTitle?.includes(kw) || v.category.includes(kw)
        );
        setSearchResults(localMatched);
        setHasSearched(true);
        setStatusMessage(
          localMatched.length > 0
            ? `本地检索到 ${localMatched.length} 部片源`
            : `未检索到关于 "${kw}" 的视频`
        );
      }
    } catch (err) {
      console.error("搜索异常:", err);
      const localMatched = presetVideos.filter((v) => v.title.includes(kw));
      setSearchResults(localMatched);
      setHasSearched(true);
      setStatusMessage(`本地匹配到 ${localMatched.length} 部`);
    } finally {
      setIsSearching(false);
    }
  };

  // 智能识别并获取剧集列表中最新的一集 (优化3: 默认播放最新一集)
  const getLatestEpisode = (episodes: Episode[]): Episode | null => {
    if (!episodes || episodes.length === 0) return null;
    if (episodes.length === 1) return episodes[0];

    const getEpNumber = (ep: Episode) => {
      const match = ep.name.match(/\d+/g);
      if (!match) return 0;
      return parseInt(match[match.length - 1], 10);
    };

    const firstNum = getEpNumber(episodes[0]);
    const lastNum = getEpNumber(episodes[episodes.length - 1]);

    if (lastNum > firstNum) {
      // 原始数组是正序排列 (如 1 -> 245)，最后一集是最新更新集
      return episodes[episodes.length - 1];
    } else if (firstNum > lastNum) {
      // 原始数组是倒序排列 (如 245 -> 1)，第一集是最新集
      return episodes[0];
    }
    // 无法判断数字时默认返回最后一集
    return episodes[episodes.length - 1];
  };

  // 选择视频并拉起播放
  const selectVideo = (video: VideoItem) => {
    setSelectedVideo(video);
    setCurrentSourceIndex(0);

    // 🌟 阶段二：打通本地追剧库状态
    setIsCollected(isFavorite(video.id));

    const allEps = video.sources[0]?.episodes || [];
    if (allEps.length > 0) {
      syncLatestEpisodeInfo(video.id, allEps[allEps.length - 1]?.name || "全集", allEps.length);
    }

    // 检查此剧是否有历史观看记录 (优化2: 优先续播上次观看集数与进度)
    const existingHistory = watchHistory.find(
      (item) => String(item.vodId) === String(video.id) || item.vodName === video.title
    );

    let epToPlay: Episode | null = null;
    let seekTime: number | null = null;

    if (existingHistory && existingHistory.episodeUrl) {
      // 命中历史记录，恢复当时集数与播放时间点
      epToPlay =
        allEps.find(
          (e) => e.url === existingHistory.episodeUrl || e.name === existingHistory.episodeName
        ) || { name: existingHistory.episodeName, url: existingHistory.episodeUrl };
      if (existingHistory.currentTime && existingHistory.currentTime > 2) {
        seekTime = existingHistory.currentTime;
      }
    } else {
      // 首次观看此片 (优化3: 默认播放最新的一集)
      epToPlay = getLatestEpisode(allEps);
    }

    if (!epToPlay && allEps.length > 0) {
      epToPlay = allEps[0];
    }

    // 默认剧集列表采用倒序排列 (最新集排在最上方)，并计算所在分页
    const isMultiEp = allEps.length > 1;
    setIsReverseOrder(isMultiEp);

    if (epToPlay && allEps.length > 0) {
      const orderList = isMultiEp ? [...allEps].reverse() : allEps;
      const idx = orderList.findIndex(
        (e) => e.url === epToPlay?.url || e.name === epToPlay?.name
      );
      if (idx >= 0) {
        setPageIndex(Math.floor(idx / 30));
      } else {
        setPageIndex(0);
      }
    } else {
      setPageIndex(0);
    }

    setCurrentEpisode(epToPlay);
    pendingSeekTimeRef.current = seekTime;
    setShowPlayerModal(true);

    if (seekTime) {
      setStatusMessage(`正在续播: ${video.title} · ${epToPlay?.name || ""} (进度 ${formatTime(seekTime)})`);
    } else {
      setStatusMessage(`正在播放最新: ${video.title} · ${epToPlay?.name || ""}`);
    }

    // 如果 DOM 中的 video 已存在，立即播放；否则由挂载监听起播
    if (videoRef.current && epToPlay) {
      playEpisode(epToPlay, video.title);
    }

    // 同步观看进度至追剧库并消除新集更新红点
    if (epToPlay) {
      const currentIdx = allEps.findIndex((e) => e.name === epToPlay?.name);
      recordWatchInFavorite(
        video.id,
        epToPlay.name,
        currentIdx >= 0 ? currentIdx : 0,
        existingHistory?.progressPercent || 0,
        allEps.length
      );
    }

    // 记录/更新到观看历史
    if (epToPlay) {
      setWatchHistory((prev) => {
        const filtered = prev.filter((item) => String(item.vodId) !== String(video.id));
        return [
          {
            vodId: video.id,
            vodName: video.title,
            vodPic: video.pic,
            episodeName: epToPlay!.name,
            episodeUrl: epToPlay!.url,
            progressPercent: existingHistory?.progressPercent || 0,
            currentTime: seekTime || 0,
            duration: existingHistory?.duration || 0,
            sourceIndex: 0,
            timestamp: Date.now(),
          },
          ...filtered,
        ];
      });
    }

    // 智能后台嗅探全网最新完整集数与高速源
    searchOnlineVideos(video.title)
      .then((results) => {
        if (results && results.length > 0) {
          const matched = results.find((r) => r.title === video.title) || results[0];
          if (matched && matched.sources.length > 0) {
            const bestSource = matched.sources.find((s) => s.episodes.length > 5) || matched.sources[0];
            const currentCount = video.sources[0]?.episodes?.length || 0;
            if (bestSource && bestSource.episodes.length > currentCount) {
              setSelectedVideo((prev) => {
                if (!prev || prev.title !== video.title) return prev;
                return {
                  ...prev,
                  remarks: `更新至${bestSource.episodes.length}集`,
                  sources: matched.sources,
                };
              });
              setStatusMessage(`已同步全网最新真实剧集 (${bestSource.episodes.length}集)`);
            }
          }
        }
      })
      .catch((err) => {
        console.warn("后台嗅探非关键异常:", err);
      });
  };

  // 从历史记录精准续播 (优化2)
  const resumePlayFromHistory = (item: WatchHistoryItem) => {
    let target = presetVideos.find(
      (v) => String(v.id) === String(item.vodId) || v.title === item.vodName
    );
    if (!target) {
      target = {
        id: item.vodId,
        title: item.vodName,
        category: "历史播放",
        remarks: item.episodeName,
        pic: item.vodPic,
        sources: [
          {
            sourceName: "历史播放源",
            episodes: [{ name: item.episodeName, url: item.episodeUrl }],
          },
        ],
      };
    }

    const sIdx =
      item.sourceIndex !== undefined && item.sourceIndex < target.sources.length
        ? item.sourceIndex
        : 0;
    setCurrentSourceIndex(sIdx);
    currentSourceIndexRef.current = sIdx;

    const activeSrc = target.sources[sIdx] || target.sources[0];
    let targetEp =
      activeSrc?.episodes?.find(
        (e) => e.url === item.episodeUrl || e.name === item.episodeName
      ) || activeSrc?.episodes?.[0];

    if (!targetEp) {
      targetEp = { name: item.episodeName, url: item.episodeUrl };
    }

    // 记录断点续播时间点 (精准跳转)
    const seekTime = item.currentTime && item.currentTime > 2 ? item.currentTime : null;
    pendingSeekTimeRef.current = seekTime;

    if (seekTime) {
      setStatusMessage(
        `正在续播: ${item.vodName} · ${item.episodeName} (从 ${formatTime(seekTime)} 继续播放)`
      );
    } else {
      setStatusMessage(`正在播放: ${item.vodName} · ${item.episodeName}`);
    }

    setSelectedVideo(target);
    setCurrentEpisode(targetEp);
    setShowHistoryDrawer(false);
    setShowPlayerModal(true);

    if (videoRef.current) {
      playEpisode(targetEp, target.title);
    }
  };

  // 单条删除历史记录
  const removeHistoryItem = (vodId: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchHistory((prev) => prev.filter((item) => String(item.vodId) !== String(vodId)));
  };

  // 清空所有历史记录
  const clearAllHistory = () => {
    if (window.confirm("确定要清空全部播放历史记录吗？")) {
      setWatchHistory([]);
      try {
        localStorage.removeItem(STORAGE_KEY_HISTORY);
      } catch {}
    }
  };

  // 监听模态框开启与视频挂载：确保 DOM 出现后第一时间自动起播首集
  useEffect(() => {
    if (showPlayerModal && selectedVideo && videoRef.current) {
      if (!hlsRef.current) {
        const epToPlay = currentEpisode || selectedVideo.sources[currentSourceIndex]?.episodes[0];
        if (epToPlay) {
          playEpisode(epToPlay, selectedVideo.title);
        }
      }
    }
  }, [showPlayerModal, selectedVideo]);

  // 切换播放线路
  const switchSource = (sourceIndex: number) => {
    if (failoverTimeoutRef.current) {
      clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
    setCurrentSourceIndex(sourceIndex);
    currentSourceIndexRef.current = sourceIndex;
    if (!selectedVideo) return;
    const targetSource = selectedVideo.sources[sourceIndex];
    if (targetSource && targetSource.episodes.length > 0) {
      setStatusMessage(`已切换至: ${targetSource.sourceName}`);
      const currentEpIndex = activeRawEpisodes.findIndex((e) => e.url === currentEpisode?.url);
      const nextEpIndex =
        currentEpIndex >= 0 && currentEpIndex < targetSource.episodes.length ? currentEpIndex : 0;
      const targetEp = targetSource.episodes[nextEpIndex];
      playEpisode(targetEp, selectedVideo.title);
    }
  };

  // 线路异常自动故障转移 (Failover)
  const autoFailoverNextSource = (reason: string) => {
    const video = selectedVideoRef.current;
    const currentIdx = currentSourceIndexRef.current;
    if (!video || video.sources.length <= 1) {
      setStatusMessage(`播放受阻: ${reason || "媒体源连接失败"}`);
      return;
    }

    const nextIdx = (currentIdx + 1) % video.sources.length;
    const nextSource = video.sources[nextIdx];
    setStatusMessage(`正在切换备用线路: ${nextSource.sourceName}...`);

    if (failoverTimeoutRef.current) clearTimeout(failoverTimeoutRef.current);
    failoverTimeoutRef.current = setTimeout(() => {
      switchSource(nextIdx);
    }, 2500);
  };

  // 核心播放引擎 (加载 M3U8 / 直连播放与平滑降级)
  const playEpisode = (episode: Episode, videoTitle: string) => {
    if (failoverTimeoutRef.current) {
      clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
    setCurrentEpisode(episode);
    currentEpisodeRef.current = episode;

    // 同步更新历史记录中的集数与时间戳
    const curVid = selectedVideoRef.current;
    if (curVid) {
      setWatchHistory((prev) => {
        const filtered = prev.filter((item) => String(item.vodId) !== String(curVid.id));
        const prevItem = prev.find((item) => String(item.vodId) === String(curVid.id));
        const isSameEp = prevItem?.episodeUrl === episode.url;
        return [
          {
            vodId: curVid.id,
            vodName: curVid.title,
            vodPic: curVid.pic,
            episodeName: episode.name,
            episodeUrl: episode.url,
            progressPercent: isSameEp ? (prevItem?.progressPercent || 0) : 0,
            currentTime: isSameEp ? prevItem?.currentTime : 0,
            duration: prevItem?.duration || 0,
            sourceIndex: currentSourceIndexRef.current,
            timestamp: Date.now(),
          },
          ...filtered,
        ];
      });
    }

    if (!videoRef.current) return;
    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const rawUrl = episode.url;
    // 优先直连标准 M3U8 流媒体；仅在本地存在特定代理服务时中转
    const isTauriProxyAvailable = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__) && proxyPort;
    const effectiveUrl = useProxy && isTauriProxyAvailable
      ? `http://127.0.0.1:${proxyPort}/stream?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;

    setStatusMessage(`正在连接: ${videoTitle} · ${episode.name}`);

    const isHls = rawUrl.includes(".m3u8") || rawUrl.includes("index") || !rawUrl.endsWith(".mp4");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        maxBufferLength: 60,
        maxMaxBufferLength: 120,
        maxBufferSize: 80 * 1024 * 1024,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        fragLoadingTimeOut: 25000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        startFragPrefetch: true,
      });

      hlsRef.current = hls;
      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatusMessage(`正在播放: ${videoTitle} (${episode.name})`);
        video.play().catch(() => {});

        // 恢复断点续播时间点
        if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
          const seekTo = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
          setTimeout(() => {
            if (videoRef.current) {
              videoRef.current.currentTime = seekTo;
              setStatusMessage(`已续播至上次位置: ${formatTime(seekTo)}`);
            }
          }, 250);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn("HLS 加载报警:", data.type, data.details);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("遇到网络错误，自动尝试恢复或平滑切换线路:", data.details);
              hls.startLoad();
              autoFailoverNextSource(data.details);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("遇到解码/媒体格式波动，尝试平滑恢复...");
              hls.recoverMediaError();
              break;
            default:
              console.warn("不可恢复异常，切换备用线路:", data.details);
              hls.destroy();
              autoFailoverNextSource(data.details);
              break;
          }
        }
      });
    } else {
      // iOS Safari / WKWebView 原生流媒体硬解播放
      video.src = effectiveUrl;
      video.load();

      const onPlaying = () => {
        setStatusMessage(`正在播放: ${videoTitle} (${episode.name})`);
      };

      const onLoadedMetadata = () => {
        setStatusMessage(`正在播放: ${videoTitle} (${episode.name})`);
        if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
          const seekTo = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
          video.currentTime = seekTo;
          setStatusMessage(`已续播至上次位置: ${formatTime(seekTo)}`);
        }
      };

      const onError = () => {
        console.warn("原生播放器加载异常，准备切换备用线路");
        autoFailoverNextSource("网络或媒体流格式异常");
      };

      video.addEventListener("playing", onPlaying, { once: true });
      video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
      video.addEventListener("error", onError, { once: true });

      video.play().catch((err) => {
        console.warn("直接播放需要用户交互唤醒:", err);
      });
    }
  };

  // 当前源的所有分集列表
  const activeRawEpisodes = useMemo(() => {
    if (!selectedVideo || !selectedVideo.sources[currentSourceIndex]) return [];
    return selectedVideo.sources[currentSourceIndex].episodes || [];
  }, [selectedVideo, currentSourceIndex]);

  // 选集分页机制 (30 集一页)
  const EPISODES_PER_PAGE = 30;
  const totalPages = Math.ceil(activeRawEpisodes.length / EPISODES_PER_PAGE);

  const displayedEpisodes = useMemo(() => {
    let list = [...activeRawEpisodes];
    if (isReverseOrder) {
      list.reverse();
    }
    const start = pageIndex * EPISODES_PER_PAGE;
    return list.slice(start, start + EPISODES_PER_PAGE);
  }, [activeRawEpisodes, pageIndex, isReverseOrder]);

  // 当前正在播放的集数纯数字 (如 "1")
  const currentEpNumber = useMemo(() => {
    if (!currentEpisode) return "1";
    const num = currentEpisode.name.replace(/[^0-9]/g, "");
    return num || "1";
  }, [currentEpisode]);

  // 播放器状态监听与实时观看历史进度记录
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleDurationChange = () => setDuration(video.duration || 0);

    const handleTimeUpdate = () => {
      const cur = video.currentTime;
      setCurrentTime(cur);

      // 实时记录观看进度 (每 2 秒节流写入一次历史状态)
      const now = Date.now();
      if (now - lastSavedProgressRef.current > 2000 && video.duration > 0) {
        lastSavedProgressRef.current = now;
        const dur = video.duration;
        const percent = Math.min(100, Math.round((cur / dur) * 100));
        const v = selectedVideoRef.current;
        const ep = currentEpisodeRef.current;
        if (v && ep) {
          setWatchHistory((prev) => {
            const filtered = prev.filter((item) => String(item.vodId) !== String(v.id));
            return [
              {
                vodId: v.id,
                vodName: v.title,
                vodPic: v.pic,
                episodeName: ep.name,
                episodeUrl: ep.url,
                progressPercent: percent,
                currentTime: cur,
                duration: dur,
                sourceIndex: currentSourceIndexRef.current,
                timestamp: now,
              },
              ...filtered,
            ];
          });
        }
      }
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
    };
  }, [showPlayerModal]);

  // 自动隐藏全屏控制栏定时器
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 4000);
  };

  // 播放 / 暂停切换
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    triggerControls();
  };

  // 上一集 / 下一集
  const playNextEpisode = (step: number) => {
    if (!currentEpisode || activeRawEpisodes.length === 0) return;
    const currentIndex = activeRawEpisodes.findIndex((e) => e.url === currentEpisode.url);
    if (currentIndex === -1) return;
    const targetIndex = currentIndex + step;
    if (targetIndex >= 0 && targetIndex < activeRawEpisodes.length) {
      playEpisode(activeRawEpisodes[targetIndex], selectedVideo?.title || "剧集");
    }
  };

  // 点击视频主画面时显隐控制栏
  const handleVideoTap = () => {
    if (showEpisodeDrawer) {
      setShowEpisodeDrawer(false);
      return;
    }
    setShowControls((prev) => {
      const next = !prev;
      if (next) triggerControls();
      return next;
    });
  };

  // 监听键盘 ESC 退出横屏全屏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLandscapeFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLandscapeFullscreen]);

  // 统一退出/关闭播放器
  const closePlayerModal = () => {
    setShowPlayerModal(false);
    setIsFullscreen(false);
    setIsLandscapeFullscreen(false);
    setShowEpisodeDrawer(false);
    setIsScreenLocked(false);
    setShowLockBtn(true);
    if (lockBtnTimerRef.current) clearTimeout(lockBtnTimerRef.current);
    document.body.classList.remove("landscape-fullscreen-active");

    // 退出时确保恢复 iOS 竖屏方向与状态栏显示
    try {
      (window as any).webkit?.messageHandlers?.setOrientation?.postMessage("portrait");
      (window as any).webkit?.messageHandlers?.setStatusBar?.postMessage("visible");
    } catch (_) {}

    if (failoverTimeoutRef.current) {
      clearTimeout(failoverTimeoutRef.current);
      failoverTimeoutRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setCurrentEpisode(null);
    window.scrollTo(0, 0);
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 60);
  };

  // 全屏切换：点全屏直接进入 1:1 复刻的图 2 横屏沉浸原生控制台，禁止降级到系统 QuickTime
  const toggleFullscreen = () => {
    const video = videoRef.current;
    const container = videoContainerRef.current;
    if (!video) return;

    if (
      isLandscapeFullscreen ||
      isFullscreen ||
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    ) {
      setIsLandscapeFullscreen(false);
      setIsFullscreen(false);
      setShowEpisodeDrawer(false);
      setIsScreenLocked(false);
      setShowLockBtn(true);
      if (lockBtnTimerRef.current) clearTimeout(lockBtnTimerRef.current);
      document.body.classList.remove("landscape-fullscreen-active");

      // 通知 iOS 原生切换回竖屏并恢复状态栏
      try {
        (window as any).webkit?.messageHandlers?.setOrientation?.postMessage("portrait");
        (window as any).webkit?.messageHandlers?.setStatusBar?.postMessage("visible");
      } catch (_) {}

      if (screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (_) {}
      }

      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      window.scrollTo(0, 0);
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 80);
      return;
    }

    // 进入全屏：激活 isLandscapeFullscreen 与 isFullscreen，展现图 2 完整控制台
    setIsLandscapeFullscreen(true);
    setIsFullscreen(true);
    triggerControls();
    document.body.classList.add("landscape-fullscreen-active");

    // 通知 iOS 原生切换为横屏并隐藏系统状态栏
    try {
      (window as any).webkit?.messageHandlers?.setOrientation?.postMessage("landscape");
      (window as any).webkit?.messageHandlers?.setStatusBar?.postMessage("hidden");
    } catch (_) {}

    // 尝试标准 Web 屏幕锁定横屏
    if (screen.orientation && (screen.orientation as any).lock) {
      try {
        (screen.orientation as any).lock("landscape").catch(() => {});
      } catch (_) {}
    }

    // 网页端标准全屏（保留自定义容器 DOM）
    if (container?.requestFullscreen) {
      container.requestFullscreen().catch(() => {});
    }
  };

  // 画中画 (Picture-in-Picture) 模式切换
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiPActive(false);
      } else if ((video as any).webkitPresentationMode) {
        const currentMode = (video as any).webkitPresentationMode;
        const targetMode = currentMode === "picture-in-picture" ? "inline" : "picture-in-picture";
        (video as any).webkitSetPresentationMode(targetMode);
        setIsPiPActive(targetMode === "picture-in-picture");
      } else if (document.pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setIsPiPActive(true);
      } else {
        alert("当前系统环境未开放原生画中画功能");
      }
    } catch (err) {
      console.warn("画中画模式切换异常:", err);
    }
  };

  // 1.6 屏幕全链路手势系统 (边缘返回、中央Seek、左侧亮度、右侧音量、长按2.0x)
  const EDGE_SWIPE_THRESHOLD = 44; // 边缘触发区: 屏幕最左侧 <= 44px

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isScreenLocked) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;
      const video = videoRef.current;
      const initialTime = video ? video.currentTime : currentTime;
      const initialVol = video ? video.volume : volume;

      touchGestureRef.current = {
        startX,
        startY,
        startTime: Date.now(),
        type: startX <= EDGE_SWIPE_THRESHOLD ? "edge-back" : "potential",
        initialTime,
        targetTime: initialTime,
        diffSeconds: 0,
        initialBrightness: brightness,
        initialVolume: initialVol,
      };

      // 长按 500ms 触发 2.0x 临时加速
      if (startX > EDGE_SWIPE_THRESHOLD) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
          if (videoRef.current && touchGestureRef.current && touchGestureRef.current.type === "potential") {
            originalPlaybackRateRef.current = videoRef.current.playbackRate || playbackRate || 1.0;
            videoRef.current.playbackRate = 2.0;
            setIsLongPress2x(true);
          }
        }, 500);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isScreenLocked || !touchGestureRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const { startX, startY, type, initialTime, initialBrightness, initialVolume } = touchGestureRef.current;
    const currentX = touch.clientX;
    const currentY = touch.clientY;
    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // 如果手指移动距离超过 10px，取消长按 2.0x 判定
    if (absX > 10 || absY > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    // 1. 如果是从最左侧边缘起始 (startX <= 44px) -> 边缘返回手势候选
    if (type === "edge-back") {
      if (deltaX > 8 && deltaX > absY * 1.2) {
        setEdgeSwipeIndicator({
          active: true,
          distance: Math.min(deltaX, 80),
        });
      } else if (deltaX <= 4) {
        setEdgeSwipeIndicator(null);
      }
      return;
    }

    // 2. 判定手势类型 (若还在 potential 初始探测阶段)
    if (type === "potential") {
      // 水平滑动判定：快进快退 Seek
      if (absX > 18 && absX > absY * 1.3) {
        touchGestureRef.current.type = "center-seek";
      }
      // 垂直滑动判定：左半屏调亮度，右半屏调音量
      else if (absY > 14 && absY > absX * 1.3) {
        const screenWidth = window.innerWidth || 375;
        if (startX < screenWidth / 2) {
          touchGestureRef.current.type = "vertical-brightness";
        } else {
          touchGestureRef.current.type = "vertical-volume";
        }
      }
    }

    // 3. 执行 Seek 预览
    if (touchGestureRef.current.type === "center-seek") {
      const totalDur = duration || (videoRef.current ? videoRef.current.duration : 0) || 1;
      const factor = Math.max(0.25, Math.min(1.0, totalDur / 600));
      const diffSec = Math.round(deltaX * factor);
      const target = Math.max(0, Math.min(totalDur, initialTime + diffSec));

      touchGestureRef.current.targetTime = target;
      touchGestureRef.current.diffSeconds = diffSec;

      setSeekGestureHud({
        targetTime: target,
        duration: totalDur,
        diffSeconds: diffSec,
      });
      return;
    }

    // 4. 执行左侧垂直滑动：亮度调节 (向上滑动增加，向下滑动降低)
    if (touchGestureRef.current.type === "vertical-brightness") {
      const screenHeight = window.innerHeight || 667;
      const ratio = -deltaY / (screenHeight * 0.6);
      const newBrightness = Math.max(0.1, Math.min(1.0, initialBrightness + ratio));
      setBrightness(newBrightness);
      setBrightnessHud(Math.round(newBrightness * 100));

      if (brightnessHudTimerRef.current) clearTimeout(brightnessHudTimerRef.current);
      return;
    }

    // 5. 执行右侧垂直滑动：音量调节 (向上滑动增加，向下滑动降低)
    if (touchGestureRef.current.type === "vertical-volume") {
      const screenHeight = window.innerHeight || 667;
      const ratio = -deltaY / (screenHeight * 0.6);
      const newVol = Math.max(0, Math.min(1.0, initialVolume + ratio));
      setVolume(newVol);
      if (videoRef.current) {
        videoRef.current.volume = newVol;
        if (newVol > 0 && isMuted) {
          setIsMuted(false);
          videoRef.current.muted = false;
        }
      }
      setVolumeHud(Math.round(newVol * 100));

      if (volumeHudTimerRef.current) clearTimeout(volumeHudTimerRef.current);
      return;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 若触发了长按 2.0x，松手瞬间无缝恢复原速
    if (isLongPress2x) {
      setIsLongPress2x(false);
      if (videoRef.current) {
        videoRef.current.playbackRate = originalPlaybackRateRef.current || playbackRate || 1.0;
      }
    }

    // 定时隐藏亮度 HUD 与音量 HUD (松手 800ms 后平滑淡出)
    if (brightnessHud !== null) {
      if (brightnessHudTimerRef.current) clearTimeout(brightnessHudTimerRef.current);
      brightnessHudTimerRef.current = setTimeout(() => setBrightnessHud(null), 800);
    }
    if (volumeHud !== null) {
      if (volumeHudTimerRef.current) clearTimeout(volumeHudTimerRef.current);
      volumeHudTimerRef.current = setTimeout(() => setVolumeHud(null), 800);
    }

    if (isScreenLocked || !touchGestureRef.current) {
      setEdgeSwipeIndicator(null);
      setSeekGestureHud(null);
      return;
    }

    const { startX, startY, startTime, type, targetTime } = touchGestureRef.current;
    const endTouch = e.changedTouches[0];
    const endX = endTouch ? endTouch.clientX : startX;
    const endY = endTouch ? endTouch.clientY : startY;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const deltaTime = Date.now() - startTime;

    touchGestureRef.current = null;
    setEdgeSwipeIndicator(null);

    // 1. 边缘右滑返回：必须起始于屏幕最左侧 (startX <= 44px) 且向右滑动超过 44px
    if (type === "edge-back") {
      if (deltaX > 44 && deltaX > Math.abs(deltaY) * 1.3 && deltaTime < 700) {
        // 触发级联退回操作 (优先级: 抽屉 -> 全屏 -> 播放模态框)
        if (showEpisodeDrawer) {
          setShowEpisodeDrawer(false);
        } else if (showFilterDrawer) {
          setShowFilterDrawer(false);
        } else if (showHistoryDrawer) {
          setShowHistoryDrawer(false);
        } else if (showDownloadDrawer) {
          setShowDownloadDrawer(false);
        } else if (showFavoritesDrawer) {
          setShowFavoritesDrawer(false);
        } else if (showCustomSourceDrawer) {
          setShowCustomSourceDrawer(false);
        } else if (isLandscapeFullscreen || isFullscreen || isLandscapeMode) {
          toggleFullscreen();
        } else if (showPlayerModal) {
          closePlayerModal();
        }
      }
      return;
    }

    // 2. 中央 Seek 释放：如果在中央区域进行了水平快进/快退，执行真实跳转
    if (type === "center-seek" && seekGestureHud) {
      setSeekGestureHud(null);
      if (videoRef.current && typeof targetTime === "number") {
        videoRef.current.currentTime = targetTime;
        setCurrentTime(targetTime);
        triggerControls();
      }
      return;
    }

    setSeekGestureHud(null);
  };

  // 监听原生全屏及画中画状态变化
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleBeginFullscreen = () => {
      setIsFullscreen(true);
    };

    const handleEndFullscreen = () => {
      setIsFullscreen(false);
      setIsLandscapeFullscreen(false);
      setShowEpisodeDrawer(false);
      document.body.classList.remove("landscape-fullscreen-active");
      window.scrollTo(0, 0);
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 80);
    };

    const handlePresentationMode = () => {
      if ((video as any).webkitPresentationMode) {
        setIsPiPActive((video as any).webkitPresentationMode === "picture-in-picture");
      }
    };

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    video.addEventListener("webkitbeginfullscreen", handleBeginFullscreen);
    video.addEventListener("webkitendfullscreen", handleEndFullscreen);
    video.addEventListener("webkitpresentationmodechanged", handlePresentationMode);
    video.addEventListener("enterpictureinpicture", handleEnterPiP);
    video.addEventListener("leavepictureinpicture", handleLeavePiP);

    return () => {
      video.removeEventListener("webkitbeginfullscreen", handleBeginFullscreen);
      video.removeEventListener("webkitendfullscreen", handleEndFullscreen);
      video.removeEventListener("webkitpresentationmodechanged", handlePresentationMode);
      video.removeEventListener("enterpictureinpicture", handleEnterPiP);
      video.removeEventListener("leavepictureinpicture", handleLeavePiP);
    };
  }, [showPlayerModal]);

  // 格式化秒数为 00:00:00
  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return "00:00";
    const h = Math.floor(timeInSeconds / 3600);
    const m = Math.floor((timeInSeconds % 3600) / 60);
    const s = Math.floor(timeInSeconds % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
        .toString()
        .padStart(2, "0")}`;
    }
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="bagtrim-app">
      {/* =========================================================
          1. 顶部状态栏与吸顶操作区 (当未进入分类库时展示正常头部，进入分类库时展示原生形态 B 沉浸导航)
          ========================================================= */}
      {!activeCategoryLibrary ? (
        <>
          <header className="bagtrim-header">
            {/* 左侧：圆角胶囊搜索框 (内置放大镜、占位符与筛选入口) */}
            <div className="search-capsule-box">
              <Search size={17} className="search-capsule-icon" />
              <input
                type="text"
                className="search-capsule-input"
                placeholder={isSearching ? "全网检索中..." : "阿凡达"}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch(searchKeyword);
                  }
                }}
              />
              {searchKeyword && (
                <button
                  className="capsule-clear-btn"
                  onClick={() => {
                    setSearchKeyword("");
                    setHasSearched(false);
                    setSearchResults([]);
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <span className="search-capsule-divider"></span>
              <button
                className="search-filter-trigger"
                onClick={() => setShowFilterDrawer(true)}
              >
                筛选
              </button>
            </div>

            {/* 右侧：两个独立操作圆形图标 (下载缓存 + 历史记录) */}
            <div className="header-action-group">
              {/* 下载缓存 */}
              <button
                className="header-circle-btn"
                onClick={() => setShowDownloadDrawer(true)}
                title="离线缓存"
              >
                <Download size={18} strokeWidth={2.2} />
              </button>

              {/* 历史记录 */}
              <button
                className="header-circle-btn"
                onClick={() => setShowHistoryDrawer(true)}
                title="观看历史"
              >
                <Clock size={18} strokeWidth={2.2} />
              </button>
            </div>
          </header>

          {/* 2. 二级频道水平弹性滚动条 (首页 | 短剧 | 直播 | 电视剧 | 电影...) */}
          <nav className="channel-tabs-container">
            <div className="channel-tabs-scroll">
              {CHANNELS.map((channel) => (
                <button
                  key={channel}
                  className={`channel-tab-item ${activeChannel === channel ? "active" : ""}`}
                  onClick={() => {
                    setActiveChannel(channel);
                    setHasSearched(false);
                    if (channel === "短剧") {
                      setActiveBottomTab("shorts");
                    } else {
                      setActiveBottomTab("home");
                    }
                  }}
                >
                  {channel}
                </button>
              ))}
            </div>
          </nav>
        </>
      ) : (
        <div className="category-library-header">
          <button
            className="library-back-btn"
            onClick={handleCloseCategoryLibrary}
          >
            <ChevronLeft size={22} />
            <span>返回</span>
          </button>
          <div className="library-title-center">
            <span className="library-title-text">{activeCategoryLibrary}库</span>
            <span className="library-badge-pill">{filteredLibraryVideos.length} 部</span>
          </div>
          <button
            className="library-search-btn"
            onClick={() => {
              setActiveCategoryLibrary(null);
            }}
            title="搜索"
          >
            <Search size={18} />
          </button>
        </div>
      )}

      {/* =========================================================
          3. 主视口内容区 (根据底栏切换: 首页流 / 短剧流 / 排行榜 / 我的)
          ========================================================= */}
      <main className="bagtrim-main-view">
        {/* TAB 1: 首页长流 (Home) / 原生形态 B 分类影视全量库 */}
        {activeBottomTab === "home" && (
          activeCategoryLibrary ? (
            <div className="category-library-view">
              {/* 多维横滑筛选项 (Sticky Filter Bar) */}
              <div className="category-filter-chips-section">
                {/* 题材类型 */}
                <div className="filter-chips-row">
                  <span className="filter-row-label">类型</span>
                  <div className="filter-chips-scroll">
                    {(CHANNEL_GENRES_MAP[activeCategoryLibrary] || FILTER_GENRES).map((genre) => (
                      <button
                        key={genre}
                        className={`filter-chip-pill ${libraryGenre === genre ? "active" : ""}`}
                        onClick={() => setLibraryGenre(genre)}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 地区 */}
                <div className="filter-chips-row">
                  <span className="filter-row-label">地区</span>
                  <div className="filter-chips-scroll">
                    {FILTER_REGIONS.map((region) => (
                      <button
                        key={region}
                        className={`filter-chip-pill ${libraryRegion === region ? "active" : ""}`}
                        onClick={() => setLibraryRegion(region)}
                      >
                        {region}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 年份 */}
                <div className="filter-chips-row">
                  <span className="filter-row-label">年份</span>
                  <div className="filter-chips-scroll">
                    {FILTER_YEARS.map((year) => (
                      <button
                        key={year}
                        className={`filter-chip-pill ${libraryYear === year ? "active" : ""}`}
                        onClick={() => setLibraryYear(year)}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 排序 */}
                <div className="filter-chips-row sort-row">
                  <span className="filter-row-label">排序</span>
                  <div className="filter-chips-scroll">
                    {FILTER_SORTS.map((sort) => (
                      <button
                        key={sort}
                        className={`filter-chip-pill ${librarySort === sort ? "active" : ""}`}
                        onClick={() => setLibrarySort(sort)}
                      >
                        {sort}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 筛选结果统计条与重置按键 */}
              <div className="library-result-meta-bar">
                <span className="result-meta-text">
                  共找到 <strong>{filteredLibraryVideos.length}</strong> 部{activeCategoryLibrary}
                  {(libraryGenre !== "全部" || libraryRegion !== "全部" || libraryYear !== "全部") && (
                    <span className="active-filter-tags">
                      {libraryGenre !== "全部" && ` · ${libraryGenre}`}
                      {libraryRegion !== "全部" && ` · ${libraryRegion}`}
                      {libraryYear !== "全部" && ` · ${libraryYear}`}
                    </span>
                  )}
                </span>
                {(libraryGenre !== "全部" || libraryRegion !== "全部" || libraryYear !== "全部" || librarySort !== "按热门推荐") && (
                  <button
                    className="library-reset-filter-btn"
                    onClick={() => {
                      setLibraryGenre("全部");
                      setLibraryRegion("全部");
                      setLibraryYear("全部");
                      setLibrarySort("按热门推荐");
                    }}
                  >
                    重置筛选
                  </button>
                )}
              </div>

              {/* 全量影视卡片双列瀑布流 (无 Banner 占用，空间利用率最大化) */}
              {filteredLibraryVideos.length === 0 ? (
                <div className="library-empty-state">
                  <div className="empty-state-icon">🎬</div>
                  <div className="empty-state-title">未找到符合条件的{activeCategoryLibrary}</div>
                  <div className="empty-state-desc">您可以尝试放宽筛选条件，或重置后再查看</div>
                  <button
                    className="empty-state-reset-btn"
                    onClick={() => {
                      setLibraryGenre("全部");
                      setLibraryRegion("全部");
                      setLibraryYear("全部");
                      setLibrarySort("按热门推荐");
                    }}
                  >
                    重置全部筛选
                  </button>
                </div>
              ) : (
                <div className="video-cards-grid library-cards-grid">
                  {filteredLibraryVideos.map((item) => (
                    <div
                      key={item.id}
                      className="video-poster-card"
                      onClick={() => selectVideo(item)}
                    >
                      <div className="poster-wrapper">
                        <img
                          src={getHighDefinitionPoster(item.pic)}
                          alt={item.title}
                          className="poster-img"
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=60";
                          }}
                        />
                        <div className="poster-status-badge">
                          {item.remarks || "正片"}
                        </div>
                      </div>
                      <div className="card-info-wrap">
                        <div className="card-main-title">{item.title}</div>
                        <div className="card-sub-title">
                          {item.subTitle || item.vodClass || "超清无广告独家极速播放"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 列表触底提示 */}
              <div className="library-bottom-tip">
                <span>— 已经到底啦 (共 {filteredLibraryVideos.length} 部影片) —</span>
              </div>

              {/* 回到顶部浮动按键 */}
              {showBackToTop && (
                <button
                  className="library-back-to-top-btn"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  title="回到顶部"
                >
                  <ArrowUp size={18} />
                </button>
              )}

              {/* 避让底栏高度垫片 */}
              <div className="dock-spacer"></div>
            </div>
          ) : (
            <div className="home-content-stream">
              {/* 焦点推荐大卡片 Hero Banner (每个频道均展示该频道的“正在热播”宽幅横条，1:1 对齐真机截图) */}
              {channelBannerVideo && !hasSearched && (
                <div
                  className="hero-banner-card"
                  onClick={() => selectVideo(channelBannerVideo)}
                >
                  <img
                    src={getHighDefinitionPoster(channelBannerVideo.pic)}
                    alt={channelBannerVideo.title}
                    className="hero-banner-img"
                    loading="eager"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=70";
                    }}
                  />
                  <div className="hero-banner-gradient"></div>
                  <div className="hero-banner-info">
                    <h2 className="hero-banner-title">{channelBannerVideo.title}</h2>
                    <div className="hero-banner-hot-label">
                      <span className="hot-label-text">正在热播</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 搜索提示或无结果 */}
              {hasSearched && (
                <div className="search-result-hint">
                  <span>搜索结果：{displayedVideos.length} 部影片</span>
                  <button
                    className="reset-search-btn"
                    onClick={() => {
                      setHasSearched(false);
                      setSearchKeyword("");
                    }}
                  >
                    返回推荐
                  </button>
                </div>
              )}

              {/* 双列横版网格瀑布流 (2-Column Grid，1:1 对标截图) */}
              <div className={`video-cards-grid ${isRefreshing ? "is-refreshing-grid" : ""}`}>
                {displayedVideos.map((item) => (
                  <div
                    key={item.id}
                    className="video-poster-card"
                    onClick={() => selectVideo(item)}
                  >
                    {/* 横版海报缩略图容器 (16:10 比例) */}
                    <div className="poster-wrapper">
                      <img
                        src={getHighDefinitionPoster(item.pic)}
                        alt={item.title}
                        className="poster-img"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=60";
                        }}
                      />
                      {/* 右下角状态药丸 Badge (半透明黑底高斯模糊) */}
                      <div className="poster-status-badge">
                        {item.remarks || "全集"}
                      </div>
                    </div>

                    {/* 标题与副标题排版 */}
                    <div className="card-info-wrap">
                      <div className="card-main-title">{item.title}</div>
                      <div className="card-sub-title">
                        {item.subTitle || item.vodClass || "超清无广告独家极速播放"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 频道底部的【查看全部】与【换一换】双胶囊按键 (1:1 复刻真机截图) */}
              {!hasSearched && gridCandidateVideos.length > 0 && (
                <div className="channel-section-footer">
                  <button
                    className="channel-action-capsule view-all"
                    onClick={() => handleOpenCategoryLibrary(activeChannel)}
                  >
                    <LayoutGrid size={16} />
                    <span>查看全部</span>
                  </button>
                  <button
                    className="channel-action-capsule refresh"
                    onClick={handleRefreshChannelVideos}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={16} className={isRefreshing ? "rotating-icon" : ""} />
                    <span>换一换</span>
                  </button>
                </div>
              )}

              {/* 底部避让悬浮胶囊的高度垫片 */}
              <div className="dock-spacer"></div>
            </div>
          )
        )}

        {/* TAB 2: 短剧沉浸流 (Shorts) */}
        {activeBottomTab === "shorts" && (
          <div className="shorts-immersive-container">
            {shortsList.map((short, idx) => (
              <div
                key={short.id}
                className={`short-item-slide ${idx === currentShortIndex ? "active" : ""}`}
                style={{ display: idx === currentShortIndex ? "flex" : "none" }}
              >
                <div className="short-video-mock" onClick={() => selectVideo(short)}>
                  <img src={getHighDefinitionPoster(short.pic)} alt={short.title} className="short-bg-poster" />
                  <div className="short-play-floating-btn">
                    <Play size={36} fill="#fff" />
                  </div>
                </div>

                {/* 短剧右侧互动悬浮按钮组 */}
                <div className="short-right-actions">
                  <div className="short-action-item">
                    <div className="action-circle-icon liked">
                      <Heart size={22} fill="#ef4444" color="#ef4444" />
                    </div>
                    <span>3.8万</span>
                  </div>
                  <div
                    className="short-action-item"
                    onClick={() => selectVideo(short)}
                  >
                    <div className="action-circle-icon">
                      <List size={22} />
                    </div>
                    <span>选集</span>
                  </div>
                  <div className="short-action-item">
                    <div className="action-circle-icon">
                      <Share2 size={22} />
                    </div>
                    <span>分享</span>
                  </div>
                </div>

                {/* 短剧底部信息栏 */}
                <div className="short-bottom-info">
                  <div className="short-drama-tag">🔥 热门爆款微短剧</div>
                  <h3 className="short-drama-title">
                    {short.title} · {short.remarks}
                  </h3>
                  <p className="short-drama-desc">{short.subTitle}</p>

                  {/* 切集导航快捷栏 */}
                  <div className="short-episode-stepper">
                    <button
                      disabled={currentShortIndex === 0}
                      onClick={() => setCurrentShortIndex((i) => Math.max(0, i - 1))}
                    >
                      上一部
                    </button>
                    <span>
                      {currentShortIndex + 1} / {shortsList.length}
                    </span>
                    <button
                      disabled={currentShortIndex === shortsList.length - 1}
                      onClick={() => setCurrentShortIndex((i) => Math.min(shortsList.length - 1, i + 1))}
                    >
                      下一部
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="dock-spacer"></div>
          </div>
        )}

        {/* TAB 3: 排行榜 (Rank) */}
        {activeBottomTab === "rank" && (
          <div className="rank-view-container">
            {/* 排行榜分类子标签 */}
            <div className="rank-sub-tabs">
              <button
                className={activeRankTab === "hot" ? "active" : ""}
                onClick={() => setActiveRankTab("hot")}
              >
                🔥 热播总榜
              </button>
              <button
                className={activeRankTab === "surge" ? "active" : ""}
                onClick={() => setActiveRankTab("surge")}
              >
                ⚡ 飙升榜
              </button>
              <button
                className={activeRankTab === "shorts" ? "active" : ""}
                onClick={() => setActiveRankTab("shorts")}
              >
                🎬 短剧榜
              </button>
              <button
                className={activeRankTab === "new" ? "active" : ""}
                onClick={() => setActiveRankTab("new")}
              >
                ✨ 新片榜
              </button>
            </div>

            {/* 排行榜列表 */}
            <div className="rank-list-wrapper">
              {rankVideos.map((item, index) => {
                const rankNum = index + 1;
                return (
                  <div
                    key={item.id}
                    className="rank-card-item"
                    onClick={() => selectVideo(item)}
                  >
                    {/* 排名数字或专属皇冠徽章 */}
                    <div className="rank-badge-box">
                      {rankNum === 1 ? (
                        <div className="crown-badge gold">1</div>
                      ) : rankNum === 2 ? (
                        <div className="crown-badge silver">2</div>
                      ) : rankNum === 3 ? (
                        <div className="crown-badge bronze">3</div>
                      ) : (
                        <span className="rank-normal-num">{rankNum}</span>
                      )}
                    </div>

                    {/* 海报缩略图 */}
                    <img src={getHighDefinitionPoster(item.pic)} alt={item.title} className="rank-item-poster" />

                    {/* 信息介绍 */}
                    <div className="rank-item-details">
                      <div className="rank-item-header">
                        <span className="rank-title">{item.title}</span>
                        <span className="rank-heat">
                          <Flame size={13} color="#f97316" /> {(9.9 - index * 0.2).toFixed(1)}万
                        </span>
                      </div>
                      <div className="rank-sub">{item.subTitle}</div>
                      <div className="rank-tags">
                        <span className="badge-tag">{item.category}</span>
                        <span className="badge-tag remarks">{item.remarks}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="dock-spacer"></div>
          </div>
        )}

        {/* TAB 4: 我的个人中心 (Profile) */}
        {activeBottomTab === "profile" && (
          <div className="profile-view-container">
            {/* 用户身份卡片 */}
            <div className="user-profile-card">
              <div className="user-avatar-wrap">
                <div className="user-avatar-inner">
                  <ShieldCheck size={28} color="#3b82f6" />
                </div>
              </div>
              <div className="user-info-text">
                <div className="user-name-row">
                  <span className="user-name">至尊VIP会员</span>
                  <span className="user-vip-pill">永久免广告</span>
                </div>
                <div className="user-id">ID: 88482026 · 极光硬件解码引擎已开启</div>
              </div>
            </div>

            {/* 快捷金刚区 */}
            <div className="profile-quick-stats">
              <div
                className="stat-box"
                onClick={() => setShowHistoryDrawer(true)}
              >
                <div className="stat-icon-wrap">
                  <Clock size={20} color="#38bdf8" />
                </div>
                <div className="stat-text">
                  <span className="stat-label">观看历史</span>
                  <span className="stat-count">{watchHistory.length} 部</span>
                </div>
              </div>

              <div
                className="stat-box"
                onClick={() => setShowDownloadDrawer(true)}
              >
                <div className="stat-icon-wrap">
                  <Download size={20} color="#34d399" />
                </div>
                <div className="stat-text">
                  <span className="stat-label">离线缓存</span>
                  <span className="stat-count">{downloadTasks.length} 部</span>
                </div>
              </div>

              <div
                className="stat-box"
                onClick={() => {
                  setFavorites(getFavorites());
                  setShowFavoritesDrawer(true);
                }}
              >
                <div className="stat-icon-wrap" style={{ position: "relative" }}>
                  <Heart size={20} color="#f43f5e" />
                  {favorites.some((f) => f.hasUpdate) && (
                    <span
                      className="red-dot-indicator"
                      style={{ position: "absolute", top: -2, right: -2 }}
                    />
                  )}
                </div>
                <div className="stat-text">
                  <span className="stat-label">我的追剧</span>
                  <span className="stat-count">{favorites.length} 部</span>
                </div>
              </div>
            </div>

            {/* 设置与偏好列表 */}
            <div className="settings-group-card">
              <div className="setting-row">
                <div className="setting-label">
                  <Zap size={16} color="#eab308" />
                  <span>启用流媒体 HLS 切片本地加速中转</span>
                </div>
                <input
                  type="checkbox"
                  className="switch-input"
                  checked={useProxy}
                  onChange={(e) => setUseProxy(e.target.checked)}
                />
              </div>

              <div className="setting-row">
                <div className="setting-label">
                  <Sparkles size={16} color="#a855f7" />
                  <span>自动跳过片头片尾 (90秒)</span>
                </div>
                <input type="checkbox" className="switch-input" defaultChecked />
              </div>

              <div className="setting-row">
                <div className="setting-label">
                  <Layers size={16} color="#3b82f6" />
                  <span>默认画质选择</span>
                </div>
                <span className="setting-value">4K原画 / 蓝光1080P</span>
              </div>

              {/* 🌐 阶段五：自定义多源生态与测速入口 */}
              <div
                className="setting-row"
                style={{ cursor: "pointer" }}
                onClick={() => setShowCustomSourceDrawer(true)}
              >
                <div className="setting-label">
                  <Radio size={16} color="#06b6d4" />
                  <span>自定义采集源管理与并发测速</span>
                </div>
                <span className="setting-value" style={{ color: "#38bdf8" }}>
                  {customSources.filter((s) => s.enabled).length} 个已启用 &gt;
                </span>
              </div>

              {/* 规则导出备份入口 */}
              <div
                className="setting-row"
                style={{ cursor: "pointer" }}
                onClick={handleExportSources}
              >
                <div className="setting-label">
                  <UploadCloud size={16} color="#10b981" />
                  <span>规则配置备份与导出</span>
                </div>
                <span className="setting-value" style={{ color: "#34d399" }}>
                  复制到剪贴板 &gt;
                </span>
              </div>
            </div>
            <div className="dock-spacer"></div>
          </div>
        )}
      </main>

      {/* =========================================================
          4. 悬浮毛玻璃胶囊 Dock TabBar (1:1 像素级复刻截图悬浮岛)
          ========================================================= */}
      <nav className="bagtrim-floating-dock">
        <div className="dock-inner-capsule">
          {/* 首页 Tab (选中时带独特的浅色半透明圆角底色背板) */}
          <button
            className={`dock-nav-item ${activeBottomTab === "home" ? "active" : ""}`}
            onClick={() => {
              if (activeBottomTab === "home" && activeCategoryLibrary) {
                setActiveCategoryLibrary(null);
              }
              setActiveBottomTab("home");
            }}
          >
            {/* 1:1 复刻截图中的倾斜菱形播放方块图标 */}
            <svg
              className="dock-svg-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="4" transform="rotate(45 12 12)" />
              <polygon points="10,8 16,12 10,16" fill="currentColor" />
            </svg>
            <span className="dock-label">首页</span>
          </button>

          {/* 短剧 Tab */}
          <button
            className={`dock-nav-item ${activeBottomTab === "shorts" ? "active" : ""}`}
            onClick={() => setActiveBottomTab("shorts")}
          >
            <svg
              className="dock-svg-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="2" width="14" height="20" rx="3" />
              <polygon points="10,9 15,12 10,15" fill="currentColor" />
            </svg>
            <span className="dock-label">短剧</span>
          </button>

          {/* 排行榜 Tab */}
          <button
            className={`dock-nav-item ${activeBottomTab === "rank" ? "active" : ""}`}
            onClick={() => {
              setActiveRankTab("hot");
              setActiveBottomTab("rank");
            }}
          >
            <svg
              className="dock-svg-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span className="dock-label">排行榜</span>
          </button>

          {/* 我的 Tab */}
          <button
            className={`dock-nav-item ${activeBottomTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveBottomTab("profile")}
          >
            <svg
              className="dock-svg-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
            <span className="dock-label">我的</span>
          </button>
        </div>
      </nav>

      {/* =========================================================
          5. 1:1 复刻 BagTrim 原生吸顶播放详情页
          ========================================================= */}
      {selectedVideo && showPlayerModal && (
        <div
          className={`bagtrim-player-page ${isFullscreen ? "is-fullscreen" : ""} ${
            isLandscapeMode ? "is-landscape-fullscreen" : ""
          } ${rotationAngle === 270 ? "rotate-270" : ""}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            if (isLongPress2x) {
              setIsLongPress2x(false);
              if (videoRef.current) {
                videoRef.current.playbackRate = originalPlaybackRateRef.current || playbackRate || 1.0;
              }
            }
            touchGestureRef.current = null;
            setEdgeSwipeIndicator(null);
            setSeekGestureHud(null);
            setBrightnessHud(null);
            setVolumeHud(null);
          }}
        >
          {/* 阶段一 1.6：iPhone 原生边缘右滑返回指示器 */}
          {edgeSwipeIndicator?.active && (
            <div
              className="edge-swipe-back-pill"
              style={{
                opacity: Math.min(1, Math.max(0.3, edgeSwipeIndicator.distance / 40)),
                transform: `translateY(-50%) translateX(${Math.min(edgeSwipeIndicator.distance * 0.45, 36)}px)`,
              }}
            >
              <ChevronLeft size={22} strokeWidth={2.6} />
              <span>滑动返回</span>
            </div>
          )}

          {/* 顶部吸顶 16:9 播放视口 */}
          <div
            className="player-sticky-viewport"
            ref={videoContainerRef}
            onClick={handleVideoTap}
            onDoubleClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
          >
            <video
              ref={videoRef}
              className={`player-viewport-video aspect-${aspectRatioMode}`}
              controls={false}
              autoPlay
              playsInline
              webkit-playsinline="true"
              x5-playsinline="true"
              preload="auto"
            />

            {/* 动态亮度暗化遮罩 */}
            <div
              className="brightness-filter-overlay"
              style={{
                opacity: Math.max(0, 1 - brightness),
                pointerEvents: "none",
              }}
            />

            {/* 阶段一 1.4：画面长按 2.0x 顶部药丸徽章 */}
            {isLongPress2x && (
              <div className="longpress-2x-badge">
                <span className="badge-pulse-icon">▶▶</span>
                <span>2.0x 快速播放中</span>
              </div>
            )}

            {/* 阶段一 1.1：左侧垂直滑动亮度调节 HUD */}
            {brightnessHud !== null && (
              <div className="brightness-gesture-hud">
                <Sun size={26} className="hud-icon" />
                <div className="hud-bar-track">
                  <div className="hud-bar-fill" style={{ height: `${brightnessHud}%` }} />
                </div>
                <span className="hud-pct-text">{brightnessHud}%</span>
              </div>
            )}

            {/* 阶段一 1.2：右侧垂直滑动音量调节 HUD */}
            {volumeHud !== null && (
              <div className="volume-gesture-hud">
                {volumeHud === 0 ? (
                  <VolumeX size={26} className="hud-icon" />
                ) : (
                  <Volume2 size={26} className="hud-icon" />
                )}
                <div className="hud-bar-track">
                  <div className="hud-bar-fill" style={{ height: `${volumeHud}%` }} />
                </div>
                <span className="hud-pct-text">{volumeHud}%</span>
              </div>
            )}

            {/* 阶段一 1.3 & 1.6：中央 Seek 快进/快退手势 HUD (与边缘返回严格隔离) */}
            {seekGestureHud && (
              <div className="seek-gesture-hud">
                <div className="seek-time-badge">
                  <span className="seek-target-time">{formatTime(seekGestureHud.targetTime)}</span>
                  <span className="seek-divider">/</span>
                  <span className="seek-total-time">{formatTime(seekGestureHud.duration)}</span>
                </div>
                <div className={`seek-diff-chip ${seekGestureHud.diffSeconds >= 0 ? "forward" : "backward"}`}>
                  {seekGestureHud.diffSeconds >= 0 ? `+${seekGestureHud.diffSeconds}s` : `${seekGestureHud.diffSeconds}s`}
                </div>
              </div>
            )}

            {/* =========================================================
                【复刻截图 1】竖屏播放器内嵌极简控制层 (纯白折线 < + 投屏 + 底部细进度条 + 暂停/全屏)
                ========================================================= */}
            {!isLandscapeMode && (
              <div
                className={`portrait-viewport-overlay ${showControls ? "visible" : "hidden"}`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* 顶部两端：左上角返回键 + 右上角投屏键 */}
                <div className="portrait-top-bar">
                  <button
                    className="portrait-back-btn"
                    onClick={closePlayerModal}
                    title="返回上一页"
                  >
                    <ChevronLeft size={28} strokeWidth={2.4} />
                  </button>
                  <button
                    className="portrait-cast-btn"
                    onClick={handleAirPlay}
                    title="AirPlay 电视投屏"
                  >
                    <Tv size={24} strokeWidth={2.2} />
                  </button>
                </div>

                {/* 底部浮层：播放/暂停 + 当前时间 + 进度条 + 总时间 + 全屏框 */}
                <div className="portrait-bottom-bar">
                  <button
                    className="portrait-play-btn"
                    onClick={togglePlay}
                    title={isPlaying ? "暂停" : "播放"}
                  >
                    {isPlaying ? (
                      <Pause size={20} fill="#ffffff" color="#ffffff" />
                    ) : (
                      <Play size={20} fill="#ffffff" color="#ffffff" style={{ marginLeft: "2px" }} />
                    )}
                  </button>
                  <span className="portrait-time-text current">{formatTime(currentTime)}</span>
                  <div className="portrait-progress-track">
                    <div
                      className="portrait-progress-fill"
                      style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
                    />
                    <input
                      type="range"
                      className="portrait-progress-range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCurrentTime(val);
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }}
                    />
                  </div>
                  <span className="portrait-time-text total">{formatTime(duration)}</span>
                  <button
                    className="portrait-fullscreen-btn"
                    onClick={toggleFullscreen}
                    title="横屏全屏"
                  >
                    <Maximize size={20} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            )}

            {/* =========================================================
                【复刻截图 2】横屏全屏播放器覆盖层 (顶栏状态条 + 标题 + 锁屏 + 底部完整控制台)
                ========================================================= */}
            {isLandscapeMode && (
              <>
                {/* 📺 极顶原生拟态状态条 (WIFI 00:54 80% 🔋) */}
                <div
                  className={`ios-landscape-statusbar ${
                    showControls && !isScreenLocked ? "visible" : "hidden"
                  }`}
                >
                  <div className="statusbar-left">
                    <span className="statusbar-wifi-label">WIFI</span>
                  </div>
                  <div className="statusbar-center">
                    <span className="statusbar-time-text">
                      {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </div>
                  <div className="statusbar-right">
                    <span className="statusbar-battery-pct">80%</span>
                    <div className="statusbar-battery-pill">
                      <div className="battery-fill" style={{ width: "80%" }} />
                    </div>
                  </div>
                </div>

                {/* 屏幕防误触锁悬浮按键 (横屏左侧悬浮) */}
                {/* 方案 1：未锁定时随 controls 自动显隐；锁定后仅在轻触屏幕时单独唤出 3 秒后自动淡出沉浸 */}
                <button
                  className={`screen-lock-floating-btn ${isScreenLocked ? "locked" : ""} ${
                    (isScreenLocked ? showLockBtn : showControls) ? "visible" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleScreenLock();
                  }}
                  title={isScreenLocked ? "点击解锁屏幕" : "锁定屏幕防误触"}
                >
                  {isScreenLocked ? (
                    <Lock size={22} strokeWidth={2.4} />
                  ) : (
                    <Unlock size={22} strokeWidth={2.4} />
                  )}
                </button>

                {/* 锁定状态时的触控全屏拦截层：轻触屏幕时仅单独唤出锁按钮 3 秒，并轻量提醒 */}
                {isScreenLocked && (
                  <div
                    className="screen-lock-overlay-blocker"
                    onClick={() => {
                      triggerLockBtn(3000);
                      showToast("🔒 屏幕已锁定，点击左侧锁图标恢复操作");
                    }}
                  />
                )}

                {/* 画幅切换提示 HUD */}
                {aspectRatioToast && (
                  <div className="aspect-ratio-hud">
                    <Crop size={18} color="#38bdf8" />
                    <span>{aspectRatioToast}</span>
                  </div>
                )}

                {/* 顶部控制栏 (左侧: < 返回 + 标题集数; 右侧: 投屏 + 画中画 + 画幅比例) */}
                <div
                  className={`ios-landscape-top-header ${
                    showControls && !isScreenLocked && !showEpisodeDrawer ? "visible" : "hidden"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="ios-top-left-title-group">
                    <button
                      className="ios-top-btn back-btn"
                      onClick={toggleFullscreen}
                      title="退出全屏"
                    >
                      <ChevronLeft size={28} strokeWidth={2.4} />
                    </button>
                    <span className="ios-top-title-text">
                      {selectedVideo.title} {currentEpNumber}
                    </span>
                  </div>

                  <div className="ios-top-right-actions">
                    <button
                      className="ios-top-btn airplay-btn"
                      onClick={handleAirPlay}
                      title="AirPlay 电视投屏"
                    >
                      <Tv size={22} strokeWidth={2.2} />
                    </button>
                    <button
                      className={`ios-top-btn pip-btn ${isPiPActive ? "active" : ""}`}
                      onClick={togglePiP}
                      title="画中画播放"
                    >
                      <PictureInPicture size={22} strokeWidth={2.2} />
                    </button>
                    <button
                      className="ios-top-btn crop-btn"
                      onClick={cycleAspectRatio}
                      title="切换画幅比例 (自适应/满屏拉伸/居中裁切)"
                    >
                      <Crop size={22} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                {/* 底部通栏控制台 (1:1 复刻截图 2) */}
                <div
                  className={`ios-landscape-bottom-bar ${
                    showControls && !isScreenLocked ? "visible" : "hidden"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 第一行：时间 (00:37 / 39:10) + 细进度条 */}
                  <div className="ios-bottom-progress-row">
                    <div className="ios-time-compact">
                      <span className="time-curr">{formatTime(currentTime)}</span>
                      <span className="time-sep">/</span>
                      <span className="time-dur">{formatTime(duration)}</span>
                    </div>
                    <div className="ios-progress-track">
                      <div
                        className="ios-progress-fill"
                        style={{ width: `${duration ? Math.min(100, (currentTime / duration) * 100) : 0}%` }}
                      />
                      <input
                        type="range"
                        className="ios-progress-range"
                        min={0}
                        max={duration || 100}
                        value={currentTime}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCurrentTime(val);
                          if (videoRef.current) videoRef.current.currentTime = val;
                        }}
                      />
                    </div>
                  </div>

                  {/* 第二行：左侧播放/下一集/[弹] + 右侧 片头/尾/倍速/播放源/选集 */}
                  <div className="ios-bottom-actions-row">
                    <div className="ios-bottom-left-group">
                      <button
                        className="ios-action-icon-btn play-toggle"
                        onClick={togglePlay}
                        title={isPlaying ? "暂停" : "播放"}
                      >
                        {isPlaying ? (
                          <Pause size={24} fill="#ffffff" color="#ffffff" />
                        ) : (
                          <Play size={24} fill="#ffffff" color="#ffffff" style={{ marginLeft: "2px" }} />
                        )}
                      </button>
                      <button
                        className="ios-action-icon-btn next-ep"
                        onClick={() => playNextEpisode(1)}
                        title="下一集"
                      >
                        <SkipForward size={24} fill="#ffffff" color="#ffffff" />
                      </button>
                      <button
                        className={`ios-action-danmaku-btn ${isDanmakuOn ? "active" : ""}`}
                        onClick={() => {
                          const next = !isDanmakuOn;
                          setIsDanmakuOn(next);
                          showToast(next ? "弹幕已开启" : "弹幕已关闭");
                        }}
                        title="弹幕开关"
                      >
                        弹
                      </button>
                    </div>

                    <div className="ios-bottom-right-group">
                      <button
                        className={`ios-text-action-btn ${skipIntroOutro ? "active" : ""}`}
                        onClick={() => {
                          const next = !skipIntroOutro;
                          setSkipIntroOutro(next);
                          showToast(next ? "已开启自动跳过片头90秒/片尾60秒" : "已关闭跳过片头片尾");
                        }}
                        title="跳过片头片尾"
                      >
                        片头/尾
                      </button>
                      <button
                        className={`ios-text-action-btn ${showRatePicker ? "highlight" : ""}`}
                        onClick={() => {
                          setShowRatePicker((prev) => !prev);
                          setShowSourcePicker(false);
                        }}
                        title="选择倍速"
                      >
                        {playbackRate === 1.0 ? "倍速" : `${playbackRate}x`}
                      </button>
                      <button
                        className={`ios-text-action-btn ${showSourcePicker ? "highlight" : ""}`}
                        onClick={() => {
                          setShowSourcePicker((prev) => !prev);
                          setShowRatePicker(false);
                        }}
                        title="切换播放源"
                      >
                        播放源
                      </button>
                      <button
                        className="ios-text-action-btn"
                        onClick={() => {
                          setShowEpisodeDrawer(true);
                          setShowRatePicker(false);
                          setShowSourcePicker(false);
                        }}
                        title="选集"
                      >
                        选集
                      </button>
                    </div>
                  </div>
                </div>

                {/* 横屏倍速浮动气泡 */}
                {showRatePicker && (
                  <div className="landscape-popover rate-popover" onClick={(e) => e.stopPropagation()}>
                    <div className="popover-title">播放倍速</div>
                    <div className="popover-chips">
                      {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((r) => (
                        <button
                          key={r}
                          className={`popover-chip ${playbackRate === r ? "active" : ""}`}
                          onClick={() => {
                            setPlaybackRate(r);
                            if (videoRef.current) videoRef.current.playbackRate = r;
                            setShowRatePicker(false);
                            showToast(`倍速已设为 ${r}x`);
                          }}
                        >
                          {r}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 横屏播放源浮动气泡 */}
                {showSourcePicker && selectedVideo && (
                  <div className="landscape-popover source-popover" onClick={(e) => e.stopPropagation()}>
                    <div className="popover-title">切换播放源</div>
                    <div className="popover-chips">
                      {selectedVideo.sources.map((src, idx) => (
                        <button
                          key={idx}
                          className={`popover-chip ${currentSourceIndex === idx ? "active" : ""}`}
                          onClick={() => {
                            switchSource(idx);
                            setShowSourcePicker(false);
                          }}
                        >
                          {src.sourceName || `线路 ${idx + 1}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 全屏专属右侧滑出选集抽屉 */}
                <div
                  className={`fullscreen-ep-drawer ${showEpisodeDrawer ? "open" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="fullscreen-drawer-header">
                    <div className="drawer-title-group">
                      <span className="drawer-title">选集播放</span>
                      <span className="drawer-count">({activeRawEpisodes.length}集全)</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        className="drawer-pager-chip"
                        onClick={() => playNextEpisode(-1)}
                        title="上一集"
                      >
                        上一集
                      </button>
                      <button
                        className="drawer-pager-chip"
                        onClick={() => playNextEpisode(1)}
                        title="下一集"
                      >
                        下一集
                      </button>
                      <button
                        className="drawer-close-btn"
                        onClick={() => setShowEpisodeDrawer(false)}
                        title="关闭选集"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* 线路切换胶囊 */}
                  {selectedVideo.sources.length > 1 && (
                    <div className="fullscreen-drawer-sources">
                      {selectedVideo.sources.map((src, idx) => (
                        <button
                          key={idx}
                          className={`drawer-source-chip ${currentSourceIndex === idx ? "active" : ""}`}
                          onClick={() => switchSource(idx)}
                        >
                          {src.sourceName || `线路 ${idx + 1}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 分页器 */}
                  {totalPages > 1 && (
                    <div className="fullscreen-drawer-pagers">
                      {Array.from({ length: totalPages }).map((_, p) => (
                        <button
                          key={p}
                          className={`drawer-pager-chip ${pageIndex === p ? "active" : ""}`}
                          onClick={() => setPageIndex(p)}
                        >
                          {p * EPISODES_PER_PAGE + 1}-{Math.min((p + 1) * EPISODES_PER_PAGE, activeRawEpisodes.length)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 剧集列表网格 */}
                  <div className="fullscreen-drawer-grid">
                    {displayedEpisodes.map((ep, idx) => {
                      const epNum = ep.name.replace(/[^0-9]/g, "") || String(pageIndex * EPISODES_PER_PAGE + idx + 1);
                      const isCurrentActive = currentEpisode?.url === ep.url;
                      return (
                        <button
                          key={ep.url}
                          className={`drawer-ep-btn ${isCurrentActive ? "active" : ""}`}
                          onClick={() => playEpisode(ep, selectedVideo.title)}
                          title={ep.name}
                        >
                          <span className="ep-num-text">{epNum}</span>
                          {isCurrentActive && <span className="ep-playing-dot" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 播放器下方详情与交互区 (竖屏模式下直接在此平铺展示与滚动) */}
          {!isLandscapeMode && (
            <div className="bagtrim-detail-scroll-body" data-status={statusMessage}>
              {/* 二级 Tab：详情 (高亮) 与 讨论 6 (移除突兀的右侧极速播放药丸，贴合原版) */}
              <div className="bagtrim-sub-tabs-bar">
                <div className="sub-tabs-left">
                  <button
                    className={`sub-tab-item ${activeDetailTab === "detail" ? "active" : ""}`}
                    onClick={() => setActiveDetailTab("detail")}
                  >
                    详情
                  </button>
                  <button
                    className={`sub-tab-item ${activeDetailTab === "discuss" ? "active" : ""}`}
                    onClick={() => setActiveDetailTab("discuss")}
                  >
                    讨论 <span className="sub-tab-badge">6</span>
                  </button>
                </div>
              </div>

              {activeDetailTab === "detail" ? (
                <>
                  {/* 大标题与简介按键 (1:1 复刻截图 1: 左侧九门，右侧 简介 >) */}
                  <div className="bagtrim-vod-title-row">
                    <h1 className="bagtrim-vod-title">{selectedVideo.title}</h1>
                    <button
                      className="vod-intro-btn"
                      onClick={() => setShowIntroModal(true)}
                      title="查看剧集简介"
                    >
                      <span>简介</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {/* 药丸属性行：[📅 2026] [🔥 855] [冒险] [悬疑] [历史] [电视剧] (过滤长串标签，火苗数值纯白高亮) */}
                  <div className="bagtrim-meta-pills-row">
                    <span className="meta-pill">
                      <Calendar size={13} className="pill-icon" />
                      <span>{selectedVideo.year || "2026"}</span>
                    </span>
                    <span className="meta-pill">
                      <Flame size={13} className="pill-icon flame" />
                      <span className="pill-val-bold">{selectedVideo.hits || "855"}</span>
                    </span>
                    <span className="meta-pill">
                      {selectedVideo.area || "冒险"}
                    </span>
                    <span className="meta-pill">
                      {(() => {
                        const rawType = selectedVideo.type || (selectedVideo.category ? selectedVideo.category.replace("热门", "") : "电视剧");
                        return rawType.length > 5 ? rawType.split(/[/,， ]/)[0] || "悬疑" : rawType;
                      })()}
                    </span>
                    <span className="meta-pill">历史</span>
                    <span className="meta-pill">电视剧</span>
                  </div>

                  {/* 【1:1 复刻截图 1】五大功能按键等分排布: ♡ 1.7万 / ⤓ 下载 / ☆ 收藏 / 📺 投屏 / ➦ 分享 */}
                  <div className="bagtrim-action-five-row">
                    <button
                      className={`action-five-btn ${heartAnimActive ? "heart-active" : ""} ${
                        isCollected ? "active" : ""
                      }`}
                      onClick={handleToggleFavorite}
                      title="追剧/点赞"
                    >
                      <Heart
                        size={22}
                        className="action-btn-icon"
                        fill={isCollected ? "#ff4757" : "none"}
                        color={isCollected ? "#ff4757" : "#e2e8f0"}
                        strokeWidth={2}
                      />
                      <span className="action-btn-label">{isCollected ? "已追" : "1.7万"}</span>
                    </button>
                    <button
                      className="action-five-btn"
                      onClick={handleStartDownload}
                      title="离线缓存至沙盒"
                    >
                      <Download size={22} className="action-btn-icon" color="#e2e8f0" strokeWidth={2} />
                      <span className="action-btn-label">
                        {downloadTasks.some(
                          (t) =>
                            String(t.vodId) === String(selectedVideo.id) &&
                            t.status === "completed"
                        )
                          ? "已下载"
                          : "下载"}
                      </span>
                    </button>
                    <button
                      className={`action-five-btn ${isCollected ? "collected" : ""}`}
                      onClick={handleToggleFavorite}
                      title="收藏片单"
                    >
                      <Star
                        size={22}
                        className="action-btn-icon"
                        fill={isCollected ? "#ffa502" : "none"}
                        color={isCollected ? "#ffa502" : "#e2e8f0"}
                        strokeWidth={2}
                      />
                      <span className="action-btn-label">{isCollected ? "已收藏" : "收藏"}</span>
                    </button>
                    <button
                      className="action-five-btn"
                      onClick={handleAirPlay}
                      title="AirPlay 电视投屏"
                    >
                      <Tv size={22} className="action-btn-icon" color="#e2e8f0" strokeWidth={2} />
                      <span className="action-btn-label">投屏</span>
                    </button>
                    <button
                      className="action-five-btn"
                      onClick={() => {
                        if (currentEpisode?.url) {
                          navigator.clipboard.writeText(currentEpisode.url);
                          showToast("🔗 播放链接已复制，可分享好友！");
                        } else {
                          showToast("🔗 已复制分享链接");
                        }
                      }}
                      title="分享好友"
                    >
                      <Share2 size={22} className="action-btn-icon" color="#e2e8f0" strokeWidth={2} />
                      <span className="action-btn-label">分享</span>
                    </button>
                  </div>

                  {/* 选集与线路模块 */}
                  <div className="bagtrim-episodes-module">
                    {/* 选集副头部：左侧加粗「选集」，右侧浅灰「30集全 >」 */}
                    <div className="bagtrim-episodes-subhead">
                      <div className="subhead-title">
                        <span className="subhead-title-bold">选集</span>
                      </div>
                      <div className="subhead-tools">
                        <button
                          className="bagtrim-all-eps-btn"
                          onClick={() => setShowEpisodeDrawer(true)}
                          title="查看全部剧集列表"
                        >
                          <span>{activeRawEpisodes.length}集全</span>
                          <ChevronRight size={15} />
                        </button>
                      </div>
                    </div>

                    {/* 线路切换胶囊栏 (选中项白底黑字，其余暗灰半透明底白字) */}
                    {selectedVideo.sources.length > 0 && (
                      <div className="bagtrim-sources-scroll">
                        {selectedVideo.sources.map((src, idx) => (
                          <button
                            key={idx}
                            className={`bagtrim-source-capsule ${currentSourceIndex === idx ? "active" : ""}`}
                            onClick={() => switchSource(idx)}
                          >
                            {src.sourceName.replace(/\s*\(.*?\)/, "") || `线路 ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 分页器 (若集数 > 24) */}
                    {totalPages > 1 && (
                      <div className="bagtrim-pager-row">
                        {Array.from({ length: totalPages }).map((_, p) => (
                          <button
                            key={p}
                            className={`pager-chip ${pageIndex === p ? "active" : ""}`}
                            onClick={() => setPageIndex(p)}
                          >
                            {p * EPISODES_PER_PAGE + 1}-{Math.min((p + 1) * EPISODES_PER_PAGE, activeRawEpisodes.length)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 1:1 复刻圆角正方形纯数字选集网格 */}
                    <div className="bagtrim-square-grid">
                      {displayedEpisodes.map((ep, idx) => {
                        const epNum = ep.name.replace(/[^0-9]/g, "") || String(pageIndex * EPISODES_PER_PAGE + idx + 1);
                        const isCurrentActive = currentEpisode?.url === ep.url;
                        return (
                          <button
                            key={ep.url}
                            className={`square-ep-btn ${isCurrentActive ? "active" : ""}`}
                            onClick={() => playEpisode(ep, selectedVideo.title)}
                            title={ep.name}
                          >
                            {epNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 猜你喜欢瀑布流推荐 */}
                  <div className="bagtrim-recommend-wrap">
                    <div className="recommend-title-bar">
                      <span className="recommend-title">猜你喜欢</span>
                    </div>
                    <div className="bagtrim-recommend-grid">
                      {presetVideos
                        .filter((v) => v.id !== selectedVideo.id)
                        .slice(0, 8)
                        .map((rec) => (
                          <div
                            key={rec.id}
                            className="bagtrim-rec-card"
                            onClick={() => {
                              setSelectedVideo(rec);
                              setCurrentSourceIndex(0);
                              setPageIndex(0);
                              const firstEp = rec.sources[0]?.episodes[0] || null;
                              if (firstEp) {
                                playEpisode(firstEp, rec.title);
                              }
                            }}
                          >
                            <div className="rec-poster-box">
                              <img
                                src={getHighDefinitionPoster(rec.pic)}
                                alt={rec.title}
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=60";
                                }}
                              />
                              {rec.remarks && (
                                <span className="rec-badge">{rec.remarks}</span>
                              )}
                            </div>
                            <h4 className="rec-title">{rec.title}</h4>
                            <p className="rec-subtitle">{rec.subTitle || rec.category}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="bagtrim-discuss-panel">
                  <div className="discuss-empty-box">
                    <div className="discuss-bubble">💬</div>
                    <div className="discuss-tip">精选弹幕与剧评 (共 6 条)</div>
                    <div className="discuss-mock-list">
                      <div className="discuss-item">
                        <span className="discuss-user">影迷小张：</span>
                        <span className="discuss-text">这剧情节奏太紧凑了，越看越上头！</span>
                      </div>
                      <div className="discuss-item">
                        <span className="discuss-user">追剧达人：</span>
                        <span className="discuss-text">男主演技炸裂，强烈推荐大家都来看看！</span>
                      </div>
                      <div className="discuss-item">
                        <span className="discuss-user">夜行者：</span>
                        <span className="discuss-text">画质好清，秒播无缓冲，体验太爽了。</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 剧集完整剧情简介抽屉 (1:1 复刻截图 1「简介 >」) */}
      {showIntroModal && selectedVideo && (
        <div className="drawer-mask" onClick={() => setShowIntroModal(false)}>
          <div className="drawer-sheet intro-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">{selectedVideo.title} · 简介</span>
              <button className="drawer-close-btn" onClick={() => setShowIntroModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="drawer-scroll-body">
              <div className="intro-meta-tags">
                <span className="intro-tag">年份: {selectedVideo.year || "2026"}</span>
                <span className="intro-tag">地区: {selectedVideo.area || "中国大陆"}</span>
                <span className="intro-tag">类型: {selectedVideo.type || selectedVideo.category || "电视剧"}</span>
              </div>
              <p className="intro-full-text">
                {selectedVideo.subTitle || "暂无详细剧情简介，欢迎持续关注更新。极光影院为您提供全网极速超清无广告播放体验。"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          6. 多维高级筛选抽屉 (点击搜索框内置“筛选”拉起)
          ========================================================= */}
      {showFilterDrawer && (
        <div
          className="drawer-mask"
          onClick={() => setShowFilterDrawer(false)}
        >
          <div
            className="drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">全维影视筛选</span>
              <button
                className="drawer-close-btn"
                onClick={() => setShowFilterDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-scroll-body">
              {/* 分类 */}
              <div className="filter-group">
                <span className="filter-group-label">频道分类</span>
                <div className="filter-chips-wrap">
                  {FILTER_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      className={`filter-chip ${selectedFilterCategory === cat ? "active" : ""}`}
                      onClick={() => setSelectedFilterCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 题材 */}
              <div className="filter-group">
                <span className="filter-group-label">影视题材</span>
                <div className="filter-chips-wrap">
                  {FILTER_GENRES.map((genre) => (
                    <button
                      key={genre}
                      className={`filter-chip ${selectedFilterGenre === genre ? "active" : ""}`}
                      onClick={() => setSelectedFilterGenre(genre)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* 地区 */}
              <div className="filter-group">
                <span className="filter-group-label">制作地区</span>
                <div className="filter-chips-wrap">
                  {FILTER_REGIONS.map((region) => (
                    <button
                      key={region}
                      className={`filter-chip ${selectedFilterRegion === region ? "active" : ""}`}
                      onClick={() => setSelectedFilterRegion(region)}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>

              {/* 年份 */}
              <div className="filter-group">
                <span className="filter-group-label">上映年份</span>
                <div className="filter-chips-wrap">
                  {FILTER_YEARS.map((year) => (
                    <button
                      key={year}
                      className={`filter-chip ${selectedFilterYear === year ? "active" : ""}`}
                      onClick={() => setSelectedFilterYear(year)}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* 排序 */}
              <div className="filter-group">
                <span className="filter-group-label">排序规则</span>
                <div className="filter-chips-wrap">
                  {FILTER_SORTS.map((sort) => (
                    <button
                      key={sort}
                      className={`filter-chip ${selectedFilterSort === sort ? "active" : ""}`}
                      onClick={() => setSelectedFilterSort(sort)}
                    >
                      {sort}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="drawer-footer-actions">
              <button
                className="filter-reset-btn"
                onClick={() => {
                  setSelectedFilterCategory("全部");
                  setSelectedFilterGenre("全部");
                  setSelectedFilterRegion("全部");
                  setSelectedFilterYear("全部");
                  setSelectedFilterSort("按热门推荐");
                }}
              >
                重置
              </button>
              <button
                className="filter-apply-btn"
                onClick={() => {
                  setShowFilterDrawer(false);
                  if (selectedFilterCategory !== "全部") {
                    handleOpenCategoryLibrary(selectedFilterCategory);
                  }
                }}
              >
                {selectedFilterCategory !== "全部"
                  ? `进入${selectedFilterCategory}库 (${displayedVideos.length}部)`
                  : `确定应用 (${displayedVideos.length}部)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          7. 观看历史抽屉 (点击右上角时钟图标拉起)
          ========================================================= */}
      {showHistoryDrawer && (
        <div
          className="drawer-mask"
          onClick={() => setShowHistoryDrawer(false)}
        >
          <div
            className="drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">观影历史记录</span>
              <div className="drawer-header-right">
                {watchHistory.length > 0 && (
                  <button
                    className="drawer-text-action"
                    onClick={clearAllHistory}
                  >
                    清空历史
                  </button>
                )}
                <button
                  className="drawer-close-btn"
                  onClick={() => setShowHistoryDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-scroll-body">
              {watchHistory.length === 0 ? (
                <div className="empty-drawer-view">
                  <Clock size={36} color="#6b7280" />
                  <span>暂无观看历史记录</span>
                  <span className="empty-sub-tip">播放视频后将自动在此为您记录追剧进度</span>
                </div>
              ) : (
                <div className="history-items-list">
                  {watchHistory.map((item, idx) => (
                    <div
                      key={`${item.vodId}-${idx}`}
                      className="history-item-row"
                      onClick={() => resumePlayFromHistory(item)}
                    >
                      <div className="history-poster-wrap">
                        <img
                          src={item.vodPic}
                          alt={item.vodName}
                          className="history-poster"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=200&auto=format&fit=crop&q=60";
                          }}
                        />
                        <span className="history-time-tag">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <div className="history-details">
                        <div className="history-name">{item.vodName}</div>
                        <div className="history-ep">观看到：{item.episodeName}</div>
                        <div className="history-meta-sub">
                          {item.currentTime && item.duration
                            ? `${formatTime(item.currentTime)} / ${formatTime(item.duration)} · 已看 ${item.progressPercent}%`
                            : `已看至 ${item.progressPercent}%`}
                        </div>
                        <div className="history-progress-wrap">
                          <div
                            className="history-progress-bar"
                            style={{ width: `${Math.max(5, item.progressPercent)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="history-item-actions">
                        <button
                          className="history-action-pill"
                          onClick={(e) => {
                            e.stopPropagation();
                            resumePlayFromHistory(item);
                          }}
                        >
                          续播
                        </button>
                        <button
                          className="history-del-icon-btn"
                          onClick={(e) => removeHistoryItem(item.vodId, e)}
                          title="删除记录"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          8. 离线缓存下载抽屉 (真实切片下载引擎驱动)
          ========================================================= */}
      {showDownloadDrawer && (
        <div
          className="drawer-mask"
          onClick={() => setShowDownloadDrawer(false)}
        >
          <div
            className="drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">离线沙盒缓存引擎</span>
              <div className="drawer-header-right">
                <button
                  className="drawer-close-btn"
                  onClick={() => setShowDownloadDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-scroll-body">
              <div className="download-storage-summary">
                <span>
                  沙盒已用:{" "}
                  {formatBytes(
                    downloadTasks.reduce((acc, t) => acc + (t.downloadedBytes || 0), 0)
                  )}
                </span>
                <span className="storage-free">
                  共 {downloadTasks.length} 个任务 (IndexedDB 存储)
                </span>
              </div>

              {downloadTasks.length === 0 ? (
                <div className="empty-drawer-view">
                  <DownloadCloud size={40} color="#64748b" />
                  <span>暂无离线下载任务</span>
                  <span className="empty-sub-tip">
                    在视频详情页点击「下载」按钮，即可切片高速缓存至沙盒
                  </span>
                </div>
              ) : (
                <div className="download-items-list">
                  {downloadTasks.map((item) => (
                    <div key={item.id} className="download-task-item">
                      <img
                        src={item.vodPic}
                        alt={item.vodName}
                        className="download-task-poster"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=200&auto=format&fit=crop&q=60";
                        }}
                      />
                      <div className="download-task-content">
                        <div className="download-task-title">{item.vodName}</div>
                        <div className="download-task-sub">
                          <span>{item.episodeName}</span>
                          {item.status === "downloading" && (
                            <span className="download-speed-tag">⚡ {item.downloadSpeed}</span>
                          )}
                          {item.status === "completed" && (
                            <span style={{ color: "#34d399", fontWeight: 600 }}>已完成</span>
                          )}
                          {item.status === "paused" && (
                            <span style={{ color: "#eab308" }}>已暂停</span>
                          )}
                        </div>

                        {/* 进度条 */}
                        <div className="download-progress-container" style={{ margin: "4px 0" }}>
                          <div
                            className="download-progress-inner"
                            style={{
                              width: `${item.progressPercent}%`,
                              background: item.status === "completed" ? "#10b981" : "#38bdf8",
                            }}
                          ></div>
                        </div>

                        <div style={{ fontSize: "11px", color: "#64748b", display: "flex", justifyContent: "space-between" }}>
                          <span>
                            {item.downloadedSegments} / {item.totalSegments || "?"} 切片
                          </span>
                          <span>{item.progressPercent}%</span>
                        </div>
                      </div>

                      {/* 操作按钮区 */}
                      <div className="download-action-btn-group">
                        {item.status === "completed" && (
                          <button
                            className="favorite-remove-btn"
                            style={{ color: "#34d399" }}
                            onClick={() => handlePlayDownloaded(item)}
                            title="本地离线起播"
                          >
                            <PlayCircle size={22} />
                          </button>
                        )}
                        {item.status === "downloading" && (
                          <button
                            className="favorite-remove-btn"
                            onClick={() => pauseDownloadTask(item.id)}
                            title="暂停下载"
                          >
                            <Pause size={18} />
                          </button>
                        )}
                        {item.status === "paused" && (
                          <button
                            className="favorite-remove-btn"
                            onClick={() => resumeDownloadTask(item.id)}
                            title="继续下载"
                          >
                            <Play size={18} />
                          </button>
                        )}
                        <button
                          className="favorite-remove-btn"
                          onClick={() => deleteDownloadTask(item.id)}
                          title="删除切片任务"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          9. 🌟 阶段二：我的追剧毛玻璃抽屉面板
          ========================================================= */}
      {showFavoritesDrawer && (
        <div
          className="drawer-mask"
          onClick={() => setShowFavoritesDrawer(false)}
        >
          <div
            className="drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">
                我的追剧片单 ({favorites.length})
              </span>
              <div className="drawer-header-right">
                {favorites.length > 0 && (
                  <button
                    className="drawer-text-action"
                    onClick={() => {
                      if (confirm("确认清空所有追剧记录吗？")) {
                        clearAllFavorites();
                        showToast("已清空追剧片单");
                      }
                    }}
                  >
                    清空追剧
                  </button>
                )}
                <button
                  className="drawer-close-btn"
                  onClick={() => setShowFavoritesDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-scroll-body">
              {favorites.length === 0 ? (
                <div className="empty-drawer-view">
                  <Heart size={40} color="#f43f5e" />
                  <span>暂无追剧收藏</span>
                  <span className="empty-sub-tip">
                    在心仪的剧集详情页点击「收藏/心形」，更新时将自动为您提醒
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {favorites.map((fav) => (
                    <div
                      key={fav.vodId}
                      className="favorite-item-row"
                      onClick={() => {
                        // 优先从预设库中找到原片
                        const found = presetVideos.find((p) => String(p.id) === String(fav.vodId));
                        if (found) {
                          selectVideo(found);
                          setShowFavoritesDrawer(false);
                        } else {
                          // 构建简易对象
                          selectVideo({
                            id: fav.vodId,
                            title: fav.vodName,
                            pic: fav.vodPic,
                            remarks: fav.latestEpisode || "全集",
                            category: fav.category || "影视",
                            sources: [
                              {
                                sourceName: "默认专线",
                                episodes: [
                                  {
                                    name: fav.lastWatchEpisode || "第 01 集",
                                    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
                                  },
                                ],
                              },
                            ],
                          });
                          setShowFavoritesDrawer(false);
                        }
                      }}
                    >
                      <div className="favorite-poster-wrap">
                        <img
                          src={fav.vodPic}
                          alt={fav.vodName}
                          className="favorite-poster"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=200&auto=format&fit=crop&q=60";
                          }}
                        />
                        {/* 智能更新角标对比与红点提醒 */}
                        {fav.hasUpdate && (
                          <div className="favorite-update-badge">
                            🔴 NEW {fav.latestEpisode}
                          </div>
                        )}
                      </div>

                      <div className="favorite-details">
                        <div className="favorite-title-row">
                          <span className="favorite-name">{fav.vodName}</span>
                          <button
                            className="favorite-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(fav.vodId);
                              showToast(`已将《${fav.vodName}》移出追剧`);
                            }}
                            title="取消追剧"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        <div className="favorite-ep-info">
                          <span>最新：{fav.latestEpisode || "已完结"}</span>
                          {fav.hasUpdate && (
                            <span className="red-dot-indicator" title="有新剧集更新" />
                          )}
                        </div>

                        <div className="favorite-ep-info">
                          <span>
                            上次看至：{fav.lastWatchEpisode || "尚未观看"}
                          </span>
                          {fav.lastWatchProgress ? (
                            <span className="favorite-progress-pill">
                              已看 {fav.lastWatchProgress}%
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          10. 📺 阶段三：AirPlay 电视投屏助手引导弹层
          ========================================================= */}
      {showAirPlayModal && (
        <div
          className="drawer-mask"
          style={{ justifyContent: "center", alignItems: "center" }}
          onClick={() => setShowAirPlayModal(false)}
        >
          <div
            className="airplay-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "17px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
                <Tv size={20} color="#38bdf8" />
                AirPlay 电视投屏助手
              </span>
              <button
                className="drawer-close-btn"
                onClick={() => setShowAirPlayModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="airplay-searching-circle">
              <Tv size={26} color="#38bdf8" />
            </div>

            <div className="airplay-guide-text">
              <p>1. 请确保您的手机/电脑与电视 (Apple TV / 小米 / 华为智慧屏) 连接至<strong>同一个 Wi-Fi</strong>网络。</p>
              <p>2. 在 iOS Safari 中，系统将直接弹出原生 AirPlay 投屏菜单选择大屏设备。</p>
              <p>3. 您也可以复制下方视频流地址，粘贴至电视端播放器 (如 Kodi, VLC, PotPlayer) 播放：</p>
            </div>

            <div className="airplay-url-box">
              {currentEpisode?.url || "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                className="source-tool-action-btn primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => {
                  if (currentEpisode?.url) {
                    navigator.clipboard.writeText(currentEpisode.url);
                    showToast("📋 视频流地址已复制");
                  }
                }}
              >
                复制播放流直链
              </button>
              <button
                className="source-tool-action-btn"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setShowAirPlayModal(false)}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          11. 🌐 阶段五：自定义多源生态管理与并发测速抽屉
          ========================================================= */}
      {showCustomSourceDrawer && (
        <div
          className="drawer-mask"
          onClick={() => setShowCustomSourceDrawer(false)}
        >
          <div
            className="drawer-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-handle-bar"></div>
            <div className="drawer-header">
              <span className="drawer-title">
                自定义采集源管理 ({customSources.length})
              </span>
              <div className="drawer-header-right">
                <button
                  className="drawer-close-btn"
                  onClick={() => setShowCustomSourceDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="drawer-scroll-body">
              {/* 工具条 */}
              <div className="source-tools-toolbar">
                <button
                  className="source-tool-action-btn primary"
                  onClick={handlePingAllSources}
                  disabled={isPingingSources}
                >
                  <Zap size={14} />
                  <span>{isPingingSources ? "测速中..." : "并发测速 Ping"}</span>
                </button>
                <button
                  className="source-tool-action-btn"
                  onClick={() => setShowImportDialog(true)}
                >
                  <DownloadCloud size={14} />
                  <span>导入源 (TVBox/CMS)</span>
                </button>
                <button
                  className="source-tool-action-btn"
                  onClick={handleExportSources}
                >
                  <UploadCloud size={14} />
                  <span>备份规则</span>
                </button>
              </div>

              {/* 源列表 */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {customSources.map((src) => (
                  <div key={src.key} className="source-item-card">
                    <div className="source-meta-left">
                      <div className="source-name-title">
                        <span>{src.name}</span>
                        {src.pingMs !== undefined && (
                          <span
                            className={`source-ping-pill ${
                              src.pingMs < 100 ? "fast" : "slow"
                            }`}
                          >
                            {src.pingMs} ms
                          </span>
                        )}
                      </div>
                      <div className="source-api-url">{src.api}</div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        className="switch-input"
                        checked={src.enabled}
                        onChange={() => toggleSourceEnabled(src.key)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          12. 导入 TVBox / CMS 源模态对话框
          ========================================================= */}
      {showImportDialog && (
        <div
          className="drawer-mask"
          style={{ justifyContent: "center", alignItems: "center" }}
          onClick={() => setShowImportDialog(false)}
        >
          <div
            className="airplay-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
                导入采集源规则 (TVBox JSON / CMS)
              </span>
              <button
                className="drawer-close-btn"
                onClick={() => setShowImportDialog(false)}
              >
                <X size={18} />
              </button>
            </div>

            <textarea
              value={importInputText}
              onChange={(e) => setImportInputText(e.target.value)}
              placeholder={`支持直接粘贴 TVBox JSON 格式配置，例如：\n{\n  "sites": [\n    {\n      "key": "my_source",\n      "name": "极速4K云专线",\n      "type": 1,\n      "api": "https://api.example.com/api.php/provide/vod/"\n    }\n  ]\n}`}
              style={{
                width: "100%",
                height: "140px",
                borderRadius: "8px",
                background: "rgba(0, 0, 0, 0.4)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#fff",
                padding: "10px",
                fontSize: "12px",
                fontFamily: "monospace",
                resize: "none",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="source-tool-action-btn primary"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={handleImportSources}
              >
                立即解析并导入
              </button>
              <button
                className="source-tool-action-btn"
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setShowImportDialog(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          13. 全局浮动毛玻璃 Toast 提示胶囊
          ========================================================= */}
      {toastMessage && (
        <div className="aurora-floating-toast">
          <Sparkles size={16} color="#38bdf8" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
