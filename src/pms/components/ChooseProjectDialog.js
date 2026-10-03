import React, { useEffect, useState } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'

const CLOSED = ['Closed', 'Cancelled']

// Company-wide screens (Milestones, Risks, Issues, Change Requests, Resources) add a record to one project:
// this asks which project first, then the screen opens its usual form for it. Closed projects are not offered.
const ChooseProjectDialog = ({ open, title, onClose, onChoose }) => {
  const [pickedId, setPickedId] = useState('')
  const { data } = useGetProjectOptionsQuery(undefined, { skip: !open })
  const projects = (Array.isArray(data?.detail) ? data.detail : []).filter(p => !CLOSED.includes(p.status))

  useEffect(() => {
    if (open) setPickedId('')
  }, [open])

  const choose = () => {
    const project = projects.find(p => String(p.id) === pickedId)
    if (project) onChoose(project)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='xs'>
      <DialogTitle className='!text-[17px] !font-semibold'>{title}</DialogTitle>
      <DialogContent>
        <label htmlFor='choose_project' className='mb-1 block text-sm font-medium text-slate-700'>
          Project <span className='text-red-500'>*</span>
        </label>
        <select
          id='choose_project'
          value={pickedId}
          onChange={e => setPickedId(e.target.value)}
          className={ThemeStyles.formsInputsDropdown}
        >
          <option value=''>Select project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.project_code} - {p.project_name}
            </option>
          ))}
        </select>
        <span className='!mt-1 block text-xs text-gray-500'>Closed and cancelled projects are not listed.</span>
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={choose} disabled={!pickedId}>
          Continue
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

export default ChooseProjectDialog
