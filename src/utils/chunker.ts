export interface TextChunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  minChunkLength?: number;
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 150;
const MIN_CHUNK_LENGTH = 50;

export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? DEFAULT_OVERLAP;
  const minChunkLength = options.minChunkLength ?? MIN_CHUNK_LENGTH;

  if (!text || text.length < minChunkLength) {
    return [];
  }

  const chunks: TextChunk[] = [];
  const sentences = splitIntoSentences(text);
  let currentChunk = '';
  let currentStartIndex = 0;
  let chunkIndex = 0;
  let searchPosition = 0;

  for (const sentence of sentences) {
    const sentenceWithSpace = sentence + ' ';

    if (currentChunk.length + sentenceWithSpace.length > chunkSize && currentChunk.length > 0) {
      if (currentChunk.length >= minChunkLength) {
        chunks.push({
          id: `chunk-${chunkIndex}`,
          text: currentChunk.trim(),
          startIndex: currentStartIndex,
          endIndex: currentStartIndex + currentChunk.length,
          chunkIndex,
        });
        chunkIndex++;
      }

      const overlapText = getOverlapText(currentChunk, overlap);
      currentChunk = overlapText + sentenceWithSpace;
      currentStartIndex = chunks.length > 0
        ? chunks[chunks.length - 1].endIndex - overlapText.length
        : currentStartIndex;
    } else {
      if (currentChunk.length === 0) {
        currentStartIndex = text.indexOf(sentence, searchPosition);
        if (currentStartIndex < 0) {
          currentStartIndex = searchPosition;
        }
      }
      currentChunk += sentenceWithSpace;
      searchPosition = currentStartIndex + currentChunk.length;
    }
  }

  if (currentChunk.trim().length >= minChunkLength) {
    chunks.push({
      id: `chunk-${chunkIndex}`,
      text: currentChunk.trim(),
      startIndex: currentStartIndex,
      endIndex: currentStartIndex + currentChunk.length,
      chunkIndex,
    });
  }

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  const sentenceRegex = /[^.!?]+[.!?]*\s*/g;
  const matches = text.match(sentenceRegex);

  if (!matches || matches.length <= 1) {
    return text.length > 0 ? [text] : [];
  }

  return matches.map(s => s.trim()).filter(s => s.length > 0);
}

function getOverlapText(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) {
    return '';
  }

  const tail = text.slice(-overlap);
  const lastSentenceBreak = Math.max(
    tail.lastIndexOf('.'),
    tail.lastIndexOf('!'),
    tail.lastIndexOf('?'),
    tail.lastIndexOf('\n'),
  );

  if (lastSentenceBreak > overlap * 0.3) {
    return tail.slice(lastSentenceBreak + 1).trim() + ' ';
  }

  const lastSpace = tail.lastIndexOf(' ');
  if (lastSpace > overlap * 0.5) {
    return tail.slice(lastSpace + 1);
  }

  return tail.trim() + ' ';
}
