import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell for Android/iOS. The web build (dist-native) is bundled INSIDE the app — it works
 * offline and loads instantly; only data sync and AI go over the network.
 * Same package id + signing key as the earlier FORGE APK, so it installs as an update.
 */
const config: CapacitorConfig = {
  appId: 'app.forge.fitness',
  appName: 'FORGE',
  webDir: 'dist-native',
  backgroundColor: '#0E0D0C',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: 'never', backgroundColor: '#0E0D0C' },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#0E0D0C', showSpinner: false },
    StatusBar: { overlaysWebView: false, backgroundColor: '#0E0D0C', style: 'DARK' },
  },
}

export default config
