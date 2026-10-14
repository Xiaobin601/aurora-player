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

// 观看历史接口
interface WatchHistoryItem {
  vodId: string | number;
  vodName: string;
  vodPic: string;
  episodeName: string;
  episodeUrl: string;
  progressPercent: number;
  timestamp: number;
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
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>([
    {
      vodId: 149147,
      vodName: "美人余",
      vodPic: "https://vcover-vt-pic.puui.qpic.cn/vcover_vt_pic/0/mzc00200xqdobf51787296754730/260",
      episodeName: "第 03 集",
      episodeUrl: "https://test-streams.mux.dev/test_001/stream.m3u8",
      progressPercent: 68,
      timestamp: Date.now() - 3600000,
    },
    {
      vodId: 148459,
      vodName: "现在就出发 第四季",
      vodPic: "https://vcover-vt-pic.puui.qpic.cn/vcover_vt_pic/0/mzc002001bk7moh1788430209093/260",
      episodeName: "2026-10-13期",
      episodeUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      progressPercent: 42,
      timestamp: Date.now() - 86400000,
    },
  ]);

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

  const selectedVideoRef = useRef<VideoItem | null>(null);
  const currentSourceIndexRef = useRef<number>(0);
  const failoverTimeoutRef = useRef<any>(null);

  useEffect(() => {
    selectedVideoRef.current = selectedVideo;
  }, [selectedVideo]);

  useEffect(() => {
    currentSourceIndexRef.current = currentSourceIndex;
  }, [currentSourceIndex]);

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
        sources: realSources,
      };
    });
  }, []);

  // 当前首页焦点 Banner 影片 (优先选用《九门》)
  const heroVideo = useMemo(() => {
    const jiuMen = presetVideos.find((v) => v.title.includes("九门"));
    return jiuMen || presetVideos[0] || null;
  }, [presetVideos]);

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

  // 当前展示视频流 (综合搜索结果、频道过滤与多维筛选)
  const displayedVideos = useMemo(() => {
    if (hasSearched && searchResults.length > 0) {
      return searchResults;
    }

    let list = presetVideos;

    // 根据顶部频道过滤
    if (activeChannel === "短剧") {
      list = list.filter((v) => v.category.includes("短剧") || v.vodClass?.includes("短剧"));
    } else if (activeChannel === "电视剧") {
      list = list.filter((v) => v.category.includes("电视剧") || v.vodClass?.includes("电视剧"));
    } else if (activeChannel === "电影") {
      list = list.filter((v) => v.category.includes("电影") || v.vodClass?.includes("电影"));
    } else if (activeChannel === "综艺") {
      list = list.filter((v) => v.category.includes("综艺") || v.vodClass?.includes("综艺"));
    } else if (activeChannel === "动漫") {
      list = list.filter((v) => v.category.includes("动漫") || v.vodClass?.includes("动漫"));
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

    return list;
  }, [presetVideos, hasSearched, searchResults, activeChannel, selectedFilterCategory, selectedFilterGenre]);

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

    // 记录到最近历史
    setWatchHistory((prev) => {
      const filtered = prev.filter((item) => String(item.vodId) !== String(video.id));
      return [
        {
          vodId: video.id,
          vodName: video.title,
          vodPic: video.pic,
          episodeName: firstEp?.name || "第 01 集",
          episodeUrl: firstEp?.url || "",
          progressPercent: 5,
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

  // 播放器状态监听
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration || 0);

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
          1. 顶部状态栏与吸顶操作区 (1:1 复刻截图搜索框与快捷按键)
          ========================================================= */}
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

      {/* =========================================================
          2. 二级频道水平弹性滚动条 (首页 | 短剧 | 直播 | 电视剧 | 电影...)
          ========================================================= */}
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

      {/* =========================================================
          3. 主视口内容区 (根据底栏切换: 首页流 / 短剧流 / 排行榜 / 我的)
          ========================================================= */}
      <main className="bagtrim-main-view">
        {/* TAB 1: 首页长流 (Home) */}
        {activeBottomTab === "home" && (
          <div className="home-content-stream">
            {/* 焦点推荐大卡片 Hero Banner (16:9 大圆角，带渐变阴影与主视觉) */}
            {heroVideo && !hasSearched && (
              <div
                className="hero-banner-card"
                onClick={() => selectVideo(heroVideo)}
              >
                <img
                  src={heroVideo.pic}
                  alt={heroVideo.title}
                  className="hero-banner-img"
                  loading="eager"
                />
                <div className="hero-banner-gradient"></div>
                <div className="hero-banner-info">
                  <h2 className="hero-banner-title">{heroVideo.title}</h2>
                  <div className="hero-banner-play-badge">
                    <Play size={14} fill="#fff" />
                    <span>立即播放</span>
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
            <div className="video-cards-grid">
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

            {/* 底部避让悬浮胶囊的高度垫片 */}
            <div className="dock-spacer"></div>
          </div>
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
            onClick={() => setActiveBottomTab("home")}
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
          5. 播放器模态层 (全功能播放视口，支持选集、换源、横屏沉浸全屏)
          ========================================================= */}
      {selectedVideo && showPlayerModal && (
        <div
          className={`player-modal-overlay ${isFullscreen ? "is-fullscreen" : ""} ${
            isLandscapeFullscreen ? "is-landscape-fullscreen" : ""
          } ${rotationAngle === 270 ? "rotate-270" : ""}`}
        >
          <div className="player-modal-window">
            {/* 视频容器 */}
            <div
              className="video-container"
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

              {/* 非全屏模式下的右上角快捷按键 (关闭 + 全屏) */}
              {!isLandscapeFullscreen && !isFullscreen && (
                <div className="player-top-floating-actions">
                  <button
                    className="floating-icon-btn close-btn"
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
                    title="收起播放器"
                  >
                    <X size={18} />
                  </button>
                  <button
                    className="floating-icon-btn fullscreen-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                    title="横屏全屏播放"
                  >
                    <Maximize size={18} />
                  </button>
                </div>
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

            {/* 播放器下方详情与选集（竖屏半模态展示） */}
            {!isLandscapeFullscreen && !isFullscreen && (
              <div className="player-modal-body">
                <div className="player-meta-info">
                  <h3 className="player-vod-title">{selectedVideo.title}</h3>
                  <div className="player-vod-sub">
                    {selectedVideo.subTitle || selectedVideo.remarks}
                    <span className="player-status-tag"> · {statusMessage}</span>
                  </div>
                </div>

                {/* 线路选择 */}
                {selectedVideo.sources.length > 1 && (
                  <div className="player-source-selector">
                    <span className="selector-label">切换线路：</span>
                    <div className="source-chips">
                      {selectedVideo.sources.map((src, idx) => (
                        <button
                          key={idx}
                          className={`source-chip ${currentSourceIndex === idx ? "active" : ""}`}
                          onClick={() => switchSource(idx)}
                        >
                          {src.sourceName}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 选集列表 */}
                <div className="player-episodes-section">
                  <div className="episodes-header">
                    <div className="episodes-header-top">
                      <div className="episodes-header-left">
                        <span className="episodes-title">
                          剧集列表 ({activeRawEpisodes.length}集)
                        </span>
                        <button
                          className="order-toggle-btn"
                          onClick={() => setIsReverseOrder((prev) => !prev)}
                          title="切换正序/倒序"
                        >
                          <ArrowUpDown size={12} />
                          <span>{isReverseOrder ? "倒序" : "正序"}</span>
                        </button>
                      </div>
                    </div>

                    {totalPages > 1 && (
                      <div className="episodes-pager">
                        {Array.from({ length: totalPages }).map((_, p) => (
                          <button
                            key={p}
                            className={`page-num-btn ${pageIndex === p ? "active" : ""}`}
                            onClick={() => setPageIndex(p)}
                          >
                            {p * EPISODES_PER_PAGE + 1}-{Math.min((p + 1) * EPISODES_PER_PAGE, activeRawEpisodes.length)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="episodes-tiles-grid">
                    {displayedEpisodes.map((ep) => (
                      <button
                        key={ep.url}
                        className={`ep-tile ${currentEpisode?.url === ep.url ? "active" : ""}`}
                        onClick={() => playEpisode(ep, selectedVideo.title)}
                      >
                        {ep.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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
                onClick={() => setShowFilterDrawer(false)}
              >
                确定应用 ({displayedVideos.length}部)
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
                <button
                  className="drawer-text-action"
                  onClick={() => setWatchHistory([])}
                >
                  清空历史
                </button>
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
                </div>
              ) : (
                <div className="history-items-list">
                  {watchHistory.map((item, idx) => (
                    <div
                      key={idx}
                      className="history-item-row"
                      onClick={() => {
                        const target = presetVideos.find((v) => String(v.id) === String(item.vodId));
                        if (target) {
                          selectVideo(target);
                          setShowHistoryDrawer(false);
                        }
                      }}
                    >
                      <img src={item.vodPic} alt={item.vodName} className="history-poster" />
                      <div className="history-details">
                        <div className="history-name">{item.vodName}</div>
                        <div className="history-ep">观看到：{item.episodeName}</div>
                        <div className="history-progress-wrap">
                          <div
                            className="history-progress-bar"
                            style={{ width: `${item.progressPercent}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="history-action-pill">续播</div>
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
