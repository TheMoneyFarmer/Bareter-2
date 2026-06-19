import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bareter.app',
  appName: 'Bareter',
  webDir: 'dist/public',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,      // hide manually after app is ready
      backgroundColor: '#136c68', // brand teal
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#136c68', // brand teal
      style: 'LIGHT',             // light (white) icons on dark teal
      overlaysWebView: false,     // push content below status bar, not underneath
    },
  },
};

export default config;
