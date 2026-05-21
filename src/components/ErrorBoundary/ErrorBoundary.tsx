import React, {Component, ErrorInfo, ReactNode} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView} from 'react-native';
import {sentryService} from '../../services/SentryService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {hasError: false, error: null};
  }

  static getDerivedStateFromError(error: Error): State {
    return {hasError: true, error};
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    sentryService.captureException(error, {
      componentStack: errorInfo.componentStack,
      boundary: 'ErrorBoundary',
    });

    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({hasError: false, error: null});
  };

  handleReport = () => {
    if (this.state.error) {
      sentryService.captureException(this.state.error, {
        manualReport: true,
      });
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <ScrollView style={styles.stackScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.stackText} selectable>
                {this.state.error?.stack || ''}
              </Text>
            </ScrollView>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
              {sentryService.isEnabled() && (
                <TouchableOpacity style={styles.buttonSecondary} onPress={this.handleReport} activeOpacity={0.8}>
                  <Text style={styles.buttonTextSecondary}>Report Issue</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24},
  card: {
    backgroundColor: '#f7f7f8',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  title: {fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8},
  message: {fontSize: 14, color: '#555', marginBottom: 16, lineHeight: 20},
  stackScroll: {maxHeight: 200, marginBottom: 16, backgroundColor: '#fff', borderRadius: 8, padding: 8},
  stackText: {fontSize: 11, color: '#888', fontFamily: 'monospace'},
  buttonRow: {flexDirection: 'row', gap: 12},
  button: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {color: '#fff', fontSize: 16, fontWeight: '600'},
  buttonSecondary: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  buttonTextSecondary: {color: '#555', fontSize: 16, fontWeight: '600'},
});
