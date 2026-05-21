import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

export interface DeviceMemoryInfo {
  totalMemory: number;
  availableMemory: number;
  memoryThreshold: number;
  isLowMemory: boolean;
}

export interface DeviceCapabilityInfo {
  isHighEnd: boolean;
  cpuCores: number;
  recommendedThreads: number;
  maxGpuLayers: number;
  supportsFlashAttention: boolean;
}

let cachedMemoryInfo: DeviceMemoryInfo | null = null;
let cachedCapabilityInfo: DeviceCapabilityInfo | null = null;

const LOW_MEMORY_THRESHOLD = 2 * 1e9; // 2GB
const MID_MEMORY_THRESHOLD = 4 * 1e9; // 4GB
const HIGH_MEMORY_THRESHOLD = 8 * 1e9; // 8GB

export async function getDeviceMemoryInfo(): Promise<DeviceMemoryInfo> {
  if (cachedMemoryInfo) return cachedMemoryInfo;

  try {
    const totalMemory = await DeviceInfo.getTotalMemory();
    const usedMemory = await DeviceInfo.getUsedMemory();
    const availableMemory = totalMemory - usedMemory;

    cachedMemoryInfo = {
      totalMemory,
      availableMemory,
      memoryThreshold: LOW_MEMORY_THRESHOLD,
      isLowMemory: totalMemory < LOW_MEMORY_THRESHOLD,
    };
  } catch (error) {
    console.warn('[DeviceCapabilities] Failed to get memory info:', error);
    cachedMemoryInfo = {
      totalMemory: 4 * 1e9,
      availableMemory: 2 * 1e9,
      memoryThreshold: LOW_MEMORY_THRESHOLD,
      isLowMemory: false,
    };
  }

  return cachedMemoryInfo;
}

export async function getDeviceCapabilityInfo(): Promise<DeviceCapabilityInfo> {
  if (cachedCapabilityInfo) return cachedCapabilityInfo;

  try {
    const totalMemory = await DeviceInfo.getTotalMemory();
    const cpuCores = await getCpuCoreCount();
    const isHighEnd = totalMemory >= HIGH_MEMORY_THRESHOLD;

    const recommendedThreads = Math.max(2, Math.min(cpuCores, 4));
    const maxGpuLayers = isHighEnd ? 99 : totalMemory >= MID_MEMORY_THRESHOLD ? 50 : 20;
    const supportsFlashAttention = Platform.OS === 'ios' || totalMemory >= MID_MEMORY_THRESHOLD;

    cachedCapabilityInfo = {
      isHighEnd,
      cpuCores,
      recommendedThreads,
      maxGpuLayers,
      supportsFlashAttention,
    };
  } catch (error) {
    console.warn('[DeviceCapabilities] Failed to get capability info:', error);
    cachedCapabilityInfo = {
      isHighEnd: false,
      cpuCores: 4,
      recommendedThreads: 4,
      maxGpuLayers: 50,
      supportsFlashAttention: false,
    };
  }

  return cachedCapabilityInfo;
}

export async function getCpuCoreCount(): Promise<number> {
  try {
    // DeviceInfo doesn't have getCpuProcessorCount in all versions
    // Use getTotalMemory as a proxy for device capability
    const totalMemory = await DeviceInfo.getTotalMemory();
    // Estimate cores based on memory (rough heuristic)
    if (totalMemory >= 8e9) return 8;
    if (totalMemory >= 6e9) return 6;
    if (totalMemory >= 4e9) return 4;
    return 2;
  } catch {
    return 4;
  }
}

export async function getRecommendedThreadCount(): Promise<number> {
  const cores = await getCpuCoreCount();
  return Math.max(2, Math.min(cores, 4));
}

export async function isHighEndDevice(): Promise<boolean> {
  const info = await getDeviceCapabilityInfo();
  return info.isHighEnd;
}

export async function hasEnoughMemory(
  modelSizeBytes: number,
  projectionSizeBytes: number = 0,
): Promise<boolean> {
  const memoryInfo = await getDeviceMemoryInfo();
  const totalNeeded = modelSizeBytes + projectionSizeBytes;
  const availableWithBuffer = memoryInfo.availableMemory * 0.7;
  return totalNeeded <= availableWithBuffer;
}

export function clearDeviceCache(): void {
  cachedMemoryInfo = null;
  cachedCapabilityInfo = null;
}
