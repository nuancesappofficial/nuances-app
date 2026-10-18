import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

type GlobalErrorDetails = {
  error: Error;
  errorInfo?: ErrorInfo | null;
  isFatal?: boolean;
  source?: 'react_error_boundary' | 'global_handler' | 'unhandled_rejection';
  timestamp: string;
};

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  errorDetails: GlobalErrorDetails | null;
  copied: boolean;
};

// Singleton listener so non-React errors (ErrorUtils, unhandledrejection) can trigger this UI
let globalErrorListener: ((details: GlobalErrorDetails) => void) | null = null;

export function reportFatalDiagnosticError(
  error: unknown,
  source: 'react_error_boundary' | 'global_handler' | 'unhandled_rejection' = 'global_handler',
  isFatal = true
): void {
  const normalizedError =
    error instanceof Error
      ? error
      : new Error(typeof error === 'string' ? error : JSON.stringify(error));

  const details: GlobalErrorDetails = {
    error: normalizedError,
    source,
    isFatal,
    timestamp: new Date().toISOString(),
  };

  if (globalErrorListener) {
    globalErrorListener(details);
  }
}

export class GlobalErrorBoundary extends Component<Props, State> {
  private originalGlobalHandler: ((error: Error, isFatal?: boolean) => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorDetails: null,
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      errorDetails: {
        error,
        source: 'react_error_boundary',
        isFatal: true,
        timestamp: new Date().toISOString(),
      },
      copied: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[GlobalErrorBoundary] Caught React component tree crash:', error, errorInfo);
    this.setState((prev) => ({
      hasError: true,
      errorDetails: {
        ...(prev.errorDetails || {
          error,
          source: 'react_error_boundary',
          isFatal: true,
          timestamp: new Date().toISOString(),
        }),
        errorInfo,
      },
    }));
  }

  componentDidMount(): void {
    // Register singleton listener
    globalErrorListener = (details: GlobalErrorDetails) => {
      this.setState({
        hasError: true,
        errorDetails: details,
        copied: false,
      });
    };

    // Install global ErrorUtils handler interception
    const runtimeGlobal = globalThis as typeof globalThis & {
      ErrorUtils?: {
        getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
        setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
      };
      addEventListener?: (type: string, listener: (event: unknown) => void) => void;
    };

    if (runtimeGlobal.ErrorUtils?.setGlobalHandler) {
      this.originalGlobalHandler = runtimeGlobal.ErrorUtils.getGlobalHandler?.() ?? null;
      runtimeGlobal.ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        console.error('[GlobalErrorBoundary] Intercepted ErrorUtils error:', error, 'isFatal:', isFatal);
        reportFatalDiagnosticError(error, 'global_handler', Boolean(isFatal));
        // Note: We do NOT call this.originalGlobalHandler(error, true) because in release builds
        // React Native's default handler kills the process immediately before rendering the overlay.
      });
    }

    // Install unhandledrejection listener
    if (runtimeGlobal.addEventListener) {
      runtimeGlobal.addEventListener('unhandledrejection', (event: unknown) => {
        const reason = (event as { reason?: unknown })?.reason ?? event;
        console.error('[GlobalErrorBoundary] Intercepted unhandled promise rejection:', reason);
        reportFatalDiagnosticError(reason, 'unhandled_rejection', false);
      });
    }
  }

  componentWillUnmount(): void {
    if (globalErrorListener) {
      globalErrorListener = null;
    }
  }

  private handleCopy = async (): Promise<void> => {
    const { errorDetails } = this.state;
    if (!errorDetails) return;

    const payload = [
      '=== Nuances Crash Diagnostics ===',
      `Time: ${errorDetails.timestamp}`,
      `Platform: ${Platform.OS} (v${Platform.Version})`,
      `Source: ${errorDetails.source}`,
      `Fatal: ${Boolean(errorDetails.isFatal)}`,
      `Error Name: ${errorDetails.error.name}`,
      `Error Message: ${errorDetails.error.message}`,
      '\n--- Stack Trace ---',
      errorDetails.error.stack || 'No stack trace available',
      errorDetails.errorInfo?.componentStack
        ? `\n--- Component Stack ---\n${errorDetails.errorInfo.componentStack}`
        : '',
    ].join('\n');

    try {
      await Clipboard.setStringAsync(payload);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 3000);
    } catch (e) {
      console.warn('Failed to copy to clipboard', e);
    }
  };

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      errorDetails: null,
      copied: false,
    });
  };

  render(): ReactNode {
    const { hasError, errorDetails, copied } = this.state;

    if (!hasError || !errorDetails) {
      return this.props.children;
    }

    const { error, errorInfo, source, timestamp } = errorDetails;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1A0000" />
        <View style={styles.header}>
          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>FATAL CRASH INTERCEPTED</Text>
          </View>
          <Text style={styles.headerTitle}>Startup Error Diagnostic</Text>
          <Text style={styles.headerSubtitle}>
            This overlay caught a release-build crash. Please copy the stack trace and share it
            with developers.
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Source: <Text style={styles.metaValue}>{source}</Text></Text>
          <Text style={styles.metaLabel}>Time: <Text style={styles.metaValue}>{timestamp.slice(11, 19)}</Text></Text>
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Error Message</Text>
          <View style={styles.messageBox}>
            <Text style={styles.messageText}>
              {error.name ? `${error.name}: ` : ''}{error.message || 'Unknown error'}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Stack Trace</Text>
          <View style={styles.codeBox}>
            <Text selectable style={styles.codeText}>
              {error.stack || 'No stack trace available'}
            </Text>
          </View>

          {errorInfo?.componentStack ? (
            <>
              <Text style={styles.sectionTitle}>Component Stack</Text>
              <View style={styles.codeBox}>
                <Text selectable style={styles.codeText}>
                  {errorInfo.componentStack.trim()}
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.actionFooter}>
          <TouchableOpacity
            style={[styles.actionButton, styles.copyButton, copied && styles.copiedButton]}
            onPress={this.handleCopy}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {copied ? '✓ Copied to Clipboard' : '📋 Copy Stack Trace'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.retryButton]}
            onPress={this.handleRetry}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>🔄 Retry / Continue</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0404',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3A1414',
  },
  badgeContainer: {
    alignSelf: 'flex-start',
    backgroundColor: '#E53935',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: '#FFCDD2',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: '#EF9A9A',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#200A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#3A1414',
  },
  metaLabel: {
    color: '#B0BEC5',
    fontSize: 11,
  },
  metaValue: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  sectionTitle: {
    color: '#FF8A80',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 6,
  },
  messageBox: {
    backgroundColor: '#2B0E0E',
    borderColor: '#D32F2F',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  messageText: {
    color: '#FFEBEE',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: '#1C1C1C',
    borderColor: '#424242',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  codeText: {
    color: '#ECEFF1',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  actionFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#3A1414',
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#140606',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButton: {
    backgroundColor: '#C62828',
  },
  copiedButton: {
    backgroundColor: '#2E7D32',
  },
  retryButton: {
    backgroundColor: '#37474F',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default GlobalErrorBoundary;
