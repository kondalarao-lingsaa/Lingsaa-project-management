import React from 'react'
import { Icon } from '@iconify/react'

// Tile colours are mixed with transparency, so the same card works on light and dark backgrounds.
const TONES = {
  indigo: '#4f46e5',
  emerald: '#059669',
  blue: '#2563eb',
  red: '#dc2626',
  violet: '#7c3aed',
  amber: '#d97706',
  cyan: '#0891b2',
  orange: '#ea580c'
}

// Same card as the stat cards on the Lingsaa_Accounts list screens.
const StatCard = ({ icon, tone, label, value, hint }) => {
  const color = TONES[tone] || TONES.indigo

  return (
    <div className='min-w-0 rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm transition-all duration-200 hover:shadow-md'>
      <div className='flex items-center'>
        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10' style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          <Icon icon={icon} width={18} />
        </div>
        <div className='mx-2 h-12 w-px bg-gray-200 sm:mx-3' />
        <div className='flex min-w-0 flex-1 flex-col'>
          <span title={label} className='truncate text-[13px] font-medium text-gray-500 sm:text-[14px]'>{label}</span>
          <span className='mt-1 text-[17px] font-semibold tabular-nums' style={{ color }}>{value}</span>
          {hint && <span className='truncate text-[11px] text-gray-500'>{hint}</span>}
        </div>
      </div>
    </div>
  )
}

export default StatCard
