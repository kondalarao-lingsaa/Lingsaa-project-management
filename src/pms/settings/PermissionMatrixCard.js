import React, { useEffect, useMemo, useState } from 'react'
import { Icon } from '@iconify/react'
import { Tooltip } from '@mui/material'
import toast from 'react-hot-toast'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { useGetPermissionsQuery, useSavePermissionsMutation } from 'src/store/apps/pms/accessApi'
import SettingsCard from './SettingsCard'

const ACTION_LABEL = { view: 'View', add: 'Add', edit: 'Edit', delete: 'Delete', approve: 'Approve' }
const SHORT = { view: 'V', add: 'A', edit: 'E', delete: 'D', approve: 'Ap' }

// The rules every PMS role setup follows (the same ones used by market PMS and ERP tools).
const RULES = [
  ['Least privilege', 'Each role gets only the rights its job needs; everything else is off by default.'],
  ['Separation of duties', 'Nobody approves their own request (hours, expenses, changes, projects).'],
  ['Authority by amount', 'Who approves depends on the money involved (Approval Rules below).'],
  ['Need to know', 'Members, Team Leads and PMs see only their own projects; pay rates only with Budget rights.'],
  ['Client isolation', 'A client sees only their own company’s projects, in the client portal.'],
  ['Admin safety', 'The Admin always keeps full access, and only the Admin changes users, roles and settings.']
]

// Settings > Users & Access > Permission Matrix: what each role can do in each module. Starts from the recommended
// matrix; the Admin can change a role, and locked cells (the safety rules) never change.
const PermissionMatrixCard = () => {
  const { data } = useGetPermissionsQuery()
  const [save, { isLoading: saving }] = useSavePermissionsMutation()
  const d = data?.detail
  const [role, setRole] = useState('project_manager')
  const [draft, setDraft] = useState({})
  const [confirmReset, setConfirmReset] = useState(false)

  // Load the chosen role's current rights into the editable copy.
  useEffect(() => {
    if (d) setDraft(Object.fromEntries(d.groups.map(g => [g.key, d.matrix[role]?.[g.key] || []])))
  }, [d, role])

  const dirty = useMemo(
    () => Boolean(d) && d.groups.some(g => (draft[g.key] || []).join() !== (d.matrix[role]?.[g.key] || []).join()),
    [d, draft, role]
  )

  if (!d) return null
  const isAdmin = role === 'admin'
  const lockReason = (group, action) => d.locked[role]?.[group]?.[action]
  const recommended = (group, action) => (d.defaults[role]?.[group] || []).includes(action)

  const toggle = (group, action) => {
    setDraft(prev => {
      const has = (prev[group] || []).includes(action)
      let next = has ? prev[group].filter(a => a !== action) : [...(prev[group] || []), action]
      // Any right needs View; taking View away takes every right on the module away.
      if (!has && action !== 'view' && !next.includes('view')) next = ['view', ...next]
      if (has && action === 'view') next = next.filter(a => lockReason(group, a))
      
return { ...prev, [group]: d.actions.filter(a => next.includes(a)) }
    })
  }

  const submit = async () => {
    try {
      const resp = await save({ role, permissions: draft }).unwrap()
      toast.success(resp.detail)
    } catch {
      // The shared error toast explains why.
    }
  }

  const reset = async () => {
    try {
      const resp = await save({ role, permissions: null }).unwrap()
      toast.success(resp.detail)
    } catch {
      // The shared error toast explains why.
    }
    setConfirmReset(false)
  }

  const roleTitle = d.roles.find(r => r.key === role)?.title
  const changedHere = d.changed.some(c => c.startsWith(`${role}.`))

  return (
    <div className='mb-4' data-permission-matrix>
      <SettingsCard
        icon='tabler:table-options'
        title='Permission Matrix'
        subtitle='What each role can do in each module. Starts from the recommended setup; locked cells keep the PMS safe'
      >
        <div className='mb-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3' data-pms-rules>
          {RULES.map(([title, text]) => (
            <div key={title} className='rounded-lg bg-gray-50 px-3 py-2'>
              <div className='text-[13px] font-semibold text-slate-800'>
                <Icon icon='tabler:shield-check' width={15} className='-mt-0.5 mr-1 inline text-emerald-600' />
                {title}
              </div>
              <div className='text-xs text-gray-600'>{text}</div>
            </div>
          ))}
        </div>

        <div className='mb-3 flex flex-wrap gap-2' role='tablist'>
          {d.roles.map(r => (
            <button
              key={r.key}
              type='button'
              role='tab'
              aria-selected={role === r.key}
              onClick={() => setRole(r.key)}
              data-matrix-role={r.key}
              className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold ${
                role === r.key ? 'border-transparent text-white' : 'border-gray-200 bg-white text-slate-600 hover:bg-gray-50'
              }`}
              style={role === r.key ? { background: 'var(--theme-solid)' } : undefined}
            >
              {r.title}
              {d.changed.some(c => c.startsWith(`${r.key}.`)) && <span className='ml-1' title='Changed from the recommended setup'>•</span>}
            </button>
          ))}
        </div>
        <p className='mb-3 text-[13px] text-gray-600'>
          <b>{roleTitle}:</b> {d.roles.find(r => r.key === role)?.responsibility}
          {isAdmin && ' The Admin always has full access.'}
        </p>

        <div className='overflow-x-auto'>
          <table className='w-full min-w-[720px] text-left text-[13px]' data-matrix-table>
            <thead>
              <tr className='border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500'>
                <th className='py-2 pr-3'>Module</th>
                {d.actions.map(a => (
                  <th key={a} className='w-[84px] py-2 text-center'>
                    {ACTION_LABEL[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.groups.map(g => (
                <tr key={g.key} className='border-b border-gray-100' data-matrix-row={g.key}>
                  <td className='py-2 pr-3'>
                    <div className='font-semibold text-slate-800'>{g.label}</div>
                    <div className='text-xs text-gray-500'>{g.description}</div>
                  </td>
                  {d.actions.map(a => {
                    const reason = lockReason(g.key, a)
                    const on = (draft[g.key] || []).includes(a)
                    const differs = !reason && on !== recommended(g.key, a)
                    const box = (
                      <label
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${reason ? 'cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-gray-100'} ${
                          differs ? 'ring-2 ring-amber-300' : ''
                        }`}
                      >
                        <input
                          type='checkbox'
                          checked={on}
                          disabled={Boolean(reason)}
                          onChange={() => toggle(g.key, a)}
                          aria-label={`${roleTitle} ${ACTION_LABEL[a]} ${g.label}`}
                          data-cell={`${g.key}.${a}`}
                          className='h-4 w-4'
                        />
                      </label>
                    )

                    return (
                      <td key={a} className='py-2 text-center'>
                        {reason ? (
                          <Tooltip title={reason} arrow>
                            <span>{box}</span>
                          </Tooltip>
                        ) : (
                          box
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className='mt-2 text-xs text-gray-500'>
          Grey boxes are locked by the safety rules (hover to see why). A yellow ring marks a change from the recommended setup.
          Changes apply when that person next opens a page.
        </p>

        {!isAdmin && (
          <div className='mt-4 flex flex-wrap justify-end gap-2'>
            {changedHere && (
              <GhostButton onClick={() => setConfirmReset(true)} disabled={saving}>
                <Icon icon='tabler:restore' width={16} /> Reset to Recommended
              </GhostButton>
            )}
            <PrimaryButton onClick={submit} disabled={!dirty || saving} data-save-matrix>
              <Icon icon='tabler:device-floppy' width={16} /> Save {roleTitle} Permissions
            </PrimaryButton>
          </div>
        )}

        <div className='mt-6'>
          <div className='mb-2 text-[14px] font-semibold text-slate-800'>All roles at a glance</div>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[860px] text-left text-xs' data-matrix-overview>
              <thead>
                <tr className='border-b border-gray-200 text-gray-500'>
                  <th className='py-2 pr-3'>Module</th>
                  {d.roles.map(r => (
                    <th key={r.key} className='py-2 pr-2 text-center'>
                      {r.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.groups.map(g => (
                  <tr key={g.key} className='border-b border-gray-100'>
                    <td className='py-1.5 pr-3 font-semibold text-slate-700'>{g.label}</td>
                    {d.roles.map(r => {
                      const acts = d.matrix[r.key]?.[g.key] || []

                      return (
                        <td key={r.key} className='py-1.5 pr-2 text-center tabular-nums text-slate-600'>
                          {acts.length ? acts.map(a => SHORT[a]).join(' ') : <span className='text-gray-300'>–</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className='mt-1 text-xs text-gray-500'>V View · A Add · E Edit · D Delete · Ap Approve</p>
        </div>
      </SettingsCard>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={reset}
        busy={saving}
        title='Reset to recommended?'
        message={`${roleTitle} goes back to the recommended permissions. Your changes for this role are removed.`}
        confirmText='Reset'
        cancelText='Cancel'
      />
    </div>
  )
}

export default PermissionMatrixCard
