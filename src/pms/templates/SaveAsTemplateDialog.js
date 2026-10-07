import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import toast from 'react-hot-toast'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { TITLE_REGEX, capitalizeFirst, capitalizeWords } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useSaveProjectAsTemplateMutation } from 'src/store/apps/pms/settingsApi'

const nameError = v => {
  const t = (v || '').trim()
  if (!t) return 'Please Enter Template Name'
  if (t.length < 3) return 'Template Name must be at least 3 characters'
  if (!/[A-Za-z]/.test(t) || !TITLE_REGEX.test(t))
    return 'Template Name must contain letters and only common symbols (. , & ( ) - / : + #)'

  return null
}

// "Save as Template" on Project Details: the project's milestones and tasks become a reusable plan.
const SaveAsTemplateDialog = ({ open, onClose, project }) => {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)
  const [save, { isLoading }] = useSaveProjectAsTemplateMutation()

  useEffect(() => {
    if (!open || !project) return
    setName(capitalizeWords(`${project.project_name} Template`))
    setDescription('')
    setError(null)
    setSaved(null)
  }, [open, project])

  const submit = async () => {
    const e = nameError(name)
    setError(e)
    if (e) return toast.error(e)
    try {
      const resp = await save({
        projectId: project.id,
        body: { name: name.trim(), description: description.trim() || null }
      }).unwrap()
      toast.success(resp.detail)
      setSaved(resp.data)
    } catch (err) {
      if (err?.data?.errors?.name) setError(err.data.errors.name)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Save as Template</DialogTitle>
      <DialogContent>
        {saved ? (
          <div
            className='rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800'
            data-template-saved
          >
            <b>{saved.name}</b> saved with {saved.milestone_count} milestones and{' '}
            {saved.task_count + saved.subtask_count} tasks ({saved.duration_days} days).{' '}
            <Link href={`${PMS_BASE}/projects/projectTemplates/`} className='font-semibold underline'>
              Open Project Templates
            </Link>
          </div>
        ) : (
          <>
            <p className='mb-3 text-sm text-gray-600'>
              The milestones and tasks of {project?.project_code} are saved with their dates as days from the project
              start, so a new project can start from this plan. Assignees, hours logged and statuses are not copied.
            </p>
            <span className={ThemeStyles.formLabels}>
              Template Name <span className='text-red-500'>*</span>
            </span>
            <input
              id='template_name'
              value={name}
              maxLength={120}
              onChange={e => {
                setName(capitalizeWords(e.target.value))
                setError(null)
              }}
              onBlur={() => setError(nameError(name))}
              className={`${ThemeStyles.formsInputs} mt-1${error ? ' !border !border-red-500' : ''}`}
            />
            {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
            <div className='mt-3'>
              <span className={ThemeStyles.formLabels}>Description</span>
              <textarea
                id='template_description'
                rows={2}
                maxLength={1000}
                value={description}
                onChange={e => setDescription(capitalizeFirst(e.target.value))}
                placeholder='When to use this template'
                className={`${ThemeStyles.formsInputs} mt-1`}
              />
            </div>
          </>
        )}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>{saved ? 'Close' : 'Cancel'}</GhostButton>
        {!saved && (
          <PrimaryButton onClick={submit} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Template'}
          </PrimaryButton>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default SaveAsTemplateDialog
