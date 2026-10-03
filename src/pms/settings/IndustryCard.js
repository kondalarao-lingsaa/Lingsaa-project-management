import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { capitalizeWords } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetSettingsQuery, useLoadStarterTemplateMutation, useSaveIndustryMutation } from 'src/store/apps/pms/settingsApi'

const PM_ROLE = 'Project Manager'
const CUSTOM = '__custom__' // "Other": the company types its own industry (it starts from the General roles)
const CUSTOM_BASE = 'General'

// Settings > Industry & Team Roles: the PMS works the same for every industry; the industry sets the team
// roles people pick from (editable) and offers a starter project template.
const IndustryCard = () => {
  const { data } = useGetSettingsQuery()
  const s = data?.detail
  const [saveIndustry, { isLoading: saving }] = useSaveIndustryMutation()
  const [loadStarter, { isLoading: loading }] = useLoadStarterTemplateMutation()
  const [industry, setIndustry] = useState('')
  const [roles, setRoles] = useState([])
  const [newRole, setNewRole] = useState('')
  const [error, setError] = useState(null)
  const [customName, setCustomName] = useState('')
  const [customError, setCustomError] = useState(null)

  useEffect(() => {
    if (!s) return
    setIndustry(s.custom_industry ? CUSTOM : s.industry)
    setCustomName(s.custom_industry ? s.industry : '')
    setRoles(s.member_roles)
  }, [s])

  if (!s) return null
  const isCustom = industry === CUSTOM
  const chosen = isCustom ? customName.trim() : industry
  const preset = s.industries.find(i => i.name === (isCustom ? CUSTOM_BASE : industry))
  const changed = chosen !== s.industry || roles.join('|') !== s.member_roles.join('|')

  const pickIndustry = name => {
    setIndustry(name)
    // A new industry starts from its preset roles (your own: the General ones); they can be edited before saving.
    setRoles(s.industries.find(i => i.name === (name === CUSTOM ? CUSTOM_BASE : name))?.roles || roles)
    setError(null)
    setCustomError(null)
  }

  const addRole = () => {
    const role = capitalizeWords(newRole.trim())
    if (!role) return setError('Please Enter Role Name')
    if (role.length < 2 || role.length > 60) return setError('Role name must be 2 to 60 characters')
    if (roles.some(r => r.toLowerCase() === role.toLowerCase())) return setError(`'${role}' is already in the list`)
    if (roles.length >= 30) return setError('At most 30 roles')
    setRoles(prev => [...prev.filter(r => r !== 'Other'), role, ...(prev.includes('Other') ? ['Other'] : [])])
    setNewRole('')
    setError(null)
  }

  const save = async () => {
    if (isCustom && (chosen.length < 2 || !/[A-Za-z]/.test(chosen))) return setCustomError('Please Enter your Industry (at least 2 letters)')
    try {
      const resp = await saveIndustry({ industry: chosen, member_roles: roles }).unwrap()
      toast.success(resp.detail)
    } catch {
      // shown by the shared error toast
    }
  }

  const addTemplate = async () => {
    try {
      const resp = await loadStarter(isCustom ? chosen || CUSTOM_BASE : industry).unwrap()
      toast.success(resp.detail)
    } catch {
      // shown by the shared error toast (for example: already added)
    }
  }

  return (
    <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm' data-industry-card>
      <div className='mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3'>
        <div className='flex items-start gap-3'>
          <span
            className='flex h-9 w-9 items-center justify-center rounded-lg'
            style={{ background: 'color-mix(in srgb, var(--theme-solid) 12%, transparent)', color: 'var(--theme-solid)' }}
          >
            <Icon icon='tabler:building-factory-2' width={19} />
          </span>
          <div>
            <div className='text-[15px] font-semibold text-slate-800'>Industry & Team Roles</div>
            <div className='text-xs text-gray-500'>The roles people pick when they are added to a project team</div>
          </div>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <div>
          <label htmlFor='industry' className={ThemeStyles.formLabels}>
            Industry
          </label>
          <select id='industry' value={industry} onChange={e => pickIndustry(e.target.value)} className={ThemeStyles.formsInputsDropdown}>
            {s.industries.map(i => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
            <option value={CUSTOM}>Other (type your own)</option>
          </select>
          {isCustom && (
            <div className='mt-2'>
              <input
                id='custom_industry'
                type='text'
                maxLength={60}
                value={customName}
                onChange={e => {
                  setCustomName(capitalizeWords(e.target.value.replace(/|/g, '')))
                  setCustomError(null)
                }}
                placeholder='Your industry, e.g. Solar Installation'
                className={`${ThemeStyles.formsInputs}${customError ? ' !border !border-red-500' : ''}`}
              />
              {customError && <span className='!mt-1 block text-xs font-semibold text-red-500'>{customError}</span>}
            </div>
          )}
          {preset && (
            <div className='mt-3 rounded-lg border border-dashed border-gray-300 p-3'>
              <div className='text-xs font-medium text-gray-500'>Starter template</div>
              <div className='text-[14px] font-semibold text-slate-800'>{preset.template}</div>
              <GhostButton onClick={addTemplate} disabled={loading} className='mt-2'>
                <Icon icon='tabler:template' width={16} /> Add to Project Templates
              </GhostButton>
            </div>
          )}
        </div>

        <div className='lg:col-span-2'>
          <div className={ThemeStyles.formLabels}>Team roles ({roles.length})</div>
          <div className='flex flex-wrap gap-2' data-role-list>
            {roles.map(role => (
              <span key={role} className='inline-flex items-center gap-1 rounded-full border border-gray-300 px-3 py-1 text-[13px] text-slate-700'>
                {role}
                {role !== PM_ROLE && (
                  <button
                    type='button'
                    onClick={() => setRoles(prev => prev.filter(r => r !== role))}
                    aria-label={`Remove ${role}`}
                    className='cursor-pointer text-gray-400 hover:text-red-600'
                  >
                    <Icon icon='tabler:x' width={14} />
                  </button>
                )}
              </span>
            ))}
          </div>
          <div className='mt-3 flex flex-col gap-2 sm:flex-row'>
            <input
              id='new_role'
              type='text'
              maxLength={60}
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRole()}
              placeholder='Add a role, e.g. Site Engineer'
              className={`${ThemeStyles.formsInputs}${error ? ' !border !border-red-500' : ''} sm:max-w-xs`}
            />
            <GhostButton onClick={addRole}>
              <Icon icon='tabler:plus' width={16} /> Add Role
            </GhostButton>
          </div>
          {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
          <p className='mt-2 text-xs text-gray-500'>
            Project Manager always stays: the manager joins every team with it. Members keep their current role if you remove it from
            the list.
          </p>
        </div>
      </div>

      <div className='mt-4 flex justify-end border-t border-gray-100 pt-3'>
        <PrimaryButton onClick={save} disabled={!changed || saving}>
          <Icon icon='tabler:device-floppy' width={16} /> Save Industry & Roles
        </PrimaryButton>
      </div>
    </section>
  )
}

export default IndustryCard
