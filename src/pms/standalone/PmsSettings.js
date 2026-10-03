import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider, createTheme } from '@mui/material/styles'

// STANDALONE ONLY - stands in for Lingsaa_Accounts' SettingsContext + ThemeComponent
// (src/@core/context/settingsContext.js, src/@core/theme/ThemeComponent.js). It uses the SAME
// localStorage key ("settings") and field names, sets the same body class (light-mode / dark-mode)
// and the same CSS variables (--theme-solid / --theme-grad-start / --theme-grad-end), so every PMS
// screen already behaves exactly as it will inside the root app. Not copied at merge time.

const DEFAULTS = {
  mode: 'light',
  colorType: 'gradient',
  customSolidColor: '#7367F0',
  customGradientStart: '#4f46e5',
  customGradientEnd: '#9333ea'
}

// Same presets as the root app's theme customizer.
export const SOLID_PRESETS = [
  { name: 'Template', color: '#7367F0' },
  { name: 'Sky', color: '#00CFE8' },
  { name: 'Green', color: '#28C76F' },
  { name: 'Blue', color: '#3B82F6' },
  { name: 'Harvest', color: '#FF9F43' },
  { name: 'Rose', color: '#EC4899' }
]

export const GRADIENT_PRESETS = [
  { name: 'Template', start: '#4f46e5', end: '#9333ea' },
  { name: 'Sky', start: '#00CFE8', end: '#0EA5E9' },
  { name: 'Green', start: '#336108', end: '#049e49' },
  { name: 'Blue', start: '#3b82f6', end: '#2dd4bf' },
  { name: 'Harvest', start: '#ef4444', end: '#f97316' },
  { name: 'Rose', start: '#8b5cf6', end: '#ec4899' }
]

const readStored = () => {
  try {
    return JSON.parse(window.localStorage.getItem('settings') || '{}') || {}
  } catch {
    return {}
  }
}

const SettingsContext = createContext({ settings: DEFAULTS, saveSettings: () => {} })

export const usePmsSettings = () => useContext(SettingsContext)

export const PmsSettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(DEFAULTS)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    setSettings(prev => ({ ...prev, ...readStored() }))
    setRestored(true)
  }, [])

  const saveSettings = useCallback(next => {
    setSettings(next)
    try {
      // Merge so keys owned by the root app (skin, navCollapsed, ...) are kept.
      window.localStorage.setItem('settings', JSON.stringify({ ...readStored(), ...next }))
    } catch {
      // Storage blocked (private window): the choice still applies until reload.
    }
  }, [])

  const isDark = settings.mode === 'dark'
  const solid = settings.colorType === 'gradient' ? settings.customGradientStart : settings.customSolidColor
  const gradEnd = settings.colorType === 'gradient' ? settings.customGradientEnd : settings.customSolidColor

  useEffect(() => {
    document.body.classList.remove('light-mode', 'dark-mode')
    document.body.classList.add(isDark ? 'dark-mode' : 'light-mode')
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
  }, [isDark])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--theme-solid', solid)
    root.style.setProperty('--theme-grad-start', solid)
    root.style.setProperty('--theme-grad-end', gradEnd)
  }, [solid, gradEnd])

  // Same surface colours as the root app's palette (src/@core/theme/palette).
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: isDark ? 'dark' : 'light',
          primary: { main: solid },
          background: isDark ? { default: '#25293C', paper: '#2F3349' } : { default: '#F8F7FA', paper: '#FFFFFF' },
          text: isDark ? { primary: '#CFD3EC', secondary: '#9A9EB6' } : { primary: '#2F2B3D', secondary: '#6D6B77' }
        },
        typography: { fontFamily: 'inherit' },
        shape: { borderRadius: 6 }
      }),
    [isDark, solid]
  )

  const value = useMemo(() => ({ settings, saveSettings }), [settings, saveSettings])

  return (
    <SettingsContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {/* ThemeStyles (universalThemeColors) reads the mode from localStorage while rendering. The server
            cannot see localStorage, so screens are drawn only once the stored settings are known (server and
            first browser render then match - no hydration warning in dark mode) and re-mounted when the mode
            changes. */}
        {restored ? (
          <React.Fragment key={settings.mode}>{children}</React.Fragment>
        ) : (
          <div className='min-h-screen' aria-busy='true' />
        )}
      </ThemeProvider>
    </SettingsContext.Provider>
  )
}
