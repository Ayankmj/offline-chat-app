import {CompletionParams} from './completionTypes';

export const COMPLETION_SETTINGS_VERSION = 2;

export const defaultCompletionParams: CompletionParams = {
  n_predict: 2048,
  temperature: 0.7,
  top_k: 40,
  top_p: 0.9,
  min_p: 0.05,
  penalty_last_n: 64,
  penalty_repeat: 1.0,
  penalty_freq: 0.0,
  penalty_present: 0.0,
  enable_thinking: false,
};

export function migrateCompletionSettings(
  settings: Partial<CompletionParams> & {version?: number},
): CompletionParams {
  const version = settings.version || 1;

  let migrated = {...defaultCompletionParams, ...settings};

  if (version < 2) {
    // v2: added min_p, enable_thinking
    migrated = {
      ...migrated,
      min_p: settings.min_p ?? 0.05,
      enable_thinking: settings.enable_thinking ?? false,
    };
  }

  migrated.version = COMPLETION_SETTINGS_VERSION;
  return migrated as CompletionParams;
}
