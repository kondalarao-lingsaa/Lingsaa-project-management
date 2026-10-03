import React, { useEffect, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { CalendarRange, FolderKanban, Phone, ReceiptText, UserRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { getAuthParams } from 'src/store/rtkQuery/baseQuery'
import {
  capitalizeFirst,
  capitalizeWords,
  collectErrors,
  decimalOnly,
  digitsOnly,
  getProjectFieldError,
  GSTIN_REGEX,
  isClientRequired,
  noSpaces,
  personName,
  maskGstin,
  maskPan,
  PROJECT_VALIDATED_FIELDS
} from 'src/pms/utils/validation'
import {
  useChangeProjectStatusMutation,
  useCreateProjectMutation,
  useLazyGetProjectDetailQuery,
  useUpdateProjectMutation
} from 'src/store/apps/pms/projectsApi'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { useCreateProjectFromTemplateMutation } from 'src/store/apps/pms/settingsApi'

const EMPTY_FORM = {
  project_name: '',
  customer_name: '',
  customer_contact_name: '',
  customer_mobile: '',
  customer_email: '',
  customer_gstin: '',
  customer_pan: '',
  project_type: '',
  category: '',
  business_domain: '',
  description: '',
  priority: 'Medium',
  start_date: '',
  end_date: '',
  budget: '',
  project_manager_name: '',
  project_manager_id: ''
}

// Applied while typing, so the value is already in the right shape when the user leaves the field.
const FORMATTERS = {
  project_name: capitalizeWords,
  customer_name: capitalizeWords,
  customer_contact_name: personName,
  project_manager_name: personName,
  customer_mobile: digitsOnly,
  customer_email: noSpaces,
  customer_gstin: maskGstin,
  customer_pan: maskPan,
  description: capitalizeFirst,
  budget: v => decimalOnly(v, 2)
}

// A new project defaults to being managed by whoever creates it, which is also what makes
// it show up under "My Projects".
const currentUserAsManager = () => {
  const { username, userId } = getAuthParams()

  return {
    project_manager_name: username === '0' ? '' : personName(username),
    project_manager_id: String(userId || '')
  }
}

const toForm = p =>
  Object.fromEntries(
    Object.keys(EMPTY_FORM).map(key => [key, p?.[key] === null || p?.[key] === undefined ? '' : String(p[key])])
  )

const toPayload = form => ({
  ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])),
  project_name: form.project_name.trim(),
  priority: form.priority || 'Medium',
  budget: form.budget === '' ? null : Number(form.budget),
  project_manager_id: /^\d+$/.test(form.project_manager_id) ? Number(form.project_manager_id) : null
})

const Options = ({ items = [] }) =>
  items.map(item => (
    <option key={item} value={item}>
      {item}
    </option>
  ))

// Required for client projects, optional for Internal ones.
const CLIENT_FIELDS = ['customer_name', 'customer_contact_name', 'customer_mobile']

const Required = () => <span className='text-red-500'>*</span>

// template: create the project from a Project Template (its milestones and tasks are added, dates counted from Start Date).
const ProjectDrawer = ({ open, onClose, projectId, onSuccess, meta, template }) => {
  const isEdit = Boolean(projectId)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})

  const [loadDetail, { isFetching: isLoadingDetail }] = useLazyGetProjectDetailQuery()
  const [createProject, { isLoading: isCreating }] = useCreateProjectMutation()
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation()
  const [createFromTemplate, { isLoading: isCreatingFromTemplate }] = useCreateProjectFromTemplateMutation()
  const [changeStatus, { isLoading: isApproving }] = useChangeProjectStatusMutation()
  const isSubmitting = isCreating || isUpdating || isCreatingFromTemplate || isApproving
  // People with approval authority can create a project already approved (no separate approval step).
  const { userPermissions } = usePmsPermissions(getScreen('projects.allProjects')?.permissionName)
  const canApprove = Boolean(userPermissions?.approve)

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (!isEdit) {
      setForm({
        ...EMPTY_FORM,
        ...currentUserAsManager(),
        ...(template ? { project_type: template.project_type || '', description: template.description || '' } : {})
      })

      return
    }
    loadDetail(projectId)
      .unwrap()
      .then(resp => resp?.detail && setForm(toForm(resp.detail)))
      .catch(() => {})
  }, [open, projectId, isEdit, loadDetail, template])

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
    // Typing a different manager name means the stored user id no longer applies.
    setForm(prev => {
      const updated = { ...prev, [id]: next }
      if (id === 'project_manager_name') updated.project_manager_id = ''
      // A GSTIN contains the PAN (characters 3-12), so a complete GSTIN fills an empty PAN.
      if (id === 'customer_gstin' && GSTIN_REGEX.test(next) && !prev.customer_pan)
        updated.customer_pan = next.slice(2, 12)

      return updated
    })
    setError(id, null)
    // Choosing "Internal" makes the client fields optional, so their "required" errors may no longer apply.
    if (id === 'project_type') {
      CLIENT_FIELDS.filter(field => errors[field]).forEach(field =>
        setError(field, getProjectFieldError(field, form[field], { ...form, project_type: next }))
      )
    }
  }

  // Re-checks one field when the user leaves it; a date change also re-checks the end date.
  const handleBlur = field => {
    setError(field, getProjectFieldError(field, form[field], form))
    if (field === 'start_date' && form.end_date)
      setError('end_date', getProjectFieldError('end_date', form.end_date, form))
    if (field === 'customer_gstin' && form.customer_pan)
      setError('customer_pan', getProjectFieldError('customer_pan', form.customer_pan, form))
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null

  const handleSubmit = async (andApprove = false) => {
    if (isSubmitting) return
    const found = collectErrors(PROJECT_VALIDATED_FIELDS, getProjectFieldError, form)
    // Approval needs an end date and a budget (same rule as Submit for Approval).
    if (andApprove) {
      if (!form.end_date && !found.end_date) found.end_date = 'Please Select End Date - it is needed to approve the project'
      if ((form.budget === '' || form.budget === null || form.budget === undefined) && !found.budget) found.budget = 'Please Enter Budget - it is needed to approve the project'
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
        ? await updateProject({ id: projectId, body }).unwrap()
        : template
        ? await createFromTemplate({ id: template.id, body }).unwrap()
        : await createProject(body).unwrap()
      const newId = resp?.data?.id
      if (andApprove && newId) {
        // Submitting applies the approval rules: an approver's own authority (or the budget limit) approves it at
        // once; a project above their level still waits for the next approver. The server says which.
        const sent = await changeStatus({ id: newId, status: 'Pending Approval' }).unwrap()
        toast.success(sent?.detail || `${resp?.data?.project_code || 'Project'} created`)
      } else {
        toast.success(resp?.detail || (isEdit ? 'Project updated' : 'Project created'))
      }
      onClose()
      // Let the drawer's scroll lock release before the parent reacts.
      setTimeout(() => onSuccess?.(resp), 300)
    } catch (e) {
      // The shared base query already showed the toast; also mark the fields the server rejected.
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const section = ThemeStyles.drawerHeadingSection
  const input = id => ({ id, value: form[id], onChange: handleChange, onBlur: () => handleBlur(id) })

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[80%] lg:w-[60%] xl:w-[40%] 2xl:w-[35%]'>
          <DrawerHeader
            title={isEdit ? 'Edit Project' : template ? 'Create Project from Template' : 'Create Project'}
            subtitle={
              isEdit
                ? 'Update project information'
                : template
                ? `${template.name}: ${template.milestone_count} milestones and ${
                    template.task_count + template.subtask_count
                  } tasks, ${template.duration_days} days`
                : 'Set up a new project'
            }
            icon={FolderKanban}
          />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            {isLoadingDetail ? (
              <div className='flex justify-center py-10'>
                <CircularProgress size={28} />
              </div>
            ) : (
              <>
                <p className='px-1 text-xs text-gray-500'>
                  Fields marked <Required /> are required. End Date and Budget are needed before the project can be sent
                  for approval.
                </p>
                {template && (
                  <p
                    className='mt-2 rounded-lg border border-[color-mix(in_srgb,var(--theme-solid)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-solid)_7%,transparent)] px-3 py-2 text-xs text-slate-700'
                    data-template-hint
                  >
                    Every milestone and task date of <b>{template.name}</b> is counted from the Start Date. Leave End
                    Date empty to use the template length ({template.duration_days} days).
                  </p>
                )}

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <FolderKanban className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Project Details</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>
                        Project Name <Required />
                      </span>
                      <input
                        {...input('project_name')}
                        type='text'
                        maxLength={200}
                        placeholder='e.g. E-Commerce Application'
                        className={`${ThemeStyles.formsInputs}${errorBorder('project_name')}`}
                      />
                      {fieldError('project_name')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>
                        Client / Customer {isClientRequired(form) && <Required />}
                      </span>
                      <input
                        {...input('customer_name')}
                        type='text'
                        maxLength={200}
                        placeholder='Who is this project for?'
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_name')}`}
                      />
                      {fieldError('customer_name')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>
                        Project Type <Required />
                      </span>
                      <select
                        {...input('project_type')}
                        className={`${ThemeStyles.formsInputsDropdown}${errorBorder('project_type')}`}
                      >
                        <option value=''>Select type</option>
                        <Options items={meta?.project_types} />
                      </select>
                      {fieldError('project_type')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Category</span>
                      <select {...input('category')} className={ThemeStyles.formsInputsDropdown}>
                        <option value=''>Select category</option>
                        <Options items={meta?.categories} />
                      </select>
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Business Domain</span>
                      <select {...input('business_domain')} className={ThemeStyles.formsInputsDropdown}>
                        <option value=''>Select domain</option>
                        <Options items={meta?.business_domains} />
                      </select>
                    </div>

                    <div className='space-y-1 md:col-span-2'>
                      <div className='flex items-center justify-between'>
                        <span className={ThemeStyles.formLabels}>Description</span>
                        <span className='text-xs text-gray-400'>{form.description.length}/2000</span>
                      </div>
                      <textarea
                        {...input('description')}
                        rows={3}
                        maxLength={2000}
                        placeholder='Goals, scope and key notes'
                        className={`${ThemeStyles.formsInputs}${errorBorder('description')}`}
                      />
                      {fieldError('description')}
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <Phone className={`${ThemeStyles.drawerHeadingIcon} text-cyan-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Client Contact</span>
                    {!isClientRequired(form) && (
                      <span className='ms-auto text-xs font-medium text-gray-400'>Optional for Internal projects</span>
                    )}
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1 md:col-span-2'>
                      <span className={ThemeStyles.formLabels}>
                        Contact Person {isClientRequired(form) && <Required />}
                      </span>
                      <input
                        {...input('customer_contact_name')}
                        type='text'
                        maxLength={200}
                        placeholder="Client's contact person"
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_contact_name')}`}
                      />
                      {fieldError('customer_contact_name')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Mobile No {isClientRequired(form) && <Required />}</span>
                      <input
                        {...input('customer_mobile')}
                        type='text'
                        inputMode='numeric'
                        maxLength={10}
                        placeholder='10-digit mobile number'
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_mobile')}`}
                      />
                      {fieldError('customer_mobile')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Email</span>
                      <input
                        {...input('customer_email')}
                        type='email'
                        maxLength={150}
                        placeholder='e.g. name@example.com'
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_email')}`}
                      />
                      {fieldError('customer_email')}
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <ReceiptText className={`${ThemeStyles.drawerHeadingIcon} text-amber-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Client Tax Details</span>
                    <span className='ms-auto text-xs font-medium text-gray-400'>Optional - used for billing</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>GSTIN</span>
                      <input
                        {...input('customer_gstin')}
                        type='text'
                        maxLength={15}
                        placeholder='e.g. 22AAAAA0000A1Z5'
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_gstin')}`}
                      />
                      {fieldError('customer_gstin')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>PAN Number</span>
                      <input
                        {...input('customer_pan')}
                        type='text'
                        maxLength={10}
                        placeholder='e.g. ABCDE1234F'
                        className={`${ThemeStyles.formsInputs}${errorBorder('customer_pan')}`}
                      />
                      {fieldError('customer_pan')}
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <CalendarRange className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Schedule, Budget and Priority</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>
                        Start Date <Required />
                      </span>
                      <input
                        {...input('start_date')}
                        type='date'
                        className={`${ThemeStyles.formsInputs}${errorBorder('start_date')}`}
                      />
                      {fieldError('start_date')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>End Date</span>
                      <input
                        {...input('end_date')}
                        type='date'
                        min={form.start_date || undefined}
                        className={`${ThemeStyles.formsInputs}${errorBorder('end_date')}`}
                      />
                      {fieldError('end_date')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Budget</span>
                      <input
                        {...input('budget')}
                        type='text'
                        inputMode='decimal'
                        maxLength={13}
                        placeholder='0.00'
                        className={`${ThemeStyles.formsInputs}${errorBorder('budget')}`}
                      />
                      {fieldError('budget')}
                    </div>

                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>Priority</span>
                      <select {...input('priority')} className={ThemeStyles.formsInputsDropdown}>
                        <Options items={meta?.priorities} />
                      </select>
                    </div>
                  </div>
                </div>

                <div className={section}>
                  <div className={ThemeStyles.drawerHeadingBox}>
                    <UserRound className={`${ThemeStyles.drawerHeadingIcon} text-emerald-500`} />
                    <span className={ThemeStyles.drawerHeadingText}>Ownership</span>
                  </div>

                  <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                    <div className='space-y-1'>
                      <span className={ThemeStyles.formLabels}>
                        Project Manager <Required />
                      </span>
                      <input
                        {...input('project_manager_name')}
                        type='text'
                        maxLength={200}
                        placeholder='Who runs this project?'
                        className={`${ThemeStyles.formsInputs}${errorBorder('project_manager_name')}`}
                      />
                      {fieldError('project_manager_name')}
                    </div>
                  </div>
                </div>

                {!isEdit && (
                  <p className='mt-3 px-1 text-xs text-gray-500'>
                    New projects start as Draft. Move them through Pending Approval, Approved and Active from the
                    project page.
                  </p>
                )}
              </>
            )}
          </div>

          <DrawerFooter
            onClose={onClose}
            onSubmit={() => handleSubmit(false)}
            submitText={isEdit ? 'Update' : 'Create Draft'}
            disabled={isSubmitting || isLoadingDetail}
            extra={!isEdit && canApprove ? { text: 'Create & Approve', onClick: () => handleSubmit(true) } : undefined}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default ProjectDrawer
