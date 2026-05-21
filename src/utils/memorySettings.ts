import {Platform} from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

export async function resolveUseMmap(
  setting: 'true' | 'false' | 'smart',
  modelPath: string,
): Promise<boolean> {
  if (setting === 'true') return true;
  if (setting === 'false') return false;

  // Smart: disable mmap for very large models on Android (avoids OOM)
  // and for models on external storage
  if (setting === 'smart') {
    try {
      const stat = await RNFS.stat(modelPath);
      const fileSize = stat.size;

      // Disable mmap for models > 3GB on Android
      if (Platform.OS === 'android' && fileSize > 3 * 1e9) {
        return false;
      }

      // Disable mmap for models on external/SD storage
      if (modelPath.includes('/storage/') || modelPath.includes('/sdcard/')) {
        return false;
      }

      return true;
    } catch {
      return true;
    }
  }

  return true;
}
