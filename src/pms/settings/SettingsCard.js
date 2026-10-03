import React from 'react'
import { Icon } from '@iconify/react'

// One section of the Settings page: icon, title, subtitle, an optional action on the right, then its content.
const SettingsCard = ({ icon, title, subtitle, children, action }) => (
  <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
    <div className='mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3'>
      <div className='flex items-start gap-3'>
        <span
          className='flex h-9 w-9 items-center justify-center rounded-lg'
          style={{ background: 'color-mix(in srgb, var(--theme-solid) 12%, transparent)', color: 'var(--theme-solid)' }}
        >
          <Icon icon={icon} width={19} />
        </span>
        <div>
          <div className='text-[15px] font-semibold text-slate-800'>{title}</div>
          <div className='text-xs text-gray-500'>{subtitle}</div>
        </div>
      </div>
      {action}
    </div>
    {children}
  </section>
)

export default SettingsCard
