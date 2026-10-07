import React, { useEffect, useMemo, useState } from 'react'
import { Drawer } from '@mui/material'
import { Receipt, Save, Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerHeader } from 'src/pms/components/DrawerParts'
import { GhostButton, PrimaryButton } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  capitalizeFirst,
  capitalizeWords,
  collectErrors,
  EXPENSE_VALIDATED_FIELDS,
  getExpenseFieldError
} from 'src/pms/utils/validation'
import { useGetProjectMilestonesQuery } from 'src/store/apps/pms/billingApi'
import {
  useAttachReceiptMutation,
  useGetExpenseMetaQuery,
  useRemoveReceiptMutation,
  useSaveExpenseMutation,
  useSubmitExpenseMutation
} from 'src/store/apps/pms/expensesApi'
import { useDownloadDocumentMutation } from 'src/store/apps/pms/documentsApi'
import { useGetProjectSettingsQuery } from 'src/store/apps/pms/settingsApi'
import { saveBlob } from 'src/pms/documents/fileUtils'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'

const SPENDING = ['Approved', 'Active', 'On Hold']
const todayIso = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const EMPTY = {
  project_id: '',
  category: '',
  description: '',
  vendor: '',
  expense_date: '',
  amount: '',
  billable: false,
  milestone_id: ''
}
const RECEIPT_TYPES = ['pdf', 'jpg', 'jpeg', 'png']
const RECEIPT_MAX_MB = 15
const Required = () => <span className='text-red-500'>*</span>

// expense: edit a Draft/Rejected one; defaultProjectId: pre-selects the project for a new one.
const ExpenseDrawer = ({ open, onClose, expense, defaultProjectId }) => {
  const isEdit = Boolean(expense)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const { data: metaResp } = useGetExpenseMetaQuery(undefined, { skip: !open })
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: !open })
  const { data: milestonesResp } = useGetProjectMilestonesQuery(form.project_id, { skip: !open || !form.project_id })
  const [save, { isLoading: saving }] = useSaveExpenseMutation()
  const [attachReceipt, { isLoading: uploading }] = useAttachReceiptMutation()
  const [removeReceipt] = useRemoveReceiptMutation()
  const [submitExpense, { isLoading: submitting }] = useSubmitExpenseMutation()
  const [download] = useDownloadDocumentMutation()
  const isLoading = saving || uploading || submitting
  const [receiptFile, setReceiptFile] = useState(null)
  const [hasReceipt, setHasReceipt] = useState(false)
  // A save that failed half way (receipt upload or submit) already created the expense / attached the file:
  // a retry updates that expense instead of adding a duplicate.
  const [savedId, setSavedId] = useState(null)
  const [uploadedFile, setUploadedFile] = useState(null)
  const { data: settingsResp } = useGetProjectSettingsQuery(form.project_id, { skip: !open || !form.project_id })
  const receiptLimit = form.project_id ? settingsResp?.detail?.receipt_required_above ?? null : null
  const receiptNeeded = receiptLimit !== null && Number(form.amount) > receiptLimit
  const today = todayIso()

  // Only projects that may spend money (Approved, Active, On Hold), plus the expense's own project when editing.
  const projects = useMemo(
    () =>
      (projectsResp?.detail || []).filter(
        p => SPENDING.includes(p.status) || String(p.id) === String(expense?.project_id)
      ),
    [projectsResp, expense]
  )
  const project = projects.find(p => String(p.id) === String(form.project_id)) || {}

  useEffect(() => {
    if (!open) return
    setErrors({})
    if (isEdit) {
      setForm({
        project_id: String(expense.project_id),
        category: expense.category,
        description: expense.description,
        vendor: expense.vendor || '',
        expense_date: expense.expense_date,
        amount: String(expense.amount),
        billable: expense.billable,
        milestone_id: expense.milestone_id ? String(expense.milestone_id) : ''
      })
    } else {
      setForm({ ...EMPTY, project_id: defaultProjectId ? String(defaultProjectId) : '', expense_date: today })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    setReceiptFile(null)
    setHasReceipt(Boolean(expense?.receipt_document_id))
    setSavedId(null)
    setUploadedFile(null)
  }, [open, expense])

  // The page may pick its project (from ?projectId=) just after the form opened: use it if nothing is chosen yet.
  useEffect(() => {
    if (open && !isEdit && defaultProjectId && !form.project_id)
      setForm(prev => ({ ...prev, project_id: String(defaultProjectId) }))
  }, [open, isEdit, defaultProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadReceipt = async () => {
    try {
      saveBlob(await download(expense.receipt_document_id).unwrap(), expense.receipt_file_name)
    } catch {
      // shown by the shared error toast
    }
  }

  const dropReceipt = async () => {
    try {
      const resp = await removeReceipt(expense.id).unwrap()
      toast.success(resp.detail)
      setHasReceipt(false)
    } catch {
      // shown by the shared error toast
    }
  }

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const change = (id, value) => {
    const formatted = id === 'description' ? capitalizeFirst(value) : id === 'vendor' ? capitalizeWords(value) : value
    setForm(prev => ({ ...prev, [id]: formatted, ...(id === 'project_id' ? { milestone_id: '' } : {}) }))
    setError(id, null)
  }
  const input = id => ({
    id,
    value: form[id],
    onChange: e => change(id, e.target.value),
    onBlur: () => setError(id, getExpenseFieldError(id, form[id], form, project, today))
  })
  const border = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null

  const pickReceipt = file => {
    setError('receipt', null)
    if (!file) return setReceiptFile(null)
    const ext = file.name.split('.').pop().toLowerCase()
    if (!RECEIPT_TYPES.includes(ext)) return setError('receipt', 'Attach a PDF, JPG or PNG file')
    if (file.size > RECEIPT_MAX_MB * 1024 * 1024)
      return setError('receipt', `The file is larger than ${RECEIPT_MAX_MB} MB`)
    setReceiptFile(file)
  }

  const submit = async sendForApproval => {
    if (isLoading) return
    const found = collectErrors(
      EXPENSE_VALIDATED_FIELDS,
      (f, v, fm) => getExpenseFieldError(f, v, fm, project, today),
      form
    )
    if (sendForApproval && receiptNeeded && !receiptFile && !hasReceipt)
      found.receipt = `This project needs a receipt for expenses above ₹${receiptLimit.toLocaleString('en-IN')}`
    setErrors(found)
    const ids = Object.keys(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      document.getElementById(ids[0])?.focus()

      return
    }
    try {
      const upload = receiptFile && receiptFile !== uploadedFile ? receiptFile : null
      const body = {
        project_id: Number(form.project_id),
        category: form.category,
        description: form.description.trim(),
        vendor: form.vendor.trim() || null,
        expense_date: form.expense_date,
        amount: Number(form.amount),
        billable: form.billable,
        milestone_id: form.milestone_id ? Number(form.milestone_id) : null,
        // With a receipt to upload, save first, attach the file, then send for approval.
        submit: sendForApproval && !upload
      }
      const resp = await save({ id: expense?.id || savedId || undefined, body }).unwrap()
      if (!expense) setSavedId(resp.data.id)
      let message = resp.detail
      if (upload) {
        await attachReceipt({ id: resp.data.id, file: upload }).unwrap()
        setUploadedFile(upload)
        message = `${resp.data.expense_key} saved with its receipt`
        if (sendForApproval) message = (await submitExpense(resp.data.id).unwrap()).detail
      }
      toast.success(message)
      onClose()
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[60%] lg:w-[45%] xl:w-[36%] 2xl:w-[30%]'>
          <DrawerHeader
            title={isEdit ? `Edit ${expense.expense_key}` : 'Add Expense'}
            subtitle='Money spent for a project besides people’s time'
            icon={Receipt}
          />
          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            {expense?.status === 'Rejected' && (
              <div className='mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700'>
                Rejected by {expense.reviewed_by_name}: {expense.reject_reason}
              </div>
            )}
            <div className={ThemeStyles.drawerHeadingSection}>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Project <Required />
                  </span>
                  <select
                    {...input('project_id')}
                    disabled={isEdit || Boolean(savedId)}
                    className={`${ThemeStyles.formsInputsDropdown}${border('project_id')}`}
                  >
                    <option value=''>Select project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code} - {p.project_name}
                      </option>
                    ))}
                  </select>
                  {fieldError('project_id') ||
                    (!isEdit && (
                      <span className='block text-[11px] text-gray-500'>
                        Only Approved, Active and On Hold projects can record expenses.
                      </span>
                    ))}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Category <Required />
                  </span>
                  <select {...input('category')} className={`${ThemeStyles.formsInputsDropdown}${border('category')}`}>
                    <option value=''>Select category</option>
                    {(metaResp?.detail?.categories || []).map(c => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  {fieldError('category')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Date <Required />
                  </span>
                  <input
                    {...input('expense_date')}
                    type='date'
                    max={project.end_date && project.end_date < today ? project.end_date : today}
                    min={project.start_date || undefined}
                    className={`${ThemeStyles.formsInputs}${border('expense_date')}`}
                  />
                  {fieldError('expense_date')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Amount (₹, incl. GST) <Required />
                  </span>
                  <input
                    {...input('amount')}
                    type='number'
                    min='0'
                    step='0.01'
                    placeholder='0.00'
                    className={`${ThemeStyles.formsInputs}${border('amount')}`}
                  />
                  {fieldError('amount')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Vendor</span>
                  <input
                    {...input('vendor')}
                    maxLength={200}
                    placeholder='e.g. Ola, AWS, Croma'
                    className={ThemeStyles.formsInputs}
                  />
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <span className={ThemeStyles.formLabels}>
                    Description <Required />
                  </span>
                  <textarea
                    {...input('description')}
                    rows={2}
                    maxLength={500}
                    placeholder='What was bought and why, e.g. Taxi to client office for demo'
                    className={`${ThemeStyles.formsInputs}${border('description')}`}
                  />
                  {fieldError('description')}
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Milestone</span>
                  <select
                    {...input('milestone_id')}
                    disabled={!form.project_id}
                    className={ThemeStyles.formsInputsDropdown}
                  >
                    <option value=''>Not linked</option>
                    {(form.project_id ? milestonesResp?.detail || [] : []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className='flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-slate-700'>
                  <input
                    id='billable'
                    type='checkbox'
                    checked={form.billable}
                    onChange={e => change('billable', e.target.checked)}
                    className='h-4 w-4 accent-[var(--theme-solid)]'
                  />
                  Billable to the client
                </label>
                <div className='space-y-1 md:col-span-2' data-receipt>
                  <span className={ThemeStyles.formLabels}>
                    Receipt {receiptNeeded && <Required />}
                    <span className='ms-1 text-[11px] font-normal text-gray-400'>
                      (PDF, JPG or PNG, up to {RECEIPT_MAX_MB} MB)
                    </span>
                  </span>
                  {hasReceipt && !receiptFile ? (
                    <div className='flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm'>
                      <span className='truncate font-semibold text-slate-700'>{expense.receipt_file_name}</span>
                      <button
                        type='button'
                        onClick={downloadReceipt}
                        className='cursor-pointer text-xs font-semibold'
                        style={{ color: 'var(--theme-solid)' }}
                      >
                        Download
                      </button>
                      <label className='cursor-pointer text-xs font-semibold text-slate-600 hover:underline'>
                        Replace
                        <input
                          type='file'
                          accept='.pdf,.jpg,.jpeg,.png'
                          className='hidden'
                          onChange={e => pickReceipt(e.target.files?.[0])}
                        />
                      </label>
                      <button
                        type='button'
                        onClick={dropReceipt}
                        className='ms-auto cursor-pointer text-xs font-semibold text-red-600'
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <input
                      id='receipt'
                      type='file'
                      accept='.pdf,.jpg,.jpeg,.png'
                      onChange={e => pickReceipt(e.target.files?.[0])}
                      className={`${ThemeStyles.formsInputs} !py-1.5${border('receipt')}`}
                    />
                  )}
                  {fieldError('receipt') ||
                    (receiptLimit !== null && (
                      <span className='block text-[11px] text-gray-500'>
                        This project needs a receipt for expenses above ₹{receiptLimit.toLocaleString('en-IN')}.
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </div>
          <div className='border-t border-gray-100 bg-gradient-to-r from-gray-50 via-white to-gray-50 p-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <GhostButton onClick={onClose}>
                <X size={16} /> Close
              </GhostButton>
              <div className='flex gap-2'>
                <GhostButton onClick={() => submit(false)} disabled={isLoading}>
                  <Save size={16} /> Save Draft
                </GhostButton>
                <PrimaryButton onClick={() => submit(true)} disabled={isLoading}>
                  <Send size={16} /> Submit for Approval
                </PrimaryButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  )
}

export default ExpenseDrawer
