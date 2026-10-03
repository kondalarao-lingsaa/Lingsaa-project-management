import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { GitPullRequest, Scale } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { inr } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst, CHANGE_VALIDATED_FIELDS, collectErrors, getChangeFieldError } from 'src/pms/utils/validation'
import { useGetRiskMetaQuery, useSaveChangeRequestMutation } from 'src/store/apps/pms/risksApi'
import { useGetProjectMilestonesQuery } from 'src/store/apps/pms/billingApi'

const EMPTY = { title: '', reason: '', change_type: '', cost_impact: '', days_impact: '', milestone_id: '' }
const Required = () => <span className='text-red-500'>*</span>
const signedDecimal = v => v.replace(/[^\d.-]/g, '').replace(/(?!^)-/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2})\d+/, '$1')
const signedInt = v => v.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '').slice(0, 4)

const ChangeDrawer = ({ open, onClose, project, change }) => {
  const isEdit = Boolean(change)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const { data: metaResp } = useGetRiskMetaQuery(undefined, { skip: !open })
  const { data: milestonesResp } = useGetProjectMilestonesQuery(project?.id, { skip: !open || !project })
  const [save, { isLoading }] = useSaveChangeRequestMutation()
  // Only milestones whose amount can still change (not accepted, not invoiced).
  const milestones = (milestonesResp?.detail || []).filter(m => m.status !== 'Accepted' && !m.invoice)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(isEdit ? Object.fromEntries(Object.keys(EMPTY).map(k => [k, change[k] === null || change[k] === undefined ? '' : String(change[k])])) : EMPTY)
  }, [open, isEdit, change])

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    const formatted = id === 'cost_impact' ? signedDecimal(value) : id === 'days_impact' ? signedInt(value) : ['title', 'reason'].includes(id) ? capitalizeFirst(value) : value
    setForm(prev => ({ ...prev, [id]: formatted }))
    setError(id, null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id => (errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null)
  const input = id => ({ id, value: form[id], onChange: handleChange, onBlur: () => setError(id, getChangeFieldError(id, form[id], form)) })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(CHANGE_VALIDATED_FIELDS, getChangeFieldError, form)
    const ids = Object.keys(found)
    setErrors(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      document.getElementById(ids[0])?.focus()

      return
    }
    try {
      const body = {
        title: form.title.trim(),
        reason: form.reason.trim(),
        change_type: form.change_type,
        cost_impact: form.cost_impact === '' ? null : Number(form.cost_impact),
        days_impact: form.days_impact === '' ? null : Number(form.days_impact),
        milestone_id: form.milestone_id ? Number(form.milestone_id) : null
      }
      const resp = await save({ projectId: project.id, id: change?.id, body }).unwrap()
      toast.success(resp?.detail || 'Change request saved')
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const cost = Number(form.cost_impact || 0)
  const days = Number(form.days_impact || 0)
  const target = milestones.find(m => String(m.id) === form.milestone_id)

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[38%] 2xl:w-[32%]'>
          <DrawerHeader title={isEdit ? `Edit ${change.cr_key}` : 'New Change Request'} subtitle={project ? `${project.project_code} · ${project.project_name}` : ''} icon={GitPullRequest} />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <Required /> are required. Someone other than you approves it; approval applies the impact automatically.
            </p>
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <GitPullRequest className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Change</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Change Title <Required />
                  </span>
                  <input {...input('title')} type='text' maxLength={200} placeholder='e.g. Add Excel export to reports' className={`${ThemeStyles.formsInputs}${errorBorder('title')}`} />
                  {fieldError('title')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Change Type <Required />
                  </span>
                  <select {...input('change_type')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('change_type')}`}>
                    <option value=''>Select type</option>
                    {(metaResp?.detail?.change_types || []).map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {fieldError('change_type')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Reason <Required />
                  </span>
                  <textarea {...input('reason')} rows={3} maxLength={2000} placeholder='Why the change is needed and who asked for it' className={`${ThemeStyles.formsInputs}${errorBorder('reason')}`} />
                  {fieldError('reason')}
                </div>
              </div>
            </div>

            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Scale className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Impact</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Cost Impact (₹)</span>
                  <input {...input('cost_impact')} type='text' inputMode='decimal' maxLength={16} placeholder='e.g. 15000 or -5000' className={`${ThemeStyles.formsInputs}${errorBorder('cost_impact')}`} />
                  {fieldError('cost_impact')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Days Impact</span>
                  <input {...input('days_impact')} type='text' inputMode='numeric' maxLength={4} placeholder='e.g. 10 or -5' className={`${ThemeStyles.formsInputs}${errorBorder('days_impact')}`} />
                  {fieldError('days_impact')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Add the cost to</span>
                  <select {...input('milestone_id')} className={ThemeStyles.formsInputsDropdown}>
                    <option value=''>The project budget</option>
                    {milestones.map(m => (
                      <option key={m.id} value={m.id}>
                        Milestone: {m.name} ({m.amount === null ? 'no amount' : inr(m.amount)})
                      </option>
                    ))}
                  </select>
                </div>
                {(cost !== 0 || days !== 0) && (
                  <div className='rounded-lg border border-gray-200 px-3 py-2 text-xs text-slate-700 md:col-span-2'>
                    <div className='mb-1 font-semibold'>When approved:</div>
                    {cost !== 0 && (
                      <div>
                        {target ? `Milestone '${target.name}' amount` : 'Project budget'} {cost > 0 ? 'increases' : 'decreases'} by {inr(Math.abs(cost))}
                        {target ? ` (${inr(target.amount || 0)} → ${inr((target.amount || 0) + cost)})` : project?.budget !== undefined && project?.budget !== null ? ` (${inr(project.budget)} → ${inr(project.budget + cost)})` : ''}
                      </div>
                    )}
                    {days !== 0 && (
                      <div>
                        End date moves {days > 0 ? 'later' : 'earlier'} by {Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} onSubmit={handleSubmit} submitText={isEdit ? 'Update' : 'Submit Change'} disabled={isLoading} />
        </div>
      </div>
    </Drawer>
  )
}

export default ChangeDrawer
