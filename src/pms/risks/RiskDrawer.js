import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { Chip } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst, collectErrors, getRiskFieldError, RISK_VALIDATED_FIELDS, riskLevel } from 'src/pms/utils/validation'
import { useGetRiskMetaQuery, useSaveRiskMutation } from 'src/store/apps/pms/risksApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'
import { useGetProjectMilestonesQuery } from 'src/store/apps/pms/billingApi'

export const LEVEL_TONE = { High: 'red', Medium: 'amber', Low: 'green' }
export const SCALE = ['1 - Very low', '2 - Low', '3 - Medium', '4 - High', '5 - Very high']

const todayIso = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = { title: '', description: '', category: '', probability: '', impact: '', owner_member_id: '', mitigation: '', contingency: '', review_date: '', milestone_id: '' }
const Required = () => <span className='text-red-500'>*</span>

const RiskDrawer = ({ open, onClose, project, risk }) => {
  const isEdit = Boolean(risk)
  const today = todayIso()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const { data: metaResp } = useGetRiskMetaQuery(undefined, { skip: !open })
  const { data: membersResp } = useGetProjectMembersQuery(project?.id, { skip: !open || !project })
  const { data: milestonesResp } = useGetProjectMilestonesQuery(project?.id, { skip: !open || !project })
  const [save, { isLoading }] = useSaveRiskMutation()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      isEdit
        ? { ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, risk[k] === null || risk[k] === undefined ? '' : String(risk[k])])), original_review_date: risk.review_date || '' }
        : EMPTY
    )
  }, [open, isEdit, risk])

  const score = form.probability && form.impact ? Number(form.probability) * Number(form.impact) : null
  const level = score ? riskLevel(score) : null

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({ ...prev, [id]: ['title', 'description', 'mitigation', 'contingency'].includes(id) ? capitalizeFirst(value) : value }))
    setError(id, null)
    // Changing the score can make the mitigation plan required (or no longer required).
    if (id === 'probability' || id === 'impact') setError('mitigation', null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id => (errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null)
  const input = id => ({ id, value: form[id], onChange: handleChange, onBlur: () => setError(id, getRiskFieldError(id, form[id], form, today)) })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(RISK_VALIDATED_FIELDS, (f, v, fm) => getRiskFieldError(f, v, fm, today), form)
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
        description: form.description.trim() || null,
        category: form.category,
        probability: Number(form.probability),
        impact: Number(form.impact),
        owner_member_id: form.owner_member_id ? Number(form.owner_member_id) : null,
        mitigation: form.mitigation.trim() || null,
        contingency: form.contingency.trim() || null,
        review_date: form.review_date || null,
        milestone_id: form.milestone_id ? Number(form.milestone_id) : null
      }
      const resp = await save({ projectId: project.id, id: risk?.id, body }).unwrap()
      toast.success(resp?.detail || 'Risk saved')
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const section = ThemeStyles.drawerHeadingSection

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[55%] xl:w-[40%] 2xl:w-[34%]'>
          <DrawerHeader title={isEdit ? `Edit Risk ${risk.risk_key}` : 'Add Risk'} subtitle={project ? `${project.project_code} · ${project.project_name}` : ''} icon={ShieldAlert} />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <Required /> are required. Score = probability x impact (1-25): 15+ is High and needs a mitigation plan.
            </p>
            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <ShieldAlert className={`${ThemeStyles.drawerHeadingIcon} text-orange-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Risk</span>
                {level && (
                  <span className='ms-auto'>
                    <Chip tone={LEVEL_TONE[level]}>
                      {level} · score {score}
                    </Chip>
                  </span>
                )}
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Risk Title <Required />
                  </span>
                  <input {...input('title')} type='text' maxLength={200} placeholder='e.g. Vendor API may be delivered late' className={`${ThemeStyles.formsInputs}${errorBorder('title')}`} />
                  {fieldError('title')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Category <Required />
                  </span>
                  <select {...input('category')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('category')}`}>
                    <option value=''>Select category</option>
                    {(metaResp?.detail?.categories || []).map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {fieldError('category')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Owner</span>
                  <select {...input('owner_member_id')} className={ThemeStyles.formsInputsDropdown}>
                    <option value=''>{(membersResp?.detail || []).length ? 'No owner yet' : 'No team members yet'}</option>
                    {(membersResp?.detail || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.member_name} - {m.role}
                      </option>
                    ))}
                    {/* An owner removed from the team since: shown so the form says who it is, and can be changed. */}
                    {membersResp && risk?.owner_member_id && !(membersResp.detail || []).some(m => m.id === risk.owner_member_id) && (
                      <option value={risk.owner_member_id}>{risk.owner_name || 'Owner'} (left the team)</option>
                    )}
                  </select>
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Probability <Required />
                  </span>
                  <select {...input('probability')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('probability')}`}>
                    <option value=''>How likely?</option>
                    {SCALE.map((label, i) => (
                      <option key={label} value={i + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {fieldError('probability')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Impact <Required />
                  </span>
                  <select {...input('impact')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('impact')}`}>
                    <option value=''>How bad if it happens?</option>
                    {SCALE.map((label, i) => (
                      <option key={label} value={i + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {fieldError('impact')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Description</span>
                  <textarea {...input('description')} rows={2} maxLength={2000} placeholder='What could happen and why' className={ThemeStyles.formsInputs} />
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <ShieldCheck className={`${ThemeStyles.drawerHeadingIcon} text-emerald-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Response Plan</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Mitigation {level === 'High' && <Required />}</span>
                  <textarea {...input('mitigation')} rows={2} maxLength={2000} placeholder='What we do now to make it less likely or less harmful' className={`${ThemeStyles.formsInputs}${errorBorder('mitigation')}`} />
                  {fieldError('mitigation')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Contingency</span>
                  <textarea {...input('contingency')} rows={2} maxLength={2000} placeholder='What we do if it happens anyway' className={ThemeStyles.formsInputs} />
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Next Review</span>
                  <input {...input('review_date')} type='date' min={today} className={`${ThemeStyles.formsInputs}${errorBorder('review_date')}`} />
                  {fieldError('review_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Threatens Milestone</span>
                  <select {...input('milestone_id')} className={ThemeStyles.formsInputsDropdown}>
                    <option value=''>None</option>
                    {(milestonesResp?.detail || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <DrawerFooter onClose={onClose} onSubmit={handleSubmit} submitText={isEdit ? 'Update' : 'Add Risk'} disabled={isLoading} />
        </div>
      </div>
    </Drawer>
  )
}

export default RiskDrawer
