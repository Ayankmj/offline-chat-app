import * as Sentry from '@sentry/react-native';

export interface SentryConfig {
  dsn: string;
  environment: 'development' | 'staging' | 'production';
  enabled: boolean;
  tracesSampleRate?: number;
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
}

const DEFAULT_CONFIG: SentryConfig = {
  dsn: '',
  environment: 'development',
  enabled: false,
  tracesSampleRate: 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
};

class SentryService {
  private config: SentryConfig | null = null;
  private isInitialized = false;

  async initialize(config: Partial<SentryConfig> = {}): Promise<void> {
    if (this.isInitialized) return;

    const finalConfig = {...DEFAULT_CONFIG, ...config};

    if (!finalConfig.dsn || !finalConfig.enabled) {
      console.log('[Sentry] Disabled - no DSN or explicitly disabled');
      return;
    }

    this.config = finalConfig;

    try {
      Sentry.init({
        dsn: finalConfig.dsn,
        environment: finalConfig.environment,
        tracesSampleRate: finalConfig.tracesSampleRate,
        debug: finalConfig.environment === 'development',
        enableAutoSessionTracking: true,
        enableAppHangTracking: true,
        enableNative: true,
        enableNdk: true,
        beforeSend: (event: any) => {
          return this.filterSensitiveData(event);
        },
        beforeBreadcrumb: (breadcrumb: Sentry.Breadcrumb) => {
          return this.filterBreadcrumb(breadcrumb);
        },
      });

      this.isInitialized = true;
      console.log('[Sentry] Initialized successfully');
    } catch (error) {
      console.error('[Sentry] Failed to initialize:', error);
    }
  }

  captureException(error: unknown, context?: Record<string, unknown>): string | undefined {
    if (!this.isInitialized) {
      console.error('[Sentry] Not initialized, cannot capture exception');
      return undefined;
    }

    return Sentry.captureException(error, {
      captureContext: {
        contexts: {
          runtime: {
            ...context,
          },
        },
      },
    });
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): string | undefined {
    if (!this.isInitialized) {
      console.error('[Sentry] Not initialized, cannot capture message');
      return undefined;
    }

    return Sentry.captureMessage(message, level);
  }

  addBreadcrumb(breadcrumb: Sentry.Breadcrumb): void {
    if (!this.isInitialized) return;

    Sentry.addBreadcrumb(breadcrumb);
  }

  setUser(user: Sentry.User | null): void {
    if (!this.isInitialized) return;

    Sentry.setUser(user);
  }

  setTag(key: string, value: string): void {
    if (!this.isInitialized) return;

    Sentry.setTag(key, value);
  }

  setContext(key: string, context: Record<string, unknown>): void {
    if (!this.isInitialized) return;

    Sentry.setContext(key, context);
  }

  isEnabled(): boolean {
    return this.isInitialized;
  }

  private filterSensitiveData(event: any): any {
    if (!event.request?.url) {
      return event;
    }

    const sensitivePatterns = [
      /token/i,
      /password/i,
      /secret/i,
      /api[_-]?key/i,
      /authorization/i,
    ];

    const url = event.request.url;
    if (sensitivePatterns.some(pattern => pattern.test(url))) {
      event.request.url = '[REDACTED]';
    }

    if (event.user?.email) {
      event.user.email = this.maskEmail(event.user.email);
    }

    return event;
  }

  private filterBreadcrumb(
    breadcrumb: Sentry.Breadcrumb,
  ): Sentry.Breadcrumb | null {
    if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
      const url = breadcrumb.data.url as string;
      const sensitivePatterns = [
        /token/i,
        /password/i,
        /secret/i,
        /api[_-]?key/i,
        /authorization/i,
      ];

      if (sensitivePatterns.some(pattern => pattern.test(url))) {
        breadcrumb.data.url = '[REDACTED]';
      }
    }

    return breadcrumb;
  }

  private maskEmail(email: string): string {
    try {
      const domain = email.split('@')[1];
      const username = email.split('@')[0];
      return `${username.slice(0, 3)}***@${domain}`;
    } catch {
      return '[REDACTED]';
    }
  }
}

export const sentryService = new SentryService();
