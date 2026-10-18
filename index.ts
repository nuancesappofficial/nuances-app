import React from 'react';
import 'react-native-gesture-handler';
import './src/polyfills/webCrypto';
import { registerRootComponent } from 'expo';
import { installDiagnosticsLogger } from './src/services/logging/diagnosticsLog';
import GlobalErrorBoundary from './src/components/UI/shared/GlobalErrorBoundary';

import App from './App';

installDiagnosticsLogger();

function RootApp() {
  return React.createElement(GlobalErrorBoundary, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => RootApp);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootApp);
