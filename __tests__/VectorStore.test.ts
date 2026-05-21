import {VectorStore} from '../src/utils/VectorStore';

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore();
  });

  it('should add and retrieve records', () => {
    const record = {
      id: 'test-1',
      embedding: [0.1, 0.2, 0.3],
      metadata: {title: 'Test Document'},
    };

    store.add(record);
    expect(store.size()).toBe(1);
    expect(store.getById('test-1')).toEqual(record);
  });

  it('should remove records', () => {
    store.add({
      id: 'test-1',
      embedding: [0.1, 0.2, 0.3],
      metadata: {},
    });

    expect(store.remove('test-1')).toBe(true);
    expect(store.size()).toBe(0);
    expect(store.getById('test-1')).toBeUndefined();
  });

  it('should return false when removing non-existent record', () => {
    expect(store.remove('non-existent')).toBe(false);
  });

  it('should clear all records', () => {
    store.add({id: '1', embedding: [0.1], metadata: {}});
    store.add({id: '2', embedding: [0.2], metadata: {}});

    store.clear();
    expect(store.size()).toBe(0);
  });

  it('should search and return results sorted by similarity', () => {
    const queryEmbedding = new Float32Array([1, 0, 0]);

    store.add({
      id: 'similar',
      embedding: [0.9, 0.1, 0],
      metadata: {title: 'Similar'},
    });

    store.add({
      id: 'dissimilar',
      embedding: [0.1, 0.9, 0],
      metadata: {title: 'Dissimilar'},
    });

    const results = store.search(queryEmbedding, 2);

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('similar');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('should return empty array when searching empty store', () => {
    const queryEmbedding = new Float32Array([1, 0, 0]);
    const results = store.search(queryEmbedding, 5);

    expect(results).toEqual([]);
  });

  it('should respect topK limit', () => {
    for (let i = 0; i < 5; i++) {
      store.add({
        id: `doc-${i}`,
        embedding: [0.1 * i, 0.2 * i, 0.3 * i],
        metadata: {},
      });
    }

    const results = store.search(new Float32Array([1, 1, 1]), 2);
    expect(results.length).toBe(2);
  });

  it('should serialize and deserialize correctly', () => {
    store.add({
      id: 'test-1',
      embedding: [0.1, 0.2, 0.3],
      metadata: {title: 'Test', count: 42},
    });

    const serialized = store.serialize();
    const newStore = new VectorStore();
    newStore.deserialize(serialized);

    expect(newStore.size()).toBe(1);
    expect(newStore.getById('test-1')?.metadata).toEqual({title: 'Test', count: 42});
  });

  it('should handle invalid deserialize data', () => {
    const newStore = new VectorStore();
    newStore.deserialize('invalid json');

    expect(newStore.size()).toBe(0);
  });
});
