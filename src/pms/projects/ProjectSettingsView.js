import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { GhostButton, PrimaryButton, timeAgo } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectSettingsQuery, useSaveProjectSettingsMutation } from 'src/store/apps/pms/settingsApi'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const TAX = [0, 5, 12, 18, 28]
const TERMS = [0, 7, 15, 30, 45, 60, 90]
const str = v => (v === null || v === undefined ? '' : String(v))

const toForm = s => ({
  default_task_priority: s.default_task_priority,
  default_estimate_hours: str(s.default_estimate_hours),
  task_labels: s.task_labels || [],
  timesheet_lock_days: str(s.timesheet_lock_days),
  budget_alert_pct: str(s.budget_alert_pct),
  receipt_required_above: str(s.receipt_required_above),
  default_tax_pct: str(s.default_tax_pct),
  default_payment_terms: str(s.default_payment_terms)
})

// Same rules as schemas/settings.py ProjectSettingsIn.
export const getProjectSettingsErrors = f => {
  const e = {}
  const n = v => Number(v)
  if (
    f.default_estimate_hours !== '' &&
    (Number.isNaN(n(f.default_estimate_hours)) || n(f.default_estimate_hours) < 0 || n(f.default_estimate_hours) > 9999)
  )
    e.default_estimate_hours = 'Between 0 and 9999 hours'
  if (
    f.timesheet_lock_days !== '' &&
    (!Number.isInteger(n(f.timesheet_lock_days)) || n(f.timesheet_lock_days) < 1 || n(f.timesheet_lock_days) > 90)
  )
    e.timesheet_lock_days = 'A whole number of days from 1 to 90'
  if (
    f.budget_alert_pct === '' ||
    !Number.isInteger(n(f.budget_alert_pct)) ||
    n(f.budget_alert_pct) < 50 ||
    n(f.budget_alert_pct) > 100
  )
    e.budget_alert_pct = 'A whole percentage from 50 to 100'
  if (f.receipt_required_above !== '' && (Number.isNaN(n(f.receipt_required_above)) || n(f.receipt_required_above) < 0))
    e.receipt_required_above = 'Amount cannot be negative'

  return e
}

const Section = ({ icon, title, hint, children }) => (
  <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
    <div className='mb-3 flex items-start gap-3 border-b border-gray-100 pb-3'>
      <span
        className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'
        style={{ background: 'color-mix(in srgb, var(--theme-solid) 12%, transparent)', color: 'var(--theme-solid)' }}
      >
        <Icon icon={icon} width={19} />
      </span>
      <div>
        <div className='text-[15px] font-semibold text-slate-800'>{title}</div>
        <div className='text-xs text-gray-500'>{hint}</div>
      </div>
    </div>
    <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>{children}</div>
  </section>
)

const ProjectSettingsView = () => {
  const { projectId, project, picker } = useProjectPicker()
  const { data, isFetching } = useGetProjectSettingsQuery(projectId, { skip: !projectId })
  const [save, { isLoading }] = useSaveProjectSettingsMutation()
  const s = data?.detail
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (s) {
      setForm(toForm(s))
      setErrors({})
    }
  }, [s])

  const closed = project?.status === 'Closed'
  const dirty = form && s && JSON.stringify(form) !== JSON.stringify(toForm(s))
  const set = (id, value) => {
    setForm(p => ({ ...p, [id]: value }))
    setErrors(p => ({ ...p, [id]: null }))
  }
  const field = (id, props = {}) => ({
    id,
    value: form[id],
    disabled: closed,
    onChange: e => set(id, e.target.value),
    onBlur: () => setErrors(p => ({ ...p, [id]: getProjectSettingsErrors(form)[id] || null })),
    className: `${props.select ? ThemeStyles.formsInputsDropdown : ThemeStyles.formsInputs}${
      errors[id] ? ' !border !border-red-500' : ''
    }`
  })
  const err = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null
  const lbl = (text, hint) => (
    <span className={ThemeStyles.formLabels}>
      {text}
      {hint && <span className='ms-1 text-[11px] font-normal text-gray-400'>{hint}</span>}
    </span>
  )

  const addLabel = () => {
    const v = label.trim().toLowerCase()
    if (!v) return
    if (v.length > 30 || v.includes(','))
      return setErrors(p => ({ ...p, task_labels: 'At most 30 characters, without commas' }))
    if (form.task_labels.length >= 30) return setErrors(p => ({ ...p, task_labels: 'At most 30 labels' }))
    if (!form.task_labels.includes(v)) set('task_labels', [...form.task_labels, v])
    setLabel('')
  }

  const submit = async () => {
    const found = getProjectSettingsErrors(form)
    setErrors(found)
    const count = Object.keys(found).length
    if (count) return toast.error(count === 1 ? Object.values(found)[0] : `Please fix the ${count} highlighted fields`)
    const num = v => (v === '' ? null : Number(v))
    try {
      const resp = await save({
        projectId,
        body: {
          default_task_priority: form.default_task_priority,
          default_estimate_hours: num(form.default_estimate_hours),
          task_labels: form.task_labels,
          timesheet_lock_days: num(form.timesheet_lock_days),
          budget_alert_pct: Number(form.budget_alert_pct),
          receipt_required_above: num(form.receipt_required_above),
          default_tax_pct: Number(form.default_tax_pct),
          default_payment_terms: Number(form.default_payment_terms)
        }
      }).unwrap()
      toast.success(resp.detail)
    } catch (e) {
      if (e?.data?.errors) setErrors(e.data.errors)
    }
  }

  return (
    <PmsPage
      screenId='projects.projectSettings'
      actions={
        form && (
          <div className='flex gap-2'>
            {dirty && (
              <GhostButton onClick={() => setForm(toForm(s))}>
                <Icon icon='tabler:arrow-back-up' width={16} /> Undo changes
              </GhostButton>
            )}
            <PrimaryButton onClick={submit} disabled={isLoading || !dirty || closed}>
              <Icon icon='tabler:device-floppy' width={16} /> {isLoading ? 'Saving...' : 'Save Settings'}
            </PrimaryButton>
          </div>
        )
      }
    >
      <div className='mb-3 flex flex-wrap items-center gap-3'>
        {picker}
        {project && (
          <Link
            href={projectDetailsPath(project.id)}
            className='text-sm font-semibold hover:underline'
            style={{ color: 'var(--theme-solid)' }}
          >
            Open project
          </Link>
        )}
        {s && (
          <span className='text-xs text-gray-500'>
            {s.is_default ? 'Using the default settings' : `Changed ${timeAgo(s.updated_at)} by ${s.updated_by_name}`}
          </span>
        )}
      </div>
      {closed && (
        <div className='mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800'>
          {project.project_code} is Closed, so its settings are read-only.
        </div>
      )}

      {!projectId ? (
        <div className='py-10 text-center text-sm text-gray-500'>Pick a project.</div>
      ) : !form ? (
        <div className='py-10 text-center text-sm text-gray-500'>
          {isFetching ? 'Loading...' : 'No settings found.'}
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 xl:grid-cols-2' data-project-settings>
          <Section icon='tabler:checklist' title='Tasks' hint='Starting values for new tasks in this project'>
            <div className='space-y-1'>
              {lbl('Default Priority')}
              <select {...field('default_task_priority', { select: true })}>
                {PRIORITIES.map(p => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className='space-y-1'>
              {lbl('Default Estimate', '(hours, optional)')}
              <input {...field('default_estimate_hours')} type='number' min='0' step='0.5' placeholder='e.g. 4' />
              {err('default_estimate_hours')}
            </div>
            <div className='space-y-1 md:col-span-2'>
              {lbl('Suggested Labels', '(shown as quick picks in the task form)')}
              <div className='flex gap-2'>
                <input
                  id='new_label'
                  value={label}
                  disabled={closed}
                  maxLength={30}
                  onChange={e => {
                    setLabel(e.target.value)
                    setErrors(p => ({ ...p, task_labels: null }))
                  }}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                  placeholder='Type a label and press Enter, e.g. backend'
                  className={`${ThemeStyles.formsInputs}${errors.task_labels ? ' !border !border-red-500' : ''}`}
                />
                <GhostButton onClick={addLabel} disabled={closed}>
                  Add
                </GhostButton>
              </div>
              {err('task_labels')}
              <div className='flex flex-wrap gap-1.5 pt-1' data-labels>
                {form.task_labels.length === 0 && (
                  <span className='text-xs text-gray-400'>No suggested labels yet.</span>
                )}
                {form.task_labels.map(l => (
                  <span
                    key={l}
                    className='inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700'
                  >
                    {l}
                    {!closed && (
                      <button
                        type='button'
                        onClick={() =>
                          set(
                            'task_labels',
                            form.task_labels.filter(x => x !== l)
                          )
                        }
                        className='cursor-pointer text-gray-400 hover:text-red-600'
                        aria-label={`Remove label ${l}`}
                      >
                        <Icon icon='tabler:x' width={12} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          <Section icon='tabler:clock-hour-4' title='Timesheets' hint='Protect hours that were already reported'>
            <div className='space-y-1 md:col-span-2'>
              {lbl('Lock hours older than', '(days, empty = never lock)')}
              <input {...field('timesheet_lock_days')} type='number' min='1' max='90' placeholder='e.g. 7' />
              {err('timesheet_lock_days') || (
                <span className='block text-xs text-gray-500'>
                  {form.timesheet_lock_days
                    ? `Team members cannot log or change hours dated more than ${form.timesheet_lock_days} days ago.`
                    : 'Hours can be logged for any past date inside the project.'}
                </span>
              )}
            </div>
          </Section>

          <Section icon='tabler:wallet' title='Budget & Expenses' hint='Warnings and approval rules for money'>
            <div className='space-y-1'>
              {lbl('Budget Alert at', '(% of budget used)')}
              <input {...field('budget_alert_pct')} type='number' min='50' max='100' />
              {err('budget_alert_pct') || (
                <span className='block text-xs text-gray-500'>
                  Budget health turns &quot;At risk&quot; at {form.budget_alert_pct || '-'}% used.
                </span>
              )}
            </div>
            <div className='space-y-1'>
              {lbl('Receipt Required Above', '(₹, empty = never)')}
              <input {...field('receipt_required_above')} type='number' min='0' step='1' placeholder='e.g. 2000' />
              {err('receipt_required_above') || (
                <span className='block text-xs text-gray-500'>
                  {form.receipt_required_above !== ''
                    ? `Expenses above ₹${Number(form.receipt_required_above).toLocaleString(
                        'en-IN'
                      )} need a bill attached before they can be submitted.`
                    : 'Receipts are optional.'}
                </span>
              )}
            </div>
          </Section>

          <Section icon='tabler:receipt' title='Billing' hint='Starting values for new invoices of this project'>
            <div className='space-y-1'>
              {lbl('Default GST %')}
              <select {...field('default_tax_pct', { select: true })}>
                {TAX.map(t => (
                  <option key={t} value={t}>
                    {t}%
                  </option>
                ))}
              </select>
            </div>
            <div className='space-y-1'>
              {lbl('Default Payment Terms')}
              <select {...field('default_payment_terms', { select: true })}>
                {TERMS.map(d => (
                  <option key={d} value={d}>
                    {d === 0 ? 'Due on receipt' : `${d} days after issue`}
                  </option>
                ))}
              </select>
            </div>
          </Section>
        </div>
      )}
    </PmsPage>
  )
}

export default ProjectSettingsView
