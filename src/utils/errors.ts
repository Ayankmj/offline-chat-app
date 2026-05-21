export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorSource = 'model' | 'download' | 'chat' | 'network' | 'storage' | 'system';

export interface ErrorState {
  id: string;
  message: string;
  severity: ErrorSeverity;
  source: ErrorSource;
  timestamp: number;
  context?: Record<string, unknown>;
  recoverable: boolean;
  retryAction?: () => Promise<void>;
}

export function createErrorState(
  error: unknown,
  source: ErrorSource,
  severity: ErrorSeverity = 'error',
  context?: Record<string, unknown>,
): ErrorState {
  const message = error instanceof Error ? error.message : String(error);
  const recoverable = severity !== 'critical';

  return {
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    message,
    severity,
    source,
    timestamp: Date.now(),
    context,
    recoverable,
  };
}

export function isCriticalError(error: ErrorState): boolean {
  return error.severity === 'critical';
}

export function isRecoverableError(error: ErrorState): boolean {
  return error.recoverable;
}
