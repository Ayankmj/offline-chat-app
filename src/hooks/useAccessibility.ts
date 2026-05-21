import {useState, useEffect, useMemo, useCallback} from 'react';
import {AccessibilityInfo} from 'react-native';

export interface AccessibilityConfig {
  label: string;
  hint?: string;
  role?: string;
  state?: Record<string, boolean>;
  actions?: Record<string, () => void>;
}

export function useAccessibility(config: AccessibilityConfig) {
  const actionsKey = useMemo(() => {
    return config.actions
      ? JSON.stringify(Object.keys(config.actions).sort())
      : '';
  }, [config.actions]);
  const stateKey = useMemo(() => {
    return config.state ? JSON.stringify(config.state) : '';
  }, [config.state]);

  const accessibilityProps = useMemo(() => {
    const props: Record<string, unknown> = {
      accessible: true,
      accessibilityLabel: config.label,
      accessibilityRole: config.role || 'text',
    };

    if (config.hint) {
      props.accessibilityHint = config.hint;
    }

    if (config.state) {
      const state: Record<string, boolean> = {};
      if (config.state.selected !== undefined) {
        state.selected = config.state.selected;
      }
      if (config.state.disabled !== undefined) {
        state.disabled = config.state.disabled;
      }
      if (Object.keys(state).length > 0) {
        props.accessibilityState = state;
      }
    }

    if (config.actions) {
      props.accessibilityActions = Object.keys(config.actions).map(name => ({name}));
      props.onAccessibilityAction = (event: any) => {
        const action = config.actions?.[event.nativeEvent.actionName];
        if (action) {
          action();
        }
      };
    }

    return props;
  }, [config.label, config.hint, config.role, stateKey, actionsKey]);

  return accessibilityProps;
}

export function useScreenReaderStatus() {
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);

  useEffect(() => {
    const initialState = async () => {
      const isEnabled = await AccessibilityInfo.isScreenReaderEnabled();
      setScreenReaderEnabled(isEnabled);
    };

    initialState();

    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (isEnabled) => {
        setScreenReaderEnabled(isEnabled);
      },
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return {screenReaderEnabled};
}

export function useAnnounce() {
  return useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
}
