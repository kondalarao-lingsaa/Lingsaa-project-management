import React, { useEffect, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { Icon } from '@iconify/react'
import { LayoutTemplate } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { capitalizeFirst, capitalizeWords, getTemplateErrors, TEMPLATE_MAX_DAYS } from 'src/pms/utils/validation'
import { useLazyGetTemplateQuery, useSaveTemplateMutation } from 'src/store/apps/pms/settingsApi'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const TYPES = ['Task', 'Story', 'Bug', 'Epic']
const uid = () => Math.random().toString(36).slice(2)
const blankMilestone = () => ({ key: uid(), name: '', description: '', due_offset: '', amount: '' })
const blankTask = () => ({
  key: uid(),
  title: '',
  description: '',
  priority: 'Medium',
  task_type: 'Task',
  estimated_hours: '',
  start_offset: '',
  duration_days: '',
  milestone: '',
  parent: ''
})
const str = v => (v === null || v === undefined ? '' : String(v))
const numOrNull = v => (v === '' || v === null || v === undefined ? null : Number(v))

// Server rows use indexes; the form uses row keys so removing a row keeps every link right.
const toForm = t => {
  // Descriptions have no field in the editor, but are carried along so saving the template keeps them.
  const ms = t.milestones.map(m => ({
    key: uid(),
    name: m.name,
    description: m.description || '',
    due_offset: str(m.due_offset),
    amount: str(m.amount)
  }))
  const ts = t.tasks.map(x => ({
    key: uid(),
    title: x.title,
    description: x.description || '',
    priority: x.priority,
    task_type: x.task_type === 'Subtask' ? 'Task' : x.task_type,
    estimated_hours: str(x.estimated_hours),
    start_offset: str(x.start_offset),
    duration_days: str(x.duration_days),
    milestone: '',
    parent: ''
  }))
  t.tasks.forEach((x, i) => {
    if (x.milestone_index !== null && ms[x.milestone_index]) ts[i].milestone = ms[x.milestone_index].key
    if (x.parent_index !== null && ts[x.parent_index]) ts[i].parent = ts[x.parent_index].key
  })

  return {
    name: t.name,
    description: t.description || '',
    project_type: t.project_type || '',
    duration_days: str(t.duration_days),
    milestones: ms,
    tasks: ts
  }
}

const toBody = form => {
  const mIndex = Object.fromEntries(form.milestones.map((m, i) => [m.key, i]))
  const tIndex = Object.fromEntries(form.tasks.map((t, i) => [t.key, i]))

  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    project_type: form.project_type || null,
    duration_days: Number(form.duration_days),
    milestones: form.milestones.map(m => ({
      name: m.name.trim(),
      description: (m.description || '').trim() || null,
      due_offset: numOrNull(m.due_offset),
      amount: numOrNull(m.amount)
    })),
    tasks: form.tasks.map(t => ({
      title: t.title.trim(),
      description: (t.description || '').trim() || null,
      priority: t.priority,
      task_type: t.parent ? 'Subtask' : t.task_type,
      estimated_hours: numOrNull(t.estimated_hours),
      start_offset: numOrNull(t.start_offset),
      duration_days: numOrNull(t.duration_days),
      milestone_index: t.milestone && mIndex[t.milestone] !== undefined ? mIndex[t.milestone] : null,
      parent_index: t.parent && tIndex[t.parent] !== undefined ? tIndex[t.parent] : null
    }))
  }
}

const Err = ({ msg }) =>
  msg ? <span className='mt-0.5 block text-[11px] font-semibold text-red-500'>{msg}</span> : null

const TemplateEditorDrawer = ({ open, onClose, templateId, projectTypes = [] }) => {
  const isEdit = Boolean(templateId)
  const [form, setForm] = useState({
    name: '',
    description: '',
    project_type: '',
    duration_days: '30',
    milestones: [],
    tasks: []
  })
  const [errors, setErrors] = useState({})
  const [load, { isFetching }] = useLazyGetTemplateQuery()
  const [save, { isLoading }] = useSaveTemplateMutation()

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (!isEdit) {
      setForm({
        name: '',
        description: '',
        project_type: '',
        duration_days: '30',
        milestones: [blankMilestone()],
        tasks: [blankTask()]
      })

      return
    }
    load(templateId)
      .unwrap()
      .then(r => r?.detail && setForm(toForm(r.detail)))
      .catch(() => {})
  }, [open, templateId, isEdit, load])

  const setField = (id, value) => {
    setForm(p => ({ ...p, [id]: value }))
    setErrors(p => ({ ...p, [id]: null, plan: null }))
  }
  const setRow = (list, i, field, value) => {
    setForm(p => ({ ...p, [list]: p[list].map((r, j) => (j === i ? { ...r, [field]: value } : r)) }))
    setErrors(p => ({ ...p, [`${list[0]}${i}.${field}`]: null }))
  }
  const removeRow = (list, i) =>
    setForm(p => {
      const gone = p[list][i].key
      const next = { ...p, [list]: p[list].filter((_, j) => j !== i) }
      // Links to the removed row are cleared, not left pointing at the wrong row.
      if (list === 'milestones') next.tasks = next.tasks.map(t => (t.milestone === gone ? { ...t, milestone: '' } : t))
      if (list === 'tasks') next.tasks = next.tasks.map(t => (t.parent === gone ? { ...t, parent: '' } : t))
      setErrors({})

      return next
    })

  const submit = async () => {
    if (isLoading) return
    const found = getTemplateErrors(form)
    setErrors(found)
    const count = Object.keys(found).length
    if (count) {
      toast.error(count === 1 ? Object.values(found)[0] : `Please fix the ${count} highlighted fields`)

      return
    }
    try {
      const resp = await save({ id: templateId, body: toBody(form) }).unwrap()
      toast.success(resp.detail)
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(p => ({ ...p, ...e.data.errors }))
    }
  }

  const b = key => (errors[key] ? ' !border !border-red-500' : '')
  const cell = `${ThemeStyles.formsInputs} !px-2 !py-1.5`
  const mainTasks = form.tasks.filter(t => !t.parent)
  const totalHours = form.tasks.reduce((n, t) => n + (Number(t.estimated_hours) || 0), 0)

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl lg:w-[88%] xl:w-[75%] 2xl:w-[65%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Template' : 'New Project Template'}
            subtitle='Dates are "day N from the project start" (day 0 = first day)'
            icon={LayoutTemplate}
          />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            {isFetching ? (
              <div className='flex justify-center py-10'>
                <CircularProgress size={28} />
              </div>
            ) : (
              <>
                <div className={ThemeStyles.drawerHeadingSection}>
                  <div className='grid grid-cols-1 gap-3 md:grid-cols-4'>
                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>
                        Template Name <span className='text-red-500'>*</span>
                      </span>
                      <input
                        id='name'
                        value={form.name}
                        maxLength={120}
                        onChange={e => setField('name', capitalizeWords(e.target.value))}
                        placeholder='e.g. Website Delivery'
                        className={`${ThemeStyles.formsInputs}${b('name')}`}
                      />
                      <Err msg={errors.name} />
                    </div>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Project Type</span>
                      <select
                        id='project_type'
                        value={form.project_type}
                        onChange={e => setField('project_type', e.target.value)}
                        className={ThemeStyles.formsInputsDropdown}
                      >
                        <option value=''>Any</option>
                        {projectTypes.map(t => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>
                        Project Length (days) <span className='text-red-500'>*</span>
                      </span>
                      <input
                        id='duration_days'
                        type='number'
                        min={1}
                        max={TEMPLATE_MAX_DAYS}
                        value={form.duration_days}
                        onChange={e => setField('duration_days', e.target.value)}
                        className={`${ThemeStyles.formsInputs}${b('duration_days')}`}
                      />
                      <Err msg={errors.duration_days} />
                    </div>
                    <div className='space-y-1 md:col-span-4'>
                      <span className={ThemeStyles.formLabels}>Description</span>
                      <textarea
                        id='description'
                        rows={2}
                        maxLength={1000}
                        value={form.description}
                        onChange={e => setField('description', capitalizeFirst(e.target.value))}
                        placeholder='When to use this template'
                        className={`${ThemeStyles.formsInputs}${b('description')}`}
                      />
                      <Err msg={errors.description} />
                    </div>
                  </div>
                </div>

                {errors.plan && (
                  <div className='mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600'>
                    {errors.plan}
                  </div>
                )}

                <div className={`${ThemeStyles.drawerHeadingSection} mt-3`}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <Icon icon='tabler:flag' className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Milestones ({form.milestones.length})</span>
                  </div>
                  <div className='hidden grid-cols-[1fr_110px_140px_32px] gap-2 px-1 pb-1 text-[11px] font-semibold uppercase text-gray-500 md:grid'>
                    <span>Name *</span>
                    <span>Due day</span>
                    <span>Amount (₹)</span>
                    <span />
                  </div>
                  {form.milestones.map((m, i) => (
                    <div
                      key={m.key}
                      className='mb-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_140px_32px]'
                      data-milestone-row={i}
                    >
                      <div>
                        <input
                          value={m.name}
                          maxLength={200}
                          onChange={e => setRow('milestones', i, 'name', capitalizeWords(e.target.value))}
                          placeholder='e.g. Design Signed Off'
                          className={`${cell}${b(`m${i}.name`)}`}
                          aria-label={`Milestone ${i + 1} name`}
                        />
                        <Err msg={errors[`m${i}.name`]} />
                      </div>
                      <div>
                        <input
                          type='number'
                          min={0}
                          value={m.due_offset}
                          onChange={e => setRow('milestones', i, 'due_offset', e.target.value)}
                          placeholder='day'
                          className={`${cell}${b(`m${i}.due_offset`)}`}
                          aria-label={`Milestone ${i + 1} due day`}
                        />
                        <Err msg={errors[`m${i}.due_offset`]} />
                      </div>
                      <div>
                        <input
                          type='number'
                          min={0}
                          value={m.amount}
                          onChange={e => setRow('milestones', i, 'amount', e.target.value)}
                          placeholder='optional'
                          className={`${cell}${b(`m${i}.amount`)}`}
                          aria-label={`Milestone ${i + 1} amount`}
                        />
                        <Err msg={errors[`m${i}.amount`]} />
                      </div>
                      <button
                        type='button'
                        onClick={() => removeRow('milestones', i)}
                        className='cursor-pointer self-start rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600'
                        aria-label={`Remove milestone ${i + 1}`}
                      >
                        <Icon icon='tabler:trash' width={17} />
                      </button>
                    </div>
                  ))}
                  <button
                    type='button'
                    onClick={() => setForm(p => ({ ...p, milestones: [...p.milestones, blankMilestone()] }))}
                    className='cursor-pointer text-sm font-semibold'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    + Add milestone
                  </button>
                </div>

                <div className={`${ThemeStyles.drawerHeadingSection} mt-3`}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <Icon icon='tabler:checklist' className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Tasks ({form.tasks.length})</span>
                    <span className='ms-auto text-xs font-medium text-gray-500'>
                      {Math.round(totalHours * 10) / 10} h estimated
                    </span>
                  </div>
                  <div className='hidden grid-cols-[1.6fr_100px_90px_80px_80px_70px_1fr_1fr_32px] gap-2 px-1 pb-1 text-[11px] font-semibold uppercase text-gray-500 xl:grid'>
                    <span>Task *</span>
                    <span>Priority</span>
                    <span>Type</span>
                    <span>Hours</span>
                    <span>Start day</span>
                    <span>Days</span>
                    <span>Milestone</span>
                    <span>Subtask of</span>
                    <span />
                  </div>
                  {form.tasks.map((t, i) => (
                    <div
                      key={t.key}
                      className='mb-2 grid grid-cols-2 gap-2 border-b border-gray-100 pb-2 md:grid-cols-4 xl:grid-cols-[1.6fr_100px_90px_80px_80px_70px_1fr_1fr_32px] xl:border-0 xl:pb-0'
                      data-task-row={i}
                    >
                      <div className='col-span-2 md:col-span-4 xl:col-span-1'>
                        <input
                          value={t.title}
                          maxLength={300}
                          onChange={e => setRow('tasks', i, 'title', capitalizeFirst(e.target.value))}
                          placeholder={t.parent ? '↳ Subtask name' : 'Task name'}
                          className={`${cell}${b(`t${i}.title`)}`}
                          aria-label={`Task ${i + 1} name`}
                        />
                        <Err msg={errors[`t${i}.title`]} />
                      </div>
                      <select
                        value={t.priority}
                        onChange={e => setRow('tasks', i, 'priority', e.target.value)}
                        className={`${ThemeStyles.formsInputsDropdown} !py-1.5`}
                        aria-label={`Task ${i + 1} priority`}
                      >
                        {PRIORITIES.map(p => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      <select
                        value={t.parent ? 'Subtask' : t.task_type}
                        disabled={Boolean(t.parent)}
                        onChange={e => setRow('tasks', i, 'task_type', e.target.value)}
                        className={`${ThemeStyles.formsInputsDropdown} !py-1.5`}
                        aria-label={`Task ${i + 1} type`}
                      >
                        {(t.parent ? ['Subtask'] : TYPES).map(p => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                      <div>
                        <input
                          type='number'
                          min={0}
                          step='0.5'
                          value={t.estimated_hours}
                          onChange={e => setRow('tasks', i, 'estimated_hours', e.target.value)}
                          placeholder='h'
                          className={`${cell}${b(`t${i}.estimated_hours`)}`}
                          aria-label={`Task ${i + 1} hours`}
                        />
                        <Err msg={errors[`t${i}.estimated_hours`]} />
                      </div>
                      <div>
                        <input
                          type='number'
                          min={0}
                          value={t.start_offset}
                          onChange={e => setRow('tasks', i, 'start_offset', e.target.value)}
                          placeholder='day'
                          className={`${cell}${b(`t${i}.start_offset`)}`}
                          aria-label={`Task ${i + 1} start day`}
                        />
                        <Err msg={errors[`t${i}.start_offset`]} />
                      </div>
                      <div>
                        <input
                          type='number'
                          min={1}
                          value={t.duration_days}
                          onChange={e => setRow('tasks', i, 'duration_days', e.target.value)}
                          placeholder='1'
                          className={`${cell}${b(`t${i}.duration_days`)}`}
                          aria-label={`Task ${i + 1} days`}
                        />
                        <Err msg={errors[`t${i}.duration_days`]} />
                      </div>
                      <select
                        value={t.milestone}
                        onChange={e => setRow('tasks', i, 'milestone', e.target.value)}
                        className={`${ThemeStyles.formsInputsDropdown} !py-1.5`}
                        aria-label={`Task ${i + 1} milestone`}
                      >
                        <option value=''>No milestone</option>
                        {form.milestones.map((m, j) => (
                          <option key={m.key} value={m.key}>
                            {m.name || `Milestone ${j + 1}`}
                          </option>
                        ))}
                      </select>
                      <select
                        value={t.parent}
                        onChange={e => setRow('tasks', i, 'parent', e.target.value)}
                        className={`${ThemeStyles.formsInputsDropdown} !py-1.5`}
                        aria-label={`Task ${i + 1} parent`}
                      >
                        <option value=''>Main task</option>
                        {mainTasks
                          .filter(x => x.key !== t.key)
                          .map(x => (
                            <option key={x.key} value={x.key} disabled={form.tasks.some(y => y.parent === t.key)}>
                              {x.title || 'Untitled task'}
                            </option>
                          ))}
                      </select>
                      <button
                        type='button'
                        onClick={() => removeRow('tasks', i)}
                        className='cursor-pointer self-start rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600'
                        aria-label={`Remove task ${i + 1}`}
                      >
                        <Icon icon='tabler:trash' width={17} />
                      </button>
                    </div>
                  ))}
                  <button
                    type='button'
                    onClick={() => setForm(p => ({ ...p, tasks: [...p.tasks, blankTask()] }))}
                    className='cursor-pointer text-sm font-semibold'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    + Add task
                  </button>
                  <p className='mt-2 text-xs text-gray-500'>
                    Leave Start day empty for tasks without dates. A task with subtasks cannot become a subtask itself.
                  </p>
                </div>
              </>
            )}
          </div>
          <DrawerFooter
            onClose={onClose}
            onSubmit={submit}
            submitText={isEdit ? 'Update Template' : 'Save Template'}
            disabled={isLoading || isFetching}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default TemplateEditorDrawer
