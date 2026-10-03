import React, { useState } from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { digitsOnly, EMAIL_REGEX, personName } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetUsersQuery, useRemoveUserMutation, useSaveUserMutation } from 'src/store/apps/pms/accessApi'
import SettingsCard from './SettingsCard'

const EMPTY = { user_id: '', user_name: '', email: '', role: '', customer_name: '', is_active: true }

const ROLE_TONE = {
  admin: '#4f46e5',
  director: '#7c3aed',
  project_manager: '#2563eb',
  team_lead: '#0891b2',
  member: '#64748b',
  finance: '#16a34a',
  resource_manager: '#d97706',
  client: '#db2777'
}

const validate = (form, isEdit) => {
  const e = {}
  if (!isEdit && !/^\d{1,9}$/.test(String(form.user_id))) e.user_id = 'Please Enter the User ID (from Master)'
  if ((form.user_name || '').trim().length < 2) e.user_name = 'Please Enter Name'
  if (form.email && !EMAIL_REGEX.test(form.email.trim())) e.email = 'Please Enter a valid Email'
  if (!form.role) e.role = 'Please Select Role'
  if (form.role === 'client' && !form.customer_name) e.customer_name = "Please Select the Client's company"

  return e
}

// Settings > Users & Roles: each login user's PMS role. The role decides the screens they see, what they can
// change, which projects they see and what they can approve.
const UsersRolesCard = () => {
  const { data, isFetching } = useGetUsersQuery()
  const [saveUser, { isLoading: saving }] = useSaveUserMutation()
  const [removeUser, { isLoading: removing }] = useRemoveUserMutation()
  const [form, setForm] = useState(null) // null = closed
  const [errors, setErrors] = useState({})
  const [toRemove, setToRemove] = useState(null)
  const [showRoles, setShowRoles] = useState(false)

  const d = data?.detail
  if (!d) return null
  const isEdit = Boolean(form?.id)
  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: null }))
  }

  const submit = async () => {
    const e = validate(form, isEdit)
    setErrors(e)
    if (Object.keys(e).length) return
    const body = {
      user_id: Number(form.user_id),
      user_name: form.user_name.trim(),
      email: form.email?.trim() || null,
      role: form.role,
      customer_name: form.role === 'client' ? form.customer_name : null,
      is_active: form.is_active
    }
    try {
      const resp = await saveUser({ id: form.id, body }).unwrap()
      toast.success(resp.detail)
      setForm(null)
    } catch (err) {
      if (err?.data?.errors) setErrors(err.data.errors)
    }
  }

  const field = (id, label, input, required = true) => (
    <div className='space-y-1'>
      <label htmlFor={id} className={ThemeStyles.formLabels}>
        {label} {required && <span className='text-red-500'>*</span>}
      </label>
      {input}
      {errors[id] && <span className='block text-xs font-semibold text-red-500'>{errors[id]}</span>}
    </div>
  )
  const inputClass = id => `w-full rounded-lg border px-3 py-2 text-sm ${errors[id] ? 'border-red-500' : 'border-gray-300'}`

  return (
    <div className='mb-4' data-users-roles>
      <SettingsCard
        icon='tabler:user-shield'
        title='Users & Roles'
        subtitle='Each person’s role decides the screens they see, which projects they see and what they can approve'
        action={
          <div className='flex gap-2'>
            <GhostButton onClick={() => setShowRoles(v => !v)}>
              <Icon icon='tabler:info-circle' width={16} /> {showRoles ? 'Hide' : 'What each role does'}
            </GhostButton>
            <PrimaryButton
              onClick={() => {
                setErrors({})
                setForm(EMPTY)
              }}
            >
              <Icon icon='tabler:user-plus' width={16} /> Add User
            </PrimaryButton>
          </div>
        }
      >
        {showRoles && (
          <div className='mb-4 grid grid-cols-1 gap-2 md:grid-cols-2' data-role-guide>
            {d.roles.map(r => (
              <div key={r.key} className='rounded-lg border border-gray-100 bg-gray-50 px-3 py-2'>
                <div className='text-[13px] font-semibold' style={{ color: ROLE_TONE[r.key] }}>
                  {r.title}
                </div>
                <div className='text-xs text-gray-600'>{r.responsibility}</div>
              </div>
            ))}
          </div>
        )}

        <div className='overflow-x-auto'>
          <table className='w-full min-w-[640px] text-left text-[13px]'>
            <thead>
              <tr className='border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500'>
                <th className='py-2 pr-3'>Name</th>
                <th className='py-2 pr-3'>User ID</th>
                <th className='py-2 pr-3'>Role</th>
                <th className='py-2 pr-3'>Client company</th>
                <th className='py-2 pr-3'>Access</th>
                <th className='py-2 text-right'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {d.users.map(u => (
                <tr key={u.id} className='border-b border-gray-100' data-user-row={u.user_id}>
                  <td className='py-2 pr-3'>
                    <div className='font-semibold text-slate-800'>{u.user_name}</div>
                    {u.email && <div className='text-xs text-gray-500'>{u.email}</div>}
                  </td>
                  <td className='py-2 pr-3 tabular-nums text-gray-600'>{u.user_id}</td>
                  <td className='py-2 pr-3'>
                    <span
                      className='rounded-full px-2 py-0.5 text-xs font-semibold'
                      style={{ color: ROLE_TONE[u.role], background: `color-mix(in srgb, ${ROLE_TONE[u.role]} 12%, transparent)` }}
                    >
                      {u.role_title}
                    </span>
                  </td>
                  <td className='py-2 pr-3 text-gray-600'>{u.customer_name || '-'}</td>
                  <td className='py-2 pr-3'>
                    {u.is_active ? <span className='text-emerald-700'>On</span> : <span className='text-red-600'>Off</span>}
                  </td>
                  <td className='py-2 text-right'>
                    <button
                      type='button'
                      className='mr-3 cursor-pointer text-[13px] font-semibold hover:underline'
                      style={{ color: 'var(--theme-solid)' }}
                      onClick={() => {
                        setErrors({})
                        setForm({ ...u, email: u.email || '', customer_name: u.customer_name || '' })
                      }}
                    >
                      Change Role
                    </button>
                    <button type='button' className='cursor-pointer text-[13px] font-semibold text-red-600 hover:underline' onClick={() => setToRemove(u)}>
                      Remove Role
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className='mt-3 text-xs text-gray-500'>
          {isFetching ? 'Refreshing… ' : ''}People without a role here are Members. The company always keeps at least one Admin.
        </p>
      </SettingsCard>

      <ConfirmDialog
        open={Boolean(toRemove)}
        onClose={() => setToRemove(null)}
        busy={removing}
        title='Remove this role?'
        message={toRemove ? `${toRemove.user_name} goes back to being a Member.` : ''}
        confirmText='Remove Role'
        cancelText='Cancel'
        onConfirm={async () => {
          try {
            const resp = await removeUser(toRemove.id).unwrap()
            toast.success(resp.detail)
          } catch {
            // The shared error toast explains why (for example the only Admin).
          }
          setToRemove(null)
        }}
      />

      <Dialog open={Boolean(form)} onClose={() => setForm(null)} maxWidth='sm' fullWidth>
        <DialogTitle className='!border-b !border-gray-100 !p-4 !pb-3 !text-[17px] !font-bold'>
          {isEdit ? `Edit ${form?.user_name}` : 'Add User'}
        </DialogTitle>
        {form && (
          <DialogContent className='!pt-4'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              {field(
                'user_id',
                'User ID',
                <input
                  id='user_id'
                  inputMode='numeric'
                  disabled={isEdit}
                  value={form.user_id}
                  maxLength={9}
                  onChange={e => set('user_id', digitsOnly(e.target.value))}
                  className={`${inputClass('user_id')} disabled:bg-gray-100`}
                />
              )}
              {field(
                'user_name',
                'Name',
                <input
                  id='user_name'
                  value={form.user_name}
                  maxLength={200}
                  onChange={e => set('user_name', personName(e.target.value))}
                  className={inputClass('user_name')}
                />
              )}
              {field(
                'email',
                'Email',
                <input
                  id='email'
                  type='email'
                  value={form.email}
                  maxLength={150}
                  onChange={e => set('email', e.target.value.replace(/\s/g, ''))}
                  className={inputClass('email')}
                />,
                false
              )}
              {field(
                'role',
                'Role',
                <select id='role' value={form.role} onChange={e => set('role', e.target.value)} className={inputClass('role')}>
                  <option value=''>Select Role</option>
                  {d.roles.map(r => (
                    <option key={r.key} value={r.key}>
                      {r.title}
                    </option>
                  ))}
                </select>
              )}
              {form.role === 'client' &&
                field(
                  'customer_name',
                  "Client's company",
                  <select
                    id='customer_name'
                    value={form.customer_name}
                    onChange={e => set('customer_name', e.target.value)}
                    className={inputClass('customer_name')}
                  >
                    <option value=''>Select Client</option>
                    {d.customers.map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
              <label className='flex items-center gap-2 self-end text-sm text-slate-700'>
                <input type='checkbox' id='is_active' checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
                Access on
              </label>
            </div>
            {form.role && (
              <p className='mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600'>
                {d.roles.find(r => r.key === form.role)?.responsibility}
              </p>
            )}
          </DialogContent>
        )}
        <DialogActions className='!justify-end !gap-2 !border-t !border-gray-100 !bg-gray-50 !p-3'>
          <GhostButton onClick={() => setForm(null)}>Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save' : 'Add User'}
          </PrimaryButton>
        </DialogActions>
      </Dialog>
    </div>
  )
}

export default UsersRolesCard
