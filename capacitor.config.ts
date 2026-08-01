import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bareter.app',
  appName: 'Bareter',
  webDir: 'dist/public',
  server: {
    cleartext: false,
    allowNavigation: [
      'bareter.com',
      'accounts.google.com',
      'appleid.apple.com',
      '*.didit.me',
    ],
  },
  ios: {
    // Enable the native iOS swipe-right-to-go-back gesture.
    // Wouter uses the History API so history.back() is triggered by the gesture
    // and the router responds correctly — no extra JS needed.
    allowsBackForwardNavigationGestures: true,
    // Scroll bounce gives a native feel; content inset is handled by safe-area CSS
    scrollEnabled: true,
    contentInset: 'automatic',
  },
  android: {
    // Hardware back button already fires history.back() via Capacitor's default handler
    allowMixedContent: false,
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
