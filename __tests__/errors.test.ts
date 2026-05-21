import {createErrorState, isCriticalError, isRecoverableError, ErrorState} from '../src/utils/errors';

describe('createErrorState', () => {
  it('should create error state from Error object', () => {
    const error = new Error('Test error message');
    const errorState = createErrorState(error, 'chat', 'error');

    expect(errorState.message).toBe('Test error message');
    expect(errorState.source).toBe('chat');
    expect(errorState.severity).toBe('error');
    expect(errorState.recoverable).toBe(true);
    expect(errorState.id).toBeDefined();
    expect(errorState.timestamp).toBeDefined();
  });

  it('should create error state from string', () => {
    const errorState = createErrorState('String error', 'download', 'warning');

    expect(errorState.message).toBe('String error');
    expect(errorState.source).toBe('download');
    expect(errorState.severity).toBe('warning');
  });

  it('should include context when provided', () => {
    const context = {modelId: 'test-model', retryCount: 3};
    const errorState = createErrorState(new Error('Test'), 'model', 'error', context);

    expect(errorState.context).toEqual(context);
  });

  it('should set recoverable flag based on severity', () => {
    const errorError = createErrorState(new Error('Error'), 'chat', 'error');
    const warningError = createErrorState(new Error('Warning'), 'chat', 'warning');
    const criticalError = createErrorState(new Error('Critical'), 'system', 'critical');

    expect(errorError.recoverable).toBe(true);
    expect(warningError.recoverable).toBe(true);
    expect(criticalError.recoverable).toBe(false);
  });

  it('should handle unknown error types', () => {
    const errorState = createErrorState(null, 'network', 'error');

    expect(errorState.message).toBe('null');
    expect(errorState.source).toBe('network');
  });

  it('should generate unique IDs', () => {
    const error1 = createErrorState(new Error('Error 1'), 'chat');
    const error2 = createErrorState(new Error('Error 2'), 'chat');

    expect(error1.id).not.toBe(error2.id);
  });
});

describe('isCriticalError', () => {
  it('should return true for critical errors', () => {
    const criticalError = createErrorState(new Error('Critical'), 'system', 'critical');
    expect(isCriticalError(criticalError)).toBe(true);
  });

  it('should return false for non-critical errors', () => {
    const error = createErrorState(new Error('Error'), 'chat', 'error');
    expect(isCriticalError(error)).toBe(false);
  });
});

describe('isRecoverableError', () => {
  it('should return true for recoverable errors', () => {
    const error = createErrorState(new Error('Error'), 'chat', 'error');
    expect(isRecoverableError(error)).toBe(true);
  });

  it('should return false for critical errors', () => {
    const criticalError = createErrorState(new Error('Critical'), 'system', 'critical');
    expect(isRecoverableError(criticalError)).toBe(false);
  });
});
