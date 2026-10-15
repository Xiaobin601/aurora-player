import { useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  X,
  Maximize,
  Minimize,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCw,
  List,
  ChevronLeft,
  Flame,
  Download,
  Clock,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
  Check,
  Share2,
  Heart,
  ArrowUpDown,
  Calendar,
  Star,
  Trash2,
  LayoutGrid,
  RefreshCw,
  ArrowUp,
} from "lucide-react";
import presetData from "./data/presetLibrary.json";
import { searchOnlineVideos } from "./services/videoSearch";
import type { VideoItem, Episode } from "./services/videoSearch";
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

// 离线下载项接口
interface DownloadItem {
  id: string;
  vodName: string;
  vodPic: string;
  episodeName: string;
  status: "downloading" | "completed";
  progress: number;
  fileSize: string;
}

export default function App() {
  // 核心播放器引用与 HLS 实例
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // 导航与页面状态
  const [activeBottomTab, setActiveBottomTab] = useState<BottomNavTab>("home");
  const [activeChannel, setActiveChannel] = useState<string>("首页");

  // 弹层抽屉状态
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [showHistoryDrawer, setShowHistoryDrawer] = useState<boolean>(false);
  const [showDownloadDrawer, setShowDownloadDrawer] = useState<boolean>(false);
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
  const [showControls, setShowControls] = useState<boolean>(true);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState<boolean>(false);
  const [rotationAngle, setRotationAngle] = useState<90 | 270>(90);
  const controlsTimerRef = useRef<any>(null);

  // 本地/云端代理状态
  const [proxyPort, setProxyPort] = useState<number | null>(null);
  const [useProxy, setUseProxy] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string>("就绪");

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

  const [downloadList, setDownloadList] = useState<DownloadItem[]>([
    {
      id: "dl-1",
      vodName: "现在就出发 第四季",
      vodPic: "https://vcover-vt-pic.puui.qpic.cn/vcover_vt_pic/0/mzc002001bk7moh1788430209093/260",
      episodeName: "第 01 集 (高清)",
      status: "completed",
      progress: 100,
      fileSize: "482 MB",
    },
    {
      id: "dl-2",
      vodName: "美人余",
      vodPic: "https://vcover-vt-pic.puui.qpic.cn/vcover_vt_pic/0/mzc00200xqdobf51787296754730/260",
      episodeName: "第 02 集 (超清)",
      status: "downloading",
      progress: 74,
      fileSize: "320 MB",
    },
  ]);

  // 排行榜 Tab
  const [activeRankTab, setActiveRankTab] = useState<"hot" | "surge" | "shorts" | "new">("hot");

  // 短剧当前选中的剧集索引
  const [currentShortIndex, setCurrentShortIndex] = useState<number>(0);

  // 1:1 BagTrim 原生详情页二级 Tab 与互动状态
  const [activeDetailTab, setActiveDetailTab] = useState<"detail" | "discuss">("detail");
  const [isLiked, setIsLiked] = useState<boolean>(false);
  const [isCollected, setIsCollected] = useState<boolean>(false);

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

  // 执行全网聚合在线搜索
  const handleSearch = async (kw: string) => {
    if (!kw.trim()) {
      setHasSearched(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setStatusMessage(`正在全网聚合检索 "${kw}"...`);
    try {
      const results = await searchOnlineVideos(kw.trim());
      if (results && results.length > 0) {
        setSearchResults(results);
        setHasSearched(true);
        setStatusMessage(`找到 ${results.length} 部关于 "${kw}" 的超清片源`);
      } else {
        // 匹配本地片库
        const localMatched = presetVideos.filter(
          (v) => v.title.includes(kw) || v.subTitle?.includes(kw) || v.category.includes(kw)
        );
        setSearchResults(localMatched);
        setHasSearched(true);
        setStatusMessage(localMatched.length > 0 ? `本地检索到 ${localMatched.length} 部片源` : `未检索到关于 "${kw}" 的视频`);
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

  // 选择视频并拉起播放
  const selectVideo = (video: VideoItem) => {
    setSelectedVideo(video);
    setCurrentSourceIndex(0);
    setPageIndex(0);
    setIsReverseOrder(false);
    const firstEp = video.sources[0]?.episodes[0] || null;
    setCurrentEpisode(firstEp);
    setShowPlayerModal(true);

    // 记录到最近历史 (优先继承之前的历史进度，若无则初始化)
    setWatchHistory((prev) => {
      const filtered = prev.filter((item) => String(item.vodId) !== String(video.id));
      const existing = prev.find((item) => String(item.vodId) === String(video.id));
      return [
        {
          vodId: video.id,
          vodName: video.title,
          vodPic: video.pic,
          episodeName: existing?.episodeName || firstEp?.name || "第 01 集",
          episodeUrl: existing?.episodeUrl || firstEp?.url || "",
          progressPercent: existing?.progressPercent || 0,
          currentTime: existing?.currentTime || 0,
          duration: existing?.duration || 0,
          sourceIndex: existing?.sourceIndex || 0,
          timestamp: Date.now(),
        },
        ...filtered,
      ];
    });

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

  // 从历史记录精准续播
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

    setSelectedVideo(target);
    setShowHistoryDrawer(false);
    setShowPlayerModal(true);

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

    setCurrentEpisode(targetEp);

    // 记录断点续播时间点
    if (item.currentTime && item.currentTime > 3) {
      pendingSeekTimeRef.current = item.currentTime;
      setStatusMessage(
        `正在续播：${item.vodName} · ${item.episodeName} (恢复至 ${formatTime(item.currentTime)})`
      );
    } else {
      pendingSeekTimeRef.current = null;
    }

    playEpisode(targetEp, target.title);
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
      setStatusMessage(`播放失败: ${reason} (暂无备用线路)`);
      return;
    }

    const nextIdx = (currentIdx + 1) % video.sources.length;
    const nextSource = video.sources[nextIdx];
    setStatusMessage(`线路异常，准备切换至备用源: ${nextSource.sourceName}...`);

    if (failoverTimeoutRef.current) clearTimeout(failoverTimeoutRef.current);
    failoverTimeoutRef.current = setTimeout(() => {
      switchSource(nextIdx);
    }, 4000);
  };

  // 核心播放引擎 (加载 M3U8 / 通过本地代理中转清洗图片头)
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
    const effectiveUrl = useProxy
      ? (window as any).__TAURI_INTERNALS__ && proxyPort
        ? `http://127.0.0.1:${proxyPort}/stream?url=${encodeURIComponent(rawUrl)}`
        : `/stream?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;

    setStatusMessage(`正在加载: ${videoTitle} · ${episode.name}`);

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
              console.error("遇到致命网络错误，自动尝试恢复或切换路线:", data.details);
              hls.startLoad();
              autoFailoverNextSource(data.details);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("遇到致命解码/媒体错误，尝试平滑恢复...");
              hls.recoverMediaError();
              break;
            default:
              console.error("不可恢复的致命异常，切换下个源:", data.details);
              hls.destroy();
              autoFailoverNextSource(data.details);
              break;
          }
        }
      });
    } else {
      video.src = effectiveUrl;
      video.load();
      video.play().catch((err) => {
        console.warn("直接播放需要用户交互唤醒:", err);
      });

      if (pendingSeekTimeRef.current !== null && pendingSeekTimeRef.current > 0) {
        const seekTo = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
        const handleLoaded = () => {
          video.currentTime = seekTo;
          video.removeEventListener("loadedmetadata", handleLoaded);
        };
        video.addEventListener("loadedmetadata", handleLoaded);
      }
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
  }, []);

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

  // 快进 / 快退 10 秒
  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
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

  // 切换倍速 (0.75x -> 1.0x -> 1.25x -> 1.5x -> 2.0x)
  const cyclePlaybackRate = () => {
    const rates = [1.0, 1.25, 1.5, 2.0, 0.75];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
    triggerControls();
  };

  // 切换横屏旋转角度 (支持顺时针 90° 与逆时针 270° 翻转)
  const toggleRotationAngle = () => {
    setRotationAngle((prev) => (prev === 90 ? 270 : 90));
    triggerControls();
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

  // 全屏切换：彻底隐藏系统时间、信号、电量图标，实现 100% 沉浸播放
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
      document.body.classList.remove("landscape-fullscreen-active");

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
      return;
    }

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS && (video as any).webkitEnterFullscreen) {
      try {
        (video as any).webkitEnterFullscreen();
        return;
      } catch (err) {
        console.warn("webkitEnterFullscreen 异常，降级为网页模式:", err);
      }
    }

    if (container?.requestFullscreen) {
      container
        .requestFullscreen()
        .then(() => {
          if (screen.orientation && (screen.orientation as any).lock) {
            (screen.orientation as any).lock("landscape").catch(() => {});
          }
        })
        .catch(() => {});
      setIsLandscapeFullscreen(true);
      triggerControls();
      document.body.classList.add("landscape-fullscreen-active");
      return;
    }

    setIsLandscapeFullscreen(true);
    triggerControls();
    document.body.classList.add("landscape-fullscreen-active");
  };

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
                          src={item.pic}
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
                    src={channelBannerVideo.pic}
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
                        src={item.pic}
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
                  <img src={short.pic} alt={short.title} className="short-bg-poster" />
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
                    <img src={item.pic} alt={item.title} className="rank-item-poster" />

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
                  <span className="stat-count">{downloadList.length} 部</span>
                </div>
              </div>

              <div className="stat-box">
                <div className="stat-icon-wrap">
                  <Heart size={20} color="#f43f5e" />
                </div>
                <div className="stat-text">
                  <span className="stat-label">我的追剧</span>
                  <span className="stat-count">12 部</span>
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
            isLandscapeFullscreen ? "is-landscape-fullscreen" : ""
          } ${rotationAngle === 270 ? "rotate-270" : ""}`}
        >
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
              controls={!isLandscapeFullscreen && !isFullscreen}
              autoPlay
              playsInline
              webkit-playsinline="true"
            />

            {/* 非全屏模式下的返回按钮 (左上角半透明圆形返回按键，1:1 复刻截图) */}
            {!isLandscapeFullscreen && !isFullscreen && (
              <button
                className="bagtrim-floating-back-btn"
                onClick={() => {
                  setShowPlayerModal(false);
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
                }}
                title="返回上一页"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {/* 非全屏模式下的右上角全屏按键 */}
            {!isLandscapeFullscreen && !isFullscreen && (
              <button
                className="bagtrim-floating-fullscreen-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFullscreen();
                }}
                title="横屏全屏播放"
              >
                <Maximize size={18} />
              </button>
            )}

            {/* 现代沉浸全屏播放器覆盖层 (在全屏模式下显现) */}
            {(isLandscapeFullscreen || isFullscreen) && (
              <>
                {/* 顶部控制栏 */}
                <div
                  className={`modern-player-top ${showControls ? "visible" : "hidden"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="top-left-group">
                    <button
                      className="modern-icon-btn back-btn"
                      onClick={toggleFullscreen}
                      title="退出全屏"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <div className="modern-title-group">
                      <span className="modern-video-title">
                        {selectedVideo?.title}
                        {currentEpisode?.name ? ` · ${currentEpisode.name}` : ""}
                      </span>
                      {selectedVideo?.sources[currentSourceIndex]?.sourceName && (
                        <span className="modern-source-badge">
                          {selectedVideo.sources[currentSourceIndex].sourceName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="top-right-group">
                    <button
                      className="modern-icon-btn"
                      onClick={toggleRotationAngle}
                      title={`翻转方向 (${rotationAngle}°)`}
                    >
                      <RotateCw size={18} />
                      <span className="btn-hint-text">翻转</span>
                    </button>
                    <button
                      className={`modern-icon-btn ${showEpisodeDrawer ? "active" : ""}`}
                      onClick={() => setShowEpisodeDrawer((v) => !v)}
                      title="选集列表"
                    >
                      <List size={18} />
                      <span className="btn-hint-text">选集</span>
                    </button>
                    <button
                      className="modern-icon-btn"
                      onClick={toggleFullscreen}
                      title="退出全屏"
                    >
                      <Minimize size={18} />
                    </button>
                  </div>
                </div>

                {/* 底部控制栏 */}
                <div
                  className={`modern-player-bottom ${showControls ? "visible" : "hidden"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 进度条 */}
                  <div className="modern-progress-bar-wrap">
                    <span className="modern-time-text">{formatTime(currentTime)}</span>
                    <input
                      type="range"
                      className="modern-progress-slider"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setCurrentTime(val);
                        if (videoRef.current) videoRef.current.currentTime = val;
                      }}
                    />
                    <span className="modern-time-text total">{formatTime(duration)}</span>
                  </div>

                  {/* 动作按键排 */}
                  <div className="modern-controls-row">
                    <div className="left-controls">
                      <button
                        className="modern-icon-btn play-pause-btn"
                        onClick={togglePlay}
                      >
                        {isPlaying ? <Pause size={22} /> : <Play size={22} />}
                      </button>
                      <button
                        className="modern-icon-btn"
                        onClick={() => playNextEpisode(-1)}
                        title="上一集"
                      >
                        <SkipBack size={18} />
                      </button>
                      <button
                        className="modern-icon-btn"
                        onClick={() => playNextEpisode(1)}
                        title="下一集"
                      >
                        <SkipForward size={18} />
                      </button>
                      <button
                        className="modern-icon-btn"
                        onClick={() => seekRelative(-10)}
                        title="快退 10 秒"
                      >
                        <span className="btn-sec-text">-10s</span>
                      </button>
                      <button
                        className="modern-icon-btn"
                        onClick={() => seekRelative(10)}
                        title="快进 10 秒"
                      >
                        <span className="btn-sec-text">+10s</span>
                      </button>
                    </div>

                    <div className="right-controls">
                      <button
                        className="modern-rate-btn"
                        onClick={cyclePlaybackRate}
                      >
                        {playbackRate === 1.0 ? "倍速" : `${playbackRate}x`}
                      </button>
                      <button
                        className="modern-rate-btn"
                        onClick={() => setShowEpisodeDrawer(true)}
                      >
                        选集
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 播放器下方详情与交互区 (竖屏模式下直接在此平铺展示与滚动) */}
          {!isLandscapeFullscreen && !isFullscreen && (
            <div className="bagtrim-detail-scroll-body">
              {/* 二级 Tab：详情 (高亮) 与 讨论 6 */}
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
                <div className="sub-tabs-right">
                  <span className="live-status-pill">{statusMessage || "播放中"}</span>
                </div>
              </div>

              {activeDetailTab === "detail" ? (
                <>
                  {/* 大标题 */}
                  <h1 className="bagtrim-vod-title">{selectedVideo.title}</h1>

                  {/* 药丸属性行：[📅 2026] [🔥 172] [国产] [电视剧] */}
                  <div className="bagtrim-meta-pills-row">
                    <span className="meta-pill">
                      <Calendar size={13} className="pill-icon" />
                      <span>{selectedVideo.year || "2026"}</span>
                    </span>
                    <span className="meta-pill">
                      <Flame size={13} className="pill-icon flame" />
                      <span>{selectedVideo.hits || "172"}</span>
                    </span>
                    <span className="meta-pill">
                      {selectedVideo.area || "国产"}
                    </span>
                    <span className="meta-pill">
                      {selectedVideo.type || (selectedVideo.category ? selectedVideo.category.replace("热门", "") : "电视剧")}
                    </span>
                  </div>

                  {/* 三大金刚区：喜欢、下载、收藏 */}
                  <div className="bagtrim-action-trio">
                    <button
                      className={`action-trio-btn ${isLiked ? "active" : ""}`}
                      onClick={() => setIsLiked(!isLiked)}
                    >
                      <Heart
                        size={17}
                        fill={isLiked ? "#ff4757" : "none"}
                        color={isLiked ? "#ff4757" : "#fff"}
                      />
                      <span>{isLiked ? "1.1万" : "1.0万"}</span>
                    </button>
                    <button
                      className="action-trio-btn"
                      onClick={() => {
                        if (currentEpisode) {
                          alert(`已加入下载队列: ${selectedVideo.title} ${currentEpisode.name}`);
                        }
                      }}
                    >
                      <Download size={17} />
                      <span>下载</span>
                    </button>
                    <button
                      className={`action-trio-btn ${isCollected ? "active" : ""}`}
                      onClick={() => setIsCollected(!isCollected)}
                    >
                      <Star
                        size={17}
                        fill={isCollected ? "#ffa502" : "none"}
                        color={isCollected ? "#ffa502" : "#fff"}
                      />
                      <span>{isCollected ? "已追" : "收藏"}</span>
                    </button>
                  </div>

                  {/* 选集与线路模块 */}
                  <div className="bagtrim-episodes-module">
                    {/* 线路切换胶囊栏 */}
                    {selectedVideo.sources.length > 0 && (
                      <div className="bagtrim-sources-scroll">
                        {selectedVideo.sources.map((src, idx) => (
                          <button
                            key={idx}
                            className={`bagtrim-source-capsule ${currentSourceIndex === idx ? "active" : ""}`}
                            onClick={() => switchSource(idx)}
                          >
                            {src.sourceName || `线路 ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 选集副头部：正序/倒序与分页 */}
                    <div className="bagtrim-episodes-subhead">
                      <div className="subhead-title">
                        <span>剧集列表</span>
                        <span className="total-eps-text">({activeRawEpisodes.length}集全)</span>
                      </div>
                      <div className="subhead-tools">
                        <button
                          className="bagtrim-order-btn"
                          onClick={() => setIsReverseOrder((prev) => !prev)}
                          title="切换正序/倒序"
                        >
                          <ArrowUpDown size={12} />
                          <span>{isReverseOrder ? "倒序" : "正序"}</span>
                        </button>
                      </div>
                    </div>

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
                                src={rec.pic}
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
          8. 离线缓存下载抽屉 (点击右上角下载图标拉起)
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
              <span className="drawer-title">离线缓存管理</span>
              <button
                className="drawer-close-btn"
                onClick={() => setShowDownloadDrawer(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="drawer-scroll-body">
              <div className="download-storage-summary">
                <span>本地可用存储空间：118.4 GB</span>
                <span className="storage-free">已缓存 802 MB</span>
              </div>

              <div className="download-items-list">
                {downloadList.map((item) => (
                  <div key={item.id} className="download-item-card">
                    <img src={item.vodPic} alt={item.vodName} className="download-poster" />
                    <div className="download-meta">
                      <div className="download-title">{item.vodName}</div>
                      <div className="download-ep">
                        {item.episodeName} · {item.fileSize}
                      </div>
                      {item.status === "downloading" ? (
                        <div className="download-progress-container">
                          <div
                            className="download-progress-inner"
                            style={{ width: `${item.progress}%` }}
                          ></div>
                        </div>
                      ) : (
                        <div className="download-completed-badge">
                          <Check size={12} />
                          <span>已缓存完毕 (支持零流量离线播放)</span>
                        </div>
                      )}
                    </div>
                    <button
                      className="download-remove-btn"
                      onClick={() => setDownloadList((prev) => prev.filter((d) => d.id !== item.id))}
                      title="删除离线任务"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
