import { useEffect, useRef, useState, useMemo } from "react";
import Hls from "hls.js";
import { invoke } from "@tauri-apps/api/core";
import {
  Search,
  RotateCcw,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Radio,
  Tv,
  Film,
  Sparkles,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Maximize,
  Minimize,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCw,
  List,
} from "lucide-react";
import presetData from "./data/presetLibrary.json";
import { searchOnlineVideos } from "./services/videoSearch";
import type { VideoItem, Episode } from "./services/videoSearch";
import "./App.css";

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // 全屏状态与现代播放器状态
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
  const [statusMessage, setStatusMessage] = useState<string>("初始化中...");

  // 搜索相关状态
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);

  // 当前选中的视频详情与选集
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [currentSourceIndex, setCurrentSourceIndex] = useState<number>(0);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  // 移动端专用 Tab 切换 ('episodes' | 'search' | 'settings')
  const [mobileTab, setMobileTab] = useState<"episodes" | "search" | "settings">("episodes");

  // 选集排序与分页 (适合 100+ 集大番剧)
  const [isDescOrder, setIsDescOrder] = useState<boolean>(false);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const PAGE_SIZE = 50;

  // 播放指标监控
  const [stats, setStats] = useState({
    resolution: "--",
    bufferLength: "0.0s",
    fragmentCount: 0,
    bitrate: "-- kbps",
  });

  // 1. 初始化并连接流媒体代理服务
  useEffect(() => {
    invoke<number>("get_proxy_port")
      .then((port) => {
        setProxyPort(port);
        setStatusMessage(`本地代理就绪 (127.0.0.1:${port})`);
      })
      .catch((err) => {
        console.warn("未能通过 Tauri IPC 获取代理端口（处于 Web / 移动端模式）:", err);
        setProxyPort(8080);
        setStatusMessage("极光云端流媒体服务已就绪 (iPhone 独立模式)");
      });

    // 默认展示并搜索优质热门内容
    handleSearch("仙逆");
  }, []);

  // 2. 视频搜索逻辑（在线聚合全网接口优先，本地缓存后备）
  const handleSearch = async (keyword: string) => {
    const kw = keyword.trim();
    if (!kw) return;
    setIsSearching(true);
    setStatusMessage(`正在聚合全网检索: "${kw}"...`);

    const onlineMatches = await searchOnlineVideos(kw);
    let finalResults: VideoItem[] = [];

    if (onlineMatches.length > 0) {
      finalResults = onlineMatches;
    } else {
      finalResults = (presetData.videos as any[])
        .filter((v) => v.vodName.toLowerCase().includes(kw.toLowerCase()) || kw.includes(v.vodName))
        .map((v) => ({
          id: `local-${v.vodId}`,
          title: v.vodName,
          category: v.category || "精选",
          remarks: v.vodRemarks || "全集",
          pic: v.vodPic || "",
          sources: [
            {
              sourceName: "本地精选线路",
              episodes: v.episodes,
            },
          ],
        }));
    }

    setSearchResults(finalResults);
    setIsSearching(false);

    if (finalResults.length > 0) {
      const topHit = finalResults[0];
      const totalSources = topHit.sources.length;
      const totalEps = topHit.sources[0]?.episodes.length || 0;
      setStatusMessage(`找到 ${finalResults.length} 部影片 (${totalSources}条线路 · ${totalEps}集)`);
      selectVideo(topHit, false);
    } else {
      setStatusMessage(`未检索到关于 "${kw}" 的视频`);
    }
  };

  // 选择视频 (switchTab: 是否在移动端切回选集 Tab)
  const selectVideo = (video: VideoItem, switchTab: boolean = true) => {
    setSelectedVideo(video);
    setCurrentSourceIndex(0);
    setPageIndex(0);
    const firstEp = video.sources[0]?.episodes[0] || null;
    if (firstEp) {
      playEpisode(firstEp, video.title);
    }
    if (switchTab) {
      setMobileTab("episodes");
    }
  };

  // 切换播放线路
  const switchSource = (sourceIndex: number) => {
    setCurrentSourceIndex(sourceIndex);
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

  // 3. 核心播放引擎 (加载 M3U8 / 通过代理清洗图片头)
  const playEpisode = (episode: Episode, videoTitle: string) => {
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

    setStatusMessage(`加载中: ${videoTitle} - ${episode.name}`);

    const isHls = rawUrl.includes(".m3u8") || rawUrl.includes("index") || !rawUrl.endsWith(".mp4");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false, // 彻底关闭激进的直播低延迟模式，开启 VOD 大水库模式
        backBufferLength: 90, // 后向保留 90 秒已播放缓存，支持随时倒退免重载
        maxBufferLength: 60, // 前向预加载 60 秒切片，即使源端限速也能靠提前量平滑播放
        maxMaxBufferLength: 120, // 极限允许预加载至 120 秒
        maxBufferSize: 80 * 1024 * 1024, // 开启 80MB 内存缓冲池
        maxBufferHole: 0.5, // 忽略时间戳微缝隙，防止播放器卡在切片拼接处
        highBufferWatchdogPeriod: 2, // 启用看门狗守护，防止卡死停滞
        nudgeOffset: 0.1, // 时间戳偶发失步时自动微推平滑播放
        nudgeMaxRetry: 5,
        fragLoadingTimeOut: 25000, // 给予慢速源充足下载窗口
        fragLoadingMaxRetry: 6, // 网络波动时自动重试 6 次
        fragLoadingRetryDelay: 500,
        startFragPrefetch: true, // 启动切片预取流水线
      });

      hlsRef.current = hls;
      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatusMessage(`正在播放: ${videoTitle} (${episode.name})`);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
        setStats((prev) => ({
          ...prev,
          fragmentCount: prev.fragmentCount + 1,
          bitrate: `${Math.round((data.frag.stats.loaded / 1024 / (data.frag.duration || 1)) * 8)} kbps`,
        }));
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn("[Hls Error]", data);
          setStatusMessage(`流重载中: ${data.type}`);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else {
      // iOS Safari 原生 HLS 支持
      video.src = effectiveUrl;
      video.play().catch(() => {});
      setStatusMessage(`正在播放: ${videoTitle} (${episode.name})`);
    }
  };

  // 上一集 / 下一集快捷切换
  const activeRawEpisodes = useMemo(() => {
    if (!selectedVideo || !selectedVideo.sources[currentSourceIndex]) return [];
    return selectedVideo.sources[currentSourceIndex].episodes;
  }, [selectedVideo, currentSourceIndex]);

  const currentEpIndex = useMemo(() => {
    return activeRawEpisodes.findIndex((e) => e.url === currentEpisode?.url);
  }, [activeRawEpisodes, currentEpisode]);

  const playPrevEpisode = () => {
    if (currentEpIndex > 0 && selectedVideo) {
      playEpisode(activeRawEpisodes[currentEpIndex - 1], selectedVideo.title);
    }
  };

  const playNextEpisode = () => {
    if (currentEpIndex >= 0 && currentEpIndex < activeRawEpisodes.length - 1 && selectedVideo) {
      playEpisode(activeRawEpisodes[currentEpIndex + 1], selectedVideo.title);
    }
  };

  // 分页与排序后的当前可见集数列表
  const totalPages = Math.ceil(activeRawEpisodes.length / PAGE_SIZE) || 1;
  const pagedEpisodes = useMemo(() => {
    const list = [...activeRawEpisodes];
    if (isDescOrder) list.reverse();
    const start = pageIndex * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [activeRawEpisodes, isDescOrder, pageIndex]);

  // 监控缓冲时长与分辨率
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateStats = () => {
      let buf = 0;
      if (video.buffered.length > 0) {
        for (let i = 0; i < video.buffered.length; i++) {
          if (video.currentTime >= video.buffered.start(i) && video.currentTime <= video.buffered.end(i)) {
            buf = video.buffered.end(i) - video.currentTime;
            break;
          }
        }
      }
      setStats((prev) => ({
        ...prev,
        resolution: video.videoWidth > 0 ? `${video.videoWidth}x${video.videoHeight}` : "--",
        bufferLength: `${buf.toFixed(1)}s`,
      }));
    };

    const timer = setInterval(updateStats, 1000);
    return () => clearInterval(timer);
  }, []);

  // 监听全屏状态变化（包含标准全屏和 Safari/iOS webkit 全屏事件）
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = Boolean(
        document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    const video = videoRef.current;
    const onWebkitBegin = () => {
      setIsFullscreen(true);
      document.body.classList.add("landscape-fullscreen-active");
    };
    const onWebkitEnd = () => {
      setIsFullscreen(false);
      setIsLandscapeFullscreen(false);
      setShowEpisodeDrawer(false);
      document.body.classList.remove("landscape-fullscreen-active");
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    if (video) {
      video.addEventListener("webkitbeginfullscreen", onWebkitBegin);
      video.addEventListener("webkitendfullscreen", onWebkitEnd);
    }

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      if (video) {
        video.removeEventListener("webkitbeginfullscreen", onWebkitBegin);
        video.removeEventListener("webkitendfullscreen", onWebkitEnd);
      }
    };
  }, []);

  // 格式化时间 (秒 -> MM:SS 或 HH:MM:SS)
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const mm = m < 10 ? `0${m}` : `${m}`;
    const ss = s < 10 ? `0${s}` : `${s}`;
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  // 控制栏自动隐藏计时器 (3.5秒无操作自动隐藏)
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  // 监听视频状态事件（播放、暂停、进度更新、时长变化、自动连播）
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration || 0);
    const onEnded = () => {
      if (currentEpIndex >= 0 && currentEpIndex < activeRawEpisodes.length - 1 && selectedVideo) {
        playEpisode(activeRawEpisodes[currentEpIndex + 1], selectedVideo.title);
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
    };
  }, [currentEpIndex, activeRawEpisodes, selectedVideo]);

  // 播放 / 暂停切换
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
    triggerControls();
  };

  // 进度拖动
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
    triggerControls();
  };

  // 倍速循环切换: 1.0x -> 1.25x -> 1.5x -> 2.0x
  const speedList = [1.0, 1.25, 1.5, 2.0];
  const handleCycleSpeed = () => {
    const currentIdx = speedList.indexOf(playbackRate);
    const nextSpeed = speedList[(currentIdx + 1) % speedList.length];
    setPlaybackRate(nextSpeed);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextSpeed;
    }
    triggerControls();
  };

  // 切换横屏旋转角度 (支持顺时针 90° 与逆时针 270° 翻转，满足不同握持习惯)
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

    // 1. 如果当前处于横屏全屏或系统全屏状态，则退出
    if (
      isLandscapeFullscreen ||
      isFullscreen ||
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) {
      setIsLandscapeFullscreen(false);
      setIsFullscreen(false);
      setShowEpisodeDrawer(false);
      document.body.classList.remove("landscape-fullscreen-active");

      // 释放屏幕方向锁定
      if (screen.orientation && (screen.orientation as any).unlock) {
        try {
          (screen.orientation as any).unlock();
        } catch (_) {}
      }

      // 退出原生全屏
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      return;
    }

    // 2. 检测 iOS / iPhone 环境：调用 webkitEnterFullscreen 是系统级彻底隐藏时间、信号、电量图标的唯一方式
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

    // 3. Android / 桌面端：优先调用 requestFullscreen（完全隐藏系统状态栏与任务栏）
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

    // 4. 降级模式：激活横屏全屏展开
    setIsLandscapeFullscreen(true);
    triggerControls();
    document.body.classList.add("landscape-fullscreen-active");
  };

  return (
    <div className="app-container">
      {/* 顶部导航栏 (iPhone 灵动岛 / 安全区适配) */}
      <header className="header">
        <div className="header-left">
          <div className="brand-logo">
            <div className="logo-badge">极光</div>
            <span className="brand-name">Aurora Player</span>
          </div>

          <div className="status-indicator">
            <span className="dot online"></span>
            <span>{statusMessage}</span>
          </div>
        </div>

        {/* 顶部搜索输入框 (移动端触屏优化) */}
        <div className="header-search-box">
          <Search size={16} color="#9ca3af" className="search-icon" />
          <input
            type="text"
            className="header-search-input"
            placeholder="搜电影、剧集、动漫(如:仙逆)..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch(searchKeyword);
                setMobileTab("search");
              }
            }}
          />
          {searchKeyword && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchKeyword("")}
              title="清空"
            >
              <X size={14} />
            </button>
          )}
          <button
            className="search-submit-btn"
            onClick={() => {
              handleSearch(searchKeyword);
              setMobileTab("search");
            }}
            disabled={isSearching}
          >
            {isSearching ? "检索中" : "搜索"}
          </button>
        </div>
      </header>

      {/* 热门推荐滑动胶囊 */}
      <div className="hot-keywords-bar">
        <span className="hot-label">
          <Sparkles size={13} color="#f59e0b" /> 热搜:
        </span>
        <div className="hot-keywords-scroll">
          {presetData.hotKeywords.map((kw, i) => (
            <div
              key={i}
              className={`keyword-chip ${searchKeyword === kw ? "active" : ""}`}
              onClick={() => {
                setSearchKeyword(kw);
                handleSearch(kw);
                setMobileTab("search");
              }}
            >
              {kw}
            </div>
          ))}
        </div>
      </div>

      {/* 主视口区域 */}
      <div className="main-content">
        {/* 上方：播放器视口 (手机端 16:9 沉浸置顶，全屏时横屏展开) */}
        <div
          className={`player-viewport ${isFullscreen ? "is-fullscreen" : ""} ${
            isLandscapeFullscreen ? "is-landscape-fullscreen" : ""
          } ${rotationAngle === 270 ? "rotate-270" : ""}`}
        >
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
              x5-video-player-type="h5"
            />

            {/* 非全屏模式下的右上角快捷全屏按钮 */}
            {!isLandscapeFullscreen && !isFullscreen && (
              <button
                className="floating-fullscreen-btn"
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
                {/* 1. 顶部控制栏浮层 (随 showControls 渐隐渐现) */}
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
                        {selectedVideo?.title || "极光播放器"}
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
                      title={`翻转方向 (当前 ${rotationAngle}°)`}
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

                {/* 2. 中央轻量暂停/播放指示浮层 */}
                {!isPlaying && (
                  <div
                    className="modern-center-play-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                  >
                    <Play size={36} fill="#fff" color="#fff" />
                  </div>
                )}

                {/* 3. 底部控制栏浮层 (带流光时间轴、快进退、倍速与选集) */}
                <div
                  className={`modern-player-bottom ${showControls ? "visible" : "hidden"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* 时间进度滑块 */}
                  <div className="modern-progress-row">
                    <span className="progress-time">{formatTime(currentTime)}</span>
                    <div className="progress-slider-wrapper">
                      <input
                        type="range"
                        className="modern-seek-bar"
                        min={0}
                        max={duration || 100}
                        step={0.5}
                        value={currentTime}
                        onChange={handleSeek}
                      />
                    </div>
                    <span className="progress-time total">{formatTime(duration)}</span>
                  </div>

                  {/* 底部功能按键 */}
                  <div className="modern-controls-row">
                    <div className="controls-left">
                      <button
                        className="modern-control-btn play-pause-btn"
                        onClick={togglePlay}
                        title={isPlaying ? "暂停" : "播放"}
                      >
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                      <button
                        className="modern-control-btn"
                        onClick={playPrevEpisode}
                        disabled={currentEpIndex <= 0}
                        title="上一集"
                      >
                        <SkipBack size={18} />
                      </button>
                      <button
                        className="modern-control-btn"
                        onClick={playNextEpisode}
                        disabled={currentEpIndex < 0 || currentEpIndex >= activeRawEpisodes.length - 1}
                        title="下一集"
                      >
                        <SkipForward size={18} />
                      </button>
                    </div>

                    <div className="controls-right">
                      <button
                        className="modern-pill-btn speed-btn"
                        onClick={handleCycleSpeed}
                        title="倍速播放"
                      >
                        {playbackRate === 1.0 ? "倍速" : `${playbackRate}x`}
                      </button>
                      <button
                        className={`modern-pill-btn ${showEpisodeDrawer ? "active" : ""}`}
                        onClick={() => setShowEpisodeDrawer((v) => !v)}
                        title="选集"
                      >
                        选集
                      </button>
                      <button
                        className="modern-control-btn"
                        onClick={toggleFullscreen}
                        title="退出全屏"
                      >
                        <Minimize size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* 4. 横屏全屏专用选集抽屉 (右侧滑出) */}
                {showEpisodeDrawer && (
                  <div
                    className="modern-episode-drawer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="drawer-header">
                      <div className="drawer-title">
                        <span>选集列表</span>
                        <span className="drawer-count">({activeRawEpisodes.length}集)</span>
                      </div>
                      <div className="drawer-header-actions">
                        <button
                          className="drawer-sort-btn"
                          onClick={() => setIsDescOrder((v) => !v)}
                        >
                          <ArrowUpDown size={13} /> {isDescOrder ? "倒序" : "正序"}
                        </button>
                        <button
                          className="drawer-close-btn"
                          onClick={() => setShowEpisodeDrawer(false)}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="drawer-episodes-grid">
                      {pagedEpisodes.map((ep, idx) => {
                        const isCurrent = ep.url === currentEpisode?.url;
                        return (
                          <button
                            key={idx}
                            className={`drawer-ep-btn ${isCurrent ? "active" : ""}`}
                            onClick={() => {
                              playEpisode(ep, selectedVideo?.title || "");
                              triggerControls();
                            }}
                          >
                            {ep.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 竖屏普通模式底栏 (全屏时完全隐藏，绝不挤占横向空间) */}
          {!isLandscapeFullscreen && !isFullscreen && (
            <div className="player-bottom-bar">
              <div className="playing-info">
                <span className="video-title">
                  {selectedVideo ? `${selectedVideo.title} · ${currentEpisode?.name || ""}` : "请选择影片开始播放"}
                </span>
                <span className="video-source-info">
                  {selectedVideo?.remarks ? `[${selectedVideo.remarks}] ` : ""}
                  {selectedVideo?.category ? `分类: ${selectedVideo.category} | ` : ""}
                  {selectedVideo?.sources[currentSourceIndex]?.sourceName || ""}
                </span>
              </div>

              <div className="player-actions">
                <button
                  className="action-btn"
                  onClick={playPrevEpisode}
                  disabled={currentEpIndex <= 0}
                  title="上一集"
                >
                  <ChevronLeft size={16} /> 上一集
                </button>
                <button
                  className="action-btn"
                  onClick={playNextEpisode}
                  disabled={currentEpIndex < 0 || currentEpIndex >= activeRawEpisodes.length - 1}
                  title="下一集"
                >
                  下一集 <ChevronRight size={16} />
                </button>
                <button
                  className="action-btn icon-only"
                  onClick={() =>
                    currentEpisode && selectedVideo && playEpisode(currentEpisode, selectedVideo.title)
                  }
                  title="重新载入流"
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  className="action-btn fullscreen-btn"
                  onClick={toggleFullscreen}
                  title="横屏全屏播放"
                >
                  <Maximize size={15} />
                  <span className="btn-label-fullscreen">横屏全屏</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 下方/右侧：控制面板与内容列表 */}
        <aside className="sidebar">
          {/* 移动端专属 Tab 切换栏 */}
          <div className="mobile-tabs-bar">
            <button
              className={`mobile-tab-btn ${mobileTab === "episodes" ? "active" : ""}`}
              onClick={() => setMobileTab("episodes")}
            >
              <Tv size={15} /> 选集播放 ({activeRawEpisodes.length}集)
            </button>
            <button
              className={`mobile-tab-btn ${mobileTab === "search" ? "active" : ""}`}
              onClick={() => setMobileTab("search")}
            >
              <Layers size={15} /> 搜索片库 ({searchResults.length})
            </button>
            <button
              className={`mobile-tab-btn ${mobileTab === "settings" ? "active" : ""}`}
              onClick={() => setMobileTab("settings")}
            >
              <SlidersHorizontal size={15} /> 模式与指标
            </button>
          </div>

          {/* Tab 1: 选集播放面板 */}
          <div className={`tab-content ${mobileTab === "episodes" ? "active-content" : "hidden-on-mobile"}`}>
            {selectedVideo ? (
              <div className="sidebar-section">
                <div className="section-header-flex">
                  <span className="section-label">
                    <Tv size={14} /> 播放线路选择
                  </span>
                  <span className="section-sub">共 {selectedVideo.sources.length} 条可用线路</span>
                </div>

                {/* 线路选择胶囊 */}
                <div className="source-tabs">
                  {selectedVideo.sources.map((src, idx) => (
                    <button
                      key={idx}
                      className={`source-tab-btn ${currentSourceIndex === idx ? "active" : ""}`}
                      onClick={() => switchSource(idx)}
                    >
                      {src.sourceName}
                    </button>
                  ))}
                </div>

                {/* 选集控制辅助栏：分页 + 正序倒序 */}
                <div className="episodes-toolbar">
                  {/* 分页切换 (如 1-50, 51-100, 101-162) */}
                  {totalPages > 1 && (
                    <div className="page-tabs">
                      {Array.from({ length: totalPages }).map((_, pIdx) => {
                        const start = pIdx * PAGE_SIZE + 1;
                        const end = Math.min((pIdx + 1) * PAGE_SIZE, activeRawEpisodes.length);
                        return (
                          <button
                            key={pIdx}
                            className={`page-chip ${pageIndex === pIdx ? "active" : ""}`}
                            onClick={() => setPageIndex(pIdx)}
                          >
                            {start}-{end}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 倒序/正序切换 */}
                  <button
                    className="order-toggle-btn"
                    onClick={() => setIsDescOrder(!isDescOrder)}
                    title="切换集数排序"
                  >
                    <ArrowUpDown size={13} /> {isDescOrder ? "倒序" : "正序"}
                  </button>
                </div>

                {/* 剧集列表网格 */}
                <div className="episodes-grid">
                  {pagedEpisodes.map((ep, idx) => {
                    const isPlaying = currentEpisode?.url === ep.url;
                    return (
                      <button
                        key={idx}
                        className={`episode-btn ${isPlaying ? "active" : ""}`}
                        onClick={() => playEpisode(ep, selectedVideo.title)}
                      >
                        {ep.name}
                        {isPlaying && <span className="playing-dot"></span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty-panel">
                <Film size={36} color="#4b5563" />
                <p>暂无播放内容，请在上方搜索或在片库中选择影片</p>
              </div>
            )}
          </div>

          {/* Tab 2: 搜索片库结果 */}
          <div className={`tab-content ${mobileTab === "search" ? "active-content" : "hidden-on-mobile"}`}>
            <div className="sidebar-section">
              <div className="section-label">
                <Layers size={14} /> 搜索结果 ({searchResults.length})
              </div>
              <div className="search-results-list">
                {searchResults.map((item, idx) => (
                  <div
                    key={`${item.id}-${idx}`}
                    className={`search-item-card ${selectedVideo?.id === item.id ? "active" : ""}`}
                    onClick={() => selectVideo(item, true)}
                  >
                    {item.pic ? (
                      <img
                        src={item.pic}
                        alt=""
                        className="item-poster"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="item-poster-placeholder">
                        <Film size={22} />
                      </div>
                    )}
                    <div className="item-details">
                      <span className="item-title">{item.title}</span>
                      <span className="item-sub">
                        {item.remarks} · {item.category}
                      </span>
                      <span className="item-sources-badge">
                        {item.sources.length} 条线路 · 共 {item.sources[0]?.episodes.length || 0} 集
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tab 3: 播放模式与实时指标监控 */}
          <div className={`tab-content ${mobileTab === "settings" ? "active-content" : "hidden-on-mobile"}`}>
            <div className="sidebar-section">
              <div className="section-label">
                <ShieldCheck size={14} /> 流数据清洗与中转模式
              </div>
              <div className="mode-toggle-group">
                <div
                  className={`mode-card ${useProxy ? "active" : ""}`}
                  onClick={() => setUseProxy(true)}
                >
                  <div className="mode-card-title">
                    <Zap size={14} color="#3b82f6" /> 边缘流代理清洗
                  </div>
                  <div className="mode-card-desc">自动注入 Headers 并剥离 TS 伪装图片头 (推荐)</div>
                </div>

                <div
                  className={`mode-card ${!useProxy ? "active" : ""}`}
                  onClick={() => setUseProxy(false)}
                >
                  <div className="mode-card-title">
                    <Radio size={14} color="#10b981" /> 原生直连模式
                  </div>
                  <div className="mode-card-desc">适合开放公网流或无防盗链流媒体</div>
                </div>
              </div>
            </div>

            {/* 实时解码指标 */}
            <div className="sidebar-section">
              <div className="section-label">
                <Activity size={14} /> 实时解码指标
              </div>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-key">当前画质</span>
                  <span className="stat-val">{stats.resolution}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-key">缓冲时长</span>
                  <span className="stat-val">{stats.bufferLength}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-key">已清洗切片</span>
                  <span className="stat-val">{stats.fragmentCount}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-key">实时码率</span>
                  <span className="stat-val">{stats.bitrate}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
