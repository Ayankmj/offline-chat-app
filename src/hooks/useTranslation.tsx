import {useMemo} from 'react';
import {useObserver} from 'mobx-react-lite';
import {i18nService, Language} from '../services/I18nService';

export function useTranslation() {
  const language = useObserver(() => i18nService.language);

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string>) => {
      return i18nService.t(key, params);
    };
  }, [language]);

  return {
    t,
    language,
    setLanguage: (lang: Language) => i18nService.setLanguage(lang),
    availableLanguages: i18nService.getAvailableLanguages(),
  };
}

export const TranslationProvider = ({children}: {children: React.ReactNode}) => {
  return <>{children}</>;
};
