import React, { useEffect, useMemo, useState } from 'react'
import { CircularProgress, Drawer } from '@mui/material'
import { ReceiptText, Settings2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { DrawerFooter, DrawerHeader } from 'src/pms/components/DrawerParts'
import { inr } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import {
  capitalizeFirst,
  collectErrors,
  getInvoiceFieldError,
  INVOICE_VALIDATED_FIELDS
} from 'src/pms/utils/validation'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useCreateInvoiceMutation, useGetBillableQuery, useGetBillingMetaQuery } from 'src/store/apps/pms/billingApi'
import { useGetProjectSettingsQuery } from 'src/store/apps/pms/settingsApi'

const todayIso = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const Required = () => <span className='text-red-500'>*</span>

// Create a Draft invoice for an accepted milestone, or for approved unbilled hours plus billable expenses (Time & Material).
// projectId / milestoneId pre-fill the form when opened from a project or a milestone.
const InvoiceDrawer = ({ open, onClose, projectId, milestoneId, onCreated }) => {
  const today = todayIso()
  const empty = {
    project_id: '',
    invoice_type: 'Milestone',
    milestone_id: '',
    period_from: '',
    period_to: '',
    tax_pct: '18',
    payment_terms_days: '30',
    notes: '',
    include_expenses: true
  }
  const [form, setForm] = useState(empty)
  const [errors, setErrors] = useState({})

  const { data: projectsResp } = useGetProjectOptionsQuery(undefined, { skip: !open })
  const { data: metaResp } = useGetBillingMetaQuery(undefined, { skip: !open })
  const { data: billableResp, isFetching: loadingBillable } = useGetBillableQuery(form.project_id, {
    skip: !open || !form.project_id
  })
  const [createInvoice, { isLoading }] = useCreateInvoiceMutation()
  // Project Settings: the project's default GST % and payment terms.
  const { data: settingsResp } = useGetProjectSettingsQuery(form.project_id, { skip: !open || !form.project_id })
  const projectSettings = form.project_id ? settingsResp?.detail : null

  const projects = (Array.isArray(projectsResp?.detail) ? projectsResp.detail : []).filter(
    p => p.project_type !== 'Internal'
  )
  const meta = metaResp?.detail
  const billable = form.project_id ? billableResp?.detail : null

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm({
      ...empty,
      project_id: projectId ? String(projectId) : '',
      milestone_id: milestoneId ? String(milestoneId) : ''
    })
  }, [open, projectId, milestoneId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The project's default GST % and payment terms. Declared after the reset above and re-run on every open,
  // so reopening the drawer (settings already cached) does not fall back to 18% / 30 days.
  useEffect(() => {
    if (!open || !projectSettings) return
    setForm(prev => ({
      ...prev,
      tax_pct: String(projectSettings.default_tax_pct),
      payment_terms_days: String(projectSettings.default_payment_terms)
    }))
  }, [open, projectSettings])

  // A value the list does not offer (e.g. a project default set elsewhere) is still shown as itself, never as
  // the first option while a different value is sent.
  const withCurrent = (list, value) =>
    value === '' || list.some(v => Number(v) === Number(value)) ? list : [...list, Number(value)].sort((a, b) => a - b)
  const taxRates = withCurrent(meta?.tax_rates || [0, 5, 12, 18, 28], form.tax_pct)
  const paymentTerms = withCurrent(meta?.payment_terms || [0, 7, 15, 30, 45, 60, 90], form.payment_terms_days)

  // With no accepted milestone left but hours to bill, start on Time & Material and pre-fill the period.
  useEffect(() => {
    if (!billable || milestoneId) return
    setForm(prev => {
      const type =
        billable.milestones.length === 0 && (billable.unbilled_hours > 0 || billable.unbilled_expenses > 0)
          ? 'Time & Material'
          : prev.invoice_type

      return {
        ...prev,
        invoice_type: type,
        period_from: prev.period_from || billable.unbilled_from || '',
        period_to: prev.period_to || billable.unbilled_to || ''
      }
    })
  }, [billable, milestoneId])

  // Billable expenses dated inside the chosen period (the ones that will become invoice lines).
  const periodExpenses = useMemo(
    () =>
      (billable?.unbilled_expense_list || []).filter(
        x =>
          (!form.period_from || x.expense_date >= form.period_from) &&
          (!form.period_to || x.expense_date <= form.period_to)
      ),
    [billable, form.period_from, form.period_to]
  )
  const expenseTotal = form.include_expenses ? periodExpenses.reduce((n, x) => n + x.amount, 0) : 0

  const preview = useMemo(() => {
    if (!billable) return null
    const hours =
      form.invoice_type === 'Milestone'
        ? billable.milestones.find(m => String(m.id) === form.milestone_id)?.amount || 0
        : form.period_from === billable.unbilled_from && form.period_to === billable.unbilled_to
        ? billable.unbilled_amount
        : null
    if (hours === null) return null
    const subtotal = hours + (form.invoice_type === 'Milestone' ? 0 : expenseTotal)
    const tax = Math.round(subtotal * Number(form.tax_pct)) / 100

    return { subtotal, tax, total: subtotal + tax }
  }, [billable, form, expenseTotal])

  const setError = (field, message) =>
    setErrors(prev => {
      const next = { ...prev }
      if (message) next[field] = message
      else delete next[field]

      return next
    })

  const handleChange = e => {
    const { id, value } = e.target
    setForm(prev => ({
      ...prev,
      [id]: id === 'notes' ? capitalizeFirst(value) : value,
      ...(id === 'project_id' ? { milestone_id: '', period_from: '', period_to: '' } : {})
    }))
    setError(id, null)
  }

  const errorBorder = id => (errors[id] ? ' !border !border-red-500' : '')
  const fieldError = id =>
    errors[id] ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{errors[id]}</span> : null
  const input = id => ({
    id,
    value: form[id],
    onChange: handleChange,
    onBlur: () => setError(id, getInvoiceFieldError(id, form[id], form, today))
  })

  const handleSubmit = async () => {
    if (isLoading) return
    const found = collectErrors(INVOICE_VALIDATED_FIELDS, (f, v, fm) => getInvoiceFieldError(f, v, fm, today), form)
    const ids = Object.keys(found)
    setErrors(found)
    if (ids.length) {
      toast.error(ids.length === 1 ? found[ids[0]] : `Please fix the ${ids.length} highlighted fields below`)
      document.getElementById(ids[0])?.focus()

      return
    }
    try {
      const body = {
        project_id: Number(form.project_id),
        invoice_type: form.invoice_type,
        milestone_id: form.invoice_type === 'Milestone' ? Number(form.milestone_id) : null,
        period_from: form.invoice_type === 'Time & Material' ? form.period_from : null,
        period_to: form.invoice_type === 'Time & Material' ? form.period_to : null,
        tax_pct: Number(form.tax_pct),
        payment_terms_days: Number(form.payment_terms_days),
        notes: form.notes.trim() || null,
        include_expenses: form.include_expenses
      }
      const resp = await createInvoice(body).unwrap()
      toast.success(resp?.detail || 'Invoice created')
      onClose()
      onCreated?.(resp?.data)
    } catch (e) {
      if (e?.data?.errors) setErrors(prev => ({ ...prev, ...e.data.errors }))
    }
  }

  const section = ThemeStyles.drawerHeadingSection
  // Fixed Price work is paid through milestones, so a period invoice there carries billable expenses only.
  const expensesOnly = billable?.bills_hours === false
  const typeButton = (type, hint, label = type) => (
    <button
      type='button'
      onClick={() => handleChange({ target: { id: 'invoice_type', value: type } })}
      className={`flex-1 cursor-pointer rounded-lg border p-3 text-left transition ${
        form.invoice_type === type
          ? 'border-[var(--theme-solid)] bg-[color-mix(in_srgb,var(--theme-solid)_8%,transparent)]'
          : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className='text-[14px] font-semibold text-slate-800'>{label}</div>
      <div className='text-xs text-gray-500'>{hint}</div>
    </button>
  )

  return (
    <Drawer open={open} anchor='right' onClose={onClose}>
      <div className='fixed inset-0 z-50 flex justify-end'>
        <div className='flex w-full flex-col overflow-hidden border border-gray-200 shadow-xl sm:w-[90%] md:w-[70%] lg:w-[55%] xl:w-[40%] 2xl:w-[34%]'>
          <DrawerHeader
            title='Create Invoice'
            subtitle='Saved as Draft - issue it when it is ready to send'
            icon={ReceiptText}
          />

          <div className='pms-drawer-body flex-1 overflow-y-auto bg-gray-100 p-3'>
            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <ReceiptText className={`${ThemeStyles.drawerHeadingIcon} text-blue-500`} />
                <span className={ThemeStyles.drawerHeadingText}>What to Bill</span>
              </div>

              <div className='space-y-3'>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>
                    Project <Required />
                  </span>
                  <select
                    {...input('project_id')}
                    disabled={Boolean(projectId)}
                    className={`${ThemeStyles.formsInputsDropdown}${errorBorder('project_id')}`}
                  >
                    <option value=''>Select project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_code} - {p.project_name}
                      </option>
                    ))}
                  </select>
                  {fieldError('project_id') || (
                    <span className='block text-xs text-gray-500'>
                      Internal projects are not billed, so they are not listed.
                    </span>
                  )}
                </div>

                {form.project_id && loadingBillable && !billable && (
                  <div className='flex justify-center py-3'>
                    <CircularProgress size={20} />
                  </div>
                )}

                {billable && (
                  <>
                    <div className='rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600'>
                      Bill to:{' '}
                      <span className='font-semibold text-slate-800'>{billable.customer_name || 'No client set'}</span>
                      {billable.customer_gstin && <span> · GSTIN {billable.customer_gstin}</span>}
                    </div>

                    <div className='flex flex-col gap-2 sm:flex-row'>
                      {typeButton(
                        'Milestone',
                        `${billable.milestones.length} accepted milestone${
                          billable.milestones.length === 1 ? '' : 's'
                        } not billed`
                      )}
                      {expensesOnly
                        ? typeButton(
                            'Time & Material',
                            `Fixed Price: work is billed by milestone. ${billable.unbilled_expenses} billable expense${
                              billable.unbilled_expenses === 1 ? '' : 's'
                            } not billed (${inr(billable.unbilled_expense_amount)})`,
                            'Billable Expenses'
                          )
                        : typeButton(
                            'Time & Material',
                            `${billable.unbilled_hours} approved hours not billed (${inr(billable.unbilled_amount)})${
                              billable.unbilled_expenses
                                ? ` + ${billable.unbilled_expenses} billable expense${
                                    billable.unbilled_expenses === 1 ? '' : 's'
                                  } (${inr(billable.unbilled_expense_amount)})`
                                : ''
                            }`
                          )}
                    </div>

                    {form.invoice_type === 'Milestone' ? (
                      <div className='space-y-1'>
                        <span className={ThemeStyles.formLabels}>
                          Milestone <Required />
                        </span>
                        <select
                          {...input('milestone_id')}
                          className={`${ThemeStyles.formsInputsDropdown}${errorBorder('milestone_id')}`}
                        >
                          <option value=''>
                            {billable.milestones.length
                              ? 'Select accepted milestone'
                              : 'No accepted, unbilled milestones'}
                          </option>
                          {billable.milestones.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} - {m.amount === null ? 'no amount' : inr(m.amount)}
                            </option>
                          ))}
                        </select>
                        {fieldError('milestone_id')}
                      </div>
                    ) : (
                      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                        <div className='space-y-1'>
                          <span className={ThemeStyles.formLabels}>
                            Period From <Required />
                          </span>
                          <input
                            {...input('period_from')}
                            type='date'
                            max={today}
                            className={`${ThemeStyles.formsInputs}${errorBorder('period_from')}`}
                          />
                          {fieldError('period_from')}
                        </div>
                        <div className='space-y-1'>
                          <span className={ThemeStyles.formLabels}>
                            Period To <Required />
                          </span>
                          <input
                            {...input('period_to')}
                            type='date'
                            min={form.period_from || undefined}
                            max={today}
                            className={`${ThemeStyles.formsInputs}${errorBorder('period_to')}`}
                          />
                          {fieldError('period_to')}
                        </div>
                        <div
                          className='rounded-lg border border-gray-200 px-3 py-2 md:col-span-2'
                          data-invoice-expenses
                        >
                          <label className='flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700'>
                            <input
                              id='include_expenses'
                              type='checkbox'
                              checked={form.include_expenses || expensesOnly}
                              disabled={expensesOnly}
                              onChange={e => setForm(prev => ({ ...prev, include_expenses: e.target.checked }))}
                              className='h-4 w-4 accent-[var(--theme-solid)]'
                            />
                            Include billable expenses of this period ({periodExpenses.length},{' '}
                            {inr(periodExpenses.reduce((n, x) => n + x.amount, 0))})
                          </label>
                          {form.include_expenses && periodExpenses.length > 0 && (
                            <ul className='mt-2 space-y-1 text-xs text-gray-600'>
                              {periodExpenses.map(x => (
                                <li key={x.id} className='flex justify-between gap-2'>
                                  <span className='truncate'>
                                    {x.expense_key} · {x.category} - {x.description}
                                  </span>
                                  <span className='shrink-0 font-semibold tabular-nums text-slate-700'>
                                    {inr(x.amount)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span className='mt-1 block text-[11px] text-gray-500'>
                            Approved expenses marked &quot;Billable to the client&quot;, charged at cost, one line each.
                            GST applies to the invoice total.
                          </span>
                        </div>
                        {billable.billed_at_cost_members?.length > 0 && (
                          <span className='text-xs font-semibold text-amber-600 md:col-span-2' data-billed-at-cost>
                            No billing rate for {billable.billed_at_cost_members.join(', ')}: their hours are billed at cost (no margin). Set a
                            Billing Rate in Project &gt; Team first.
                          </span>
                        )}
                        {billable.unrated_members.length > 0 && (
                          <span className='text-xs font-semibold text-amber-600 md:col-span-2'>
                            No hourly rate for {billable.unrated_members.join(', ')} - set rates in Project &gt; Team
                            before billing their hours.
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className={section}>
              <div className={ThemeStyles.drawerHeadingBox}>
                <Settings2 className={`${ThemeStyles.drawerHeadingIcon} text-violet-500`} />
                <span className={ThemeStyles.drawerHeadingText}>Tax and Terms</span>
              </div>
              <div className='grid grid-cols-1 gap-3 md:grid-cols-2 [&>*]:min-w-0'>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>GST %</span>
                  <select {...input('tax_pct')} className={ThemeStyles.formsInputsDropdown}>
                    {taxRates.map(r => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-1'>
                  <span className={ThemeStyles.formLabels}>Payment Terms</span>
                  <select {...input('payment_terms_days')} className={ThemeStyles.formsInputsDropdown}>
                    {paymentTerms.map(d => (
                      <option key={d} value={d}>
                        {d === 0 ? 'Due on receipt' : `${d} days after issue`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className='space-y-1 md:col-span-2'>
                  <div className='flex items-center justify-between'>
                    <span className={ThemeStyles.formLabels}>Notes</span>
                    <span className='text-xs text-gray-400'>{form.notes.length}/1000</span>
                  </div>
                  <textarea
                    {...input('notes')}
                    rows={2}
                    maxLength={1000}
                    placeholder='Shown on the invoice, e.g. bank details or PO number'
                    className={`${ThemeStyles.formsInputs}${errorBorder('notes')}`}
                  />
                  {fieldError('notes')}
                </div>
              </div>
            </div>

            {preview && (
              <div className={section}>
                <div className='space-y-1 text-[14px]'>
                  <div className='flex justify-between'>
                    <span className='text-gray-500'>Subtotal</span>
                    <span className='font-semibold tabular-nums text-slate-800'>{inr(preview.subtotal)}</span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-gray-500'>GST {form.tax_pct}%</span>
                    <span className='tabular-nums text-slate-800'>{inr(preview.tax)}</span>
                  </div>
                  <div className='flex justify-between border-t border-gray-200 pt-1 text-[15px]'>
                    <span className='font-semibold text-slate-800'>Total</span>
                    <span className='font-bold tabular-nums' style={{ color: 'var(--theme-solid)' }}>
                      {inr(preview.total)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DrawerFooter
            onClose={onClose}
            onSubmit={handleSubmit}
            submitText='Create Draft'
            disabled={isLoading || (billable && !billable.billable)}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default InvoiceDrawer
