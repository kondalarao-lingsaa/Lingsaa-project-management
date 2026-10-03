import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { PrimaryButton } from 'src/pms/components/ui'
import { PMS_BASE } from 'src/pms/config/pmsModules'

// The four phases every project goes through; the guide highlights the current one.
const PHASES = [
  { key: 'setup', label: 'Set up', statuses: ['Draft'] },
  { key: 'approval', label: 'Get approval', statuses: ['Pending Approval', 'Approved'] },
  { key: 'run', label: 'Run the project', statuses: ['Active', 'On Hold'] },
  { key: 'close', label: 'Close', statuses: ['Closed'] }
]

// The order a new project is set up in. Each step says why it matters, where it is done and what it
// leads to, knows when it is done, and what its button opens. Optional steps never become the "Next step".
export const setupSteps = project => {
  const setup = project.setup || { members: 0, milestones: 0, missing_for_approval: [] }
  const tasks = project.stats?.task_count || 0
  const passed = statuses => !statuses.includes(project.status)

  return [
    {
      key: 'details',
      title: 'Fill in the project details',
      hint: setup.missing_for_approval.length ? `Still needed: ${setup.missing_for_approval.join(', ')}` : 'Dates, budget and client are in place',
      why: 'The end date and budget are what the approver decides on, and every plan and cost check uses them.',
      where: 'Edit button (top right)',
      next: 'Add the team',
      done: setup.missing_for_approval.length === 0,
      action: { kind: 'edit', label: 'Edit Details' }
    },
    {
      key: 'team',
      title: 'Add the team',
      hint: setup.members > 1 ? `${setup.members} people on the team` : 'Only the project manager so far',
      why: 'Tasks can only be given to team members, and their allocation % and rate drive capacity and cost.',
      where: 'Team tab',
      next: 'Plan milestones, then add tasks',
      done: setup.members > 1,
      action: { kind: 'tab', tab: 'team', label: 'Open Team' }
    },
    {
      key: 'milestones',
      title: 'Plan milestones',
      hint: setup.milestones ? `${setup.milestones} milestone${setup.milestones > 1 ? 's' : ''}` : 'None planned yet',
      why: 'The stages the client signs off. An accepted milestone is what you can invoice.',
      where: 'Milestones tab',
      next: 'Add tasks and link them to a milestone',
      done: setup.milestones > 0,
      optional: true,
      action: { kind: 'tab', tab: 'milestones', label: 'Open Milestones' }
    },
    {
      key: 'tasks',
      title: 'Add tasks',
      hint: tasks ? `${tasks} task${tasks > 1 ? 's' : ''}` : 'No tasks yet',
      why: 'The actual work, each with an owner and due date. Project progress is worked out from them.',
      where: 'Tasks tab (dates and dependencies in the Planning tab)',
      next: 'Submit for approval',
      done: tasks > 0,
      action: { kind: 'tab', tab: 'tasks', label: 'Open Tasks' }
    },
    {
      key: 'submit',
      title: 'Submit for approval',
      hint: 'Locks in the plan you are asking for',
      why: 'The project spends company money and people, so a person with approval authority checks the plan.',
      where: 'Submit for Approval button (top right)',
      next: 'The approver approves it, or sends it back to Draft',
      done: passed(['Draft']),
      action: { kind: 'status', status: 'Pending Approval', label: 'Submit for Approval' }
    },
    {
      key: 'approve',
      title: 'Approval',
      hint: project.status === 'Pending Approval' ? 'Waiting for approval' : 'Given by a person with approval authority',
      why: 'The approver opens this same page and clicks Approve, or Send Back to Draft so you can fix the plan.',
      where: 'Approve button (top right, for the approver)',
      next: 'Start the project',
      done: passed(['Draft', 'Pending Approval']),
      action: { kind: 'status', status: 'Approved', label: 'Approve' }
    },
    {
      key: 'activate',
      title: 'Start the project',
      hint: 'Work starts',
      why: 'Only an Active project lets the team log hours, start sprints and book expenses.',
      where: 'Activate button (top right)',
      next: 'Run the project: tasks, hours, cost, milestones, billing',
      done: passed(['Draft', 'Pending Approval', 'Approved']),
      action: { kind: 'status', status: 'Active', label: 'Activate' }
    }
  ]
}

// While the project runs, the screens used every week, in the order money flows through them.
const runSteps = project => [
  {
    key: 'work',
    title: 'Work on tasks',
    why: 'The team moves tasks To Do > In Progress > Done. A blocked task cannot be closed before its blocker.',
    where: 'Tasks and Board tabs',
    next: 'Hours are logged against these tasks',
    action: { kind: 'tab', tab: 'board', label: 'Open Board' },
    count: project.stats ? `${project.stats.by_status?.Done || 0} of ${project.stats.task_count} done` : null
  },
  {
    key: 'hours',
    title: 'Log and approve hours',
    why: 'Members log hours in My Timesheets and submit the week; the manager approves them. Approved hours become cost.',
    where: 'Timesheets > My Timesheets, then Timesheets > Approval',
    next: 'Cost shows on the Budget tab',
    action: { kind: 'link', href: `${PMS_BASE}/timesheets/approval/`, label: 'Open Approval' }
  },
  {
    key: 'cost',
    title: 'Watch the budget',
    why: 'Labour (approved hours x rate) plus approved expenses, against the budget, with a warning when it gets close.',
    where: 'Budget tab (expenses in Budget & Costs > Expenses)',
    next: 'Budget or date changes go through a change request',
    action: { kind: 'tab', tab: 'budget', label: 'Open Budget' }
  },
  {
    key: 'deliver',
    title: 'Deliver milestones',
    why: 'When its tasks are done, send the milestone for review. Once it is accepted it is locked and can be billed.',
    where: 'Milestones tab',
    next: 'Bill the accepted milestone',
    action: { kind: 'tab', tab: 'milestones', label: 'Open Milestones' }
  },
  {
    key: 'bill',
    title: 'Bill the client',
    why: 'Invoice accepted milestones, or approved hours and billable expenses for Time & Material projects. Then Issue and Mark Paid.',
    where: 'Billing',
    next: 'Billed and collected amounts show on the Budget tab',
    action: { kind: 'link', href: `${PMS_BASE}/billing/`, label: 'Open Billing' }
  },
  {
    key: 'risks',
    title: 'Handle risks and changes',
    why: 'Log risks early. A change to budget, dates or scope is a change request; approving it updates the project.',
    where: 'Risks tab',
    next: 'The Dashboard shows the project as On Track, At Risk or Delayed',
    action: { kind: 'tab', tab: 'risks', label: 'Open Risks' }
  },
  {
    key: 'close',
    title: 'Close the project',
    why: 'When the work is delivered and billed. A closed project is read-only; save it as a template to reuse the plan.',
    where: 'Close Project button (top right)',
    next: 'Reports keep its history',
    action: null
  }
]

export const nextSetupStep = project => {
  const steps = setupSteps(project)
  // Once sent, the only thing left before the project can start is the decision.
  if (project.status === 'Pending Approval') return steps.find(step => step.key === 'approve')

  return steps.find(step => !step.done && !step.optional) || null
}

// Runs a step's button: open the edit form, a tab, or move the project's status.
const useRun = ({ onEdit, onTab, onStatus }) => action => {
  if (action.kind === 'edit') onEdit()
  else if (action.kind === 'tab') onTab(action.tab)
  else if (action.kind === 'status') onStatus(action.status)
}

// Remembers (in this browser only) whether the person folded the guide away.
const GUIDE_KEY = 'pms-project-guide-hidden'
const useGuideHidden = () => {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(GUIDE_KEY) === '1')
    } catch {
      // storage blocked: the guide just stays open
    }
  }, [])
  const toggle = () =>
    setHidden(prev => {
      try {
        window.localStorage.setItem(GUIDE_KEY, prev ? '0' : '1')
      } catch {
        // storage blocked
      }

      return !prev
    })

  return [hidden, toggle]
}

const PhaseBar = ({ status }) => {
  const current = PHASES.findIndex(p => p.statuses.includes(status))

  return (
    <div className='mb-4 flex flex-wrap items-center gap-y-2' data-phase={PHASES[current]?.key}>
      {PHASES.map((phase, index) => (
        <React.Fragment key={phase.key}>
          <span
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
              index === current ? 'text-white' : index < current ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}
            style={index === current ? { background: 'var(--theme-solid)' } : undefined}
          >
            {index < current && <Icon icon='tabler:check' width={12} className='-mt-0.5 mr-1 inline' />}
            {phase.label}
          </span>
          {index < PHASES.length - 1 && <Icon icon='tabler:chevron-right' width={16} className='mx-1 text-gray-400' />}
        </React.Fragment>
      ))}
    </div>
  )
}

// One step row: number/tick, title + why, where it happens and what it leads to, and its button.
const StepRow = ({ index, step, state, button }) => (
  <li data-setup-step={step.key} data-done={state === 'done'} className='flex items-start gap-3 rounded-lg px-2 py-2' style={state === 'next' ? { background: 'color-mix(in srgb, var(--theme-solid) 6%, transparent)' } : undefined}>
    <span
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        state === 'done' ? 'bg-emerald-500 text-white' : state === 'next' ? 'text-white' : 'bg-gray-200 text-gray-500'
      }`}
      style={state === 'next' ? { background: 'var(--theme-solid)' } : undefined}
    >
      {state === 'done' ? <Icon icon='tabler:check' width={14} /> : index + 1}
    </span>
    <div className='min-w-0 flex-1'>
      <div className={`text-[14px] ${state === 'done' ? 'text-slate-500' : 'font-semibold text-slate-800'}`}>
        {step.title}
        {step.optional && <span className='ml-2 text-xs font-normal text-gray-400'>optional</span>}
        {(step.hint || step.count) && <span className='ml-2 text-xs font-normal text-gray-500'>· {step.count || step.hint}</span>}
      </div>
      {state !== 'done' && (
        <>
          <div className='mt-0.5 text-[13px] text-slate-600'>{step.why}</div>
          <div className='mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500'>
            <span>
              <Icon icon='tabler:map-pin' width={13} className='-mt-0.5 mr-1 inline' />
              {step.where}
            </span>
            <span>
              <Icon icon='tabler:arrow-right' width={13} className='-mt-0.5 mr-1 inline' />
              Then: {step.next}
            </span>
          </div>
        </>
      )}
    </div>
    {button}
  </li>
)

const linkButton = 'shrink-0 cursor-pointer text-[13px] font-semibold hover:underline'

// One line under the status stepper on every tab until the project is Active.
export const NextStepBar = ({ project, canEdit, onEdit, onTab, onStatus }) => {
  const step = nextSetupStep(project)
  const run = useRun({ onEdit, onTab, onStatus })
  if (!step || ['Active', 'On Hold', 'Closed'].includes(project.status)) return null
  // Status buttons only work when the move is allowed from here (for example Approve only while Pending Approval).
  const allowed = step.action.kind !== 'status' || project.next_statuses.includes(step.action.status)

  return (
    <div
      data-next-step={step.key}
      className='mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-2'
      style={{ borderColor: 'var(--theme-solid)', background: 'color-mix(in srgb, var(--theme-solid) 6%, transparent)' }}
    >
      <Icon icon='tabler:arrow-right-circle' width={20} style={{ color: 'var(--theme-solid)' }} />
      <div className='min-w-0 flex-1'>
        <div className='text-[14px] font-semibold text-slate-800'>Next step: {step.title}</div>
        <div className='text-xs text-gray-500'>
          {step.hint} · {step.where}
        </div>
      </div>
      {canEdit && allowed && <PrimaryButton onClick={() => run(step.action)}>{step.action.label}</PrimaryButton>}
    </div>
  )
}

const GuideCard = ({ title, subtitle, status, right, children }) => {
  const [hidden, toggle] = useGuideHidden()

  return (
    <section className='mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm' data-setup-checklist>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2'>
        <div>
          <div className='text-[15px] font-semibold text-slate-800'>{title}</div>
          <div className='text-xs text-gray-500'>{subtitle}</div>
        </div>
        <div className='flex items-center gap-3'>
          {right}
          <button type='button' onClick={toggle} className={linkButton} style={{ color: 'var(--theme-solid)' }} data-guide-toggle>
            {hidden ? 'Show guide' : 'Hide guide'}
          </button>
        </div>
      </div>
      {!hidden && (
        <>
          <PhaseBar status={status} />
          {children}
        </>
      )}
    </section>
  )
}

// The full checklist on the Overview tab while the project is being set up and approved.
export const SetupChecklist = ({ project, canEdit, onEdit, onTab, onStatus }) => {
  const steps = setupSteps(project)
  const next = nextSetupStep(project)
  const run = useRun({ onEdit, onTab, onStatus })
  const doneCount = steps.filter(s => s.done).length

  return (
    <GuideCard
      title='Project setup'
      subtitle='Do these in order. Each step says why it matters, where to do it and what comes next.'
      status={project.status}
      right={<span className='text-xs font-medium tabular-nums text-gray-500'>{doneCount} of {steps.length} done</span>}
    >
      <ol className='flex flex-col gap-1'>
        {steps.map((step, index) => {
          const allowed = step.action.kind !== 'status' || project.next_statuses.includes(step.action.status)
          const state = step.done ? 'done' : next?.key === step.key ? 'next' : 'todo'

          return (
            <StepRow
              key={step.key}
              index={index}
              step={step}
              state={state}
              button={
                canEdit && !step.done && allowed ? (
                  <button type='button' onClick={() => run(step.action)} className={`${linkButton} mt-0.5`} style={{ color: 'var(--theme-solid)' }}>
                    {step.action.label}
                  </button>
                ) : null
              }
            />
          )
        })}
      </ol>
    </GuideCard>
  )
}

// On the Overview tab while the project is Active / On Hold: the screens used to run it, in order.
export const RunningGuide = ({ project, onTab }) => (
  <GuideCard
    title='Running the project'
    subtitle='The screens you use every week, in the order the work and the money flow through them.'
    status={project.status}
  >
    <ol className='flex flex-col gap-1' data-running-guide>
      {runSteps(project).map((step, index) => (
        <StepRow
          key={step.key}
          index={index}
          step={step}
          state='todo'
          button={
            step.action?.kind === 'tab' ? (
              <button type='button' onClick={() => onTab(step.action.tab)} className={`${linkButton} mt-0.5`} style={{ color: 'var(--theme-solid)' }}>
                {step.action.label}
              </button>
            ) : step.action?.kind === 'link' ? (
              <Link href={step.action.href} className={`${linkButton} mt-0.5`} style={{ color: 'var(--theme-solid)' }}>
                {step.action.label}
              </Link>
            ) : null
          }
        />
      ))}
    </ol>
  </GuideCard>
)
