import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { Flag } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  capitalizeFirst,
  capitalizeWords,
  collectErrors,
  decimalOnly,
  getMilestoneFieldError,
  MILESTONE_VALIDATED_FIELDS
} from 'src/pms/utils/validation'
import { useSaveMilestoneMutation } from 'src/store/apps/pms/billingApi'

const EMPTY_FORM = { name: '', description: '', due_date: '', amount: '' }
const FORMATTERS = { name: capitalizeWords, description: capitalizeFirst, amount: v => decimalOnly(v, 2) }
const Required = () => <span className='text-red-500'>*</span>

// milestone: the one being edited (null = add). project: gives the id and the allowed date range.
const MilestoneDrawer = ({ open, onClose, project, milestone }) => {
  const isEdit = Boolean(milestone)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [save, { isLoading }] = useSaveMilestoneMutation()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      isEdit
        ? {
            name: milestone.name,
            description: milestone.description || '',
            due_date: milestone.due_date || '',
            amount: milestone.amount === null ? '' : String(milestone.amount)
          }
        : EMPTY_FORM
    )
  }, [open, isEdit, milestone])

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({ ...prev, [id]: FORMATTERS[id] ? FORMATTERS[id](value) : value }))
    setError(id, null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null
  const input = id => ({
    id,
    value: form[id],
    onChange: handleChange,
    onBlur: () => setError(id, getMilestoneFieldError(id, form[id], form, project))
  })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(
      MILESTONE_VALIDATED_FIELDS,
      (f, v, fm) => getMilestoneFieldError(f, v, fm, project),
      form
    )
    const ids = Object.keys(found)
    setErrors(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      document.getElementById(ids[0])?.focus()

      return
    }
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        amount: form.amount === '' ? null : Number(form.amount)
      }
      const resp = await save({ projectId: project.id, milestoneId: milestone?.id, body }).unwrap()
      toast.success(resp?.detail || 'Milestone saved')
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const billable = project?.project_type !== 'Internal'

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[36%] 2xl:w-[30%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Milestone' : 'Add Milestone'}
            subtitle={project ? `${project.project_code} · ${project.project_name}` : ''}
            icon={Flag}
          />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <Required /> are required. Link tasks to the milestone from the task form, and list what
              will be handed over as deliverables.
            </p>
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Flag className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Milestone</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Milestone Name <Required />
                  </span>
                  <input
                    {...input('name')}
                    type='text'
                    maxLength={200}
                    placeholder='e.g. Phase 1 - Design Sign-off'
                    className={`${ThemeStyles.formsInputs}${errorBorder('name')}`}
                  />
                  {fieldError('name')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Due Date</span>
                  <input
                    {...input('due_date')}
                    type='date'
                    min={project?.start_date || undefined}
                    max={project?.end_date || undefined}
                    className={`${ThemeStyles.formsInputs}${errorBorder('due_date')}`}
                  />
                  {fieldError('due_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Billing Amount (₹)</span>
                  <input
                    {...input('amount')}
                    type='text'
                    inputMode='decimal'
                    maxLength={15}
                    placeholder='0.00'
                    className={`${ThemeStyles.formsInputs}${errorBorder('amount')}`}
                  />
                  {fieldError('amount') || (
                    <span className='block text-xs text-gray-500'>
                      {billable
                        ? 'Invoiced to the client when the milestone is accepted'
                        : 'Internal project - not billed'}
                    </span>
                  )}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <div className='flex items-center justify-between'>
                    <span className={ThemeStyles.formLabels}>Description</span>
                    <span className='text-xs text-gray-400'>{form.description.length}/2000</span>
                  </div>
                  <textarea
                    {...input('description')}
                    rows={3}
                    maxLength={2000}
                    placeholder='What is delivered and how it will be accepted'
                    className={`${ThemeStyles.formsInputs}${errorBorder('description')}`}
                  />
                  {fieldError('description')}
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText={isEdit ? 'Update' : 'Add Milestone'}
            disabled={isLoading}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default MilestoneDrawer
