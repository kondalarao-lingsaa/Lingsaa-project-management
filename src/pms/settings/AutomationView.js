import React, { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import StatCard from 'src/pms/components/StatCard'
import { GhostButton, PrimaryButton, timeAgo } from 'src/pms/components/ui'
import { useCan } from 'src/pms/access/useAccess'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  useGetAutomationQuery,
  useGetAutomationRunsQuery,
  useRunAutomationMutation,
  useSaveAutomationMutation
} from 'src/store/apps/pms/automationApi'
import SettingsCard from './SettingsCard'

const GROUP_INFO = {
  Reminders: { icon: 'tabler:bell-ringing', subtitle: 'Nudges people about work, approvals and hours, so nobody has to chase them' },
  'Reports & alerts': { icon: 'tabler:report-analytics', subtitle: 'Status reports and early warnings about money and deadlines' },
  Billing: { icon: 'tabler:receipt', subtitle: 'Draft invoices and payment follow-ups. Finance still reviews and issues every invoice' },
  Work: { icon: 'tabler:checklist', subtitle: 'Routine task, milestone and sprint updates the team would otherwise do by hand' }
}

const STATUS_STYLE = {
  Success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Nothing to do': 'bg-slate-50 text-slate-600 border-slate-200',
  Failed: 'bg-red-50 text-red-700 border-red-200'
}

const StatusTag = ({ status }) =>
  status ? (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[status] || STATUS_STYLE['Nothing to do']}`}>
      {status}
    </span>
  ) : null

// "2026-10-07T09:00" (server's local time) -> "Wed 07 Oct, 09:00 am"
const formatWhen = iso => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso

  return d.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const Switch = ({ checked, onChange, disabled, label }) => (
  <button
    type='button'
    role='switch'
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? '' : 'bg-gray-300'
    }`}
    style={checked ? { background: 'var(--theme-solid)' } : undefined}
  >
    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
)

const formOf = job => ({
  run_time: job.run_time || '',
  weekday: job.weekday ?? '',
  month_day: job.month_day ?? '',
  params: Object.fromEntries(job.param_fields.map(f => [f.key, String(job.params[f.key] ?? f.default)]))
})

// One automation: switch, what it does, when it runs, its numbers, last and next run.
const JobRow = ({ job, weekdays, canEdit, onRun }) => {
  const [save, { isLoading: saving }] = useSaveAutomationMutation()
  const [form, setForm] = useState(() => formOf(job))
  const [errors, setErrors] = useState({})
  useEffect(() => {
    setForm(formOf(job))
    setErrors({})
  }, [job])

  const initial = formOf(job)
  const dirty = JSON.stringify(initial) !== JSON.stringify(form)
  const isEvent = job.schedule === 'event'

  const send = async body => {
    try {
      const resp = await save({ key: job.key, body }).unwrap()
      toast.success(resp.detail)
    } catch {
      // The shared error toast explains why.
    }
  }

  const submit = () => {
    const e = {}
    if (!isEvent && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.run_time)) e.run_time = 'Please Select the time'
    job.param_fields.forEach(f => {
      const v = Number(form.params[f.key])
      if (form.params[f.key] === '' || !Number.isInteger(v) || v < f.min || v > f.max) e[f.key] = `Enter ${f.min} to ${f.max}`
    })
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields')

      return
    }
    send({
      ...(isEvent ? {} : { run_time: form.run_time }),
      ...(job.schedule === 'weekly' ? { weekday: Number(form.weekday) } : {}),
      ...(job.schedule === 'monthly' ? { month_day: Number(form.month_day) } : {}),
      params: Object.fromEntries(job.param_fields.map(f => [f.key, Number(form.params[f.key])]))
    })
  }

  const input = 'rounded-md border border-gray-300 px-2 py-1.5 text-sm'

  return (
    <div className='border-t border-gray-100 py-3 first:border-t-0 first:pt-0' data-automation={job.key}>
      <div className='flex flex-wrap items-start gap-3'>
        <Switch checked={job.enabled} disabled={!canEdit || saving} onChange={v => send({ enabled: v })} label={`${job.title}: on or off`} />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className={`text-[14px] font-semibold ${job.enabled ? 'text-slate-800' : 'text-slate-400'}`}>{job.title}</span>
            {!job.enabled && <span className='rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500'>Off</span>}
          </div>
          <p className='mt-0.5 text-xs leading-5 text-gray-500'>{job.description}</p>

          <div className='mt-2 flex flex-wrap items-end gap-3'>
            {isEvent ? (
              <span className='inline-flex items-center gap-1 text-xs font-semibold text-slate-600'>
                <Icon icon='tabler:bolt' width={14} /> Runs straight away, when it happens
              </span>
            ) : (
              <>
                {job.schedule === 'weekly' && (
                  <label className='flex flex-col gap-1 text-xs font-semibold text-slate-600'>
                    Day
                    <select
                      id={`${job.key}_weekday`}
                      value={form.weekday}
                      disabled={!canEdit}
                      onChange={e => setForm(p => ({ ...p, weekday: e.target.value }))}
                      className={`${input} pr-6`}
                    >
                      {weekdays.map((w, i) => (
                        <option key={w} value={i}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {job.schedule === 'monthly' && (
                  <label className='flex flex-col gap-1 text-xs font-semibold text-slate-600'>
                    Day of month
                    <select
                      id={`${job.key}_month_day`}
                      value={form.month_day}
                      disabled={!canEdit}
                      onChange={e => setForm(p => ({ ...p, month_day: e.target.value }))}
                      className={`${input} pr-6`}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className='flex flex-col gap-1 text-xs font-semibold text-slate-600'>
                  {job.schedule === 'daily' ? (job.working_days ? 'Every working day at' : 'Every day at') : 'Time'}
                  <input
                    id={`${job.key}_run_time`}
                    type='time'
                    value={form.run_time}
                    disabled={!canEdit}
                    onChange={e => {
                      setForm(p => ({ ...p, run_time: e.target.value }))
                      setErrors(p => ({ ...p, run_time: null }))
                    }}
                    className={`${input} ${errors.run_time ? '!border-red-500' : ''}`}
                  />
                </label>
              </>
            )}
            {job.param_fields.map(f => (
              <label key={f.key} className='flex max-w-[260px] flex-col gap-1 text-xs font-semibold text-slate-600'>
                {f.label}
                <input
                  id={`${job.key}_${f.key}`}
                  inputMode='numeric'
                  value={form.params[f.key]}
                  disabled={!canEdit}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 3)
                    setForm(p => ({ ...p, params: { ...p.params, [f.key]: v } }))
                    setErrors(p => ({ ...p, [f.key]: null }))
                  }}
                  className={`${input} w-24 ${errors[f.key] ? '!border-red-500' : ''}`}
                />
                {errors[f.key] ? (
                  <span className='font-semibold text-red-500'>{errors[f.key]}</span>
                ) : (
                  f.hint && <span className='font-normal text-gray-500'>{f.hint}</span>
                )}
              </label>
            ))}
            {canEdit && dirty && (
              <div className='flex gap-2'>
                <PrimaryButton onClick={submit} disabled={saving}>
                  <Icon icon='tabler:device-floppy' width={15} /> {saving ? 'Saving...' : 'Save'}
                </PrimaryButton>
                <GhostButton onClick={() => setForm(initial)}>Undo</GhostButton>
              </div>
            )}
          </div>

          <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500'>
            {!isEvent && (
              <span>
                Next run: <b className='text-slate-700'>{job.enabled ? formatWhen(job.next_run_at) || '-' : 'switched off'}</b>
              </span>
            )}
            <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
              Last run:{' '}
              {job.last_run_at ? (
                <>
                  <StatusTag status={job.last_status} />
                  <span>{timeAgo(job.last_run_at)}</span>
                  <span className='min-w-0 break-words text-slate-600'>{job.last_summary}</span>
                </>
              ) : (
                <b className='text-slate-700'>not yet</b>
              )}
            </span>
          </div>
        </div>
        {!isEvent && canEdit && (
          <GhostButton onClick={() => onRun(job)} disabled={!job.enabled} aria-label={`Run ${job.title} now`}>
            <Icon icon='tabler:player-play' width={15} /> Run now
          </GhostButton>
        )}
      </div>
    </div>
  )
}

const AutomationView = () => {
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const { data, isLoading } = useGetAutomationQuery()
  const [jobFilter, setJobFilter] = useState('')
  const { data: runsResp, isFetching: loadingRuns } = useGetAutomationRunsQuery({ jobKey: jobFilter || undefined, limit: 50 })
  const [run, { isLoading: running }] = useRunAutomationMutation()
  const [confirming, setConfirming] = useState(null)
  const d = data?.detail
  const jobs = useMemo(() => d?.jobs || [], [d])
  const runs = runsResp?.detail || []

  const scheduled = jobs.filter(j => j.schedule !== 'event')
  const nextJob = scheduled
    .filter(j => j.enabled && j.next_run_at)
    .sort((a, b) => a.next_run_at.localeCompare(b.next_run_at))[0]
  const failed = runs.filter(r => r.status === 'Failed').length

  const runNow = async () => {
    const job = confirming
    setConfirming(null)
    try {
      const resp = await run(job.key).unwrap()
      if (resp.data?.status === 'Failed') toast.error(resp.detail, { duration: 8000 })
      else toast.success(resp.detail, { duration: 6000 })
    } catch {
      // The shared error toast explains why.
    }
  }

  return (
    <PmsPage screenId='settings.automation'>
      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={runNow}
        title={`Run "${confirming?.title}" now?`}
        message='It does now exactly what it does at its scheduled time: messages and emails are sent, and drafts or tasks are created. Alerts already sent are not sent again. Its scheduled run still happens as usual.'
        confirmText='Run now'
        cancelText='Cancel'
        busy={running}
      />

      {d && !d.scheduler_running && (
        <div className='mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800' data-scheduler-off>
          <Icon icon='tabler:alert-triangle' width={18} className='mt-0.5 shrink-0' />
          <span>
            The scheduler is not running on this server (AUTOMATION_ENABLED is off), so scheduled jobs do not run here by
            themselves. Run now still works.
          </span>
        </div>
      )}

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:robot' tone='indigo' label='Automations On' value={`${jobs.filter(j => j.enabled).length} of ${jobs.length}`} hint='switch each one below' />
        <StatCard
          icon='tabler:clock-play'
          tone='emerald'
          label='Next Run'
          value={nextJob ? formatWhen(nextJob.next_run_at) : '-'}
          hint={nextJob ? nextJob.title : 'nothing scheduled'}
        />
        <StatCard icon='tabler:history' tone='blue' label='Recent Runs' value={runs.length} hint={jobFilter ? 'of this automation' : 'latest 50, all automations'} />
        <StatCard icon='tabler:alert-octagon' tone={failed ? 'red' : 'emerald'} label='Failed' value={failed} hint={failed ? 'see Run History below' : 'all recent runs worked'} />
      </div>

      {isLoading ? (
        <div className='py-10 text-center text-slate-600'>Loading...</div>
      ) : (
        <div className='grid grid-cols-1 gap-4'>
          {(d?.groups || []).map(group => (
            <SettingsCard key={group} icon={GROUP_INFO[group]?.icon || 'tabler:robot'} title={group} subtitle={GROUP_INFO[group]?.subtitle}>
              {jobs
                .filter(j => j.group === group)
                .map(job => (
                  <JobRow key={job.key} job={job} weekdays={d.weekdays} canEdit={canEdit} onRun={setConfirming} />
                ))}
            </SettingsCard>
          ))}

          <SettingsCard
            icon='tabler:history'
            title='Run History'
            subtitle='What each automation did, newest first (kept for 90 days)'
            action={
              <select
                id='automation_run_filter'
                value={jobFilter}
                onChange={e => setJobFilter(e.target.value)}
                className={`${ThemeStyles.formsInputsDropdown} md:w-72`}
                aria-label='Show runs of'
              >
                <option value=''>All automations</option>
                {jobs.map(j => (
                  <option key={j.key} value={j.key}>
                    {j.title}
                  </option>
                ))}
              </select>
            }
          >
            <div className={`overflow-x-auto transition-opacity ${loadingRuns ? 'opacity-60' : ''}`}>
              <table className='w-full min-w-[760px] text-left text-[13px]' data-automation-runs>
                <thead className='border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500'>
                  <tr>
                    <th className='py-2 pr-3'>When</th>
                    <th className='py-2 pr-3'>Automation</th>
                    <th className='py-2 pr-3'>Started by</th>
                    <th className='py-2 pr-3'>Result</th>
                    <th className='py-2'>What it did</th>
                  </tr>
                </thead>
                <tbody className='text-slate-700'>
                  {runs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className='py-8 text-center text-slate-500'>
                        No runs yet. Scheduled automations run at their time; use Run now to try one.
                      </td>
                    </tr>
                  ) : (
                    runs.map(r => (
                      <tr key={r.id} className='border-b border-gray-100 align-top'>
                        <td className='whitespace-nowrap py-2 pr-3' title={r.started_at}>
                          {timeAgo(r.started_at)}
                        </td>
                        <td className='py-2 pr-3 font-semibold'>{r.title}</td>
                        <td className='whitespace-nowrap py-2 pr-3'>
                          {r.trigger === 'Schedule' ? 'Schedule' : r.trigger === 'Event' ? 'Event' : r.started_by_name || 'Manual'}
                        </td>
                        <td className='py-2 pr-3'>
                          <StatusTag status={r.status} />
                        </td>
                        <td className='max-w-[460px] break-words py-2'>{r.summary}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SettingsCard>
        </div>
      )}
    </PmsPage>
  )
}

export default AutomationView
