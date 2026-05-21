jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

import {i18nService} from '../src/services/I18nService';

describe('I18nService', () => {
  beforeEach(() => {
    i18nService.setLanguage('en');
  });

  it('should return English translations by default', () => {
    expect(i18nService.t('common.loading')).toBe('Loading...');
    expect(i18nService.t('chat.typeMessage')).toBe('Type a message...');
  });

  it('should return Bengali translations when language is set to bn', () => {
    i18nService.setLanguage('bn');
    expect(i18nService.t('common.loading')).toBe('লোড হচ্ছে...');
    expect(i18nService.t('chat.typeMessage')).toBe('একটি বার্তা লিখুন...');
  });

  it('should fallback to English when key is missing in current language', () => {
    i18nService.setLanguage('bn');
    const result = i18nService.t('non.existent.key');
    expect(result).toBe('non.existent.key');
  });

  it('should return available languages', () => {
    const languages = i18nService.getAvailableLanguages();
    expect(languages).toHaveLength(2);
    expect(languages).toContainEqual({code: 'en', name: 'English'});
    expect(languages).toContainEqual({code: 'bn', name: 'বাংলা (Bengali)'});
  });

  it('should return current language name', () => {
    i18nService.setLanguage('en');
    expect(i18nService.getCurrentLanguageName()).toBe('English');

    i18nService.setLanguage('bn');
    expect(i18nService.getCurrentLanguageName()).toBe('বাংলা (Bengali)');
  });
});
