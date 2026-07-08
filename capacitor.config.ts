import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bareter.app',
  appName: 'Bareter',
  webDir: 'dist/public',
  server: {
    url: 'https://bareter.com',
    cleartext: false,
    allowNavigation: [
      'bareter.com',
      'accounts.google.com',
      'appleid.apple.com',
      '*.didit.me',
    ],
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '990746727496-sbb7kjiht73pi1needi9e6vd1vjsku40.apps.googleusercontent.com',
      iosClientId: '990746727496-blj1mvk3i39on7d1t88cbgpos11995dp.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,      // hide manually after auth resolves
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
