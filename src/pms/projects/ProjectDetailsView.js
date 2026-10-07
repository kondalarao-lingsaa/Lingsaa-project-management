import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { Edit, LayoutTemplate, Settings, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import {
  Chip,
  formatDate,
  GhostButton,
  GRADIENT,
  inr,
  PrimaryButton,
  PRIORITY_TONE,
  ProgressBar,
  STATUS_TONE
} from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen, PMS_BASE } from 'src/pms/config/pmsModules'
import SaveAsTemplateDialog from 'src/pms/templates/SaveAsTemplateDialog'
import { ActivityFeed } from 'src/pms/communication/CommunicationViews'
import { NextStepBar, RunningGuide, SetupChecklist } from './ProjectSetupGuide'
import ProjectDrawer from './ProjectDrawer'
import TasksListView from 'src/pms/tasks/TasksListView'
import KanbanBoard from 'src/pms/tasks/KanbanBoard'
import ProjectTeamTab from 'src/pms/team/ProjectTeamTab'
import ProjectBudgetTab from 'src/pms/budget/ProjectBudgetTab'
import ProjectMilestonesTab from 'src/pms/milestones/ProjectMilestonesTab'
import ProjectRisksTab from 'src/pms/risks/ProjectRisksTab'
import ProjectDocumentsTab from 'src/pms/documents/ProjectDocumentsTab'
import ProjectPlanningTab from 'src/pms/planning/ProjectPlanningTab'
import ReasonDialog from 'src/pms/components/ReasonDialog'
import MessageThread from 'src/pms/portal/MessageThread'
import { runsProject, useCan, useMe } from 'src/pms/access/useAccess'
import { useGetClientMessagesQuery, useReplyToClientMutation } from 'src/store/apps/pms/accessApi'
import ProjectApprovalCard from './ProjectApprovalCard'
import {
  useChangeProjectStatusMutation,
  useDeleteProjectMutation,
  useReopenProjectMutation,
  useGetProjectDetailQuery,
  useGetProjectMetaQuery
} from 'src/store/apps/pms/projectsApi'

const SCREEN_ID = 'projects.projectDetails'
const LIST_PATH = `${PMS_BASE}/projects/allProjects/`

// The main path a project follows; On Hold is a side state shown as a badge.
const STEPS = ['Draft', 'Pending Approval', 'Approved', 'Active', 'Closed']

// What each move is called on the button, and whether it needs a confirmation.
const ACTIONS = {
  'Pending Approval': { label: 'Submit for Approval', icon: 'tabler:send' },
  Approved: { label: 'Approve', icon: 'tabler:circle-check' },
  Draft: { label: 'Send Back to Draft', icon: 'tabler:arrow-back-up', confirm: true },
  Active: { label: 'Activate', icon: 'tabler:player-play' },
  'On Hold': { label: 'Put On Hold', icon: 'tabler:player-pause', confirm: true },
  Closed: { label: 'Close Project', icon: 'tabler:archive', confirm: true }
}

// Said in the confirmation, so nobody pauses or closes a project without knowing what it means.
const MOVE_WARNING = {
  'On Hold': 'No hours can be logged until it is activated again.',
  Closed:
    'Closing is final: no more tasks, hours, expenses or invoices can be added. Only an Admin or Director can reopen it.'
}

// Tabs in the order a project is set up and run: team first (tasks can only go to team members), then the
// plan, the work, and money/risks/files. Every tab reuses that section's list filtered to this project.
const TABS = [
  // `needs`: the module right a role must have to see the tab (the tab reads that module's data).
  { key: 'overview', label: 'Overview', ready: true },
  { key: 'team', label: 'Team', ready: true },
  { key: 'milestones', label: 'Milestones', ready: true, needs: ['deliverables', 'view'] },
  { key: 'tasks', label: 'Tasks', ready: true, needs: ['tasks', 'view'] },
  { key: 'board', label: 'Board', ready: true, needs: ['tasks', 'view'] },
  { key: 'planning', label: 'Planning', ready: true, needs: ['planning', 'view'] },
  { key: 'budget', label: 'Budget', ready: true, needs: ['budget', 'view'] },
  { key: 'risks', label: 'Risks', ready: true, needs: ['risks', 'view'] },
  { key: 'files', label: 'Files', ready: true, needs: ['documents', 'view'] },
  { key: 'activity', label: 'Activity', ready: true, needs: ['tasks', 'view'] },
  // Messages with the client (they write from the client portal).
  { key: 'client', label: 'Client', ready: true, needs: ['communication', 'view'] }
]

// Project Details > Client: the conversation with the client's portal users.
const ClientTab = ({ project, canSend }) => {
  const { data } = useGetClientMessagesQuery(project.id)
  const [reply, { isLoading }] = useReplyToClientMutation()

  return (
    <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
      <div className='mb-3 border-b border-gray-100 pb-2'>
        <div className='text-[15px] font-semibold text-slate-800'>Messages with {project.customer_name || 'the client'}</div>
        <div className='text-xs text-gray-500'>
          The client writes from the client portal. Share files with them from the Files tab (Share with client).
        </div>
      </div>
      <MessageThread
        side='team'
        messages={data?.detail || []}
        busy={isLoading}
        canSend={canSend}
        placeholder='Reply to the client'
        onSend={body => reply({ projectId: project.id, body }).unwrap()}
      />
    </section>
  )
}

const Field = ({ label, children }) => (
  <div>
    <div className='text-xs font-medium text-gray-500'>{label}</div>
    <div className='mt-0.5 text-[14px] font-medium text-slate-800'>{children || '-'}</div>
  </div>
)

const Stepper = ({ status }) => {
  const currentIndex = STEPS.indexOf(status)

  return (
    <div className='flex flex-wrap items-center gap-y-2'>
      {STEPS.map((step, index) => {
        const done = currentIndex > index
        const current = currentIndex === index

        return (
          <React.Fragment key={step}>
            <div className='flex items-center gap-2'>
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  done || current ? 'text-white' : 'bg-gray-200 text-gray-500'
                }`}
                style={done || current ? { background: GRADIENT } : undefined}
              >
                {done ? <Icon icon='tabler:check' width={14} /> : index + 1}
              </span>
              <span
                className={`text-[13px] ${
                  current ? 'font-semibold text-slate-900' : done ? 'font-medium text-slate-700' : 'text-gray-500'
                }`}
              >
                {step}
              </span>
            </div>
            {index < STEPS.length - 1 && <span className={`mx-3 h-px w-8 ${done ? 'bg-indigo-400' : 'bg-gray-300'}`} />}
          </React.Fragment>
        )
      })}
      {status === 'On Hold' && (
        <span className='ml-4'>
          <Chip tone='orange'>On Hold</Chip>
        </span>
      )}
    </div>
  )
}

const ProjectDetailsView = () => {
  const router = useRouter()
  const id = router.query.id
  const screen = getScreen(SCREEN_ID)
  const { userPermissions } = usePmsPermissions(screen?.permissionName)
  const can = useCan()
  const { me } = useMe()
  const [askApproval, setAskApproval] = useState(null) // 'Approved' | 'Draft' (an approver sending it back)

  const { data: resp, isFetching, isUninitialized } = useGetProjectDetailQuery(id, { skip: !router.isReady || !id })
  const { data: metaResp } = useGetProjectMetaQuery()
  const [changeStatus, { isLoading: isChanging }] = useChangeProjectStatusMutation()
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()
  const [reopenProject, { isLoading: isReopening }] = useReopenProjectMutation()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [askReopen, setAskReopen] = useState(false)

  const [templateOpen, setTemplateOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState(null)

  // The open tab lives in the URL (?tab=tasks) so it can be linked to and survives a refresh.
  const activeTab = TABS.find(tab => tab.key === router.query.tab && tab.ready && (!tab.needs || can(...tab.needs)))?.key || 'overview'
  const openTab = key =>
    router.replace(
      { pathname: router.pathname, query: { id, ...(key === 'overview' ? {} : { tab: key }) } },
      undefined,
      { shallow: true }
    )

  const project = resp?.detail
  const stats = project?.stats

  const move = async (status, remarks) => {
    try {
      const result = await changeStatus({ id, status, remarks }).unwrap()
      toast.success(result?.detail || `Status changed to ${status}`)
    } catch {
      // The shared base query already showed the error.
    } finally {
      setPendingMove(null)
      setAskApproval(null)
    }
  }

  const reopen = async reason => {
    try {
      const result = await reopenProject({ id, reason }).unwrap()
      toast.success(result?.detail || 'Project reopened')
    } catch {
      // The shared base query already showed the error.
    } finally {
      setAskReopen(false)
    }
  }

  // Approve asks for an optional note; an approver sending a project back must give a reason. The requester
  // withdrawing their own request only confirms.
  const requestMove = status => {
    const approval = resp?.detail?.approval
    if (status === 'Approved') return setAskApproval('Approved')
    if (status === 'Draft' && resp?.detail?.status === 'Pending Approval' && !approval?.is_requester) return setAskApproval('Draft')
    if (ACTIONS[status]?.confirm) return setPendingMove(status)
    move(status)
  }

  const backLink = (
    <Link
      href={LIST_PATH}
      className='inline-flex items-center gap-1 text-[13px] font-medium hover:underline'
      style={{ color: 'var(--theme-solid)' }}
    >
      <Icon icon='tabler:arrow-left' width={14} /> All Projects
    </Link>
  )

  if (!router.isReady || isUninitialized || (isFetching && !project)) {
    return (
      <PmsPage screenId={SCREEN_ID}>
        <div className='py-16 text-center text-sm text-gray-500'>Loading project...</div>
      </PmsPage>
    )
  }

  if (!project) {
    return (
      <PmsPage screenId={SCREEN_ID}>
        <div className='rounded-xl border border-gray-200 bg-white p-10 text-center shadow-sm'>
          <Icon icon='tabler:folder-off' width={36} className='mx-auto mb-3 text-slate-400' />
          <div className='mb-1 text-lg font-semibold text-slate-800'>Project not found</div>
          <div className='mb-4 text-sm text-gray-500'>It may have been deleted, or it belongs to another company.</div>
          {backLink}
        </div>
      </PmsPage>
    )
  }

  const runs = runsProject(me, project)
  const canEdit = Boolean(userPermissions?.edit) && runs
  // Approved work keeps its history: only an Admin deletes a project after approval (others close it).
  const canDelete = Boolean(userPermissions?.delete) && runs && (['Draft', 'Pending Approval'].includes(project.status) || me?.role === 'admin')
  const isClosed = project.status === 'Closed'
  // The moves this person may make: Approve only for the approver of the current level; the rest need edit rights.
  const approval = project.approval || {}
  const allowedMoves = project.next_statuses.filter(status => {
    if (status === 'Approved') return approval.can_approve
    if (status === 'Draft' && project.status === 'Pending Approval') return approval.can_approve || (canEdit && approval.is_requester)

    return canEdit
  })
  const shown = { ...project, next_statuses: allowedMoves }
  const tabs = TABS.filter(tab => !tab.needs || can(...tab.needs))

  const handleDelete = async () => {
    try {
      const result = await deleteProject(project.id).unwrap()
      toast.success(result?.detail || 'Project deleted')
      setConfirmDelete(false)
      router.push(LIST_PATH)
    } catch {
      // The shared base query already showed why.
      setConfirmDelete(false)
    }
  }

  return (
    <PmsPage
      screenId={SCREEN_ID}
      actions={
        (canEdit || canDelete) && (
          <div className='flex flex-wrap gap-2'>
            {canEdit && (
              <>
                <Link
                  href={`${PMS_BASE}/projects/projectSettings/?projectId=${project.id}`}
                  className='inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-gray-50'
                >
                  <Settings size={16} /> Settings
                </Link>
                <GhostButton onClick={() => setTemplateOpen(true)}>
                  <LayoutTemplate size={16} /> Save as Template
                </GhostButton>
              </>
            )}
            {/* The server refuses changes while the project waits for approval (send it back to Draft first). */}
            {canEdit && !isClosed && project.status !== 'Pending Approval' && (
              <GhostButton onClick={() => setDrawerOpen(true)}>
                <Edit size={16} /> Edit
              </GhostButton>
            )}
            {canDelete && (
              <GhostButton onClick={() => setConfirmDelete(true)} className='!text-red-600'>
                <Trash2 size={16} /> Delete
              </GhostButton>
            )}
          </div>
        )
      }
    >
      <ProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={project.id}
        meta={metaResp?.detail}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title='Delete project?'
        message={`${project.project_code} - ${project.project_name} will be removed from the list.`}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />
      <SaveAsTemplateDialog open={templateOpen} onClose={() => setTemplateOpen(false)} project={project} />

      <ConfirmDialog
        open={Boolean(pendingMove)}
        onClose={() => setPendingMove(null)}
        onConfirm={() => move(pendingMove)}
        title={pendingMove ? `${ACTIONS[pendingMove].label}?` : ''}
        message={
          pendingMove ? `${project.project_code} will move from ${project.status} to ${pendingMove}. ${MOVE_WARNING[pendingMove] || ''}` : ''
        }
        confirmText={pendingMove === 'Closed' ? 'Yes, close project' : 'Yes, continue'}
        cancelText='Cancel'
        busy={isChanging}
      />

      <ReasonDialog
        open={askReopen}
        onClose={() => setAskReopen(false)}
        busy={isReopening}
        title={`Reopen ${project.project_code}?`}
        message='The project becomes Active again, so tasks, hours and expenses can be added. Say why it is reopened: the reason is kept in the approval history and the project manager is told.'
        label='Reason'
        minLength={10}
        confirmText='Reopen Project'
        onSubmit={reopen}
      />

      <ReasonDialog
        open={Boolean(askApproval)}
        onClose={() => setAskApproval(null)}
        busy={isChanging}
        title={askApproval === 'Approved' ? `Approve ${project.project_code}?` : `Send ${project.project_code} back to Draft?`}
        message={
          askApproval === 'Approved'
            ? `${approval.rule || ''}. Add a note for the project manager if you like.`
            : 'Say what the project manager must fix. They see this reason on the project.'
        }
        label={askApproval === 'Approved' ? 'Note' : 'Reason'}
        minLength={askApproval === 'Approved' ? 0 : 5}
        confirmText={askApproval === 'Approved' ? 'Approve' : 'Send Back'}
        onSubmit={text => move(askApproval, text)}
      />

      <div className='mb-3'>{backLink}</div>

      <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='text-xl font-semibold text-slate-900'>{project.project_name}</h2>
              <Chip tone={STATUS_TONE[project.status]}>{project.status}</Chip>
              <Chip tone={PRIORITY_TONE[project.priority]}>{project.priority} priority</Chip>
            </div>
            <div className='mt-1 text-sm text-gray-500'>
              {project.project_code}
              {project.customer_name ? ` · ${project.customer_name}` : ''}
            </div>
          </div>

          {isClosed && can('projects', 'approve') && (
            <GhostButton onClick={() => setAskReopen(true)} disabled={isReopening} data-reopen-project>
              <Icon icon='tabler:lock-open' width={16} /> Reopen Project
            </GhostButton>
          )}

          {allowedMoves.length > 0 && (
            <div className='flex flex-wrap gap-2'>
              {allowedMoves.map((status, index) => {
                const action = ACTIONS[status]
                const Button = index === 0 ? PrimaryButton : GhostButton

                return (
                  <Button key={status} onClick={() => requestMove(status)} disabled={isChanging}>
                    <Icon icon={action.icon} width={16} /> {action.label}
                  </Button>
                )
              })}
            </div>
          )}
        </div>

        <div className='mt-4 border-t border-gray-100 pt-4'>
          <Stepper status={project.status} />
          <NextStepBar project={shown} canEdit={canEdit || approval.can_approve} onEdit={() => setDrawerOpen(true)} onTab={openTab} onStatus={requestMove} />
        </div>
      </section>

      <div className='mb-4 flex gap-1 overflow-x-auto border-b border-gray-200'>
        {tabs.map(tab => (
          <button
            key={tab.key}
            type='button'
            disabled={!tab.ready}
            onClick={() => openTab(tab.key)}
            title={tab.ready ? undefined : 'Available once this section is built'}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-[14px] font-semibold ${
              !tab.ready
                ? 'cursor-not-allowed border-transparent text-gray-400'
                : activeTab === tab.key
                ? 'border-[var(--theme-solid)] text-[var(--theme-solid)]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
            {tab.key === 'tasks' && stats.task_count > 0 && (
              <span className='ml-1.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600'>
                {stats.task_count}
              </span>
            )}
            {!tab.ready && <span className='ml-1 text-[10px] font-medium uppercase text-gray-400'>soon</span>}
          </button>
        ))}
      </div>

      {activeTab === 'tasks' && <TasksListView embedded projectId={project.id} screenId='tasks.allTasks' />}
      {activeTab === 'board' && <KanbanBoard embedded projectId={project.id} />}
      {activeTab === 'team' && <ProjectTeamTab project={project} />}
      {activeTab === 'budget' && <ProjectBudgetTab project={project} />}
      {activeTab === 'milestones' && <ProjectMilestonesTab project={project} />}
      {activeTab === 'risks' && <ProjectRisksTab project={project} />}
      {activeTab === 'files' && <ProjectDocumentsTab project={project} />}
      {activeTab === 'planning' && <ProjectPlanningTab project={project} />}
      {activeTab === 'activity' && <ActivityFeed projectId={project.id} />}
      {activeTab === 'client' && <ClientTab project={project} canSend={can('communication', 'add')} />}

      {activeTab === 'overview' && (
        <>
          {['Draft', 'Pending Approval', 'Approved'].includes(project.status) && (
            <SetupChecklist project={shown} canEdit={canEdit || approval.can_approve} onEdit={() => setDrawerOpen(true)} onTab={openTab} onStatus={requestMove} />
          )}
          {['Active', 'On Hold'].includes(project.status) && <RunningGuide project={project} onTab={openTab} />}
          <ProjectApprovalCard project={project} />
          <div className='mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4'>
            <StatCard
              icon='tabler:progress-check'
              tone='emerald'
              label='Progress'
              value={`${stats.progress}%`}
              hint={`${stats.task_count} tasks in total`}
            />
            <StatCard
              icon='tabler:checklist'
              tone='blue'
              label='Tasks Done'
              value={stats.by_status.Done}
              hint={`${stats.by_status['In Progress']} in progress, ${stats.by_status.Testing} in testing`}
            />
            <StatCard
              icon='tabler:alarm'
              tone='red'
              label='Overdue Tasks'
              value={stats.overdue}
              hint='past due date, not done'
            />
            <StatCard
              icon='tabler:coin'
              tone='violet'
              label='Budget'
              value={project.budget === null ? '-' : inr(project.budget)}
              hint='planned budget'
            />
          </div>

          <div className='grid grid-cols-1 gap-4 xl:grid-cols-3'>
            <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:col-span-2'>
              <div className='mb-3 border-b border-gray-100 pb-2 text-[15px] font-semibold text-slate-800'>
                Project Information
              </div>
              <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                <Field label='Client'>{project.customer_name}</Field>
                <Field label='Client Contact'>{project.customer_contact_name}</Field>
                <Field label='Contact Mobile'>{project.customer_mobile}</Field>
                <Field label='Contact Email'>{project.customer_email}</Field>
                <Field label='Client GSTIN'>{project.customer_gstin}</Field>
                <Field label='Client PAN'>{project.customer_pan}</Field>
                <Field label='Project Manager'>{project.project_manager_name}</Field>
                <Field label='Project Type'>{project.project_type}</Field>
                <Field label='Category'>{project.category}</Field>
                <Field label='Business Domain'>{project.business_domain}</Field>
                <Field label='Priority'>{project.priority}</Field>
                <Field label='Start Date'>{formatDate(project.start_date)}</Field>
                <Field label='End Date'>{formatDate(project.end_date)}</Field>
                <Field label='Created'>{formatDate(project.created_at)}</Field>
              </div>
              <div className='mt-4 border-t border-gray-100 pt-3'>
                <div className='text-xs font-medium text-gray-500'>Description</div>
                <p className='mt-1 whitespace-pre-line text-[14px] text-slate-700'>
                  {project.description || 'No description added.'}
                </p>
              </div>
            </section>

            <section className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
              <div className='mb-3 border-b border-gray-100 pb-2 text-[15px] font-semibold text-slate-800'>
                Task Progress
              </div>
              <div className='mb-1 flex justify-between text-sm'>
                <span className='text-gray-500'>Completed</span>
                <span className='font-semibold text-slate-800'>{stats.progress}%</span>
              </div>
              <ProgressBar value={stats.progress} />
              <div className='mt-4 flex flex-col gap-2'>
                {Object.entries(stats.by_status).map(([label, count]) => (
                  <div key={label} className='flex items-center justify-between text-[13px] text-slate-700'>
                    {label}
                    <span className='font-semibold tabular-nums'>{count}</span>
                  </div>
                ))}
              </div>
              {stats.task_count === 0 ? (
                <p className='mt-4 text-xs text-gray-500'>
                  No tasks yet. Progress is worked out from this project&apos;s tasks.{' '}
                  <button
                    type='button'
                    onClick={() => openTab('tasks')}
                    className='font-semibold hover:underline'
                    style={{ color: 'var(--theme-solid)' }}
                  >
                    Add the first task
                  </button>
                </p>
              ) : (
                <button
                  type='button'
                  onClick={() => openTab('tasks')}
                  className='mt-4 text-[13px] font-semibold hover:underline'
                  style={{ color: 'var(--theme-solid)' }}
                >
                  View all {stats.task_count} tasks
                </button>
              )}
            </section>
          </div>
        </>
      )}
    </PmsPage>
  )
}

export default ProjectDetailsView
