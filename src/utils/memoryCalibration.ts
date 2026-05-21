import {getDeviceMemoryInfo, isHighEndDevice} from './deviceCapabilities';

export interface MemoryCalibrationResult {
  totalMemoryMB: number;
  availableMemoryMB: number;
  recommendedMaxModelMB: number;
  safeContextLength: number;
  gpuLayers: number;
  calibrationTimestamp: number;
}

const MEMORY_SAFETY_FACTOR = 0.6;
const MIN_AVAILABLE_MEMORY_MB = 512;
const CONTEXT_MEMORY_PER_TOKEN_KB = 2;

export async function calibrateMemory(): Promise<MemoryCalibrationResult> {
  const memoryInfo = await getDeviceMemoryInfo();
  const totalMemory = memoryInfo.totalMemory;
  const availableMemory = memoryInfo.availableMemory;

  const totalMemoryMB = Math.round(totalMemory / (1024 * 1024));
  const availableMemoryMB = Math.round(availableMemory / (1024 * 1024));

  const safeMemoryMB = Math.max(
    MIN_AVAILABLE_MEMORY_MB,
    Math.round(availableMemoryMB * MEMORY_SAFETY_FACTOR),
  );

  const recommendedMaxModelMB = Math.round(safeMemoryMB * 0.7);
  const memoryForContextMB = Math.round(safeMemoryMB * 0.3);

  const safeContextLength = Math.min(
    8192,
    Math.floor((memoryForContextMB * 1024) / CONTEXT_MEMORY_PER_TOKEN_KB),
  );

  const isHighEnd = await isHighEndDevice();
  const gpuLayers = isHighEnd ? -1 : Math.max(1, Math.floor(totalMemoryMB / 2048));

  const result: MemoryCalibrationResult = {
    totalMemoryMB,
    availableMemoryMB,
    recommendedMaxModelMB,
    safeContextLength: Math.max(512, safeContextLength),
    gpuLayers,
    calibrationTimestamp: Date.now(),
  };

  return result;
}

export function getMemoryRecommendation(
  modelSizeMB: number,
  ceiling: MemoryCalibrationResult | null,
): {
  canLoad: boolean;
  recommendedContext: number;
  recommendedGpuLayers: number;
  warning?: string;
} {
  if (!ceiling) {
    return {
      canLoad: false,
      recommendedContext: 4096,
      recommendedGpuLayers: -1,
      warning: 'Memory calibration not yet available. Run calibrateMemory() first.',
    };
  }

  const canLoad = modelSizeMB <= ceiling.recommendedMaxModelMB;
  const memoryRatio = modelSizeMB / ceiling.recommendedMaxModelMB;

  let recommendedContext = ceiling.safeContextLength;
  if (memoryRatio > 0.8) {
    recommendedContext = Math.floor(ceiling.safeContextLength * 0.5);
  } else if (memoryRatio > 0.6) {
    recommendedContext = Math.floor(ceiling.safeContextLength * 0.75);
  }

  const recommendedGpuLayers = memoryRatio > 0.7
    ? Math.max(1, Math.floor(ceiling.gpuLayers * 0.5))
    : ceiling.gpuLayers;

  let warning: string | undefined;
  if (!canLoad) {
    warning = `Model size (${modelSizeMB}MB) exceeds recommended maximum (${ceiling.recommendedMaxModelMB}MB). Loading may fail or cause instability.`;
  } else if (memoryRatio > 0.8) {
    warning = `Model is large relative to available memory. Consider reducing context length.`;
  }

  return {
    canLoad,
    recommendedContext: Math.max(512, recommendedContext),
    recommendedGpuLayers,
    warning,
  };
}
