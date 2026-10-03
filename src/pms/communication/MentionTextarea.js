import React, { useRef, useState } from 'react'
import { NameAvatar } from 'src/pms/components/ui'

// Textarea that suggests team members after "@" and inserts "@Full Name ". The backend turns those into
// mention notifications. members: [{ member_name, role }]
const MentionTextarea = ({ value, onChange, members = [], className, ...props }) => {
  const ref = useRef(null)
  const [query, setQuery] = useState(null) // text typed after "@", or null when no suggestion is open
  const [active, setActive] = useState(0)

  const matches =
    query === null ? [] : members.filter(m => m.member_name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)

  const detect = (text, caret) => {
    const before = text.slice(0, caret)
    const m = before.match(/(?:^|\s)@([A-Za-z][A-Za-z.]*(?: [A-Za-z.]*)?)?$/)
    setQuery(m ? m[1] || '' : null)
    setActive(0)
  }

  const choose = member => {
    const el = ref.current
    const caret = el.selectionStart
    const before = value.slice(0, caret).replace(/@([A-Za-z][A-Za-z.]*(?: [A-Za-z.]*)?)?$/, `@${member.member_name} `)
    const next = before + value.slice(caret)
    onChange(next)
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  const onKeyDown = e => {
    if (matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(i => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)

        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        choose(matches[active])

        return
      }
      if (e.key === 'Escape') {
        setQuery(null)

        return
      }
    }
    props.onKeyDown?.(e)
  }

  return (
    <div className='relative'>
      <textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        onChange={e => {
          onChange(e.target.value)
          detect(e.target.value, e.target.selectionStart)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <ul
          className='absolute left-2 z-20 mt-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg'
          role='listbox'
          data-mention-list
        >
          {matches.map((m, i) => (
            <li key={m.id || m.member_name}>
              <button
                type='button'
                onMouseDown={e => {
                  e.preventDefault()
                  choose(m)
                }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left ${
                  i === active ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
              >
                <div className='scale-75'>
                  <NameAvatar name={m.member_name} />
                </div>
                <div className='min-w-0'>
                  <div className='truncate text-[13px] font-semibold text-slate-800'>{m.member_name}</div>
                  <div className='truncate text-[11px] text-gray-500'>{m.role}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MentionTextarea
