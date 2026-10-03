import React, { useEffect, useRef, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { Icon } from '@iconify/react'
import { Link2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useGetTaskListQuery } from 'src/store/apps/pms/tasksApi'
import { useGetProjectMilestonesQuery } from 'src/store/apps/pms/billingApi'
import { useGetDocumentMetaQuery, useUploadDocumentMutation } from 'src/store/apps/pms/documentsApi'
import { extensionOf, fileError, fileIcon, formatBytes } from './fileUtils'

const Required = () => <span className='text-red-500'>*</span>
const EMPTY = { project_id: '', title: '', category: '', notes: '', task_id: '', milestone_id: '', deliverable_id: '' }

// preset: { projectId, taskId, milestoneId, deliverableId, category } pre-fills and locks where it came from.
// replaces: the document a new version is uploaded for.
const UploadDrawer = ({ open, onClose, preset = {}, replaces = null }) => {
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const { data: metaResp } = useGetDocumentMetaQuery(undefined, { skip: !open })
  const meta = metaResp?.detail
  const lockedProject = preset.projectId || replaces?.project_id
  const projectId = lockedProject || form.project_id
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: !open || Boolean(lockedProject) })
  const { data: tasksResp } = useGetTaskListQuery({ projectId, itemsPerPage: 1000, currentPage: 1, sortBy: 'task_key', sortOrder: 'asc' }, { skip: !open || !projectId || Boolean(replaces) })
  const { data: milestonesResp } = useGetProjectMilestonesQuery(projectId, { skip: !open || !projectId || Boolean(replaces) })
  const [upload, { isLoading }] = useUploadDocumentMutation()

  const milestones = milestonesResp?.detail || []
  const deliverables = milestones.find(m => String(m.id) === form.milestone_id)?.deliverables || []

  useEffect(() => {
    if (!open) return
    setErrors({})
    setFile(null)
    setForm({
      ...EMPTY,
      title: replaces?.title || '',
      category: replaces?.category || preset.category || '',
      task_id: preset.taskId ? String(preset.taskId) : '',
      milestone_id: preset.milestoneId ? String(preset.milestoneId) : '',
      deliverable_id: preset.deliverableId ? String(preset.deliverableId) : ''
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const pick = chosen => {
    if (!chosen) return
    const problem = fileError(chosen, meta)
    setFile(chosen)
    setError('file', problem)
    // The title starts as the file name without its extension; the user can change it.
    if (!replaces && !form.title) setForm(prev => ({ ...prev, title: capitalizeFirst(chosen.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')).slice(0, 200) }))
  }

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({
      ...prev,
      [id]: ['title', 'notes'].includes(id) ? capitalizeFirst(value) : value,
      ...(id === 'project_id' ? { task_id: '', milestone_id: '', deliverable_id: '' } : {}),
      ...(id === 'milestone_id' ? { deliverable_id: '' } : {})
    }))
    setError(id, null)
  }

  const handleSubmit = async () => {
    if (isLoading) return
    const found = {}
    const problem = fileError(file, meta)
    if (problem) found.file = problem
    if (!projectId) found.project_id = 'Please Select Project'
    if (!form.category) found.category = 'Please Select Category'
    if (form.title.trim().length < 2) found.title = 'Please Enter a Title (at least 2 characters)'
    setErrors(found)
    const ids = Object.keys(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)

      return
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('category', form.category)
    formData.append('title', form.title.trim())
    if (form.notes.trim()) formData.append('notes', form.notes.trim())
    if (replaces) formData.append('replaces_id', String(replaces.id))
    else {
      if (form.task_id) formData.append('task_id', form.task_id)
      if (form.milestone_id) formData.append('milestone_id', form.milestone_id)
      if (form.deliverable_id) formData.append('deliverable_id', form.deliverable_id)
    }
    try {
      const resp = await upload({ projectId, formData }).unwrap()
      toast.success(resp?.detail || 'Uploaded')
      onClose()
    } catch (e) {
      if (typeof e?.data?.detail === 'string') setError('file', e.data.detail)
    }
  }

  const ext = file ? extensionOf(file.name) : ''
  const [icon, color] = fileIcon(ext)
  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id => (errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null)
  const lockedLinks = Boolean(preset.taskId || preset.deliverableId)

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[50%] xl:w-[38%] 2xl:w-[32%]'>
          <DrawerHeader title={replaces ? `New Version of '${replaces.title}'` : 'Upload File'} subtitle={replaces ? `Currently version ${replaces.version} · ${replaces.file_name}` : 'Stored with the project; nobody outside your company can open it'} icon={Upload} />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Upload className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>File</span>
              </div>

              <div
                id='file_drop'
                role='button'
                tabIndex={0}
                onClick={() => inputRef.current?.click()}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault()
                  setDragging(false)
                  pick(e.dataTransfer.files?.[0])
                }}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
                  errors.file ? 'border-red-400' : dragging ? 'border-[var(--theme-solid)] bg-[color-mix(in_srgb,var(--theme-solid)_6%,transparent)]' : 'border-gray-300 hover:border-[var(--theme-solid)]'
                }`}
              >
                {file ? (
                  <>
                    <Icon icon={icon} width={36} style={{ color }} />
                    <div className='mt-2 max-w-full truncate text-[14px] font-semibold text-slate-800'>{file.name}</div>
                    <div className='text-xs text-gray-500'>{formatBytes(file.size)} · click to choose another file</div>
                  </>
                ) : (
                  <>
                    <Icon icon='tabler:cloud-upload' width={36} className='text-gray-400' />
                    <div className='mt-2 text-[14px] font-semibold text-slate-800'>Drop a file here or click to browse</div>
                    <div className='text-xs text-gray-500'>
                      Up to {meta?.max_mb || 15} MB · {(meta?.extensions || []).join(', ')}
                    </div>
                  </>
                )}
                <input ref={inputRef} id='file_input' type='file' className='hidden' accept={(meta?.extensions || []).map(e => `.${e}`).join(',')} onChange={e => pick(e.target.files?.[0])} />
              </div>
              {fieldError('file')}

              <div className='mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                {!lockedProject && (
                  <div className='space-y-1 md:col-span-2'>
                    <span className={ThemeStyles.formLabels}>
                      Project <Required />
                    </span>
                    <select id='project_id' value={form.project_id} onChange={handleChange} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('project_id')}`}>
                      <option value=''>Select project</option>
                      {(projectsResp?.detail || []).map(p => (
                        <option key={p.id} value={p.id}>
                          {p.project_code} - {p.project_name}
                        </option>
                      ))}
                    </select>
                    {fieldError('project_id')}
                  </div>
                )}
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Title <Required />
                  </span>
                  <input id='title' type='text' maxLength={200} value={form.title} onChange={handleChange} placeholder='e.g. Signed contract' className={`${ThemeStyles.formsInputs}${errorBorder('title')}`} />
                  {fieldError('title')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Category <Required />
                  </span>
                  <select id='category' value={form.category} onChange={handleChange} className={`${ThemeStyles.formsInputsDropdown}${errorBorder('category')}`}>
                    <option value=''>Select category</option>
                    {(meta?.categories || []).map(c => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {fieldError('category')}
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>Notes</span>
                  <textarea id='notes' rows={2} maxLength={1000} value={form.notes} onChange={handleChange} placeholder='e.g. Signed by the client on 12 Oct' className={ThemeStyles.formsInputs} />
                </div>
              </div>
            </div>

            {!replaces && projectId && (
              <div className={ThemeStyles.drawerHeadingSection}>
                <div className={ThemeStyles.drawerHeadingBox}>
                  <Link2 className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                  <span className={ThemeStyles.drawerHeadingText}>Attach To</span>
                  <span className='ms-auto text-xs font-medium text-gray-400'>Optional</span>
                </div>
                {!tasksResp && !milestonesResp ? (
                  <div className='flex justify-center py-3'>
                    <CircularProgress size={20} />
                  </div>
                ) : (
                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>Task</span>
                      <select id='task_id' value={form.task_id} onChange={handleChange} disabled={lockedLinks} className={ThemeStyles.formsInputsDropdown}>
                        <option value=''>Not attached to a task</option>
                        {(tasksResp?.detail || []).map(t => (
                          <option key={t.id} value={t.id}>
                            {t.task_key} - {t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Milestone</span>
                      <select id='milestone_id' value={form.milestone_id} onChange={handleChange} disabled={lockedLinks} className={ThemeStyles.formsInputsDropdown}>
                        <option value=''>None</option>
                        {milestones.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Deliverable</span>
                      <select id='deliverable_id' value={form.deliverable_id} onChange={handleChange} disabled={lockedLinks || !form.milestone_id} className={ThemeStyles.formsInputsDropdown}>
                        <option value=''>{form.milestone_id ? 'None' : 'Pick a milestone first'}</option>
                        {deliverables.map(d => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DrawerFooter onClose={onClose} onSubmit={handleSubmit} submitText={isLoading ? 'Uploading...' : replaces ? 'Upload Version' : 'Upload'} disabled={isLoading} />
        </div>
      </div>
    </Drawer>
  )
}

export default UploadDrawer
