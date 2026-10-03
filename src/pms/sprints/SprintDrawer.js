import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { Timer } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  capitalizeFirst,
  capitalizeWords,
  collectErrors,
  getSprintFieldError,
  SPRINT_VALIDATED_FIELDS
} from 'src/pms/utils/validation'
import { useSaveSprintMutation } from 'src/store/apps/pms/sprintsApi'

const Required = () => <span className='text-red-500'>*</span>
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIso = () => addDays(new Date().toISOString().slice(0, 10), 0)

// project: { id, start_date, end_date }. sprints: the project's sprints (to suggest the next name / dates).
const SprintDrawer = ({ open, onClose, project, sprint, sprints = [] }) => {
  const isEdit = Boolean(sprint)
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '' })
  const [errors, setErrors] = useState({})
  const [save, { isLoading }] = useSaveSprintMutation()

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (isEdit) {
      setForm({ name: sprint.name, goal: sprint.goal || '', start_date: sprint.start_date, end_date: sprint.end_date })

      return
    }
    // Suggest the next sprint: numbered after the last one, starting the day after it ends, two weeks long.
    const last = [...sprints].sort((a, b) => a.end_date.localeCompare(b.end_date)).pop()
    let start = last ? addDays(last.end_date, 1) : todayIso()
    if (project?.start_date && start < project.start_date) start = project.start_date
    let end = addDays(start, 13)
    if (project?.end_date && end > project.end_date) end = project.end_date
    setForm({ name: `Sprint ${sprints.length + 1}`, goal: '', start_date: start, end_date: end })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({
      ...prev,
      [id]: id === 'name' ? capitalizeWords(value) : id === 'goal' ? capitalizeFirst(value) : value
    }))
    setError(id, null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null
  const input = id => ({
    id,
    value: form[id],
    onChange: handleChange,
    onBlur: () => setError(id, getSprintFieldError(id, form[id], form, project || {}))
  })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(
      SPRINT_VALIDATED_FIELDS,
      (f, v, fm) => getSprintFieldError(f, v, fm, project || {}),
      form
    )
    const ids = Object.keys(found)
    setErrors(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)

      return
    }
    try {
      const body = {
        name: form.name.trim(),
        goal: form.goal.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date
      }
      const resp = await save({ projectId: project.id, id: sprint?.id, body }).unwrap()
      toast.success(resp?.detail || 'Sprint saved')
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const days =
    form.start_date && form.end_date && form.end_date >= form.start_date
      ? Math.round((Date.parse(form.end_date) - Date.parse(form.start_date)) / 86400000) + 1
      : null

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[60%] lg:w-[45%] xl:w-[34%] 2xl:w-[28%]'>
          <DrawerHeader
            title={isEdit ? `Edit ${sprint.name}` : 'New Sprint'}
            subtitle='A 1-4 week time-box the team commits tasks to'
            icon={Timer}
          />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Timer className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Sprint</span>
                {days && <span className='ms-auto text-xs font-medium text-gray-500'>{days} days</span>}
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Sprint Name <Required />
                  </span>
                  <input
                    {...input('name')}
                    type='text'
                    maxLength={120}
                    placeholder='e.g. Sprint 3'
                    className={`${ThemeStyles.formsInputs}${errorBorder('name')}`}
                  />
                  {fieldError('name')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Start Date <Required />
                  </span>
                  <input
                    {...input('start_date')}
                    type='date'
                    disabled={sprint?.status === 'Active'}
                    min={project?.start_date || undefined}
                    max={project?.end_date || undefined}
                    className={`${ThemeStyles.formsInputs}${errorBorder('start_date')}`}
                  />
                  {fieldError('start_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    End Date <Required />
                  </span>
                  <input
                    {...input('end_date')}
                    type='date'
                    min={form.start_date || undefined}
                    max={project?.end_date || undefined}
                    className={`${ThemeStyles.formsInputs}${errorBorder('end_date')}`}
                  />
                  {fieldError('end_date')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Sprint Goal</span>
                  <textarea
                    {...input('goal')}
                    rows={3}
                    maxLength={1000}
                    placeholder='What the team wants to have working at the end, e.g. Users can sign up and log in'
                    className={`${ThemeStyles.formsInputs}${errorBorder('goal')}`}
                  />
                  {fieldError('goal')}
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText={isEdit ? 'Update' : 'Create Sprint'}
            disabled={isLoading}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default SprintDrawer
