import {ModelFile} from '../types';

const MM_PROJ_REGEX = /[-_.]*mmproj[-_.].+\.gguf$/i;
const QUANT_REGEX = /q\d(?:[_-]k)?(?:[_-][msl])?/i;

export function isProjectionModelFile(filename: string): boolean {
  return MM_PROJ_REGEX.test(filename);
}

export function getProjectionModelFiles(files: ModelFile[] = []): ModelFile[] {
  return files.filter(file => isProjectionModelFile(file.rfilename || ''));
}

export function getPrimaryLlmFile(files: ModelFile[] = []): ModelFile | null {
  const ggufFiles = files.filter(file => file.rfilename?.toLowerCase().endsWith('.gguf'));
  const llmFiles = ggufFiles.filter(file => !isProjectionModelFile(file.rfilename || ''));
  if (llmFiles.length === 0) {
    return null;
  }

  return [...llmFiles].sort((a, b) => (b.size || 0) - (a.size || 0))[0] ?? null;
}

function extractQuantLabel(filename: string): string | null {
  const match = filename.toLowerCase().match(QUANT_REGEX);
  return match?.[0] ?? null;
}

export function getRecommendedProjectionModelFile(
  llmFilename: string,
  projectionFiles: ModelFile[] = [],
): ModelFile | null {
  if (projectionFiles.length === 0) {
    return null;
  }

  if (projectionFiles.length === 1) {
    return projectionFiles[0];
  }

  const llmQuant = extractQuantLabel(llmFilename);
  if (llmQuant) {
    const exactMatch = projectionFiles.find(file =>
      extractQuantLabel(file.rfilename || '') === llmQuant,
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  return [...projectionFiles].sort((a, b) => (b.size || 0) - (a.size || 0))[0] ?? null;
}
