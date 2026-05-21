import * as RNFS from '@dr.pogodin/react-native-fs';
import {Model} from '../types';

export interface DownloadProgress {
  progress: number;
  bytesWritten: number;
  contentLength: number;
  speed: string;
  eta: string;
}

export interface DownloadEntry {
  modelId: string;
  url: string;
  destination: string;
  progress: number;
  isDownloading: boolean;
  isComplete: boolean;
  error: string | null;
  startTime: number;
  lastProgressDate: number;
  lastBytesWritten: number;
  jobId?: number;
}

type ProgressCallback = (modelId: string, progress: DownloadProgress) => void;
type CompleteCallback = (modelId: string) => void;
type ErrorCallback = (modelId: string, error: unknown) => void;

class DownloadManager {
  private downloads = new Map<string, DownloadEntry>();
  private onProgressCb: ProgressCallback | null = null;
  private onCompleteCb: CompleteCallback | null = null;
  private onErrorCb: ErrorCallback | null = null;
  private modelLookup: ((id: string) => {downloadUrl?: string; fullPath?: string} | undefined) | null = null;

  setModelLookup(lookup: (id: string) => {downloadUrl?: string; fullPath?: string} | undefined) {
    this.modelLookup = lookup;
  }

  setCallbacks(callbacks: {
    onProgress?: ProgressCallback;
    onComplete?: CompleteCallback;
    onError?: ErrorCallback;
  }) {
    this.onProgressCb = callbacks.onProgress || null;
    this.onCompleteCb = callbacks.onComplete || null;
    this.onErrorCb = callbacks.onError || null;
  }

  isDownloading(modelId: string): boolean {
    const entry = this.downloads.get(modelId);
    return entry?.isDownloading ?? false;
  }

  getProgress(modelId: string): number {
    return this.downloads.get(modelId)?.progress ?? 0;
  }

  async startDownload(
    model: Model,
    destination: string,
    authToken: string | null = null,
    callbacks?: {
      onProgress?: (id: string, p: DownloadProgress) => void;
      onComplete?: (id: string) => Promise<void>;
      onError?: (id: string, error: unknown) => void;
    },
  ): Promise<void> {
    const url = model.downloadUrl;
    if (!url) throw new Error('Model has no download URL');

    const existing = this.downloads.get(model.id);
    if (existing?.isDownloading) {
      throw new Error('Download already in progress');
    }

    const entry: DownloadEntry = {
      modelId: model.id,
      url,
      destination,
      progress: 0,
      isDownloading: true,
      isComplete: false,
      error: null,
      startTime: Date.now(),
      lastProgressDate: Date.now(),
      lastBytesWritten: 0,
    };
    this.downloads.set(model.id, entry);

    const headers: Record<string, string> = {};
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    try {
      const job = RNFS.downloadFile({
        fromUrl: url,
        toFile: destination,
        headers,
        begin: () => {
          entry.lastBytesWritten = 0;
          entry.lastProgressDate = Date.now();
        },
        progress: res => {
          const now = Date.now();
          const elapsed = (now - entry.lastProgressDate) / 1000;
          const bytesDelta = res.bytesWritten - entry.lastBytesWritten;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;

          entry.progress = res.contentLength > 0
            ? Math.round((res.bytesWritten / res.contentLength) * 100)
            : 0;
          entry.lastBytesWritten = res.bytesWritten;
          entry.lastProgressDate = now;

          const progressData: DownloadProgress = {
            progress: entry.progress,
            bytesWritten: res.bytesWritten,
            contentLength: res.contentLength,
            speed: formatSpeed(speed),
            eta: formatETA(res.contentLength - res.bytesWritten, speed),
          };

          callbacks?.onProgress?.(model.id, progressData);
          this.onProgressCb?.(model.id, progressData);
        },
      });

      entry.jobId = job.jobId;

      const result = await job.promise;
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(`Download failed with status ${result.statusCode}`);
      }

      entry.isDownloading = false;
      entry.isComplete = true;
      entry.progress = 100;
      await callbacks?.onComplete?.(model.id);
      this.onCompleteCb?.(model.id);
    } catch (error) {
      entry.isDownloading = false;
      entry.error = error instanceof Error ? error.message : String(error);
      callbacks?.onError?.(model.id, error);
      this.onErrorCb?.(model.id, error);
      throw error;
    }
  }

  async cancelDownload(modelId: string): Promise<void> {
    const entry = this.downloads.get(modelId);
    if (!entry?.isDownloading) return;

    if (entry.jobId !== undefined) {
      try {
        await RNFS.stopDownload(entry.jobId);
      } catch {
      }
    }

    entry.isDownloading = false;
    entry.error = 'Cancelled by user';
  }

  async syncWithActiveDownloads(models: Array<{id: string; isDownloaded: boolean; progress: number}>): Promise<void> {
    for (const model of models) {
      if (model.isDownloaded) {
        this.downloads.delete(model.id);
      } else if (model.progress > 0 && model.progress < 100) {
        const existing = this.downloads.get(model.id);
        if (!existing) {
          const storedModel = this.findModelById(model.id);
          this.downloads.set(model.id, {
            modelId: model.id,
            url: storedModel?.downloadUrl || '',
            destination: storedModel?.fullPath || '',
            progress: model.progress,
            isDownloading: false,
            isComplete: false,
            error: null,
            startTime: Date.now(),
            lastProgressDate: Date.now(),
            lastBytesWritten: 0,
          });
        }
      }
    }
  }

  private findModelById(id: string): {downloadUrl?: string; fullPath?: string} | undefined {
    return this.modelLookup?.(id);
  }
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

function formatETA(remainingBytes: number, bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '--';
  const seconds = remainingBytes / bytesPerSecond;
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

export const downloadManager = new DownloadManager();
