import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import { inr, PrimaryButton } from 'src/pms/components/ui'
import { decimalOnly } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetSettingsQuery } from 'src/store/apps/pms/settingsApi'
import { useSaveApprovalLimitsMutation } from 'src/store/apps/pms/accessApi'
import SettingsCard from './SettingsCard'

const FIELDS = [
  ['pm_approval_limit', 'PM limit', 'Projects and budget changes up to this amount need no Director'],
  ['high_approval_limit', 'High limit', 'Above this, an Admin approves after the Director (two levels)'],
  ['expense_approval_limit', 'Expense limit', 'Expenses above this go to Finance, a Director or an Admin']
]

// Settings > Approval Rules: the amounts that decide who approves what (an authority matrix).
const ApprovalRulesCard = () => {
  const { data } = useGetSettingsQuery()
  const limits = data?.detail?.approvals
  const [save, { isLoading }] = useSaveApprovalLimitsMutation()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (limits) setForm(Object.fromEntries(FIELDS.map(([k]) => [k, String(limits[k])])))
  }, [limits?.pm_approval_limit, limits?.high_approval_limit, limits?.expense_approval_limit]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!form) return null
  const n = k => Number(form[k] || 0)

  const submit = async () => {
    const e = {}
    FIELDS.forEach(([k, label]) => {
      if (!(n(k) > 0)) e[k] = `Please Enter the ${label}`
    })
    if (!e.high_approval_limit && n('high_approval_limit') <= n('pm_approval_limit')) e.high_approval_limit = 'Must be more than the PM limit'
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      const resp = await save(Object.fromEntries(FIELDS.map(([k]) => [k, n(k)]))).unwrap()
      toast.success(resp.detail)
    } catch {
      // The shared error toast explains why.
    }
  }

  return (
    <div className='mb-4' data-approval-rules>
      <SettingsCard icon='tabler:gavel' title='Approval Rules' subtitle='Who approves what, by amount. Applies to the next approval'>
        <div className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
          {FIELDS.map(([k, label, hint]) => (
            <div key={k} className='space-y-1'>
              <label htmlFor={k} className={ThemeStyles.formLabels}>
                {label} (₹) <span className='text-red-500'>*</span>
              </label>
              <input
                id={k}
                inputMode='decimal'
                value={form[k]}
                onChange={e => {
                  setForm(prev => ({ ...prev, [k]: decimalOnly(e.target.value) }))
                  setErrors(prev => ({ ...prev, [k]: null }))
                }}
                className={`w-full rounded-lg border px-3 py-2 text-sm ${errors[k] ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors[k] ? <span className='block text-xs font-semibold text-red-500'>{errors[k]}</span> : <span className='block text-xs text-gray-500'>{hint}</span>}
            </div>
          ))}
        </div>

        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[560px] text-left text-[13px]' data-approval-matrix>
            <thead>
              <tr className='border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500'>
                <th className='py-2 pr-3'>Project budget or change amount</th>
                <th className='py-2'>Who approves</th>
              </tr>
            </thead>
            <tbody className='text-slate-700'>
              <tr className='border-b border-gray-100'>
                <td className='py-2 pr-3'>Internal project, or up to {inr(n('pm_approval_limit'))}</td>
                <td className='py-2'>No approval: approved on submit (a change: the project&apos;s manager)</td>
              </tr>
              <tr className='border-b border-gray-100'>
                <td className='py-2 pr-3'>
                  {inr(n('pm_approval_limit'))} to {inr(n('high_approval_limit'))}
                </td>
                <td className='py-2'>Director or Admin</td>
              </tr>
              <tr className='border-b border-gray-100'>
                <td className='py-2 pr-3'>Above {inr(n('high_approval_limit'))}</td>
                <td className='py-2'>Director, then Admin (two people)</td>
              </tr>
              <tr>
                <td className='py-2 pr-3'>Expense above {inr(n('expense_approval_limit'))}</td>
                <td className='py-2'>Finance, Director or Admin (smaller: the project&apos;s manager or team lead)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className='mt-2 text-xs text-gray-500'>Nobody approves their own request. Timesheets go to the project&apos;s manager or team lead; milestones to the client.</p>

        <div className='mt-4 flex justify-end'>
          <PrimaryButton onClick={submit} disabled={isLoading}>
            <Icon icon='tabler:device-floppy' width={16} /> {isLoading ? 'Saving...' : 'Save Approval Rules'}
          </PrimaryButton>
        </div>
      </SettingsCard>
    </div>
  )
}

export default ApprovalRulesCard
