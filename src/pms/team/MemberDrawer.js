import React, { useEffect, useMemo, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { CalendarRange, UserPlus, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import { getAuthParams } from 'src/store/rtkQuery/baseQuery'
import { collectErrors, decimalOnly, digitsOnly, getMemberFieldError, MEMBER_VALIDATED_FIELDS, noSpaces, personName } from 'src/pms/utils/validation'
import { useAddProjectMemberMutation, useGetResourceAllocationQuery, useGetTeamMetaQuery, useUpdateProjectMemberMutation } from 'src/store/apps/pms/teamApi'

const EMPTY_FORM = { member_name: '', user_id: '', role: '', allocation_pct: '', hourly_rate: '', bill_rate: '', email: '', start_date: '', end_date: '' }

const FORMATTERS = {
  member_name: personName,
  allocation_pct: v => digitsOnly(v).slice(0, 3),
  hourly_rate: v => decimalOnly(v, 2),
  bill_rate: v => decimalOnly(v, 2),
  email: noSpaces
}

const toForm = m =>
  Object.fromEntries(Object.keys(EMPTY_FORM).map(key => [key, m?.[key] === null || m?.[key] === undefined ? '' : String(m[key])]))

const toPayload = form => ({
  member_name: form.member_name.trim(),
  user_id: /^\d+$/.test(form.user_id) ? Number(form.user_id) : null,
  role: form.role,
  allocation_pct: Number(form.allocation_pct),
  hourly_rate: form.hourly_rate === '' ? null : Number(form.hourly_rate),
  bill_rate: form.bill_rate === '' ? null : Number(form.bill_rate),
  email: form.email.trim() || null,
  start_date: form.start_date || null,
  end_date: form.end_date || null
})

// 0% = on the team but not planned yet (how the project manager joins every team), so it can be saved as is.
const memberFieldError = (field, value, form, project) =>
  field === 'allocation_pct' && String(value).trim() === '0' ? null : getMemberFieldError(field, value, form, project)

const Required = () => <span className='text-red-500'>*</span>

// member: the row being edited (null = add). project: gives the id and the allowed date range.
const MemberDrawer = ({ open, onClose, project, member }) => {
  const isEdit = Boolean(member)
  // Rates are money: roles without Budget rights neither see nor send them (the server keeps the stored ones).
  const seesRates = useCan()('budget', 'view')
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const { data: metaResp } = useGetTeamMetaQuery()
  const { data: allocationResp, isFetching: loadingAllocation } = useGetResourceAllocationQuery({}, { skip: !open })
  const [addMember, { isLoading: isAdding }] = useAddProjectMemberMutation()
  const [updateMember, { isLoading: isUpdating }] = useUpdateProjectMemberMutation()
  const isSubmitting = isAdding || isUpdating
  // "Project Manager" is the project's own manager (set on the project), never picked here for someone else.
  const roles = (metaResp?.detail?.roles || []).filter(r => r !== 'Project Manager' || member?.role === 'Project Manager')
  // The company's login users: picking one links the member to that login (needed to log hours and approve).
  const people = metaResp?.detail?.people || []
  const findPerson = (name, email) =>
    people.find(p => (email && (p.email || '').toLowerCase() === email.trim().toLowerCase()) || (name && p.name.toLowerCase() === name.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(isEdit ? toForm(member) : EMPTY_FORM)
  }, [open, isEdit, member])

  // How much of this person's time other active projects already use - shown live while typing the name.
  const elsewhere = useMemo(() => {
    const name = form.member_name.trim().toLowerCase()
    if (!name) return null
    const person = (allocationResp?.detail || []).find(p => (form.user_id && String(p.user_id) === form.user_id) || p.member_name.toLowerCase() === name)
    if (!person) return { used: 0, projects: [], hidden: 0 }
    const projects = person.projects.filter(p => p.project_id !== project?.id)
    // Time on projects this user cannot see still counts (the server sends it as other_allocation).
    const hidden = person.other_allocation || 0

    return { used: projects.reduce((sum, p) => sum + p.allocation_pct, 0) + hidden, projects, hidden }
  }, [allocationResp, form.member_name, form.user_id, project?.id])
  const free = elsewhere ? Math.max(0, 100 - elsewhere.used) : 100

  const setError = (field, message) =>
    setErrors(prev => {
      if (!message && !prev[field]) return prev
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    const next = FORMATTERS[id] ? FORMATTERS[id](value) : value
    // Typing another name means the linked login user no longer applies - unless the name (picked from the list)
    // or the email is one of the company's login users, which links that login.
    setForm(prev => {
      const updated = { ...prev, [id]: next }
      if (id !== 'member_name' && id !== 'email') return updated
      const person = id === 'member_name' ? findPerson(next, '') : findPerson('', next)
      if (person) return { ...updated, member_name: person.name, user_id: String(person.user_id), email: person.email || updated.email }

      return id === 'member_name' ? { ...updated, user_id: '' } : updated
    })
    setError(id, null)
  }

  const handleBlur = field => {
    setError(field, memberFieldError(field, form[field], form, project))
    if (field === 'start_date' && form.end_date) setError('end_date', memberFieldError('end_date', form.end_date, form, project))
  }

  const addMe = () => {
    const { username, userId } = getAuthParams()
    setForm(prev => ({ ...prev, member_name: personName(username), user_id: String(userId) }))
    setError('member_name', null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id => (errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null)

  const handleSubmit = async () => {
    if (isSubmitting) return
    const found = collectErrors(MEMBER_VALIDATED_FIELDS, (f, v, fm) => memberFieldError(f, v, fm, project), form)
    // Same limit the server enforces, checked early so the message appears next to the field.
    if (!found.allocation_pct && elsewhere && Number(form.allocation_pct) > free) {
      found.allocation_pct = `Only ${free}% of ${form.member_name.trim()}'s time is free (other projects use ${elsewhere.used}%)`
    }
    const ids = Object.keys(found)
    setErrors(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      const element = document.getElementById(ids[0])
      element?.focus()
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' })

      return
    }
    try {
      const body = toPayload(form)
      const resp = isEdit
        ? await updateMember({ projectId: project.id, memberId: member.id, body }).unwrap()
        : await addMember({ projectId: project.id, body }).unwrap()
      toast.success(resp?.detail || (isEdit ? 'Member updated' : 'Member added'))
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const section = ThemeStyles.drawerHeadingSection
  const input = id => ({ id, value: form[id], onChange: handleChange, onBlur: () => handleBlur(id) })

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[36%] 2xl:w-[30%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Team Member' : 'Add Team Member'}
            subtitle={project ? `${project.project_code} · ${project.project_name}` : ''}
            icon={UserPlus}
          />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <Required /> are required. Only team members can be assigned this project&apos;s tasks.
            </p>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <UserPlus className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Member</span>
              </div>

              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <div className='flex items-center justify-between'>
                    <span className={ThemeStyles.formLabels}>
                      Member Name <Required />
                    </span>
                    {!isEdit && (
                      <button type='button' onClick={addMe} className='cursor-pointer text-xs font-semibold hover:underline' style={{ color: 'var(--theme-solid)' }}>
                        Add me
                      </button>
                    )}
                  </div>
                  <input {...input('member_name')} type='text' maxLength={200} list='pms-people' autoComplete='off' placeholder='Start typing, then pick the person' className={`${ThemeStyles.formsInputs}${errorBorder('member_name')}`} />
                  <datalist id='pms-people'>
                    {people.map(p => (
                      <option key={p.user_id} value={p.name}>
                        {p.email || ''}
                      </option>
                    ))}
                  </datalist>
                  {fieldError('member_name') ||
                    (form.member_name.trim() &&
                      (form.user_id ? (
                        <span className='block text-xs font-semibold text-green-600' data-login-link='linked'>
                          Linked to their login{form.email ? ` (${form.email})` : ''}: they can log hours and see this project
                        </span>
                      ) : (
                        <span className='block text-xs font-semibold text-amber-600' data-login-link='none'>
                          Not linked to a login: pick the name from the list (or enter their login email). Without it they cannot log hours or approve
                        </span>
                      )))}
                </div>

                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Role <Required />
                  </span>
                  <select {...input('role')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('role')}`}>
                    <option value=''>Select role</option>
                    {roles.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  {fieldError('role')}
                </div>

                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Email</span>
                  <input {...input('email')} type='email' maxLength={150} placeholder='e.g. name@example.com' className={`${ThemeStyles.formsInputs}${errorBorder('email')}`} />
                  {fieldError('email')}
                </div>
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Wallet className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Time and Cost</span>
              </div>

              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Allocation % <Required />
                  </span>
                  <input {...input('allocation_pct')} type='text' inputMode='numeric' maxLength={3} placeholder='e.g. 50' className={`${ThemeStyles.formsInputs}${errorBorder('allocation_pct')}`} />
                  {fieldError('allocation_pct') ||
                    (elsewhere && (
                      <span className={`block text-xs ${free === 0 ? 'font-semibold text-red-500' : 'text-gray-500'}`}>
                        {loadingAllocation
                          ? 'Checking other projects...'
                          : elsewhere.used
                            ? `${elsewhere.used}% used on ${[
                                ...elsewhere.projects.map(p => `${p.project_code} (${p.allocation_pct}%)`),
                                ...(elsewhere.hidden ? [`other projects (${elsewhere.hidden}%)`] : [])
                              ].join(', ')} - ${free}% free`
                            : 'Not on any other active project - 100% free'}
                      </span>
                    ))}
                </div>

                {seesRates && (
                  <>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Cost Rate (₹/h)</span>
                      <input {...input('hourly_rate')} type='text' inputMode='decimal' maxLength={11} placeholder='0.00' className={`${ThemeStyles.formsInputs}${errorBorder('hourly_rate')}`} />
                      {fieldError('hourly_rate') || <span className='block text-xs text-gray-500'>What an hour costs the company (pay). Internal: clients never see it</span>}
                    </div>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Billing Rate (₹/h)</span>
                      <input {...input('bill_rate')} type='text' inputMode='decimal' maxLength={11} placeholder='0.00' className={`${ThemeStyles.formsInputs}${errorBorder('bill_rate')}`} />
                      {fieldError('bill_rate') || <span className='block text-xs text-gray-500'>What the client pays per hour on Time &amp; Material invoices</span>}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <CalendarRange className={`${ThemeStyles.drawerHeadingIcon} text-emerald-500`} />
                <span className={ThemeStyles.drawerHeadingText}>On the Project</span>
                <span className='ms-auto text-xs font-medium text-gray-400'>Optional</span>
              </div>

              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>From</span>
                  <input {...input('start_date')} type='date' min={project?.start_date || undefined} max={project?.end_date || undefined} className={`${ThemeStyles.formsInputs}${errorBorder('start_date')}`} />
                  {fieldError('start_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>To</span>
                  <input {...input('end_date')} type='date' min={form.start_date || project?.start_date || undefined} max={project?.end_date || undefined} className={`${ThemeStyles.formsInputs}${errorBorder('end_date')}`} />
                  {fieldError('end_date')}
                </div>
              </div>
            </div>

            {loadingAllocation && !allocationResp && (
              <div className='flex justify-center py-4'>
                <CircularProgress size={20} />
              </div>
            )}
          </div>

          <DrawerFooter onClose={onClose} onSubmit={handleSubmit} submitText={isEdit ? 'Update' : 'Add Member'} disabled={isSubmitting} />
        </div>
      </div>
    </Drawer>
  )
}

export default MemberDrawer
