import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ReasonDialog from 'src/pms/components/ReasonDialog'
import { Chip, formatDate, GhostButton, inr, PrimaryButton, ProgressBar, STATUS_TONE } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'
import { saveBlob } from 'src/pms/documents/fileUtils'
import {
  useDecideMilestoneAsClientMutation,
  useDownloadPortalDocumentMutation,
  useGetPortalProjectQuery,
  useGetPortalProjectsQuery,
  useLazyGetPortalInvoiceQuery,
  useSendPortalMessageMutation
} from 'src/store/apps/pms/accessApi'
import MessageThread from './MessageThread'

const PORTAL = `${PMS_BASE}/portal`

const MILESTONE_TONE = { Planned: 'slate', 'In Progress': 'blue', 'Ready for Review': 'amber', 'Changes Requested': 'orange', Accepted: 'green' }

const Box = ({ title, subtitle, children, ...rest }) => (
  <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm' {...rest}>
    <div className='mb-3 border-b border-gray-100 pb-2'>
      <div className='text-[15px] font-semibold text-slate-800'>{title}</div>
      {subtitle && <div className='text-xs text-gray-500'>{subtitle}</div>}
    </div>
    {children}
  </section>
)

// ------------------------------------------------------------------------------ My Projects (portal home)

export const PortalHomeView = () => {
  const { data, isLoading, isError, refetch } = useGetPortalProjectsQuery()
  const d = data?.detail

  return (
    <PmsPage screenId='portal'>
      <p className='mb-4 max-w-3xl text-sm text-gray-600'>
        {d?.customer_name ? (
          <>
            Welcome. These are <b>{d.customer_name}</b>&apos;s projects with us. Open one to see its progress, review milestones, download
            shared files and invoices, or send the team a message.
          </>
        ) : (
          'Your projects with us. Open one to see its progress, review milestones, download files and invoices, or message the team.'
        )}
      </p>
      {isError ? (
        <div className='rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>
          Could not load your projects.{' '}
          <button type='button' className='cursor-pointer font-semibold underline' onClick={refetch}>
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className='py-12 text-center text-sm text-gray-500'>Loading…</div>
      ) : !d?.projects.length ? (
        <div className='rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500' data-portal-empty>
          No projects to show yet. They appear here once they are approved.
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3' data-portal-projects>
          {d.projects.map(p => (
            <Link
              key={p.id}
              href={`${PORTAL}/project/?id=${p.id}`}
              className='block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[var(--theme-solid)]'
              data-portal-project={p.id}
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <div className='text-xs text-gray-500'>{p.project_code}</div>
                  <div className='truncate text-[15px] font-semibold text-slate-800'>{p.project_name}</div>
                </div>
                <Chip tone={STATUS_TONE[p.status]}>{p.status}</Chip>
              </div>
              <div className='mt-3'>
                <div className='mb-1 flex justify-between text-xs text-gray-500'>
                  <span>Progress</span>
                  <span className='font-semibold tabular-nums text-slate-700'>{p.progress}%</span>
                </div>
                <ProgressBar value={p.progress} />
              </div>
              <div className='mt-3 text-xs text-gray-500'>
                {formatDate(p.start_date)} to {formatDate(p.end_date)} · Manager: {p.project_manager_name || '-'}
              </div>
            </Link>
          ))}
        </div>
      )}
    </PmsPage>
  )
}

// ------------------------------------------------------------------------------ one project

const InvoiceDialog = ({ invoice, onClose }) => (
  <Dialog open={Boolean(invoice)} onClose={onClose} maxWidth='md' fullWidth>
    <DialogTitle className='!border-b !border-gray-100 !p-4 !pb-3 !text-[17px] !font-bold'>Invoice {invoice?.invoice_no}</DialogTitle>
    {invoice && (
      <DialogContent className='!pt-4'>
        <div className='mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4'>
          <div>
            <div className='text-xs text-gray-500'>Issued</div>
            {formatDate(invoice.issue_date)}
          </div>
          <div>
            <div className='text-xs text-gray-500'>Due</div>
            {formatDate(invoice.due_date)}
          </div>
          <div>
            <div className='text-xs text-gray-500'>Status</div>
            {invoice.status}
          </div>
          <div>
            <div className='text-xs text-gray-500'>Billed to</div>
            {invoice.customer_name}
          </div>
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full min-w-[480px] text-left text-[13px]'>
            <thead>
              <tr className='border-b border-gray-200 text-xs uppercase text-gray-500'>
                <th className='py-2 pr-3'>Description</th>
                <th className='py-2 pr-3 text-right'>Qty</th>
                <th className='py-2 pr-3 text-right'>Rate</th>
                <th className='py-2 text-right'>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map(l => (
                <tr key={l.id} className='border-b border-gray-100'>
                  <td className='py-2 pr-3'>{l.description}</td>
                  <td className='py-2 pr-3 text-right tabular-nums'>
                    {l.quantity} {l.unit}
                  </td>
                  <td className='py-2 pr-3 text-right tabular-nums'>{inr(l.rate)}</td>
                  <td className='py-2 text-right tabular-nums'>{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='mt-3 ml-auto max-w-[260px] text-[13px]'>
          <div className='flex justify-between'>
            <span>Subtotal</span>
            <span className='tabular-nums'>{inr(invoice.subtotal)}</span>
          </div>
          <div className='flex justify-between'>
            <span>GST {invoice.tax_pct}%</span>
            <span className='tabular-nums'>{inr(invoice.tax_amount)}</span>
          </div>
          <div className='mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold'>
            <span>Total</span>
            <span className='tabular-nums'>{inr(invoice.total)}</span>
          </div>
        </div>
      </DialogContent>
    )}
    <DialogActions className='!border-t !border-gray-100 !bg-gray-50 !p-3'>
      <GhostButton onClick={onClose}>Close</GhostButton>
    </DialogActions>
  </Dialog>
)

export const PortalProjectView = () => {
  const router = useRouter()
  const id = router.query.id
  const { data, isLoading, isError } = useGetPortalProjectQuery(id, { skip: !router.isReady || !id })
  const [decide, { isLoading: deciding }] = useDecideMilestoneAsClientMutation()
  const [sendMessage, { isLoading: sending }] = useSendPortalMessageMutation()
  const [download] = useDownloadPortalDocumentMutation()
  const [loadInvoice] = useLazyGetPortalInvoiceQuery()
  const [ask, setAsk] = useState(null) // { milestone, decision }
  const [invoice, setInvoice] = useState(null)
  const p = data?.detail

  const back = (
    <Link href={`${PORTAL}/`} className='inline-flex items-center gap-1 text-[13px] font-medium hover:underline' style={{ color: 'var(--theme-solid)' }}>
      <Icon icon='tabler:arrow-left' width={14} /> My Projects
    </Link>
  )

  if (isLoading || !router.isReady) {
    return (
      <PmsPage screenId='portal.project'>
        <div className='py-12 text-center text-sm text-gray-500'>Loading…</div>
      </PmsPage>
    )
  }
  if (isError || !p) {
    return (
      <PmsPage screenId='portal.project'>
        <div className='rounded-xl border border-gray-200 bg-white p-8 text-center'>
          <div className='mb-2 font-semibold text-slate-800'>Project not found</div>
          {back}
        </div>
      </PmsPage>
    )
  }

  const submitDecision = async feedback => {
    try {
      const resp = await decide({ projectId: p.id, milestoneId: ask.milestone.id, decision: ask.decision, feedback }).unwrap()
      toast.success(resp.detail)
      setAsk(null)
    } catch {
      // The shared error toast explains why.
    }
  }

  const waiting = p.milestones.filter(m => m.status === 'Ready for Review')

  return (
    <PmsPage screenId='portal.project'>
      <ReasonDialog
        open={Boolean(ask)}
        onClose={() => setAsk(null)}
        busy={deciding}
        title={ask?.decision === 'accept' ? `Accept '${ask?.milestone.name}'?` : `Ask for changes on '${ask?.milestone.name}'?`}
        message={
          ask?.decision === 'accept'
            ? 'Accepting confirms this stage is delivered. Add a comment if you like.'
            : 'Tell the team what to change. They will send it for review again.'
        }
        label={ask?.decision === 'accept' ? 'Comment' : 'What should change'}
        minLength={ask?.decision === 'accept' ? 0 : 5}
        confirmText={ask?.decision === 'accept' ? 'Accept' : 'Send to the Team'}
        onSubmit={submitDecision}
      />
      <InvoiceDialog invoice={invoice} onClose={() => setInvoice(null)} />

      <div className='mb-3'>{back}</div>

      <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm' data-portal-header>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <div className='text-xs text-gray-500'>{p.project_code}</div>
            <h2 className='text-xl font-semibold text-slate-900'>{p.project_name}</h2>
            <div className='text-sm text-gray-500'>
              {formatDate(p.start_date)} to {formatDate(p.end_date)} · Manager: {p.project_manager_name || '-'}
            </div>
          </div>
          <Chip tone={STATUS_TONE[p.status]}>{p.status}</Chip>
        </div>
        <div className='mt-4 max-w-xl'>
          <div className='mb-1 flex justify-between text-xs text-gray-500'>
            <span>Work done</span>
            <span className='font-semibold tabular-nums text-slate-700'>{p.progress}%</span>
          </div>
          <ProgressBar value={p.progress} />
        </div>
        {waiting.length > 0 && (
          <div className='mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800' data-portal-waiting>
            <Icon icon='tabler:bell-ringing' width={18} className='mt-0.5 shrink-0' />
            <div>
              <b>{waiting.length === 1 ? `'${waiting[0].name}' is` : `${waiting.length} milestones are`} ready for your review.</b> Accept it
              below, or ask for changes.
            </div>
          </div>
        )}
      </section>

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
        <div className='flex flex-col gap-4 xl:col-span-2'>
          <Box title='Milestones' subtitle='The stages you sign off. Accepted stages can be invoiced' data-portal-milestones>
            {!p.milestones.length && <div className='text-sm text-gray-500'>No milestones yet.</div>}
            <ul className='flex flex-col gap-3'>
              {p.milestones.map(m => (
                <li key={m.id} className='rounded-lg border border-gray-100 p-3' data-portal-milestone={m.id}>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='font-semibold text-slate-800'>{m.name}</div>
                      <div className='text-xs text-gray-500'>
                        Due {formatDate(m.due_date)}
                        {m.amount ? ` · ${inr(m.amount)}` : ''}
                        {m.accepted_at ? ` · accepted ${formatDate(m.accepted_at)} by ${m.accepted_by_name}` : ''}
                      </div>
                    </div>
                    <Chip tone={MILESTONE_TONE[m.status] || 'slate'}>{m.status}</Chip>
                  </div>
                  {m.deliverables.length > 0 && (
                    <ul className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600'>
                      {m.deliverables.map(dl => (
                        <li key={dl.name}>
                          <Icon
                            icon={dl.is_done ? 'tabler:circle-check' : 'tabler:circle'}
                            width={14}
                            className={`-mt-0.5 mr-1 inline ${dl.is_done ? 'text-emerald-600' : 'text-gray-400'}`}
                          />
                          {dl.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.feedback && m.status === 'Changes Requested' && <div className='mt-2 text-xs text-orange-700'>Your feedback: {m.feedback}</div>}
                  {m.status === 'Ready for Review' && (
                    <div className='mt-3 flex flex-wrap gap-2'>
                      <GhostButton onClick={() => setAsk({ milestone: m, decision: 'changes' })}>Ask for Changes</GhostButton>
                      <PrimaryButton onClick={() => setAsk({ milestone: m, decision: 'accept' })}>
                        <Icon icon='tabler:check' width={16} /> Accept
                      </PrimaryButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Box>

          <Box title='Messages' subtitle='Questions and updates between you and the project team' data-portal-messages>
            <MessageThread
              side='client'
              messages={p.messages}
              busy={sending}
              placeholder='Write to the project team'
              onSend={body => sendMessage({ projectId: p.id, body }).unwrap()}
            />
          </Box>
        </div>

        <div className='flex flex-col gap-4'>
          <Box title='Invoices' data-portal-invoices>
            {!p.invoices.length && <div className='text-sm text-gray-500'>No invoices yet.</div>}
            <ul className='flex flex-col gap-2'>
              {p.invoices.map(i => (
                <li key={i.id} className='flex items-center justify-between gap-2 text-[13px]'>
                  <button
                    type='button'
                    className='cursor-pointer text-left font-semibold hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                    onClick={async () => {
                      try {
                        setInvoice((await loadInvoice(i.id).unwrap()).detail)
                      } catch {
                        // The shared error toast explains why.
                      }
                    }}
                  >
                    {i.invoice_no}
                    <div className='text-xs font-normal text-gray-500'>{i.milestone_name || `Issued ${formatDate(i.issue_date)}`}</div>
                  </button>
                  <div className='text-right'>
                    <div className='font-semibold tabular-nums'>{inr(i.total)}</div>
                    <span className={`text-xs ${i.status === 'Paid' ? 'text-emerald-700' : i.is_overdue ? 'text-red-600' : 'text-amber-700'}`}>
                      {i.status === 'Paid' ? `Paid ${formatDate(i.paid_date)}` : i.is_overdue ? `Overdue (due ${formatDate(i.due_date)})` : `Due ${formatDate(i.due_date)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Box>

          <Box title='Shared files' subtitle='Files the team shared with you' data-portal-documents>
            {!p.documents.length && <div className='text-sm text-gray-500'>No files shared yet.</div>}
            <ul className='flex flex-col gap-2'>
              {p.documents.map(doc => (
                <li key={doc.id} className='flex items-center justify-between gap-2 text-[13px]'>
                  <div className='min-w-0'>
                    <div className='truncate font-semibold text-slate-800'>{doc.title}</div>
                    <div className='text-xs text-gray-500'>
                      {doc.category} · version {doc.version}
                    </div>
                  </div>
                  <GhostButton
                    className='!px-2'
                    aria-label={`Download ${doc.title}`}
                    onClick={async () => {
                      try {
                        saveBlob(await download(doc.id).unwrap(), doc.file_name)
                      } catch {
                        // The shared error toast explains why.
                      }
                    }}
                  >
                    <Icon icon='tabler:download' width={16} />
                  </GhostButton>
                </li>
              ))}
            </ul>
          </Box>
        </div>
      </div>
    </PmsPage>
  )
}
