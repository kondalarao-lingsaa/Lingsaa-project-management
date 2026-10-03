import React, { useEffect, useState } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { GhostButton, PrimaryButton } from './ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'

// Asks for a short text before an action: the reason for rejecting / sending back (required), or an optional
// note when approving. minLength 0 = optional.
const ReasonDialog = ({ open, onClose, onSubmit, title, message, label = 'Reason', confirmText = 'Send', minLength = 5, busy = false }) => {
  const [text, setText] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setText('')
      setError(null)
    }
  }, [open])

  const submit = () => {
    const value = text.trim()
    if (minLength && value.length < minLength) return setError(`Please Enter a ${label} (at least ${minLength} characters)`)
    onSubmit(value || null)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle className='!border-b !border-gray-100 !p-4 !pb-3 !text-[17px] !font-bold'>{title}</DialogTitle>
      <DialogContent className='!pt-4'>
        {message && <p className='mb-3 text-sm text-gray-600'>{message}</p>}
        <label htmlFor='reason_text' className={ThemeStyles.formLabels}>
          {label}{' '}
          {minLength ? <span className='text-red-500'>*</span> : <span className='text-xs font-normal text-gray-400'>(optional)</span>}
        </label>
        <textarea
          id='reason_text'
          rows={3}
          maxLength={1000}
          value={text}
          onChange={e => {
            setText(e.target.value)
            setError(null)
          }}
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-500' : 'border-gray-300'}`}
        />
        {error && <span className='block text-xs font-semibold text-red-500'>{error}</span>}
      </DialogContent>
      <DialogActions className='!justify-end !gap-2 !border-t !border-gray-100 !bg-gray-50 !p-3'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} disabled={busy}>
          {confirmText}
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

export default ReasonDialog
