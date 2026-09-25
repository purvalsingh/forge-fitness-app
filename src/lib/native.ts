import { Capacitor } from '@capacitor/core'

/** True inside the installed Android/iOS app (Capacitor), false in a browser. */
export const isNative = Capacitor.isNativePlatform()

/** Native-only wiring: hardware back button, status bar colour, hiding the splash once React has painted. */
export async function initNative() {
  if (!isNative) return
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/status-bar'), import('@capacitor/splash-screen'),
  ])
  App.addListener('backButton', ({ canGoBack }) => {
    // Close an open sheet first, then navigate back, and only exit from the root screen.
    const sheet = document.querySelector('[role="dialog"]')
    if (sheet) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return }
    if (canGoBack && location.pathname !== '/') history.back()
    else void App.exitApp()
  })
  const dark = document.documentElement.dataset.theme !== 'light'
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
  void StatusBar.setBackgroundColor({ color: dark ? '#0E0D0C' : '#F6F2EE' }).catch(() => {})
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}))
}
