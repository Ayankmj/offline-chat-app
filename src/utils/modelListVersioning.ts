export const MODEL_LIST_VERSION = 2;

export interface ModelListMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (models: any[]) => any[];
}

export const migrations: ModelListMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (models: any[]) => {
      return models.map(model => ({
        ...model,
        ggufMetadata: model.ggufMetadata || null,
        supportsMultimodal: model.supportsMultimodal || false,
        visionEnabled: model.visionEnabled || false,
        modelType: model.modelType || 'llm',
        compatibleProjectionModels: model.compatibleProjectionModels || undefined,
        defaultProjectionModel: model.defaultProjectionModel || undefined,
        hfModel: model.hfModel || undefined,
        hfModelFile: model.hfModelFile || undefined,
      }));
    },
  },
];

export function migrateModelList(
  models: any[],
  currentVersion: number,
  targetVersion: number = MODEL_LIST_VERSION,
): {models: any[]; version: number} {
  if (currentVersion >= targetVersion) {
    return {models, version: currentVersion};
  }

  let migratedModels = [...models];
  let version = currentVersion;

  while (version < targetVersion) {
    const migration = migrations.find(m => m.fromVersion === version);
    if (!migration) {
      console.warn(`[ModelListVersion] No migration found from version ${version} to ${version + 1}`);
      break;
    }

    migratedModels = migration.migrate(migratedModels);
    version = migration.toVersion;
  }

  return {models: migratedModels, version};
}

export function needsMigration(currentVersion: number): boolean {
  return currentVersion < MODEL_LIST_VERSION;
}

export function getCurrentVersion(): number {
  return MODEL_LIST_VERSION;
}
