import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle, Tooltip } from '@mui/material'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis
} from 'recharts'
import PmsPage from 'src/pms/components/PmsPage'
import PmsPagination from 'src/pms/components/PmsPagination'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import StatCard from 'src/pms/components/StatCard'
import useProjectPicker from 'src/pms/components/useProjectPicker'
import { Chip, formatDate, GhostButton, inr, PrimaryButton } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import { getAuthParams } from 'src/store/rtkQuery/baseQuery'
import {
  useApproveExpensesMutation,
  useDeleteExpenseMutation,
  useGetActualCostQuery,
  useGetExpenseMetaQuery,
  useGetExpensesQuery,
  useGetVarianceQuery,
  useRejectExpensesMutation,
  useSubmitExpenseMutation
} from 'src/store/apps/pms/expensesApi'
import { useDownloadDocumentMutation } from 'src/store/apps/pms/documentsApi'
import { saveBlob } from 'src/pms/documents/fileUtils'
import ExpenseDrawer from './ExpenseDrawer'
import usePagedRows from 'src/pms/components/usePagedRows'

const STATUS_TONE = { Draft: 'slate', Submitted: 'amber', Approved: 'green', Rejected: 'red' }
const money = v => (v === null || v === undefined ? '-' : inr(v))
const signed = v => (v === null || v === undefined ? '-' : `${v < 0 ? '-' : '+'}${inr(Math.abs(v))}`)

const useDebouncedValue = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}

const Th = ({ children, right }) => (
  <th className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
    <div className={`pms-th-text whitespace-nowrap ${right ? 'text-right' : ''}`}>{children}</div>
  </th>
)

/* ------------------------------------------------------------------------------ Expenses */

const RejectDialog = ({ open, count, onClose, onConfirm, busy }) => {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    if (open) {
      setReason('')
      setError(null)
    }
  }, [open])
  const check = v => (v.trim().length < 5 ? 'Please give a reason of at least 5 characters' : null)

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>
        Reject {count} expense{count === 1 ? '' : 's'}?
      </DialogTitle>
      <DialogContent>
        <span className={ThemeStyles.formLabels}>
          Reason <span className='text-red-500'>*</span>
        </span>
        <textarea
          id='reject_reason'
          rows={3}
          maxLength={500}
          value={reason}
          onChange={e => {
            setReason(capitalizeFirst(e.target.value))
            setError(null)
          }}
          placeholder='What should be fixed, e.g. Add the bill number'
          className={`${ThemeStyles.formsInputs} mt-1${error ? ' !border !border-red-500' : ''}`}
        />
        {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton
          disabled={busy}
          onClick={() => {
            const e = check(reason)
            setError(e)
            if (!e) onConfirm(reason.trim())
          }}
        >
          Reject
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

export const ExpensesView = () => {
  const can = useCan()
  const mayApprove = can('expenses', 'approve')
  const { userId } = getAuthParams()
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: 5 })
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [mine, setMine] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [drawer, setDrawer] = useState(null) // { expense } | {}
  const [selected, setSelected] = useState([])
  const [rejecting, setRejecting] = useState(null) // ids
  const [deleting, setDeleting] = useState(null)
  const { data: metaResp } = useGetExpenseMetaQuery()
  const { data, isFetching } = useGetExpensesQuery(
    {
      ...pagination,
      projectId: projectId || undefined,
      status: status || undefined,
      category: category || undefined,
      search: search.trim() || undefined,
      mine
    },
    { skip: !ready, refetchOnMountOrArgChange: true }
  )
  const [approve, { isLoading: approving }] = useApproveExpensesMutation()
  const [reject, { isLoading: rejectingBusy }] = useRejectExpensesMutation()
  const [submitOne] = useSubmitExpenseMutation()
  const [remove, { isLoading: removing }] = useDeleteExpenseMutation()
  const [download] = useDownloadDocumentMutation()
  const downloadReceipt = async e => {
    try {
      saveBlob(await download(e.receipt_document_id).unwrap(), e.receipt_file_name || `receipt-${e.expense_key}`)
    } catch {
      // shown by the shared error toast
    }
  }
  const rows = useMemo(() => data?.detail || [], [data])
  const sv = data?.stack_values || {}
  const counts = sv.status_counts || {}
  const amounts = sv.status_amounts || {}
  const isOwn = e => String(e.spent_by) === String(userId)
  // Same rule as each row's checkbox (canReview below), so "select all" never picks one the server would refuse.
  const reviewable = mayApprove
    ? rows.filter(e => e.status === 'Submitted' && !isOwn(e) && e.can_approve !== false)
    : []
  const selectedRows = rows.filter(e => selected.includes(e.id))

  useEffect(() => setPagination(p => ({ ...p, currentPage: 1 })), [projectId, status, category, mine, search])
  useEffect(() => setSelected([]), [rows])

  const run = async (fn, arg) => {
    try {
      const resp = await fn(arg).unwrap()
      toast.success(resp.detail, { duration: resp.over_budget?.length ? 7000 : 3000 })
    } catch {
      // shown by the shared error toast
    }
  }

  const small = 'cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold'

  return (
    <PmsPage
      screenId='budget.expenses'
      actions={
        can('expenses', 'add') && (
          <PrimaryButton onClick={() => setDrawer({})}>
            Add Expense <PlusCircle size={16} />
          </PrimaryButton>
        )
      }
    >
      <ExpenseDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        expense={drawer?.expense || null}
        defaultProjectId={projectId || undefined}
      />
      <RejectDialog
        open={Boolean(rejecting)}
        count={rejecting?.length || 0}
        onClose={() => setRejecting(null)}
        busy={rejectingBusy}
        onConfirm={async reason => {
          await run(reject, { ids: rejecting, reason })
          setRejecting(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await run(remove, deleting.id)
          setDeleting(null)
        }}
        title='Delete expense?'
        message={
          deleting ? `${deleting.expense_key} (${inr(deleting.amount)}, ${deleting.category}) will be removed.` : ''
        }
        confirmText='Delete'
        cancelText='Cancel'
        busy={removing}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:clock-pause'
          tone='amber'
          label='Waiting Approval'
          value={inr(amounts.Submitted || 0)}
          hint={`${counts.Submitted || 0} expense${counts.Submitted === 1 ? '' : 's'}`}
        />
        <StatCard
          icon='tabler:circle-check'
          tone='emerald'
          label='Approved'
          value={inr(amounts.Approved || 0)}
          hint='part of the actual cost'
        />
        <StatCard
          icon='tabler:file-pencil'
          tone='indigo'
          label='Drafts'
          value={inr(amounts.Draft || 0)}
          hint={`${counts.Draft || 0} not sent yet`}
        />
        <StatCard
          icon='tabler:circle-x'
          tone='red'
          label='Rejected'
          value={counts.Rejected || 0}
          hint='to fix and send again'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:flex-wrap md:items-center'>
          {picker}
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with description, vendor, key...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-xs`}
            aria-label='Search expenses'
          />
          <select
            id='expense_category'
            value={category}
            onChange={e => setCategory(e.target.value)}
            className={`${ThemeStyles.formsInputsDropdown} md:max-w-[200px]`}
            aria-label='Category'
          >
            <option value=''>All Categories</option>
            {(metaResp?.detail?.categories || []).map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className='flex cursor-pointer items-center gap-2 text-sm text-slate-700'>
            <input
              type='checkbox'
              checked={mine}
              onChange={e => setMine(e.target.checked)}
              className='h-4 w-4 accent-[var(--theme-solid)]'
            />
            Only mine
          </label>
        </div>
        <div className='flex flex-wrap items-center gap-2 px-3 pb-3'>
          {[
            ['', 'All', Object.values(counts).reduce((a, b) => a + b, 0)],
            ...['Submitted', 'Draft', 'Approved', 'Rejected'].map(s => [
              s,
              s === 'Submitted' ? 'Waiting' : s,
              counts[s] || 0
            ])
          ].map(([value, label, count]) => {
            const active = status === value

            return (
              <button
                key={label}
                type='button'
                onClick={() => setStatus(value)}
                className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                  active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'
                }`}
                style={
                  active
                    ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' }
                    : undefined
                }
              >
                {label} <span className={active ? 'opacity-90' : 'text-gray-400'}>({count})</span>
              </button>
            )
          })}
          {selectedRows.length > 0 && (
            <div className='ms-auto flex items-center gap-2' data-bulk>
              <span className='text-xs text-gray-600'>
                {selectedRows.length} selected · {inr(selectedRows.reduce((n, e) => n + e.amount, 0))}
              </span>
              <PrimaryButton onClick={() => run(approve, selected)} disabled={approving} className='!px-3 !py-1.5'>
                <Icon icon='tabler:check' width={15} /> Approve
              </PrimaryButton>
              <GhostButton onClick={() => setRejecting(selected)} className='!px-3 !py-1.5'>
                Reject
              </GhostButton>
            </div>
          )}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1100px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                <th className={`${ThemeStyles.tableHeadCellsHeight} w-10 !px-3`}>
                  {mayApprove && (
                    <input
                      type='checkbox'
                      aria-label='Select all waiting'
                      disabled={!reviewable.length}
                      checked={reviewable.length > 0 && reviewable.every(e => selected.includes(e.id))}
                      onChange={e => setSelected(e.target.checked ? reviewable.map(r => r.id) : [])}
                      className='h-4 w-4 accent-[var(--theme-solid)]'
                    />
                  )}
                </th>
                <Th>Expense</Th>
                <Th>Project</Th>
                <Th>Category</Th>
                <Th>Date</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading...'
                      : 'No expenses for this filter. Record travel, licences, hardware and other project costs with Add Expense.'}
                  </td>
                </tr>
              )}
              {rows.map(e => {
                const own = isOwn(e)
                // can_approve: the server's approval-limit check (a PM cannot approve above the expense limit).
                const canReview = mayApprove && e.status === 'Submitted' && !own && e.can_approve !== false
                const canEdit = own && (e.status === 'Draft' || e.status === 'Rejected')

                return (
                  <tr key={e.id} className='border-t border-gray-200 hover:bg-gray-50/70' data-expense={e.expense_key}>
                    <td className='px-3 py-2'>
                      {canReview && (
                        <input
                          type='checkbox'
                          aria-label={`Select ${e.expense_key}`}
                          checked={selected.includes(e.id)}
                          onChange={() =>
                            setSelected(prev => (prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id]))
                          }
                          className='h-4 w-4 accent-[var(--theme-solid)]'
                        />
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      <span className={`${ThemeStyles.listNoColor} text-[13px]`}>{e.expense_key}</span>
                      <div className='pms-td-text max-w-[300px] truncate font-semibold' title={e.description}>
                        {e.description}
                      </div>
                      <div className='text-xs text-gray-500'>
                        {e.vendor ? `${e.vendor} · ` : ''}by {e.spent_by_name}
                        {e.milestone_name ? ` · ${e.milestone_name}` : ''}
                      </div>
                      {/* Only a receipt that still exists (the name is empty once it was deleted from Documents). */}
                      {e.receipt_document_id && e.receipt_file_name && (
                        <button
                          type='button'
                          onClick={() => downloadReceipt(e)}
                          className='mt-0.5 inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold hover:underline'
                          style={{ color: 'var(--theme-solid)' }}
                          aria-label={`Receipt of ${e.expense_key}`}
                        >
                          <Icon icon='tabler:paperclip' width={12} /> {e.receipt_file_name || 'Receipt'}
                        </button>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      <Link href={projectDetailsPath(e.project_id)} className='pms-td-text hover:underline'>
                        {e.project_code}
                      </Link>
                      <div className='max-w-[180px] truncate text-xs text-gray-500'>{e.project_name}</div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>
                      {e.category}
                      {e.billable && (
                        <div className='mt-0.5'>
                          <Chip tone='blue'>{e.invoice_no ? `Billed on ${e.invoice_no}` : 'Billable'}</Chip>
                        </div>
                      )}
                    </td>
                    <td className='pms-td-text px-3 py-2 whitespace-nowrap'>{formatDate(e.expense_date)}</td>
                    <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{inr(e.amount)}</td>
                    <td className='px-3 py-2'>
                      <Tooltip
                        arrow
                        title={
                          e.status === 'Rejected'
                            ? `${e.reviewed_by_name}: ${e.reject_reason}`
                            : e.reviewed_by_name
                            ? `${e.status} by ${e.reviewed_by_name}`
                            : ''
                        }
                      >
                        <span>
                          <Chip tone={STATUS_TONE[e.status]}>{e.status === 'Submitted' ? 'Waiting' : e.status}</Chip>
                        </span>
                      </Tooltip>
                      {e.status === 'Rejected' && (
                        <div className='mt-0.5 max-w-[180px] truncate text-[11px] text-red-600'>{e.reject_reason}</div>
                      )}
                    </td>
                    <td className='px-3 py-2'>
                      <div className='flex flex-wrap gap-1'>
                        {canReview && (
                          <>
                            <button
                              type='button'
                              onClick={() => run(approve, [e.id])}
                              className={`${small} border-transparent text-white`}
                              style={{ background: '#16a34a' }}
                              aria-label={`Approve ${e.expense_key}`}
                            >
                              Approve
                            </button>
                            <button
                              type='button'
                              onClick={() => setRejecting([e.id])}
                              className={`${small} border-red-200 text-red-600`}
                              aria-label={`Reject ${e.expense_key}`}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {canEdit && (
                          <>
                            <button
                              type='button'
                              onClick={() => run(submitOne, e.id)}
                              className={`${small} border-transparent text-white`}
                              style={{ background: 'var(--theme-solid)' }}
                              aria-label={`Submit ${e.expense_key}`}
                            >
                              Submit
                            </button>
                            <button
                              type='button'
                              onClick={() => setDrawer({ expense: e })}
                              className={`${small} border-gray-200 text-slate-700`}
                              aria-label={`Edit ${e.expense_key}`}
                            >
                              Edit
                            </button>
                            <button
                              type='button'
                              onClick={() => setDeleting(e)}
                              className={`${small} border-red-200 text-red-600`}
                              aria-label={`Delete ${e.expense_key}`}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {e.status === 'Submitted' && own && (
                          <span className='text-xs text-gray-500'>Waiting for a manager</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(p => ({ ...p, currentPage: page }))}
          handleipp={value => setPagination({ currentPage: 1, itemsPerPage: value })}
          total={sv.count_pg || 0}
        />
      </div>
    </PmsPage>
  )
}

/* --------------------------------------------------------------------------- Actual Cost */

const monthLabel = m => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

export const ActualCostView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const { data, isFetching } = useGetActualCostQuery(
    { projectId: projectId || undefined },
    { skip: !ready, refetchOnMountOrArgChange: true }
  )
  const c = data?.detail
  const { pageRows: costRows, pager: costPager } = usePagedRows(c?.projects || [], { resetKey: projectId })
  const s = c?.summary || {}
  const maxCat = Math.max(1, ...(c?.by_category || []).map(x => x.amount))

  return (
    <PmsPage screenId='budget.actualCost'>
      <div className='mb-3 flex flex-wrap items-center gap-2'>{picker}</div>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5'>
        <StatCard
          icon='tabler:receipt'
          tone='violet'
          label='Actual Cost'
          value={inr(s.total || 0)}
          hint='approved hours + approved expenses'
        />
        <StatCard
          icon='tabler:users'
          tone='indigo'
          label='Labour'
          value={inr(s.labour || 0)}
          hint='approved hours x locked rate'
        />
        <StatCard
          icon='tabler:shopping-cart'
          tone='blue'
          label='Expenses'
          value={inr(s.expenses || 0)}
          hint='approved expenses'
        />
        <StatCard
          icon='tabler:clock-pause'
          tone='amber'
          label='Waiting Approval'
          value={inr(s.pending_expenses || 0)}
          hint='submitted expenses'
        />
        <StatCard
          icon='tabler:wallet'
          tone='emerald'
          label='Budget Used'
          value={s.budget ? `${Math.round(((s.budgeted_total ?? s.total) / s.budget) * 100)}%` : '-'}
          hint={s.budget ? `of ${inr(s.budget)} (projects with a budget)` : 'no budgets set'}
        />
      </div>

      <div className='mb-3 grid grid-cols-1 gap-3 xl:grid-cols-3'>
        <div className='h-[260px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm xl:col-span-2'>
          <div className='mb-1 text-[13px] font-semibold text-slate-700'>Cost by month</div>
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='90%'>
            <BarChart data={(c?.by_month || []).map(m => ({ ...m, label: monthLabel(m.month) }))}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='label' tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
              <ChartTooltip formatter={v => inr(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey='labour'
                name='Labour'
                stackId='c'
                fill='var(--theme-solid)'
                maxBarSize={48}
                isAnimationActive={false}
              />
              <Bar
                dataKey='expenses'
                name='Expenses'
                stackId='c'
                fill='#38bdf8'
                maxBarSize={48}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className='rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
          <div className='mb-2 text-[13px] font-semibold text-slate-700'>Expenses by category</div>
          {(c?.by_category || []).length === 0 && (
            <div className='py-10 text-center text-xs text-gray-500'>No approved expenses yet.</div>
          )}
          <ul className='flex flex-col gap-2.5' data-categories>
            {(c?.by_category || []).map(x => (
              <li key={x.category}>
                <div className='mb-0.5 flex justify-between text-xs'>
                  <span className='font-medium text-slate-700'>{x.category}</span>
                  <span className='font-semibold tabular-nums text-slate-800'>{inr(x.amount)}</span>
                </div>
                <div className='h-2 overflow-hidden rounded-full bg-gray-100'>
                  <div className='h-full rounded-full bg-sky-400' style={{ width: `${(x.amount / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md transition-opacity ${
          isFetching ? 'opacity-60' : ''
        }`}
      >
        <table className='w-full min-w-[950px] text-left text-sm'>
          <thead className={ThemeStyles.tableHeaderBg}>
            <tr>
              <Th>Project</Th>
              <Th right>Labour</Th>
              <Th right>Expenses</Th>
              <Th right>Actual Cost</Th>
              <Th right>Budget</Th>
              <Th>Used</Th>
              <Th right>Remaining</Th>
            </tr>
          </thead>
          <tbody>
            {(c?.projects || []).length === 0 && (
              <tr>
                <td colSpan={7} className='py-10 text-center text-slate-600'>
                  {isFetching ? 'Loading...' : 'No projects.'}
                </td>
              </tr>
            )}
            {costRows.map(r => (
              <tr
                key={r.project_id}
                className='border-t border-gray-200 hover:bg-gray-50/70'
                data-cost-row={r.project_code}
              >
                <td className='px-3 py-2'>
                  <Link
                    href={`${projectDetailsPath(r.project_id)}&tab=budget`}
                    className='pms-td-text font-semibold hover:underline'
                  >
                    {r.project_code}
                  </Link>
                  <div className='max-w-[260px] truncate text-xs text-gray-500'>{r.project_name}</div>
                </td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{inr(r.labour)}</td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>
                  {inr(r.expenses)}
                  {r.pending_expenses > 0 && (
                    <div className='text-[11px] text-amber-600'>+{inr(r.pending_expenses)} waiting</div>
                  )}
                </td>
                <td className='pms-td-text px-3 py-2 text-right font-semibold tabular-nums'>{inr(r.total)}</td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{money(r.budget)}</td>
                <td className='px-3 py-2'>
                  {r.used_pct === null ? (
                    <span className='text-xs text-gray-400'>no budget</span>
                  ) : (
                    <div className='flex min-w-[120px] items-center gap-2'>
                      <div className='h-2 flex-1 overflow-hidden rounded-full bg-gray-100'>
                        <div
                          className='h-full rounded-full'
                          style={{
                            width: `${Math.min(100, r.used_pct)}%`,
                            background: r.used_pct > 100 ? '#dc2626' : r.used_pct >= 85 ? '#d97706' : '#16a34a'
                          }}
                        />
                      </div>
                      <span className={`text-xs font-semibold ${r.used_pct > 100 ? 'text-red-600' : ''}`}>
                        {r.used_pct}%
                      </span>
                    </div>
                  )}
                </td>
                <td
                  className={`pms-td-text px-3 py-2 text-right tabular-nums ${
                    r.remaining !== null && r.remaining < 0 ? '!text-red-600 font-semibold' : ''
                  }`}
                >
                  {money(r.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {costPager}
    </PmsPage>
  )
}

/* ------------------------------------------------------------------------------ Variance */

const INDEX_TONE = v => (v === null || v === undefined ? 'slate' : v >= 1 ? 'green' : v >= 0.9 ? 'amber' : 'red')
const STATE_TONE = {
  'Under budget': 'green',
  'Slightly over': 'amber',
  'Over budget': 'red',
  'On schedule': 'green',
  'Slightly behind': 'amber',
  Behind: 'red'
}

export const VarianceView = () => {
  const { projectId, picker, ready } = useProjectPicker({ allowAll: true })
  const { data, isFetching } = useGetVarianceQuery(
    { projectId: projectId || undefined },
    { skip: !ready, refetchOnMountOrArgChange: true }
  )
  const v = data?.detail
  const { pageRows: varianceRows, pager: variancePager } = usePagedRows(v?.projects || [], { resetKey: projectId })
  const s = v?.summary || {}
  const [help, setHelp] = useState(false)
  const chart = (v?.projects || [])
    .filter(r => r.budget !== null)
    .slice(0, 12)
    .map(r => ({ name: r.project_code, Budget: r.budget, Actual: r.actual, Forecast: r.eac }))

  return (
    <PmsPage
      screenId='budget.variance'
      actions={
        <GhostButton onClick={() => setHelp(!help)}>
          <Icon icon='tabler:help-circle' width={16} /> How to read this
        </GhostButton>
      }
    >
      <div className='mb-3 flex flex-wrap items-center gap-2'>{picker}</div>
      {help && (
        <div
          className='mb-3 grid grid-cols-1 gap-2 rounded-xl border border-[color-mix(in_srgb,var(--theme-solid)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-solid)_6%,transparent)] p-4 text-[13px] text-slate-700 md:grid-cols-2'
          data-help
        >
          <div>
            <b>Earned Value (EV)</b> = budget x % of work done. What the finished work was worth.
          </div>
          <div>
            <b>Planned Value (PV)</b> = budget x % of time gone. What should be done by now.
          </div>
          <div>
            <b>CPI</b> = EV / Actual cost. Below 1 means each rupee buys less than planned (over budget).
          </div>
          <div>
            <b>SPI</b> = EV / PV. Below 1 means the work is behind the calendar.
          </div>
          <div>
            <b>Forecast (EAC)</b> = budget / CPI. What the project will cost at this rate.
          </div>
          <div>
            <b>Variance at completion (VAC)</b> = budget - forecast. Negative = expected overrun.
          </div>
        </div>
      )}
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5'>
        <StatCard
          icon='tabler:gauge'
          tone={s.cpi === null || s.cpi === undefined ? 'indigo' : s.cpi >= 1 ? 'emerald' : 'red'}
          label='Cost Index (CPI)'
          value={s.cpi ?? '-'}
          hint='1.00 = on budget'
        />
        <StatCard
          icon='tabler:calendar-stats'
          tone={s.spi === null || s.spi === undefined ? 'indigo' : s.spi >= 1 ? 'emerald' : 'amber'}
          label='Schedule Index (SPI)'
          value={s.spi ?? '-'}
          hint='1.00 = on schedule'
        />
        <StatCard
          icon='tabler:trending-up'
          tone='violet'
          label='Forecast Cost'
          value={inr(s.eac || 0)}
          hint={`budget ${inr(s.budget || 0)}`}
        />
        <StatCard
          icon='tabler:alert-triangle'
          tone='red'
          label='Over Budget'
          value={s.over_budget ?? '-'}
          hint='projects with CPI below 1'
        />
        <StatCard
          icon='tabler:clock-exclamation'
          tone='amber'
          label='Behind Schedule'
          value={s.behind ?? '-'}
          hint='projects with SPI below 1'
        />
      </div>

      {chart.length > 0 && (
        <div className='mb-3 h-[240px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
          <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='name' tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={x => (x >= 1000 ? `${Math.round(x / 1000)}k` : x)} />
              <ChartTooltip formatter={x => (x === null ? '-' : inr(x))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey='Budget' fill='#cbd5e1' maxBarSize={30} isAnimationActive={false} />
              <Bar dataKey='Actual' fill='var(--theme-solid)' maxBarSize={30} isAnimationActive={false} />
              <Bar dataKey='Forecast' fill='#f97316' maxBarSize={30} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div
        className={`${ThemeStyles.tableColor} overflow-x-auto rounded-md transition-opacity ${
          isFetching ? 'opacity-60' : ''
        }`}
      >
        <table className='w-full min-w-[1200px] text-left text-sm'>
          <thead className={ThemeStyles.tableHeaderBg}>
            <tr>
              <Th>Project</Th>
              <Th right>Budget</Th>
              <Th>Work done vs Time gone</Th>
              <Th right>Earned (EV)</Th>
              <Th right>Actual (AC)</Th>
              <Th>Cost</Th>
              <Th>Schedule</Th>
              <Th right>Forecast (EAC)</Th>
              <Th right>At Completion (VAC)</Th>
            </tr>
          </thead>
          <tbody>
            {(v?.projects || []).length === 0 && (
              <tr>
                <td colSpan={9} className='py-10 text-center text-slate-600'>
                  {isFetching ? 'Loading...' : 'No projects.'}
                </td>
              </tr>
            )}
            {varianceRows.map(r => (
              <tr
                key={r.project_id}
                className='border-t border-gray-200 hover:bg-gray-50/70'
                data-variance-row={r.project_code}
              >
                <td className='px-3 py-2'>
                  <Link
                    href={`${projectDetailsPath(r.project_id)}&tab=budget`}
                    className='pms-td-text font-semibold hover:underline'
                  >
                    {r.project_code}
                  </Link>
                  <div className='max-w-[220px] truncate text-xs text-gray-500'>{r.project_name}</div>
                </td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{money(r.budget)}</td>
                <td className='px-3 py-2'>
                  <div className='min-w-[150px] space-y-1'>
                    <div className='flex items-center gap-2 text-[11px] text-gray-500'>
                      <span className='w-9'>Work</span>
                      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100'>
                        <div
                          className='h-full rounded-full'
                          style={{ width: `${r.progress}%`, background: 'var(--theme-solid)' }}
                        />
                      </div>
                      <span className='w-8 text-right font-semibold text-slate-700'>{r.progress}%</span>
                    </div>
                    <div className='flex items-center gap-2 text-[11px] text-gray-500'>
                      <span className='w-9'>Time</span>
                      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100'>
                        <div className='h-full rounded-full bg-slate-400' style={{ width: `${r.planned_pct ?? 0}%` }} />
                      </div>
                      <span className='w-8 text-right font-semibold text-slate-700'>
                        {r.planned_pct === null ? '-' : `${r.planned_pct}%`}
                      </span>
                    </div>
                  </div>
                </td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{money(r.ev)}</td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>
                  {inr(r.actual)}
                  {r.cv !== null && (
                    <div className={`text-[11px] ${r.cv < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      CV {signed(r.cv)}
                    </div>
                  )}
                </td>
                <td className='px-3 py-2'>
                  <Chip tone={STATE_TONE[r.cost_state] || 'slate'}>{r.cost_state}</Chip>
                  {r.cpi !== null && (
                    <div className='mt-0.5'>
                      <Chip tone={INDEX_TONE(r.cpi)}>CPI {r.cpi}</Chip>
                    </div>
                  )}
                </td>
                <td className='px-3 py-2'>
                  <Chip tone={STATE_TONE[r.schedule_state] || 'slate'}>{r.schedule_state}</Chip>
                  {r.spi !== null && (
                    <div className='mt-0.5'>
                      <Chip tone={INDEX_TONE(r.spi)}>SPI {r.spi}</Chip>
                    </div>
                  )}
                </td>
                <td className='pms-td-text px-3 py-2 text-right tabular-nums'>{money(r.eac)}</td>
                <td
                  className={`pms-td-text px-3 py-2 text-right font-semibold tabular-nums ${
                    r.vac !== null && r.vac < 0 ? '!text-red-600' : r.vac !== null ? '!text-emerald-600' : ''
                  }`}
                >
                  {signed(r.vac)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {variancePager}
    </PmsPage>
  )
}
