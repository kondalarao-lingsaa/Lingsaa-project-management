import React from 'react'
import { Save, X } from 'lucide-react'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { GhostButton, PrimaryButton } from './ui'

// Same layout as DrawerHeader / DrawerFooter in Lingsaa_Accounts (src/@core/reusable_components).
export const DrawerHeader = ({ title, subtitle, icon: Icon }) => (
  <div className='relative border-b border-gray-200 bg-[color-mix(in_srgb,var(--theme-solid)_5%,white)] p-3'>
    <div className='flex items-start gap-2'>
      {Icon && <Icon className={ThemeStyles.drawerHeaderIcon} />}
      <div className='min-w-0'>
        <div className={ThemeStyles.drawerHeaderTxt}>{title}</div>
        {subtitle && <div className={ThemeStyles.drawerSupportHeaderTxt}>{subtitle}</div>}
      </div>
    </div>
  </div>
)

// `extra` = an optional second action shown before the main button: { text, onClick }.
export const DrawerFooter = ({ onClose, onSubmit, submitText = 'Submit', disabled, extra }) => (
  <div className='border-t border-gray-100 bg-gradient-to-r from-gray-50 via-white to-gray-50 p-3'>
    <div className='flex items-center justify-between gap-2'>
      <GhostButton onClick={onClose}>
        <X className={ThemeStyles.btnIcon} /> Close
      </GhostButton>
      <div className='flex flex-wrap justify-end gap-2'>
        {extra && (
          <GhostButton onClick={extra.onClick} disabled={disabled}>
            {extra.text}
          </GhostButton>
        )}
        <PrimaryButton onClick={onSubmit} disabled={disabled}>
          <Save className={ThemeStyles.btnIcon} /> {submitText}
        </PrimaryButton>
      </div>
    </div>
  </div>
)
