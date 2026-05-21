import {makeAutoObservable, runInAction} from 'mobx';
import {makePersistable} from 'mobx-persist-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {en, TranslationKeys} from '../locales/en';
import {bn} from '../locales/bn';

export type Language = 'en' | 'bn';

const translations: Record<Language, TranslationKeys> = {
  en,
  bn,
};

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const result = path.split('.').reduce<Record<string, unknown> | string | undefined>(
    (acc, part) => {
      if (acc && typeof acc === 'object' && acc !== null && part in acc) {
        return acc[part] as Record<string, unknown> | string | undefined;
      }
      return undefined;
    },
    obj,
  );
  return typeof result === 'string' ? result : path;
}

class I18nService {
  language: Language = 'en';
  fallbackLanguage: Language = 'en';

  constructor() {
    makeAutoObservable(this);
    makePersistable(this, {
      name: 'I18nService',
      properties: ['language'],
      storage: AsyncStorage,
    });
  }

  setLanguage(lang: Language) {
    runInAction(() => {
      this.language = lang;
    });
  }

  t(key: string, params?: Record<string, string>): string {
    let text = getNestedValue(translations[this.language], key);

    if (text === key && this.language !== this.fallbackLanguage) {
      text = getNestedValue(translations[this.fallbackLanguage], key);
    }

    if (params) {
      for (const [paramKey, value] of Object.entries(params)) {
        const escapedKey = escapeRegExp(paramKey);
        text = text.replace(new RegExp(`\\{${escapedKey}\\}`, 'g'), value);
      }
    }

    return text;
  }

  getAvailableLanguages(): {code: Language; name: string}[] {
    return [
      {code: 'en', name: 'English'},
      {code: 'bn', name: 'বাংলা (Bengali)'},
    ];
  }

  getCurrentLanguageName(): string {
    return this.getAvailableLanguages().find(l => l.code === this.language)?.name || 'English';
  }
}

export const i18nService = new I18nService();
