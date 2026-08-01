import 'react-native-gesture-handler';
import './src/polyfills/webCrypto';
import { registerRootComponent } from 'expo';
import { installDiagnosticsLogger } from './src/services/logging/diagnosticsLog';

import App from './App';

installDiagnosticsLogger();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
