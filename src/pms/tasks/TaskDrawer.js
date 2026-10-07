import React, { useEffect, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { CalendarRange, ListChecks, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { getAuthParams } from 'src/store/rtkQuery/baseQuery'
import {
  capitalizeFirst,
  collectErrors,
  decimalOnly,
  getTaskFieldError,
  personName,
  TASK_VALIDATED_FIELDS
} from 'src/pms/utils/validation'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import {
  useCreateTaskMutation,
  useGetTaskListQuery,
  useLazyGetTaskDetailQuery,
  useUpdateTaskMutation
} from 'src/store/apps/pms/tasksApi'
import { useGetProjectMembersQuery } from 'src/store/apps/pms/teamApi'
import { useGetProjectMilestonesQuery } from 'src/store/apps/pms/billingApi'
import { useGetProjectSettingsQuery } from 'src/store/apps/pms/settingsApi'
import { useGetAssigneeSuggestionsQuery } from 'src/store/apps/pms/automationApi'

const EMPTY_FORM = {
  project_id: '',
  title: '',
  description: '',
  task_type: 'Task',
  parent_task_id: '',
  milestone_id: '',
  assignee_name: '',
  assignee_id: '',
  priority: 'Medium',
  status: 'To Do',
  start_date: '',
  due_date: '',
  estimated_hours: '',
  actual_hours: '',
  labels: ''
}

const toForm = t => ({
  ...Object.fromEntries(
    Object.keys(EMPTY_FORM).map(key => [key, t?.[key] === null || t?.[key] === undefined ? '' : String(t[key])])
  ),
  labels: (t?.labels || []).join(', ')
})

const num = v => (v === '' ? null : Number(v))

const toPayload = form => ({
  project_id: Number(form.project_id),
  title: form.title.trim(),
  description: form.description.trim() || null,
  task_type: form.task_type || 'Task',
  parent_task_id: form.parent_task_id ? Number(form.parent_task_id) : null,
  milestone_id: form.milestone_id ? Number(form.milestone_id) : null,
  assignee_name: form.assignee_name.trim() || null,
  assignee_id: /^\d+$/.test(form.assignee_id) ? Number(form.assignee_id) : null,
  priority: form.priority || 'Medium',
  status: form.status || 'To Do',
  start_date: form.start_date || null,
  due_date: form.due_date || null,
  estimated_hours: num(form.estimated_hours),
  actual_hours: num(form.actual_hours),
  labels: form.labels
    .split(',')
    .map(l => l.trim())
    .filter(Boolean)
})

// Applied while typing, so the value is already in the right shape when the user leaves the field.
const FORMATTERS = {
  title: capitalizeFirst,
  description: capitalizeFirst,
  assignee_name: personName,
  estimated_hours: v => decimalOnly(v, 2),
  actual_hours: v => decimalOnly(v, 2)
}

const Options = ({ items = [] }) =>
  items.map(item => (
    <option key={item} value={item}>
      {item}
    </option>
  ))

// projectId (optional) fixes the project, e.g. when adding a task from inside a project page.
// parentTaskId (optional) pre-selects the parent, e.g. "Add Subtask" on Task Details.
// mine: opened from My Tasks - a new task is assigned to the current user, because My Tasks only
// lists tasks assigned to you.
// dueDate: pre-fills a new task's due date (the Task Calendar's "+" on a day).
const TaskDrawer = ({ open, onClose, taskId, projectId, parentTaskId, meta, mine = false, dueDate }) => {
  const isEdit = Boolean(taskId)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [reporter, setReporter] = useState('')

  // The loaded task's updated_at: the server refuses the save if the task changed meanwhile (no silent revert).
  const [version, setVersion] = useState(null)

  const [loadDetail, { isFetching: isLoadingDetail }] = useLazyGetTaskDetailQuery()
  const [createTask, { isLoading: isCreating }] = useCreateTaskMutation()
  const [updateTask, { isLoading: isUpdating }] = useUpdateTaskMutation()
  const isSubmitting = isCreating || isUpdating

  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: !open })
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []

  // Only main tasks can be parents, and only within the chosen project.
  const { data: parentsResp } = useGetTaskListQuery(
    {
      projectId: form.project_id,
      topLevel: true,
      itemsPerPage: 1000,
      currentPage: 1,
      sortBy: 'task_key',
      sortOrder: 'asc'
    },
    { skip: !open || !form.project_id }
  )
  const parents = (Array.isArray(parentsResp?.detail) ? parentsResp.detail : []).filter(t => t.id !== taskId)

  // Milestones of the chosen project that can still take tasks (plus the task's current one).
  const { data: milestonesResp } = useGetProjectMilestonesQuery(form.project_id, { skip: !open || !form.project_id })
  const milestones = (form.project_id ? milestonesResp?.detail || [] : []).filter(
    m => m.status !== 'Accepted' || String(m.id) === form.milestone_id
  )

  // Project Settings: default priority / estimate for new tasks and suggested labels.
  const { data: settingsResp } = useGetProjectSettingsQuery(form.project_id, { skip: !open || !form.project_id })
  const projectSettings = form.project_id ? settingsResp?.detail : null
  useEffect(() => {
    if (!open || isEdit || !projectSettings) return
    // Only fill fields the user has not changed yet.
    setForm(prev => ({
      ...prev,
      priority: prev.priority === EMPTY_FORM.priority ? projectSettings.default_task_priority : prev.priority,
      estimated_hours:
        prev.estimated_hours === '' && projectSettings.default_estimate_hours !== null
          ? String(projectSettings.default_estimate_hours)
          : prev.estimated_hours
    }))
  }, [open, isEdit, projectSettings])
  const currentLabels = form.labels
    .split(',')
    .map(l => l.trim().toLowerCase())
    .filter(Boolean)
  const labelSuggestions = (projectSettings?.task_labels || []).filter(l => !currentLabels.includes(l))

  // Tasks are assigned to the chosen project's team.
  const { data: membersResp, isFetching: loadingMembers } = useGetProjectMembersQuery(form.project_id, {
    skip: !open || !form.project_id
  })
  const members = form.project_id ? membersResp?.detail || [] : []
  const isMember = (m, name, userId) =>
    (userId && m.user_id && String(m.user_id) === String(userId)) ||
    m.member_name.toLowerCase() === (name || '').toLowerCase()
  // Shown under Assignee (instead of a pop-up) when "me" cannot be assigned because I am not on the team.
  const [notInTeam, setNotInTeam] = useState(false)
  useEffect(() => setNotInTeam(false), [open, form.project_id])
  const currentMember = members.find(m => isMember(m, form.assignee_name, form.assignee_id))

  // Who on the team has the most free time between the task's dates (across all their projects).
  const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined
  const { data: suggestResp } = useGetAssigneeSuggestionsQuery(
    {
      projectId: form.project_id,
      startDate: validDate(form.start_date),
      dueDate: validDate(form.due_date),
      hours: form.estimated_hours && Number(form.estimated_hours) > 0 ? Number(form.estimated_hours) : undefined
    },
    { skip: !open || !form.project_id || members.length < 2 }
  )
  const suggestions = (form.project_id ? suggestResp?.detail?.people || [] : [])
    .filter(p => p.available_hours > 0 && !(currentMember && currentMember.id === p.member_id))
    .slice(0, 3)
  const pickSuggestion = p => {
    setForm(prev => ({ ...prev, assignee_name: p.member_name, assignee_id: p.user_id ? String(p.user_id) : '' }))
    setError('assignee_name', null)
  }
  const findMe = () => {
    const { username, userId } = getAuthParams()

    return members.find(m => isMember(m, personName(username), userId))
  }

  // My Tasks pre-fills "me"; if I am not on this project's team that cannot be saved, so clear it and say why.
  useEffect(() => {
    if (!open || isEdit || !mine || loadingMembers || !membersResp || !form.assignee_name) return
    const { userId } = getAuthParams()
    if (String(form.assignee_id) === String(userId) && !findMe()) {
      setForm(prev => ({ ...prev, assignee_name: '', assignee_id: '' }))
      setNotInTeam(true)
    }
  }, [open, isEdit, mine, loadingMembers, membersResp]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    setErrors({})
    setReporter('')
    setVersion(null)
    if (!isEdit) {
      const me = getAuthParams()
      setForm({
        ...EMPTY_FORM,
        project_id: projectId ? String(projectId) : '',
        parent_task_id: parentTaskId ? String(parentTaskId) : '',
        ...(mine ? { assignee_name: personName(me.username), assignee_id: String(me.userId) } : {}),
        ...(dueDate ? { due_date: dueDate } : {})
      })

      return
    }
    loadDetail(taskId)
      .unwrap()
      .then(resp => {
        if (!resp?.detail) return
        setForm(toForm(resp.detail))
        setReporter(resp.detail.reporter_name || '')
        setVersion(resp.detail.updated_at || null)
      })
      .catch(() => {})
  }, [open, taskId, isEdit, projectId, parentTaskId, mine, dueDate, loadDetail])

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
    const formatted = FORMATTERS[id] ? FORMATTERS[id](value) : value
    setForm(prev => ({
      ...prev,
      [id]: formatted,
      // Typing a different assignee name means the stored user id no longer applies; a new project clears the parent.
      ...(id === 'assignee_name' ? { assignee_id: '' } : {}),
      ...(id === 'project_id' ? { parent_task_id: '', milestone_id: '' } : {}),
      ...(id === 'parent_task_id' && !value && prev.task_type === 'Subtask' ? { task_type: 'Task' } : {})
    }))
    setError(id, null)
  }

  // Re-checks one field when the user leaves it; a start-date change also re-checks the due date.
  const handleBlur = field => {
    setError(field, getTaskFieldError(field, form[field], form))
    if (field === 'start_date' && form.due_date)
      setError('due_date', getTaskFieldError('due_date', form.due_date, form))
  }

  const assignToMe = () => {
    const me = findMe()
    if (!me) {
      if (form.project_id) setNotInTeam(true)
      else toast.error('Please Select Project first')

      return
    }
    setForm(prev => ({ ...prev, assignee_name: me.member_name, assignee_id: me.user_id ? String(me.user_id) : '' }))
    setError('assignee_name', null)
  }

  const handleAssignee = e => {
    const member = members.find(m => String(m.id) === e.target.value)
    setForm(prev => ({
      ...prev,
      assignee_name: member ? member.member_name : '',
      assignee_id: member?.user_id ? String(member.user_id) : ''
    }))
    setError('assignee_name', null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null

  const handleSubmit = async () => {
    if (isSubmitting) return
    const found = collectErrors(TASK_VALIDATED_FIELDS, getTaskFieldError, form)
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
      const body = isEdit ? { ...toPayload(form), updated_at: version } : toPayload(form)
      const resp = isEdit ? await updateTask({ id: taskId, body }).unwrap() : await createTask(body).unwrap()
      toast.success(resp?.detail || (isEdit ? 'Task updated' : 'Task created'))
      // Explain why a task created on My Tasks is not in the list: it is someone else's (or nobody's).
      if (mine && !isEdit && String(resp?.data?.assignee_id ?? '') !== String(getAuthParams().userId)) {
        const who = resp?.data?.assignee_name ? `assigned to ${resp.data.assignee_name}` : 'not assigned to anyone'
        toast(`This task is ${who}, so it is listed in All Tasks. My Tasks shows only tasks assigned to you.`, {
          icon: 'ℹ️',
          duration: 6000
        })
      }
      onClose()
    } catch (e) {
      // The shared base query already showed the toast; also mark the fields the server rejected.
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const section = ThemeStyles.drawerHeadingSection
  const projectLocked = isEdit || Boolean(projectId)

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[80%] lg:w-[60%] xl:w-[40%] 2xl:w-[35%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Task' : 'Create Task'}
            subtitle={isEdit ? 'Update task information' : 'Add work to a project'}
            icon={ListChecks}
          />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            {isLoadingDetail ? (
              <div className='flex justify-center py-10'>
                <CircularProgress size={28} />
              </div>
            ) : (
              <>
                <p className='px-1 text-xs text-gray-500'>
                  Fields marked <span className='text-red-500'>*</span> are required. The first letter is capitalised
                  for you as you type.
                </p>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <ListChecks className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Task Details</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>
                        Project<span className='text-red-500'>*</span>
                      </span>
                      <select
                        id='project_id'
                        onBlur={() => handleBlur('project_id')}
                        value={form.project_id}
                        onChange={handleChange}
                        disabled={projectLocked}
                        className={`${ThemeStyles.formsInputsDropdown}${errorBorder('project_id')}`}
                      >
                        <option value=''>Select project</option>
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.project_code} - {p.project_name}
                          </option>
                        ))}
                      </select>
                      {fieldError('project_id')}
                    </div>

                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>
                        Task Name<span className='text-red-500'>*</span>
                      </span>
                      <input
                        id='title'
                        onBlur={() => handleBlur('title')}
                        value={form.title}
                        onChange={handleChange}
                        type='text'
                        maxLength={300}
                        placeholder='e.g. Design the login page'
                        className={`${ThemeStyles.formsInputs}${errorBorder('title')}`}
                      />
                      {fieldError('title')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Type</span>
                      <select
                        id='task_type'
                        value={form.parent_task_id ? 'Subtask' : form.task_type}
                        onChange={handleChange}
                        disabled={Boolean(form.parent_task_id)}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <Options items={(meta?.types || []).filter(t => t !== 'Subtask')} />
                        {form.parent_task_id && <option value='Subtask'>Subtask</option>}
                      </select>
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Milestone</span>
                      <select
                        id='milestone_id'
                        value={form.milestone_id}
                        onChange={handleChange}
                        disabled={!form.project_id}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <option value=''>
                          {form.project_id && milestones.length === 0 ? 'No open milestones in this project' : 'None'}
                        </option>
                        {milestones.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Parent Task</span>
                      <select
                        id='parent_task_id'
                        value={form.parent_task_id}
                        onChange={handleChange}
                        disabled={!form.project_id}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <option value=''>None (main task)</option>
                        {parents.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.task_key} - {t.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className='space-y-1 md:col-span-2'>
                      <div className='flex items-center justify-between'>
                        <span className={ThemeStyles.formLabels}>Description</span>
                        <span className='text-xs text-gray-400'>{form.description.length}/4000</span>
                      </div>
                      <textarea
                        id='description'
                        onBlur={() => handleBlur('description')}
                        value={form.description}
                        onChange={handleChange}
                        rows={3}
                        maxLength={4000}
                        placeholder='What needs to be done?'
                        className={`${ThemeStyles.formsInputs}${errorBorder('description')}`}
                      />
                      {fieldError('description')}
                    </div>

                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>Labels</span>
                      <input
                        id='labels'
                        onBlur={() => handleBlur('labels')}
                        value={form.labels}
                        onChange={handleChange}
                        type='text'
                        placeholder='Separate with commas, e.g. ui, backend'
                        className={`${ThemeStyles.formsInputs}${errorBorder('labels')}`}
                      />
                      {fieldError('labels')}
                      {labelSuggestions.length > 0 && (
                        <div className='flex flex-wrap items-center gap-1.5 pt-1' data-label-suggestions>
                          <span className='text-[11px] text-gray-500'>Suggested:</span>
                          {labelSuggestions.map(l => (
                            <button
                              key={l}
                              type='button'
                              onClick={() =>
                                setForm(prev => ({
                                  ...prev,
                                  labels: [
                                    ...prev.labels
                                      .split(',')
                                      .map(x => x.trim())
                                      .filter(Boolean),
                                    l
                                  ].join(', ')
                                }))
                              }
                              className='cursor-pointer rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-[var(--theme-solid)] hover:text-[var(--theme-solid)]'
                            >
                              + {l}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <CalendarRange className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Status, Schedule and Effort</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Status</span>
                      <select
                        id='status'
                        value={form.status}
                        onChange={handleChange}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <Options items={meta?.statuses} />
                      </select>
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Priority</span>
                      <select
                        id='priority'
                        value={form.priority}
                        onChange={handleChange}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <Options items={meta?.priorities} />
                      </select>
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Start Date</span>
                      <input
                        id='start_date'
                        onBlur={() => handleBlur('start_date')}
                        type='date'
                        value={form.start_date}
                        onChange={handleChange}
                        className={ThemeStyles.formsInputs}
                      />
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Due Date</span>
                      <input
                        id='due_date'
                        onBlur={() => handleBlur('due_date')}
                        type='date'
                        value={form.due_date}
                        min={form.start_date || undefined}
                        onChange={handleChange}
                        className={`${ThemeStyles.formsInputs}${errorBorder('due_date')}`}
                      />
                      {fieldError('due_date')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Estimated Hours</span>
                      <input
                        id='estimated_hours'
                        onBlur={() => handleBlur('estimated_hours')}
                        type='text'
                        inputMode='decimal'
                        maxLength={6}
                        value={form.estimated_hours}
                        onChange={handleChange}
                        placeholder='0'
                        className={`${ThemeStyles.formsInputs}${errorBorder('estimated_hours')}`}
                      />
                      {fieldError('estimated_hours')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Actual Hours</span>
                      {/* Filled from approved timesheets, so it is shown but not typed. */}
                      <input
                        id='actual_hours'
                        type='text'
                        value={form.actual_hours || '0'}
                        readOnly
                        disabled
                        className={ThemeStyles.formsInputs}
                      />
                      <span className='block text-xs text-gray-500'>From approved timesheets</span>
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <UserRound className={`${ThemeStyles.drawerHeadingIcon} text-emerald-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>People</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1'>
                      <div className='flex items-center justify-between'>
                        <span className={ThemeStyles.formLabels}>Assignee</span>
                        <button
                          type='button'
                          onClick={assignToMe}
                          className='text-xs font-semibold hover:underline'
                          style={{ color: 'var(--theme-solid)' }}
                        >
                          Assign to me
                        </button>
                      </div>
                      <select
                        id='assignee_name'
                        value={currentMember ? String(currentMember.id) : form.assignee_name ? 'legacy' : ''}
                        onChange={handleAssignee}
                        disabled={!form.project_id}
                        className={`${ThemeStyles.formsInputsDropdown}${errorBorder('assignee_name')}`}
                      >
                        <option value=''>
                          {!form.project_id
                            ? 'Select a project first'
                            : loadingMembers
                            ? 'Loading team...'
                            : 'Unassigned'}
                        </option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.member_name} - {m.role}
                            {m.allocation_pct ? ` (${m.allocation_pct}%)` : ''}
                          </option>
                        ))}
                        {/* An older task whose assignee is not on the team keeps showing who it was. */}
                        {!currentMember && form.assignee_name && (
                          <option value='legacy'>{form.assignee_name} (not in team)</option>
                        )}
                      </select>
                      {fieldError('assignee_name') ||
                        (notInTeam && (
                          <span className='block text-xs text-amber-600' data-not-in-team>
                            You are not in this project&apos;s team, so you cannot be the assignee. Pick a team member,
                            or add yourself in{' '}
                            <a
                              href={`${projectDetailsPath(form.project_id)}&tab=team`}
                              className='font-semibold underline'
                            >
                              Project Details &gt; Team
                            </a>
                            .
                          </span>
                        )) ||
                        (form.project_id && !loadingMembers && members.length === 0 && (
                          <span className='block text-xs text-amber-600'>
                            This project has no team yet. Add people in Project Details &gt; Team.
                          </span>
                        ))}
                      {suggestions.length > 0 && (
                        <div className='flex flex-wrap items-center gap-1.5 pt-1' data-assignee-suggestions>
                          <span className='text-[11px] text-gray-500'>Most free time:</span>
                          {suggestions.map(p => (
                            <button
                              key={p.member_id}
                              type='button'
                              onClick={() => pickSuggestion(p)}
                              title={`${p.free_hours} h free of ${p.available_hours} h between ${suggestResp.detail.from} and ${suggestResp.detail.to}; ${p.open_tasks} open task(s)`}
                              className={`cursor-pointer rounded-full border border-dashed px-2 py-0.5 text-[11px] font-semibold hover:border-[var(--theme-solid)] hover:text-[var(--theme-solid)] ${
                                p.fits ? 'border-gray-300 text-slate-600' : 'border-amber-300 text-amber-700'
                              }`}
                            >
                              {p.member_name} ({p.free_hours} h free)
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Reporter</span>
                      <input
                        value={isEdit ? reporter || '-' : 'You (set automatically)'}
                        disabled
                        className={ThemeStyles.formsInputs}
                        readOnly
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DrawerFooter
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText={isEdit ? 'Update' : 'Submit'}
            disabled={isSubmitting || isLoadingDetail}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default TaskDrawer
