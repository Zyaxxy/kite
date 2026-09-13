import '@expo/metro-runtime';
import './src/polyfill';
import './src/web-styles';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
