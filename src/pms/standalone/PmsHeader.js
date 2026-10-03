import React, { useState } from 'react'
import { IconButton, Popover, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import NotificationBell from 'src/pms/communication/NotificationBell'
import GlobalSearch from 'src/pms/communication/GlobalSearch'
import AccountSwitcher from './AccountSwitcher'
import { GRADIENT_PRESETS, SOLID_PRESETS, usePmsSettings } from './PmsSettings'

// STANDALONE ONLY - stands in for the root app's AppBarContent (menu button on small screens,
// greeting on the left, actions on the right). Inside Lingsaa_Accounts the real header is used.

const Swatch = ({ background, active, label, onClick }) => (
  <Tooltip title={label} arrow>
    <button
      type='button'
      aria-label={label}
      onClick={onClick}
      className={`h-8 w-8 cursor-pointer rounded-full transition hover:scale-110 ${
        active ? 'ring-2 ring-offset-2 ring-[var(--theme-solid)]' : ''
      }`}
      style={{ background }}
    />
  </Tooltip>
)

const ColorThemePicker = () => {
  const { settings, saveSettings } = usePmsSettings()
  const [anchor, setAnchor] = useState(null)
  const isGradient = settings.colorType === 'gradient'

  const tab = (type, text) => (
    <button
      type='button'
      onClick={() => saveSettings({ ...settings, colorType: type })}
      className={`flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        settings.colorType === type ? 'bg-white text-[var(--theme-solid)] shadow-sm' : 'text-gray-500'
      }`}
    >
      {text}
    </button>
  )

  return (
    <>
      <Tooltip title='Color theme' arrow>
        <IconButton color='inherit' onClick={e => setAnchor(e.currentTarget)} aria-label='Color theme'>
          <Icon icon='tabler:palette' width={24} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { className: 'mt-2 w-72 p-4' } }}
      >
        <div className='mb-3 text-sm font-semibold'>Color Theme</div>
        <div className='mb-4 flex gap-1 rounded-lg bg-gray-100 p-1'>
          {tab('solid', 'Solid')}
          {tab('gradient', 'Gradient')}
        </div>
        <div className='flex flex-wrap gap-3'>
          {isGradient
            ? GRADIENT_PRESETS.map(p => (
                <Swatch
                  key={p.name}
                  label={p.name}
                  background={`linear-gradient(135deg, ${p.start}, ${p.end})`}
                  active={settings.customGradientStart === p.start && settings.customGradientEnd === p.end}
                  onClick={() => saveSettings({ ...settings, customGradientStart: p.start, customGradientEnd: p.end })}
                />
              ))
            : SOLID_PRESETS.map(p => (
                <Swatch
                  key={p.name}
                  label={p.name}
                  background={p.color}
                  active={settings.customSolidColor === p.color}
                  onClick={() => saveSettings({ ...settings, customSolidColor: p.color })}
                />
              ))}
        </div>
      </Popover>
    </>
  )
}

const ModeToggler = () => {
  const { settings, saveSettings } = usePmsSettings()
  const isDark = settings.mode === 'dark'

  return (
    <Tooltip title={isDark ? 'Light mode' : 'Dark mode'} arrow>
      <IconButton
        color='inherit'
        aria-label='Toggle dark mode'
        onClick={() => saveSettings({ ...settings, mode: isDark ? 'light' : 'dark' })}
      >
        <Icon icon={isDark ? 'tabler:sun' : 'tabler:moon-stars'} width={24} />
      </IconButton>
    </Tooltip>
  )
}

const PmsHeader = ({ onMenuClick }) => (
  <header className='pms-header sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-gray-200 bg-white/90 px-3 backdrop-blur sm:px-6'>
    <IconButton color='inherit' onClick={onMenuClick} className='lg:!hidden' aria-label='Open menu'>
      <Icon icon='tabler:menu-2' width={24} />
    </IconButton>
    <div className='min-w-0 flex-1 truncate text-[15px] font-semibold text-slate-700'>Project Management</div>
    <GlobalSearch />
    <NotificationBell />
    <ColorThemePicker />
    <ModeToggler />
    {/* Avatar with the account switcher (reads the login after mount, so no hydration mismatch). */}
    <AccountSwitcher />
  </header>
)

export default PmsHeader
