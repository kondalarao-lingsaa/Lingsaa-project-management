import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { CalendarSync, ListChecks, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst, decimalOnly } from 'src/pms/utils/validation'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'
import { useSaveRecurringTaskMutation } from 'src/store/apps/pms/automationApi'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

const today = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = {
  project_id: '',
  title: '',
  description: '',
  priority: 'Medium',
  assignee_name: '',
  assignee_id: '',
  estimated_hours: '',
  frequency: 'Weekly',
  every: '1',
  weekday: '0',
  month_day: '1',
  working_days_only: true,
  due_in_days: '0',
  start_date: '',
  end_date: '',
  is_active: true
}

export const ruleToForm = r => ({
  ...EMPTY,
  ...Object.fromEntries(
    Object.keys(EMPTY).map(k => [k, r[k] === null || r[k] === undefined ? EMPTY[k] : typeof EMPTY[k] === 'boolean' ? r[k] : String(r[k])])
  )
})

export const formToPayload = f => ({
  project_id: Number(f.project_id),
  title: f.title.trim(),
  description: f.description.trim() || null,
  priority: f.priority,
  assignee_name: f.assignee_name || null,
  assignee_id: /^\d+$/.test(String(f.assignee_id)) ? Number(f.assignee_id) : null,
  estimated_hours: f.estimated_hours === '' ? null : Number(f.estimated_hours),
  frequency: f.frequency,
  every: Number(f.every || 1),
  weekday: f.frequency === 'Weekly' ? Number(f.weekday) : null,
  month_day: f.frequency === 'Monthly' ? Number(f.month_day) : null,
  working_days_only: f.frequency === 'Daily' ? Boolean(f.working_days_only) : false,
  due_in_days: Number(f.due_in_days || 0),
  start_date: f.start_date,
  end_date: f.end_date || null,
  is_active: Boolean(f.is_active)
})

const ordinal = n => {
  const v = n % 100

  return `${n}${v >= 11 && v <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

// The sentence under the form, so people see what they set before saving.
const describe = f => {
  const n = Number(f.every || 1)
  let when
  if (f.frequency === 'Daily') when = n === 1 ? (f.working_days_only ? 'every working day' : 'every day') : `every ${n} days`
  else if (f.frequency === 'Weekly') when = n === 1 ? `every ${WEEKDAYS[f.weekday]}` : `every ${n} weeks on ${WEEKDAYS[f.weekday]}`
  else when = `${n === 1 ? 'every month' : `every ${n} months`} on the ${ordinal(Number(f.month_day))}`
  const due = Number(f.due_in_days || 0)

  return `A new task is created ${when}${f.start_date ? ` from ${f.start_date}` : ''}${f.end_date ? ` until ${f.end_date}` : ''}, due ${
    due === 0 ? 'the same day' : `${due} day${due === 1 ? '' : 's'} later`
  }. Only while the project is Active.`
}

const check = f => {
  const e = {}
  if (!f.project_id) e.project_id = 'Please Select Project'
  if (f.title.trim().length < 3) e.title = 'Please Enter the Task Name (at least 3 characters)'
  const every = Number(f.every)
  if (!Number.isInteger(every) || every < 1 || every > (f.frequency === 'Daily' ? 30 : 12))
    e.every = `Enter 1 to ${f.frequency === 'Daily' ? 30 : 12}`
  if (f.frequency === 'Monthly' && !(Number(f.month_day) >= 1 && Number(f.month_day) <= 31)) e.month_day = 'Enter a day from 1 to 31'
  if (!(Number(f.due_in_days) >= 0 && Number(f.due_in_days) <= 60)) e.due_in_days = 'Enter 0 to 60 days'
  if (!f.start_date) e.start_date = 'Please Select Start Date'
  if (f.end_date && f.start_date && f.end_date < f.start_date) e.end_date = 'The end date cannot be before the start date'
  if (f.estimated_hours !== '' && !(Number(f.estimated_hours) >= 0 && Number(f.estimated_hours) <= 999.99)) e.estimated_hours = 'Enter 0 to 999.99 hours'

  return e
}

// rule: the row being edited (null = new). projectId: fixes the project for a new rule.
const RecurringTaskDrawer = ({ open, onClose, rule, projectId }) => {
  const isEdit = Boolean(rule?.id)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [save, { isLoading }] = useSaveRecurringTaskMutation()
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: !open })
  const projects = (Array.isArray(projectsResp?.detail) ? projectsResp.detail : []).filter(
    p => p.status !== 'Closed' || String(p.id) === form.project_id
  )
  const { data: membersResp } = useGetProjectMembersQuery(form.project_id, { skip: !open || !form.project_id })
  const members = form.project_id ? membersResp?.detail || [] : []

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(isEdit ? ruleToForm(rule) : { ...EMPTY, project_id: projectId ? String(projectId) : '', start_date: today() })
  }, [open, isEdit, rule, projectId])

  const set = (key, value) => {
    setForm(p => ({ ...p, [key]: value, ...(key === 'project_id' ? { assignee_name: '', assignee_id: '' } : {}) }))
    setErrors(p => ({ ...p, [key]: null }))
  }

  const submit = async () => {
    const found = check(form)
    setErrors(found)
    const ids = Object.keys(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      document.getElementById(`rt_${ids[0]}`)?.focus()

      return
    }
    try {
      const resp = await save({ id: rule?.id, body: formToPayload(form) }).unwrap()
      toast.success(resp.detail)
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const err = k => (errors[k] ? <span className='block text-xs font-semibold text-red-500'>{errors[k]}</span> : null)
  const border = k => (errors[k] ? ' !border !border-red-500' : '')
  const section = ThemeStyles.drawerHeadingSection
  const member = members.find(m => (m.user_id && String(m.user_id) === String(form.assignee_id)) || m.member_name === form.assignee_name)

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[80%] lg:w-[60%] xl:w-[40%] 2xl:w-[35%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Recurring Task' : 'New Recurring Task'}
            subtitle='A task created again and again on a schedule'
            icon={CalendarSync}
          />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <span className='text-red-500'>*</span> are required. Each task gets the date in its name, e.g.
              &quot;Weekly client call - 12 Oct 2026&quot;.
            </p>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <ListChecks className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Task</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Project<span className='text-red-500'>*</span>
                  </span>
                  <select
                    id='rt_project_id'
                    value={form.project_id}
                    disabled={isEdit || Boolean(projectId)}
                    onChange={e => set('project_id', e.target.value)}
                    className={`${ThemeStyles.formsInputsDropdown}${border('project_id')}`}
                  >
                    <option value=''>Select project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code} - {p.project_name} ({p.status})
                      </option>
                    ))}
                  </select>
                  {err('project_id')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Task Name<span className='text-red-500'>*</span>
                  </span>
                  <input
                    id='rt_title'
                    value={form.title}
                    maxLength={250}
                    onChange={e => set('title', capitalizeFirst(e.target.value))}
                    placeholder='e.g. Weekly client call'
                    className={`${ThemeStyles.formsInputs}${border('title')}`}
                  />
                  {err('title')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Description</span>
                  <textarea
                    id='rt_description'
                    rows={2}
                    maxLength={4000}
                    value={form.description}
                    onChange={e => set('description', capitalizeFirst(e.target.value))}
                    placeholder='What should be done each time?'
                    className={ThemeStyles.formsInputs}
                  />
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Priority</span>
                  <select id='rt_priority' value={form.priority} onChange={e => set('priority', e.target.value)} className={ThemeStyles.formsInputsDropdown}>
                    {PRIORITIES.map(p => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Estimated Hours</span>
                  <input
                    id='rt_estimated_hours'
                    inputMode='decimal'
                    maxLength={6}
                    value={form.estimated_hours}
                    onChange={e => set('estimated_hours', decimalOnly(e.target.value, 2))}
                    placeholder='0'
                    className={`${ThemeStyles.formsInputs}${border('estimated_hours')}`}
                  />
                  {err('estimated_hours')}
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <CalendarSync className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Schedule</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Repeats</span>
                  <div className='flex flex-wrap gap-2' role='radiogroup' aria-label='Repeats'>
                    {FREQUENCIES.map(f => (
                      <button
                        key={f}
                        type='button'
                        role='radio'
                        aria-checked={form.frequency === f}
                        data-frequency={f}
                        onClick={() => set('frequency', f)}
                        className={`rounded-lg border px-4 py-1.5 text-sm font-semibold ${
                          form.frequency === f ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-700'
                        }`}
                        style={form.frequency === f ? { background: 'var(--theme-solid)' } : undefined}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Every ({form.frequency === 'Daily' ? 'days' : form.frequency === 'Weekly' ? 'weeks' : 'months'})
                    <span className='text-red-500'>*</span>
                  </span>
                  <input
                    id='rt_every'
                    inputMode='numeric'
                    maxLength={2}
                    value={form.every}
                    onChange={e => set('every', e.target.value.replace(/\D/g, ''))}
                    className={`${ThemeStyles.formsInputs}${border('every')}`}
                  />
                  {err('every')}
                </div>
                {form.frequency === 'Weekly' && (
                  <div className='space-y-1'>
                    <span className={ThemeStyles.formLabels}>On</span>
                    <select id='rt_weekday' value={form.weekday} onChange={e => set('weekday', e.target.value)} className={ThemeStyles.formsInputsDropdown}>
                      {WEEKDAYS.map((w, i) => (
                        <option key={w} value={i}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {form.frequency === 'Monthly' && (
                  <div className='space-y-1'>
                    <span className={ThemeStyles.formLabels}>Day of the month</span>
                    <input
                      id='rt_month_day'
                      inputMode='numeric'
                      maxLength={2}
                      value={form.month_day}
                      onChange={e => set('month_day', e.target.value.replace(/\D/g, ''))}
                      className={`${ThemeStyles.formsInputs}${border('month_day')}`}
                    />
                    {err('month_day') || <span className='block text-xs text-gray-500'>29-31: short months use their last day</span>}
                  </div>
                )}
                {form.frequency === 'Daily' && (
                  <label className='flex items-center gap-2 self-end pb-2 text-sm text-slate-700'>
                    <input
                      id='rt_working_days_only'
                      type='checkbox'
                      checked={form.working_days_only}
                      onChange={e => set('working_days_only', e.target.checked)}
                    />
                    Working days only (skip weekends and holidays)
                  </label>
                )}
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Start Date<span className='text-red-500'>*</span>
                  </span>
                  <input
                    id='rt_start_date'
                    type='date'
                    value={form.start_date}
                    onChange={e => set('start_date', e.target.value)}
                    className={`${ThemeStyles.formsInputs}${border('start_date')}`}
                  />
                  {err('start_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>End Date</span>
                  <input
                    id='rt_end_date'
                    type='date'
                    min={form.start_date || undefined}
                    value={form.end_date}
                    onChange={e => set('end_date', e.target.value)}
                    className={`${ThemeStyles.formsInputs}${border('end_date')}`}
                  />
                  {err('end_date') || <span className='block text-xs text-gray-500'>Empty = until the project ends</span>}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Due (days after it is created)</span>
                  <input
                    id='rt_due_in_days'
                    inputMode='numeric'
                    maxLength={2}
                    value={form.due_in_days}
                    onChange={e => set('due_in_days', e.target.value.replace(/\D/g, ''))}
                    className={`${ThemeStyles.formsInputs}${border('due_in_days')}`}
                  />
                  {err('due_in_days') || <span className='block text-xs text-gray-500'>0 = due the same day</span>}
                </div>
                <label className='flex items-center gap-2 self-end pb-2 text-sm text-slate-700'>
                  <input id='rt_is_active' type='checkbox' checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                  Active (untick to pause)
                </label>
                <p className='rounded-md bg-white p-2 text-xs text-slate-600 md:col-span-2' data-recurring-preview>
                  {describe(form)}
                </p>
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <UserRound className={`${ThemeStyles.drawerHeadingIcon} text-emerald-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Assignee</span>
              </div>
              <select
                id='rt_assignee_name'
                value={member ? String(member.id) : ''}
                disabled={!form.project_id}
                onChange={e => {
                  const m = members.find(x => String(x.id) === e.target.value)
                  setForm(p => ({ ...p, assignee_name: m ? m.member_name : '', assignee_id: m?.user_id ? String(m.user_id) : '' }))
                }}
                className={`${ThemeStyles.formsInputsDropdown}${border('assignee_name')}`}
              >
                <option value=''>{form.project_id ? 'Unassigned' : 'Select a project first'}</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.member_name} - {m.role}
                  </option>
                ))}
              </select>
              {err('assignee_name') || <span className='block pt-1 text-xs text-gray-500'>They are notified each time a task is created.</span>}
            </div>
          </div>
          <DrawerFooter onClose={onClose} onSubmit={submit} submitText={isEdit ? 'Update' : 'Save'} disabled={isLoading} />
        </div>
      </div>
    </Drawer>
  )
}

export default RecurringTaskDrawer
