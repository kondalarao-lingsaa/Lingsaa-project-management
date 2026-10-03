import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { GhostButton } from './ui'

// Yes/No warning dialog, same look as ConfirmationModal in Lingsaa_Accounts.
const ConfirmDialog = ({ open, onClose, onConfirm, title = 'Are you sure?', message, confirmText = 'Yes', cancelText = 'No', busy = false }) => (
  <Dialog open={open} onClose={onClose} maxWidth='xs' fullWidth>
    <DialogTitle className='!flex !items-center !gap-2 !border-b !border-gray-100 !p-4 !pb-2 !font-bold !text-amber-600'>
      <AlertTriangle size={24} className='text-amber-500' /> {title}
    </DialogTitle>
    <DialogContent className='!pt-4'>
      <p className='text-sm text-gray-600'>{message}</p>
    </DialogContent>
    <DialogActions className='!justify-end !gap-2 !border-t !border-gray-100 !bg-gray-50 !p-3'>
      <GhostButton onClick={onClose}>{cancelText}</GhostButton>
      <button
        type='button'
        onClick={onConfirm}
        disabled={busy}
        className='rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50'
      >
        {confirmText}
      </button>
    </DialogActions>
  </Dialog>
)

export default ConfirmDialog
