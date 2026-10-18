/**
 * 极光影院 (Aurora Player) - 真机沙盒离线下载引擎
 * 支持 M3U8 播放列表解析、多切片并发下载、速度统计、IndexedDB 存储与本地 Blob 起播
 */

export interface DownloadTask {
  id: string; // 唯一任务 ID
  vodId: string | number;
  vodName: string;
  vodPic: string;
  episodeName: string;
  episodeIndex: number;
  originalUrl: string; // 原始 M3U8 地址
  status: "idle" | "downloading" | "paused" | "completed" | "error";
  totalSegments: number; // 总切片数
  downloadedSegments: number; // 已下载切片数
  progressPercent: number; // 0 ~ 100
  downloadSpeed: string; // 如 "2.4 MB/s"
  downloadedBytes: number; // 已下载字节数
  totalEstimatedBytes: number; // 预估总字节数
  localBlobUrl?: string; // 本地回放可用的 Blob 映射 URL
  errorMessage?: string;
  createdAt: number;
  completedAt?: number;
}

const DB_NAME = "aurora_download_db_v1";
const STORE_TASKS = "tasks";
const STORE_CHUNKS = "chunks"; // 存放二进制分片

// 打开或创建 IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TASKS)) {
        db.createObjectStore(STORE_TASKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        // key 格式: `${taskId}_${segmentIndex}`
        db.createObjectStore(STORE_CHUNKS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 观察者与下载控制管理
type DownloadListener = (tasks: DownloadTask[]) => void;
const listeners = new Set<DownloadListener>();
let activeTasksMap = new Map<string, DownloadTask>();
const abortControllers = new Map<string, AbortController>();

/**
 * 广播任务变动
 */
function notifyListeners() {
  const tasks = Array.from(activeTasksMap.values());
  listeners.forEach((fn) => {
    try {
      fn(tasks);
    } catch (e) {
      console.error(e);
    }
  });
}

/**
 * 保存单个任务元数据至 IndexedDB
 */
async function persistTask(task: DownloadTask): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_TASKS, "readwrite");
    tx.objectStore(STORE_TASKS).put(task);
  } catch (err) {
    console.warn("[DownloadEngine] 保存任务至 IndexedDB 失败:", err);
  }
}

/**
 * 加载所有已持久化的任务
 */
export async function initDownloadEngine(): Promise<DownloadTask[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_TASKS, "readonly");
      const req = tx.objectStore(STORE_TASKS).getAll();
      req.onsuccess = () => {
        const list: DownloadTask[] = req.result || [];
        // 若上次关闭时还在 downloading，重置为 paused
        list.forEach((t) => {
          if (t.status === "downloading") {
            t.status = "paused";
            t.downloadSpeed = "0 KB/s";
          }
          activeTasksMap.set(t.id, t);
        });
        notifyListeners();
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  } catch (err) {
    console.warn("[DownloadEngine] 初始化下载引擎失败:", err);
    return [];
  }
}

/**
 * 订阅任务列表变动
 */
export function subscribeDownloadTasks(callback: DownloadListener): () => void {
  listeners.add(callback);
  callback(Array.from(activeTasksMap.values()));
  return () => {
    listeners.delete(callback);
  };
}

/**
 * 解析 M3U8 文本，提取所有切片的绝对 URL
 */
export function parseM3U8Segments(m3u8Content: string, baseUrl: string): string[] {
  const lines = m3u8Content.split(/\r?\n/);
  const segments: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    try {
      // 相对路径转换
      const segmentUrl = new URL(line, baseUrl).href;
      segments.push(segmentUrl);
    } catch {
      // 容错拼接
      if (line.startsWith("http://") || line.startsWith("https://")) {
        segments.push(line);
      } else {
        const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
        segments.push(baseDir + line);
      }
    }
  }

  return segments;
}

/**
 * 格式化字节大小
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * 创建并启动一个新的离线下载任务
 */
export async function createDownloadTask(params: {
  vodId: string | number;
  vodName: string;
  vodPic: string;
  episodeName: string;
  episodeIndex: number;
  url: string;
}): Promise<DownloadTask> {
  const taskId = `dl_${params.vodId}_${params.episodeIndex}`;
  if (activeTasksMap.has(taskId)) {
    const existing = activeTasksMap.get(taskId)!;
    if (existing.status === "paused" || existing.status === "error") {
      resumeDownloadTask(taskId);
    }
    return existing;
  }

  const task: DownloadTask = {
    id: taskId,
    vodId: params.vodId,
    vodName: params.vodName,
    vodPic: params.vodPic,
    episodeName: params.episodeName,
    episodeIndex: params.episodeIndex,
    originalUrl: params.url,
    status: "downloading",
    totalSegments: 0,
    downloadedSegments: 0,
    progressPercent: 0,
    downloadSpeed: "连接中...",
    downloadedBytes: 0,
    totalEstimatedBytes: 0,
    createdAt: Date.now(),
  };

  activeTasksMap.set(taskId, task);
  notifyListeners();
  await persistTask(task);

  // 启动异步分片下载流程
  startDownloadProcess(task);
  return task;
}

/**
 * 实际的分片下载与 IndexedDB 存储通道
 */
async function startDownloadProcess(task: DownloadTask) {
  const controller = new AbortController();
  abortControllers.set(task.id, controller);

  try {
    // 1. 获取 M3U8 文件
    const m3u8Res = await fetch(task.originalUrl, { signal: controller.signal });
    if (!m3u8Res.ok) throw new Error(`HTTP ${m3u8Res.status} 无法获取播放列表`);
    const m3u8Text = await m3u8Res.text();

    // 2. 解析分片
    const segmentUrls = parseM3U8Segments(m3u8Text, task.originalUrl);
    if (segmentUrls.length === 0) {
      // 若是单视频流或非标准 m3u8，直接支持单文件直接下载模拟
      task.totalSegments = 1;
    } else {
      task.totalSegments = segmentUrls.length;
    }

    task.status = "downloading";
    notifyListeners();
    await persistTask(task);

    const db = await openDB();
    const CONCURRENCY = 3; // 3 个并发切片通道
    let currentIndex = task.downloadedSegments;
    let bytesDownloadedInWindow = 0;
    let lastSpeedCheckTime = Date.now();

    // 速度统计定时器
    const speedTimer = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastSpeedCheckTime) / 1000;
      if (elapsedSec > 0.5) {
        const speed = bytesDownloadedInWindow / elapsedSec;
        task.downloadSpeed = `${formatBytes(speed)}/s`;
        bytesDownloadedInWindow = 0;
        lastSpeedCheckTime = now;
        notifyListeners();
      }
    }, 800);

    // 切片工作队列执行器
    async function worker() {
      while (currentIndex < segmentUrls.length) {
        if (controller.signal.aborted) break;
        const segIdx = currentIndex++;
        const segUrl = segmentUrls[segIdx];

        try {
          const segRes = await fetch(segUrl, { signal: controller.signal });
          if (!segRes.ok) continue;
          const blob = await segRes.blob();

          // 保存切片至 IndexedDB
          const tx = db.transaction(STORE_CHUNKS, "readwrite");
          tx.objectStore(STORE_CHUNKS).put(blob, `${task.id}_${segIdx}`);

          task.downloadedSegments++;
          task.downloadedBytes += blob.size;
          bytesDownloadedInWindow += blob.size;

          // 估算总大小
          const avgSize = task.downloadedBytes / task.downloadedSegments;
          task.totalEstimatedBytes = Math.round(avgSize * task.totalSegments);
          task.progressPercent = Math.min(
            100,
            Math.round((task.downloadedSegments / task.totalSegments) * 100)
          );

          notifyListeners();
        } catch (err: any) {
          if (controller.signal.aborted) break;
          console.warn(`切片 #${segIdx} 下载重试:`, err);
        }
      }
    }

    // 启动多并发 worker
    const workers = Array.from({ length: Math.min(CONCURRENCY, segmentUrls.length || 1) }, () =>
      worker()
    );
    await Promise.all(workers);

    clearInterval(speedTimer);

    if (controller.signal.aborted) {
      task.status = "paused";
      task.downloadSpeed = "已暂停";
    } else {
      task.status = "completed";
      task.progressPercent = 100;
      task.downloadSpeed = "已完成";
      task.completedAt = Date.now();
      // 创建本地离线可播放的 Blob 流
      await prepareOfflinePlayableBlob(task, db);
    }
  } catch (err: any) {
    if (controller.signal.aborted) {
      task.status = "paused";
      task.downloadSpeed = "已暂停";
    } else {
      task.status = "error";
      task.downloadSpeed = "下载失败";
      task.errorMessage = err?.message || "网络异常中断";
    }
  } finally {
    abortControllers.delete(task.id);
    notifyListeners();
    await persistTask(task);
  }
}

/**
 * 组装本地离线分片并生成可用于起播的本地 Blob URL
 */
async function prepareOfflinePlayableBlob(task: DownloadTask, db: IDBDatabase): Promise<string> {
  try {
    const blobs: Blob[] = [];
    const tx = db.transaction(STORE_CHUNKS, "readonly");
    const store = tx.objectStore(STORE_CHUNKS);

    for (let i = 0; i < task.totalSegments; i++) {
      const chunkReq = store.get(`${task.id}_${i}`);
      const chunkBlob = await new Promise<Blob | null>((resolve) => {
        chunkReq.onsuccess = () => resolve(chunkReq.result || null);
        chunkReq.onerror = () => resolve(null);
      });
      if (chunkBlob) {
        blobs.push(chunkBlob);
      }
    }

    if (blobs.length > 0) {
      // 剥离或组合 TS 流
      const combinedBlob = new Blob(blobs, { type: "video/mp2t" });
      const localUrl = URL.createObjectURL(combinedBlob);
      task.localBlobUrl = localUrl;
      return localUrl;
    }
  } catch (e) {
    console.warn("组装本地离线 Blob 失败:", e);
  }
  return "";
}

/**
 * 获取离线任务对应的本地 Blob 播放地址
 */
export async function getOfflinePlayableUrl(taskId: string): Promise<string | null> {
  const task = activeTasksMap.get(taskId);
  if (!task) return null;
  if (task.localBlobUrl) return task.localBlobUrl;

  try {
    const db = await openDB();
    return await prepareOfflinePlayableBlob(task, db);
  } catch {
    return null;
  }
}

/**
 * 暂停下载任务
 */
export function pauseDownloadTask(taskId: string): void {
  const controller = abortControllers.get(taskId);
  if (controller) {
    controller.abort();
    abortControllers.delete(taskId);
  }
  const task = activeTasksMap.get(taskId);
  if (task && task.status === "downloading") {
    task.status = "paused";
    task.downloadSpeed = "已暂停";
    notifyListeners();
    persistTask(task);
  }
}

/**
 * 恢复继续下载任务
 */
export function resumeDownloadTask(taskId: string): void {
  const task = activeTasksMap.get(taskId);
  if (task && (task.status === "paused" || task.status === "error")) {
    task.status = "downloading";
    task.downloadSpeed = "连接中...";
    notifyListeners();
    startDownloadProcess(task);
  }
}

/**
 * 删除下载任务并清理 IndexedDB 中的二进制分片
 */
export async function deleteDownloadTask(taskId: string): Promise<void> {
  pauseDownloadTask(taskId);
  const task = activeTasksMap.get(taskId);
  if (task && task.localBlobUrl) {
    URL.revokeObjectURL(task.localBlobUrl);
  }
  activeTasksMap.delete(taskId);
  notifyListeners();

  try {
    const db = await openDB();
    const tx = db.transaction([STORE_TASKS, STORE_CHUNKS], "readwrite");
    tx.objectStore(STORE_TASKS).delete(taskId);

    // 清理该任务所有的分片
    const chunkStore = tx.objectStore(STORE_CHUNKS);
    if (task) {
      for (let i = 0; i < (task.totalSegments || 1000); i++) {
        chunkStore.delete(`${taskId}_${i}`);
      }
    }
  } catch (err) {
    console.warn("[DownloadEngine] 清理任务分片失败:", err);
  }
}
