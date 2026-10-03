import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@mui/material'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import PmsPagination from 'src/pms/components/PmsPagination'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { Chip, formatDate, GhostButton, inr, PrimaryButton } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useChangeInvoiceStatusMutation, useGetInvoiceQuery, useGetInvoicesQuery } from 'src/store/apps/pms/billingApi'
import InvoiceDrawer from './InvoiceDrawer'

export const INVOICE_TONE = { Draft: 'slate', Issued: 'blue', Paid: 'green', Cancelled: 'red' }

const todayIso = () => {
  const d = new Date()

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// The invoice itself, with its actions. The printable area is the white "paper" block.
const InvoiceDialog = ({ invoiceId, onClose }) => {
  const { data, isFetching } = useGetInvoiceQuery(invoiceId, { skip: !invoiceId })
  const [changeStatus, { isLoading }] = useChangeInvoiceStatusMutation()
  const [confirm, setConfirm] = useState(null) // 'issue' | 'cancel'
  const [paying, setPaying] = useState(false)
  const [paidDate, setPaidDate] = useState(todayIso())
  const [paidError, setPaidError] = useState('')
  const inv = data?.detail

  const act = async (action, extra = {}) => {
    try {
      const resp = await changeStatus({ id: invoiceId, action, ...extra }).unwrap()
      toast.success(resp?.detail || 'Invoice updated')
      setConfirm(null)
      setPaying(false)
    } catch {
      // The shared base query already showed why.
    }
  }

  const pay = () => {
    if (!paidDate) return setPaidError('Please Select Payment Date')
    if (paidDate > todayIso()) return setPaidError('Payment date cannot be in the future')
    if (inv.issue_date && paidDate < inv.issue_date) return setPaidError('Payment date cannot be before the issue date')
    act('pay', { paidDate })
  }

  return (
    <Dialog open={Boolean(invoiceId)} onClose={onClose} fullWidth maxWidth='md'>
      <DialogContent className='!p-0'>
        <ConfirmDialog
          open={Boolean(confirm)}
          onClose={() => setConfirm(null)}
          onConfirm={() => act(confirm)}
          title={confirm === 'issue' ? 'Issue this invoice?' : 'Cancel this invoice?'}
          message={
            confirm === 'issue'
              ? 'It gets today as its issue date and can no longer be edited.'
              : 'It stays on record as Cancelled. Its milestone or hours can then be billed again.'
          }
          confirmText={confirm === 'issue' ? 'Issue' : 'Cancel Invoice'}
          cancelText='Back'
          busy={isLoading}
        />
        {!inv ? (
          <div className='p-10 text-center text-sm text-gray-500'>{isFetching ? 'Loading invoice...' : 'Invoice not found'}</div>
        ) : (
          <>
            <div className='flex flex-wrap items-center gap-2 border-b border-gray-200 p-3 print:hidden'>
              <Chip tone={INVOICE_TONE[inv.status]}>{inv.status}</Chip>
              {inv.is_overdue && <Chip tone='red'>Overdue</Chip>}
              <div className='ms-auto flex flex-wrap gap-2'>
                {inv.status === 'Draft' && (
                  <PrimaryButton onClick={() => setConfirm('issue')} disabled={isLoading}>
                    <Icon icon='tabler:send' width={16} /> Issue
                  </PrimaryButton>
                )}
                {inv.status === 'Issued' && !paying && (
                  <PrimaryButton onClick={() => setPaying(true)} disabled={isLoading}>
                    <Icon icon='tabler:cash' width={16} /> Mark Paid
                  </PrimaryButton>
                )}
                {['Draft', 'Issued'].includes(inv.status) && (
                  <GhostButton onClick={() => setConfirm('cancel')} disabled={isLoading}>
                    Cancel Invoice
                  </GhostButton>
                )}
                <GhostButton onClick={() => window.print()}>
                  <Icon icon='tabler:printer' width={16} /> Print
                </GhostButton>
                <GhostButton onClick={onClose}>Close</GhostButton>
              </div>
              {paying && (
                <div className='flex w-full flex-wrap items-start gap-2'>
                  <div>
                    <input
                      id='paid_date'
                      type='date'
                      value={paidDate}
                      max={todayIso()}
                      min={inv.issue_date || undefined}
                      onChange={e => {
                        setPaidDate(e.target.value)
                        setPaidError('')
                      }}
                      className={`${ThemeStyles.formsInputs}${paidError ? ' !border !border-red-500' : ''}`}
                    />
                    {paidError && <span className='!mt-1 block text-xs font-semibold text-red-500'>{paidError}</span>}
                  </div>
                  <PrimaryButton onClick={pay} disabled={isLoading}>
                    Confirm Payment
                  </PrimaryButton>
                  <GhostButton onClick={() => setPaying(false)}>Back</GhostButton>
                </div>
              )}
            </div>

            <div className='invoice-paper bg-white p-6 text-slate-800'>
              <div className='mb-6 flex flex-wrap justify-between gap-4'>
                <div>
                  <div className='text-2xl font-bold' style={{ color: 'var(--theme-solid)' }}>
                    INVOICE
                  </div>
                  <div className='text-sm text-gray-500'>{inv.invoice_no}</div>
                </div>
                <div className='text-right text-sm'>
                  <div>Issue date: {inv.issue_date ? formatDate(inv.issue_date) : 'Not issued yet'}</div>
                  <div>Due date: {formatDate(inv.due_date)}</div>
                  {inv.paid_date && <div className='font-semibold text-emerald-600'>Paid on {formatDate(inv.paid_date)}</div>}
                </div>
              </div>

              <div className='mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2'>
                <div>
                  <div className='text-xs font-semibold uppercase text-gray-500'>Bill To</div>
                  <div className='font-semibold'>{inv.customer_name || '-'}</div>
                  {inv.customer_gstin && <div>GSTIN: {inv.customer_gstin}</div>}
                </div>
                <div className='sm:text-right'>
                  <div className='text-xs font-semibold uppercase text-gray-500'>Project</div>
                  <div className='font-semibold'>
                    {inv.project_code} · {inv.project_name}
                  </div>
                  <div>{inv.invoice_type === 'Milestone' ? `Milestone: ${inv.milestone_name}` : `Period: ${formatDate(inv.period_from)} - ${formatDate(inv.period_to)}`}</div>
                </div>
              </div>

              <table className='w-full text-left text-sm'>
                <thead className='border-y border-gray-300'>
                  <tr>
                    <th className='py-2'>Description</th>
                    <th className='py-2 text-right'>Qty</th>
                    <th className='py-2 text-right'>Rate</th>
                    <th className='py-2 text-right'>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map(line => (
                    <tr key={line.id} className='border-b border-gray-100'>
                      <td className='py-2'>{line.description}</td>
                      <td className='py-2 text-right tabular-nums'>
                        {line.quantity} {line.unit === 'hrs' ? 'hrs' : ''}
                      </td>
                      <td className='py-2 text-right tabular-nums'>{inr(line.rate)}</td>
                      <td className='py-2 text-right tabular-nums'>{inr(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className='ms-auto mt-4 w-full max-w-xs space-y-1 text-sm'>
                <div className='flex justify-between'>
                  <span>Subtotal</span>
                  <span className='tabular-nums'>{inr(inv.subtotal)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>GST {inv.tax_pct}%</span>
                  <span className='tabular-nums'>{inr(inv.tax_amount)}</span>
                </div>
                <div className='flex justify-between border-t border-gray-300 pt-1 text-base font-bold'>
                  <span>Total</span>
                  <span className='tabular-nums'>{inr(inv.total)}</span>
                </div>
              </div>
              {inv.notes && <p className='mt-6 whitespace-pre-line text-sm text-gray-600'>{inv.notes}</p>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

const BillingView = () => {
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 5 })
  const [filters, setFilters] = useState({ status: '', invoiceType: '' })
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [openId, setOpenId] = useState(null)

  const { data, isFetching } = useGetInvoicesQuery({ ...pagination, ...filters, search })
  const rows = Array.isArray(data?.detail) ? data.detail : []
  const sv = data?.stack_values || {}
  const counts = sv.status_counts || {}

  useEffect(() => setPagination(prev => ({ ...prev, currentPage: 1 })), [search, filters])

  return (
    <PmsPage
      screenId='billing'
      actions={
        <PrimaryButton onClick={() => setDrawerOpen(true)}>
          Create Invoice <PlusCircle size={16} />
        </PrimaryButton>
      }
    >
      <InvoiceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onCreated={inv => inv && setOpenId(inv.id)} />
      <InvoiceDialog invoiceId={openId} onClose={() => setOpenId(null)} />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:file-pencil' tone='indigo' label='Draft' value={inr(sv.draft || 0)} hint={`${counts.Draft || 0} not issued yet`} />
        <StatCard icon='tabler:send' tone='blue' label='Outstanding' value={inr(sv.outstanding || 0)} hint={`${counts.Issued || 0} issued, waiting for payment`} />
        <StatCard icon='tabler:alarm' tone='red' label='Overdue' value={sv.overdue || 0} hint='past their due date' />
        <StatCard icon='tabler:cash' tone='emerald' label='Paid' value={inr(sv.paid || 0)} hint={`${counts.Paid || 0} invoices`} />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
          <input
            type='text'
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with Invoice No, Client, Project...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
          />
          <select value={filters.invoiceType} onChange={e => setFilters(prev => ({ ...prev, invoiceType: e.target.value }))} className={`${ThemeStyles.formsInputsDropdown} md:max-w-[200px]`} aria-label='Type'>
            <option value=''>All Types</option>
            <option value='Milestone'>Milestone</option>
            <option value='Time & Material'>Time &amp; Material</option>
          </select>
        </div>

        <div className='flex flex-wrap gap-2 px-3 pb-3'>
          {[['', 'All', Object.values(counts).reduce((a, b) => a + b, 0)], ...Object.keys(INVOICE_TONE).map(s => [s, s, counts[s] || 0])].map(([value, label, count]) => {
            const active = filters.status === value

            return (
              <button
                key={label}
                type='button'
                onClick={() => setFilters(prev => ({ ...prev, status: value }))}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold transition ${active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'}`}
                style={active ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' } : undefined}
              >
                {label} <span className={active ? 'opacity-90' : 'text-gray-400'}>({count})</span>
              </button>
            )
          })}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1000px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Invoice', 'Client / Project', 'Type', 'Issued', 'Due', 'Total', 'Status'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className={`pms-th-text ${h === 'Total' ? 'text-right' : h === 'Status' ? 'text-center' : ''}`}>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading...' : 'No invoices yet. Invoice an accepted milestone or approved hours with Create Invoice.'}
                  </td>
                </tr>
              ) : (
                rows.map(inv => (
                  <tr key={inv.id} className='cursor-pointer border-t border-gray-200 hover:bg-gray-50/70' onClick={() => setOpenId(inv.id)}>
                    <td className='px-3 py-2'>
                      <span className={ThemeStyles.listNoColor}>{inv.invoice_no}</span>
                    </td>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text font-semibold'>{inv.customer_name || '-'}</div>
                      <div className='text-xs text-gray-500'>
                        {inv.project_code} · {inv.project_name}
                      </div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>
                      {inv.invoice_type}
                      <div className='text-xs text-gray-500'>{inv.invoice_type === 'Milestone' ? inv.milestone_name : `${formatDate(inv.period_from)} - ${formatDate(inv.period_to)}`}</div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>{inv.issue_date ? formatDate(inv.issue_date) : '-'}</td>
                    <td className={`pms-td-text px-3 py-2 ${inv.is_overdue ? '!text-red-600 font-semibold' : ''}`}>{inv.status === 'Draft' ? '-' : formatDate(inv.due_date)}</td>
                    <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{inr(inv.total)}</td>
                    <td className='px-3 py-2 text-center'>
                      <Chip tone={INVOICE_TONE[inv.status]}>{inv.status}</Chip>
                      {inv.is_overdue && (
                        <div className='mt-1'>
                          <Chip tone='red'>Overdue</Chip>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(prev => ({ ...prev, currentPage: page }))}
          handleipp={value => setPagination({ currentPage: 1, itemsPerPage: value })}
          total={sv.count_pg || 0}
        />
      </div>
    </PmsPage>
  )
}

export default BillingView
