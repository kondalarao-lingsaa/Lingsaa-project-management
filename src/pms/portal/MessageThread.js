import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { Icon } from '@iconify/react'
import { PrimaryButton, timeAgo } from 'src/pms/components/ui'

// The conversation between a client and the project team. Used in the client portal (side = 'client') and in
// Project Details > Client (side = 'team'); each side sees its own messages on the right.
const MessageThread = ({ messages = [], side, onSend, busy, canSend = true, placeholder }) => {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  const send = async () => {
    const value = text.trim()
    if (value.length < 2) return setError('Please Enter a Message')
    try {
      const resp = await onSend(value)
      toast.success(resp?.detail || 'Message sent')
      setText('')
    } catch {
      // The shared error toast explains why.
    }
  }

  return (
    <div data-message-thread>
      <div className='mb-3 flex max-h-[420px] flex-col gap-2 overflow-y-auto'>
        {!messages.length && <div className='py-6 text-center text-sm text-gray-500'>No messages yet.</div>}
        {messages.map(m => {
          const mine = side === 'client' ? m.from_client : !m.from_client

          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-[14px] ${mine ? 'text-white' : 'bg-gray-100 text-slate-800'}`}
                style={mine ? { background: 'var(--theme-solid)' } : undefined}
              >
                <div className={`text-[11px] font-semibold ${mine ? 'text-white/80' : 'text-gray-500'}`}>
                  {m.author_name}
                  {m.from_client ? ' (client)' : ' (team)'} · {timeAgo(m.created_at)}
                </div>
                <div className='whitespace-pre-line'>{m.body}</div>
              </div>
            </div>
          )
        })}
      </div>
      {canSend && (
        <div className='flex flex-col gap-2 sm:flex-row sm:items-start'>
          <div className='min-w-0 flex-1'>
            <textarea
              id='message_text'
              rows={2}
              maxLength={2000}
              value={text}
              placeholder={placeholder}
              onChange={e => {
                setText(e.target.value)
                setError(null)
              }}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
            />
            {error && <span className='block text-xs font-semibold text-red-500'>{error}</span>}
          </div>
          <PrimaryButton onClick={send} disabled={busy}>
            <Icon icon='tabler:send' width={16} /> Send
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

export default MessageThread
