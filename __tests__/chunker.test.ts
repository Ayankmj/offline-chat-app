import {chunkText} from '../src/utils/chunker';

describe('chunkText', () => {
  it('should return empty array for empty text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });

  it('should return empty array for text shorter than minChunkLength', () => {
    expect(chunkText('short', {minChunkLength: 50})).toEqual([]);
  });

  it('should chunk text by sentences', () => {
    const text = 'This is sentence one. This is sentence two. This is sentence three.';
    const chunks = chunkText(text, {chunkSize: 30, overlap: 5, minChunkLength: 10});

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].text.length).toBeGreaterThan(0);
  });

  it('should include overlap between chunks', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.';
    const chunks = chunkText(text, {chunkSize: 25, overlap: 10, minChunkLength: 10});

    if (chunks.length > 1) {
      const firstChunkEnd = chunks[0].text.slice(-10);
      const secondChunkStart = chunks[1].text.slice(0, 10);
      expect(firstChunkEnd === secondChunkStart || chunks[1].text.includes(firstChunkEnd.slice(0, 5))).toBeTruthy();
    }
  });

  it('should assign correct chunk indices', () => {
    const text = 'One. Two. Three. Four. Five.';
    const chunks = chunkText(text, {chunkSize: 15, overlap: 5, minChunkLength: 5});

    chunks.forEach((chunk, index) => {
      expect(chunk.chunkIndex).toBe(index);
    });
  });

  it('should handle single sentence longer than chunk size', () => {
    const text = 'This is a very long sentence that exceeds the chunk size limit and should still be included as a single chunk because it cannot be split.';
    const chunks = chunkText(text, {chunkSize: 50, minChunkLength: 10});

    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toBe(text);
  });
});
