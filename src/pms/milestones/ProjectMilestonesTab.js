import React, { useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem } from '@mui/material'
import { Icon } from '@iconify/react'
import { Edit, Ellipsis, PlusCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { Chip, formatDate, GhostButton, inr, PrimaryButton, ProgressBar } from 'src/pms/components/ui'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import {
  useAddDeliverableMutation,
  useChangeMilestoneStatusMutation,
  useDeleteDeliverableMutation,
  useDeleteMilestoneMutation,
  useGetProjectMilestonesQuery,
  useRenameDeliverableMutation,
  useSetDeliverableDoneMutation
} from 'src/store/apps/pms/billingApi'
import InvoiceDrawer from 'src/pms/billing/InvoiceDrawer'
import MilestoneDrawer from './MilestoneDrawer'
import UploadDrawer from 'src/pms/documents/UploadDrawer'

export const MILESTONE_TONE = {
  Planned: 'slate',
  'In Progress': 'blue',
  'Ready for Review': 'amber',
  Accepted: 'green',
  'Changes Requested': 'red'
}

// What each move is called on its button.
const ACTION = {
  'In Progress': { label: 'Start Work', icon: 'tabler:player-play' },
  Planned: { label: 'Back to Planned', icon: 'tabler:arrow-back-up' },
  'Ready for Review': { label: 'Send for Review', icon: 'tabler:send' },
  Accepted: { label: 'Accept', icon: 'tabler:circle-check' },
  'Changes Requested': { label: 'Request Changes', icon: 'tabler:message-report' }
}

const FeedbackDialog = ({ milestone, onClose, onConfirm, busy }) => {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    if (text.trim().length < 5) {
      setError('Please Enter Feedback (at least 5 characters) so the team knows what to change')

      return
    }
    onConfirm(text.trim())
  }

  return (
    <Dialog open={Boolean(milestone)} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Request changes?</DialogTitle>
      <DialogContent>
        <p className='mb-2 text-sm text-gray-500'>
          {milestone ? `'${milestone.name}' goes back to the team with your feedback.` : ''}
        </p>
        <span className={ThemeStyles.formLabels}>
          Feedback <span className='text-red-500'>*</span>
        </span>
        <textarea
          id='milestone_feedback'
          rows={3}
          maxLength={1000}
          value={text}
          onChange={e => {
            setText(capitalizeFirst(e.target.value))
            setError('')
          }}
          placeholder='e.g. Add the export button to the report screen'
          className={`${ThemeStyles.formsInputs} mt-1${error ? ' !border !border-red-500' : ''}`}
        />
        {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={submit} disabled={busy}>
          Send Feedback
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const Deliverables = ({ project, milestone, rights, onAttach }) => {
  const [addDeliverable, { isLoading }] = useAddDeliverableMutation()
  const [setDone] = useSetDeliverableDoneMutation()
  const [remove] = useDeleteDeliverableMutation()
  const [rename] = useRenameDeliverableMutation()
  const [editing, setEditing] = useState(null) // { id, name } while renaming
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const locked = milestone.status === 'Accepted' || !rights.edit
  const ids = { projectId: project.id, milestoneId: milestone.id }

  const add = async () => {
    const text = name.trim()
    if (text.length < 2 || !/[A-Za-z]/.test(text)) {
      setError('Please Enter a Deliverable name (at least 2 characters)')

      return
    }
    try {
      await addDeliverable({ ...ids, name: text }).unwrap()
      setName('')
      setError('')
    } catch {
      // The shared base query already showed why (e.g. a duplicate).
    }
  }

  // Enter or leaving the box saves; Esc cancels. An unchanged or too-short name is not sent.
  const saveRename = async () => {
    if (!editing) return
    const text = editing.name.trim()
    const current = milestone.deliverables.find(d => d.id === editing.id)
    setEditing(null)
    if (!current || text === current.name) return
    if (text.length < 2 || !/[A-Za-z]/.test(text))
      return toast.error('Please Enter a Deliverable name (at least 2 characters)')
    try {
      await rename({ ...ids, deliverableId: editing.id, name: text }).unwrap()
      toast.success('Deliverable renamed')
    } catch {
      // The shared base query already showed why (e.g. a duplicate).
    }
  }

  return (
    <div>
      <div className='mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500'>
        Deliverables ({milestone.deliverables_done}/{milestone.deliverables.length})
      </div>
      {milestone.deliverables.length === 0 && <div className='text-xs text-gray-400'>Nothing listed yet.</div>}
      <ul className='flex flex-col gap-1'>
        {milestone.deliverables.map(d => (
          <li key={d.id} className='group flex items-center gap-2 text-[14px]'>
            <input
              type='checkbox'
              aria-label={`Mark ${d.name} done`}
              checked={d.is_done}
              disabled={locked}
              onChange={e => setDone({ ...ids, deliverableId: d.id, isDone: e.target.checked }).catch(() => {})}
              className='h-4 w-4 cursor-pointer accent-[var(--theme-solid)]'
            />
            {editing?.id === d.id ? (
              <input
                autoFocus
                aria-label='Deliverable name'
                data-rename-deliverable
                value={editing.name}
                maxLength={200}
                onChange={e => setEditing({ id: d.id, name: capitalizeFirst(e.target.value) })}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveRename()
                  if (e.key === 'Escape') setEditing(null)
                }}
                onBlur={saveRename}
                className={`${ThemeStyles.formsInputs} !py-1`}
              />
            ) : (
              <span
                className={d.is_done ? 'text-gray-400 line-through' : 'text-slate-800'}
                title={d.done_by_name ? `Done by ${d.done_by_name}` : ''}
              >
                {d.name}
              </span>
            )}
            {!locked && editing?.id !== d.id && (
              <button
                type='button'
                onClick={() => setEditing({ id: d.id, name: d.name })}
                className='cursor-pointer text-gray-300 opacity-0 hover:text-[var(--theme-solid)] group-hover:opacity-100'
                aria-label={`Rename ${d.name}`}
                title='Rename'
              >
                <Icon icon='tabler:pencil' width={15} />
              </button>
            )}
            {rights.attach && (
              <button
                type='button'
                onClick={() => onAttach(d)}
                className='ms-auto cursor-pointer text-gray-400 hover:text-[var(--theme-solid)]'
                aria-label={`Attach file to ${d.name}`}
                title='Attach the delivered file'
              >
                <Icon icon='tabler:paperclip' width={15} />
              </button>
            )}
            {!locked && rights.delete && (
              <button
                type='button'
                onClick={() => remove({ ...ids, deliverableId: d.id })}
                className='cursor-pointer text-gray-300 opacity-0 hover:text-red-600 group-hover:opacity-100'
                aria-label='Remove deliverable'
              >
                <Icon icon='tabler:x' width={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {!locked && rights.add && (
        <div className='mt-2'>
          <div className='flex gap-2'>
            <input
              id={`deliverable-${milestone.id}`}
              type='text'
              value={name}
              maxLength={200}
              onChange={e => {
                setName(capitalizeFirst(e.target.value))
                setError('')
              }}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder='Add a deliverable, e.g. Design document'
              className={`${ThemeStyles.formsInputs} !py-1.5${error ? ' !border !border-red-500' : ''}`}
            />
            <GhostButton onClick={add} disabled={isLoading} className='!px-3'>
              <Icon icon='tabler:plus' width={16} />
            </GhostButton>
          </div>
          {error && <span className='!mt-1 block text-xs font-semibold text-red-500'>{error}</span>}
        </div>
      )}
    </div>
  )
}

// Project Details > Milestones: checkpoints with their tasks, deliverables, client acceptance and invoice.
const ProjectMilestonesTab = ({ project }) => {
  const can = useCan()
  const open = project.status !== 'Closed'
  // Each button follows the exact right the server checks (add, edit, delete, accept for the client, invoice).
  const rights = {
    add: open && can('deliverables', 'add'),
    edit: open && can('deliverables', 'edit'),
    delete: open && can('deliverables', 'delete'),
    approve: open && can('deliverables', 'approve'),
    invoice: can('billing', 'add'),
    attach: open && can('documents', 'add')
  }
  const canEdit = rights.add
  const billable = project.project_type !== 'Internal'

  const { data, isFetching } = useGetProjectMilestonesQuery(project.id)
  const [changeStatus, { isLoading: isChanging }] = useChangeMilestoneStatusMutation()
  const [deleteMilestone, { isLoading: isDeleting }] = useDeleteMilestoneMutation()
  const [drawer, setDrawer] = useState(null)
  const [invoiceFor, setInvoiceFor] = useState(null)
  const [feedbackFor, setFeedbackFor] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuRow, setMenuRow] = useState(null)
  const [attachTo, setAttachTo] = useState(null) // { milestone, deliverable }

  const milestones = data?.detail || []
  const accepted = milestones.filter(m => m.status === 'Accepted').length
  const overdue = milestones.filter(m => m.is_overdue).length
  const value = milestones.reduce((sum, m) => sum + (m.amount || 0), 0)

  const move = async (m, status, feedback) => {
    try {
      const resp = await changeStatus({ projectId: project.id, milestoneId: m.id, status, feedback }).unwrap()
      toast.success(resp?.detail || `Moved to ${status}`)
      setFeedbackFor(null)
    } catch {
      // The shared base query already showed why.
    }
  }

  const remove = async () => {
    try {
      const resp = await deleteMilestone({ projectId: project.id, milestoneId: deleteTarget.id }).unwrap()
      toast.success(resp?.detail || 'Milestone deleted')
    } catch {
      // The shared base query already showed why.
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div>
      <UploadDrawer
        open={Boolean(attachTo)}
        onClose={() => setAttachTo(null)}
        preset={
          attachTo
            ? {
                projectId: project.id,
                milestoneId: attachTo.milestone.id,
                deliverableId: attachTo.deliverable.id,
                category: 'Deliverable'
              }
            : {}
        }
      />
      <MilestoneDrawer
        open={Boolean(drawer)}
        onClose={() => setDrawer(null)}
        project={project}
        milestone={drawer?.milestone || null}
      />
      <InvoiceDrawer
        open={Boolean(invoiceFor)}
        onClose={() => setInvoiceFor(null)}
        projectId={project.id}
        milestoneId={invoiceFor?.id}
      />
      {feedbackFor && (
        <FeedbackDialog
          milestone={feedbackFor}
          onClose={() => setFeedbackFor(null)}
          onConfirm={text => move(feedbackFor, 'Changes Requested', text)}
          busy={isChanging}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title='Delete milestone?'
        message={deleteTarget ? `'${deleteTarget.name}' will be removed. Its tasks stay in the project.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:flag'
          tone='indigo'
          label='Milestones'
          value={milestones.length}
          hint={`${milestones.length - accepted} still open`}
        />
        <StatCard
          icon='tabler:circle-check'
          tone='emerald'
          label='Accepted'
          value={accepted}
          hint='signed off by the client'
        />
        <StatCard icon='tabler:alarm' tone='red' label='Overdue' value={overdue} hint='past due, not accepted' />
        <StatCard
          icon='tabler:coin-rupee'
          tone='violet'
          label='Milestone Value'
          value={inr(value)}
          hint={billable ? 'billed as each is accepted' : 'internal project - not billed'}
        />
      </div>

      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='text-sm text-gray-500'>
          Link tasks from the task form. A milestone can go for review when all its tasks and deliverables are done.
        </div>
        {canEdit && (
          <PrimaryButton onClick={() => setDrawer({ milestone: null })}>
            Add Milestone <PlusCircle size={16} />
          </PrimaryButton>
        )}
      </div>

      {milestones.length === 0 ? (
        <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center`}>
          <Icon icon='tabler:flag' width={36} className='mx-auto mb-2 text-slate-400' />
          <div className='text-[15px] font-semibold text-slate-800'>
            {isFetching ? 'Loading...' : 'No milestones yet'}
          </div>
          {!isFetching && (
            <div className='text-sm text-gray-500'>
              Break the project into checkpoints the client signs off, e.g. Design, Build, Go-live.
            </div>
          )}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {milestones.map(m => (
            <section
              key={m.id}
              data-milestone={m.name}
              className='flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
            >
              <div className='mb-2 flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-[15px] font-semibold text-slate-800'>{m.name}</span>
                    <Chip tone={MILESTONE_TONE[m.status]}>{m.status}</Chip>
                    {m.is_overdue && <Chip tone='red'>Overdue</Chip>}
                  </div>
                  <div className='mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500'>
                    <span>Due {formatDate(m.due_date)}</span>
                    {m.amount !== null && <span>{inr(m.amount)}</span>}
                    <span>
                      {m.tasks_done}/{m.task_count} tasks done
                    </span>
                  </div>
                </div>
                {(rights.edit || rights.delete) && m.status !== 'Accepted' && (
                  <Ellipsis
                    className={ThemeStyles.tableActionsIcon}
                    onClick={e => {
                      setAnchorEl(e.currentTarget)
                      setMenuRow(m)
                    }}
                  />
                )}
              </div>

              <div className='mb-3 flex items-center gap-2'>
                <div className='flex-1'>
                  <ProgressBar value={m.progress} />
                </div>
                <span className='w-10 text-right text-xs font-semibold tabular-nums text-slate-700'>{m.progress}%</span>
              </div>

              {m.description && <p className='mb-3 whitespace-pre-line text-[13px] text-slate-600'>{m.description}</p>}
              {m.feedback && m.status !== 'Accepted' && (
                <div className='mb-3 rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-[13px] text-red-700'>
                  <span className='font-semibold'>Client feedback:</span> {m.feedback}
                </div>
              )}

              <Deliverables
                project={project}
                milestone={m}
                rights={rights}
                onAttach={d => setAttachTo({ milestone: m, deliverable: d })}
              />

              <div
                className='mt-auto flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3'
                style={{ marginTop: 12 }}
              >
                {m.status === 'Accepted' && (
                  <span className='text-xs text-gray-500'>
                    Accepted {formatDate(m.accepted_at)}
                    {m.accepted_by_name ? ` by ${m.accepted_by_name}` : ''}
                  </span>
                )}
                {m.invoice ? (
                  <Link href='/appModules/projects/billing/' className='ms-auto'>
                    <Chip tone={m.invoice.status === 'Paid' ? 'green' : 'blue'}>
                      {m.invoice.invoice_no} · {m.invoice.status}
                    </Chip>
                  </Link>
                ) : (
                  m.status === 'Accepted' &&
                  billable &&
                  rights.invoice &&
                  m.amount > 0 && (
                    <PrimaryButton onClick={() => setInvoiceFor(m)} className='ms-auto'>
                      <Icon icon='tabler:receipt' width={16} /> Create Invoice
                    </PrimaryButton>
                  )
                )}
                {m.next_statuses
                  // Accept / Request Changes are the client's decision (or an approver's for them); the rest is editing.
                  .filter(status => (['Accepted', 'Changes Requested'].includes(status) ? rights.approve : rights.edit))
                  .map((status, index) => {
                    const Button = index === 0 ? PrimaryButton : GhostButton

                    return (
                      <Button
                        key={status}
                        onClick={() => (status === 'Changes Requested' ? setFeedbackFor(m) : move(m, status))}
                        disabled={isChanging}
                        className={index === 0 ? 'ms-auto' : ''}
                      >
                        <Icon icon={ACTION[status].icon} width={16} />{' '}
                        {m.status === 'Changes Requested' && status === 'In Progress'
                          ? 'Resume Work'
                          : ACTION[status].label}
                      </Button>
                    )
                  })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} autoFocus={false}>
        {rights.edit && (
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setDrawer({ milestone: menuRow })
            setAnchorEl(null)
          }}
        >
          <div className={ThemeStyles.actionMenuBox}>
            <Edit className={ThemeStyles.actionMenuIcon} />
            Edit
          </div>
        </MenuItem>
        )}
        {rights.delete && (
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setDeleteTarget(menuRow)
            setAnchorEl(null)
          }}
        >
          <div className={`${ThemeStyles.actionMenuBox} text-red-600`}>
            <Trash2 className={`${ThemeStyles.actionMenuIcon} text-red-600`} />
            Delete
          </div>
        </MenuItem>
        )}
      </Menu>
    </div>
  )
}

export default ProjectMilestonesTab
