import AsyncStorage from '@react-native-async-storage/async-storage';

const HF_TOKEN_KEY = 'hf_access_token';

class HfTokenStore {
  private token: string | null = null;

  async load(): Promise<void> {
    try {
      this.token = await AsyncStorage.getItem(HF_TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  async setToken(token: string | null): Promise<void> {
    // Treat empty string same as null — clear the token
    const normalizedToken = token && token.trim() ? token.trim() : null;
    this.token = normalizedToken;
    try {
      if (normalizedToken) {
        await AsyncStorage.setItem(HF_TOKEN_KEY, normalizedToken);
      } else {
        await AsyncStorage.removeItem(HF_TOKEN_KEY);
      }
    } catch (e) {
      console.error('[HfTokenStore] Failed to persist token:', e);
    }
  }
}

export const hfTokenStore = new HfTokenStore();
