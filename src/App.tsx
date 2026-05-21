import React, {useEffect} from 'react';
import {StatusBar} from 'react-native';
import {NavigationContainer, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createDrawerNavigator} from '@react-navigation/drawer';
import {PaperProvider, MD3LightTheme} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {KeyboardProvider} from 'react-native-keyboard-controller';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import ChatScreen from './screens/ChatScreen';
import ModelsScreen from './screens/ModelsScreen';
import SettingsScreen from './screens/SettingsScreen';
import SidebarContent from './components/SidebarContent';
import {ErrorBoundary} from './components/ErrorBoundary/ErrorBoundary';
import {hfTokenStore} from './store/HfTokenStore';
import {modelStore} from './store/ModelStore';
import {sentryService} from './services/SentryService';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

// ── Paper theme — light, aligned with DeepSeek white UI ───
const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#4f8ef7',
    onPrimary: '#ffffff',
    primaryContainer: '#e8f0fe',
    onPrimaryContainer: '#1a3a6e',
    secondary: '#6b8ef7',
    onSecondary: '#ffffff',
    secondaryContainer: '#f0f5ff',
    surface: '#ffffff',
    onSurface: '#111111',
    onSurfaceVariant: '#555555',
    surfaceVariant: '#f7f7f8',
    outline: '#e0e0e0',
    background: '#ffffff',
    error: '#ef4444',
    onError: '#ffffff',
  },
};

// ── Navigation theme — Light (matching DeepSeek) ───────────
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#4f8ef7',
    background: '#fff',
    card: '#fff',
    text: '#111',
    border: '#f0f0f0',
    notification: '#4f8ef7',
  },
};

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={props => <SidebarContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: {
          backgroundColor: '#f7f7f8',
          width: 300,
          borderRightWidth: 1,
          borderRightColor: '#e8e8e8',
        },
        drawerActiveTintColor: '#111',
        drawerInactiveTintColor: '#555',
        drawerActiveBackgroundColor: '#ebebeb',
        drawerItemStyle: {borderRadius: 8, marginHorizontal: 8},
        drawerLabelStyle: {fontWeight: '500', fontSize: 14},
        swipeEdgeWidth: 60,
      }}>
      <Drawer.Screen name="Chat" component={ChatScreen} />
    </Drawer.Navigator>
  );
}

function App() {
  useEffect(() => {
    const initApp = async () => {
      hfTokenStore.load();

      await sentryService.initialize({
        dsn: __DEV__ ? '' : process.env.SENTRY_DSN || '',
        environment: __DEV__ ? 'development' : 'production',
        enabled: !__DEV__ && !!process.env.SENTRY_DSN,
        tracesSampleRate: 0.2,
      });

      sentryService.setTag('app_version', '0.1.0');
      sentryService.setTag('platform', 'react-native');
    };

    initApp();

    return () => {
      modelStore.dispose();
      modelStore.releaseContext(true).catch(() => {});
    };
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{flex: 1, backgroundColor: '#fff'}}>
        <SafeAreaProvider>
          <KeyboardProvider statusBarTranslucent>
            <PaperProvider theme={paperTheme}>
              <StatusBar
                barStyle="dark-content"
                backgroundColor="#fff"
                translucent={false}
              />
              <NavigationContainer theme={navTheme}>
                <Stack.Navigator
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    animationDuration: 220,
                    contentStyle: {backgroundColor: '#fff'},
                  }}>
                  <Stack.Screen name="Main" component={MainDrawer} />
                  <Stack.Screen name="Models" component={ModelsScreen} />
                  <Stack.Screen name="Settings" component={SettingsScreen} />
                </Stack.Navigator>
              </NavigationContainer>
            </PaperProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default App;
