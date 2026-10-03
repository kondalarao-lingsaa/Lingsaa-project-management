import React, { useEffect, useState } from 'react'
import { Drawer } from '@mui/material'
import { CircleAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst, collectErrors, getIssueFieldError, ISSUE_VALIDATED_FIELDS } from 'src/pms/utils/validation'
import { useGetRiskMetaQuery, useSaveIssueMutation } from 'src/store/apps/pms/risksApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'

const todayIso = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = { title: '', description: '', severity: 'Medium', owner_member_id: '', due_date: '' }
const Required = () => <span className='text-red-500'>*</span>

const IssueDrawer = ({ open, onClose, project, issue }) => {
  const isEdit = Boolean(issue)
  const today = todayIso()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const { data: metaResp } = useGetRiskMetaQuery(undefined, { skip: !open })
  const { data: membersResp } = useGetProjectMembersQuery(project?.id, { skip: !open || !project })
  const [save, { isLoading }] = useSaveIssueMutation()

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      isEdit
        ? { ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, issue[k] === null || issue[k] === undefined ? '' : String(issue[k])])), original_due_date: issue.due_date || '' }
        : EMPTY
    )
  }, [open, isEdit, issue])

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({ ...prev, [id]: ['title', 'description'].includes(id) ? capitalizeFirst(value) : value }))
    setError(id, null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id => (errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null)
  const input = id => ({ id, value: form[id], onChange: handleChange, onBlur: () => setError(id, getIssueFieldError(id, form[id], form, today)) })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(ISSUE_VALIDATED_FIELDS, (f, v, fm) => getIssueFieldError(f, v, fm, today), form)
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
        severity: form.severity,
        owner_member_id: form.owner_member_id ? Number(form.owner_member_id) : null,
        due_date: form.due_date || null
      }
      const resp = await save({ projectId: project.id, id: issue?.id, body }).unwrap()
      toast.success(resp?.detail || 'Issue saved')
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[36%] 2xl:w-[30%]'>
          <DrawerHeader title={isEdit ? `Edit Issue ${issue.issue_key}` : 'Raise Issue'} subtitle={project ? `${project.project_code} · ${project.project_name}` : ''} icon={CircleAlert} />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <p className='px-1 text-xs text-gray-500'>
              Fields marked <Required /> are required. An issue is a problem that is happening now (a risk is one that might).
            </p>
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <CircleAlert className={`${ThemeStyles.drawerHeadingIcon} text-red-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Issue</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Issue Title <Required />
                  </span>
                  <input {...input('title')} type='text' maxLength={200} placeholder='e.g. Payment gateway returns errors' className={`${ThemeStyles.formsInputs}${errorBorder('title')}`} />
                  {fieldError('title')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Severity <Required />
                  </span>
                  <select {...input('severity')} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('severity')}`}>
                    {(metaResp?.detail?.severities || ['Low', 'Medium', 'High', 'Critical']).map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {fieldError('severity')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Due Date</span>
                  <input {...input('due_date')} type='date' min={today} className={`${ThemeStyles.formsInputs}${errorBorder('due_date')}`} />
                  {fieldError('due_date')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Owner</span>
                  <select {...input('owner_member_id')} className={ThemeStyles.formsInputsDropdown}>
                    <option value=''>No owner yet</option>
                    {(membersResp?.detail || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.member_name} - {m.role}
                      </option>
                    ))}
                  </select>
                  <span className='block text-xs text-gray-500'>The owner gets the fix task when you create one.</span>
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Description</span>
                  <textarea {...input('description')} rows={3} maxLength={2000} placeholder='What is going wrong, and who is affected' className={ThemeStyles.formsInputs} />
                </div>
              </div>
            </div>
          </div>
          <DrawerFooter onClose={onClose} onSubmit={handleSubmit} submitText={isEdit ? 'Update' : 'Raise Issue'} disabled={isLoading} />
        </div>
      </div>
    </Drawer>
  )
}

export default IssueDrawer
