import React, { useState } from 'react'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import StatCard from 'src/pms/components/StatCard'
import { formatDate } from 'src/pms/components/ui'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectTimelineQuery, useRescheduleTaskMutation } from 'src/store/apps/pms/planningApi'
import GanttChart from './GanttChart'

const WARNING_ICON = { dependency: 'tabler:link-off', range: 'tabler:calendar-x', overdue: 'tabler:alarm', milestone: 'tabler:flag', undated: 'tabler:calendar-question' }

// Gantt of one project with its schedule warnings. Used in Project Details > Planning and Planning > Gantt.
const ProjectTimeline = ({ projectId, canEdit = true }) => {
  const { data, isFetching, isError } = useGetProjectTimelineQuery(projectId, { skip: !projectId })
  const [reschedule] = useRescheduleTaskMutation()
  const [showWarnings, setShowWarnings] = useState(true)
  const t = data?.detail

  const onReschedule = async (task, startDate, dueDate) => {
    const resp = await reschedule({ id: task.id, startDate, dueDate }).unwrap() // the base query shows the reason if refused
    toast.success(resp?.detail || `${task.key} rescheduled`)
  }

  if (!t) {
    return <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center text-sm text-gray-500`}>{isError ? 'The timeline could not be loaded.' : 'Loading timeline...'}</div>
  }

  const dated = t.tasks.filter(x => x.start && x.due)
  const lastDue = dated.reduce((max, x) => (x.due > max ? x.due : max), '')
  const editable = canEdit && t.project.status !== 'Closed'

  return (
    <div className={`transition-opacity ${isFetching ? 'opacity-70' : ''}`}>
      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:calendar-event' tone='indigo' label='Planned Tasks' value={`${dated.length} / ${t.tasks.length}`} hint='with start and due dates' />
        <StatCard icon='tabler:calendar-due' tone='violet' label='Plan Ends' value={lastDue ? formatDate(lastDue) : '-'} hint={t.project.end ? `project ends ${formatDate(t.project.end)}` : 'project has no end date'} />
        <StatCard icon='tabler:route' tone='red' label='Critical Path' value={t.critical_path.length} hint='tasks where any delay moves the end' />
        <StatCard icon='tabler:alert-triangle' tone='amber' label='Warnings' value={t.warnings.length} hint='schedule problems to look at' />
      </div>

      {t.warnings.length > 0 && (
        <div className='mb-3 rounded-xl border border-amber-300 bg-amber-100 px-3 py-2 text-amber-700'>
          <button type='button' onClick={() => setShowWarnings(v => !v)} className='flex w-full cursor-pointer items-center gap-2 text-left text-[13px] font-semibold'>
            <Icon icon='tabler:alert-triangle' width={16} /> {t.warnings.length} schedule warning{t.warnings.length === 1 ? '' : 's'}
            <Icon icon={showWarnings ? 'tabler:chevron-up' : 'tabler:chevron-down'} width={16} className='ms-auto' />
          </button>
          {showWarnings && (
            <ul className='mt-1 flex flex-col gap-1 text-[13px]'>
              {t.warnings.map((w, i) => (
                <li key={i} className='flex items-start gap-2'>
                  <Icon icon={WARNING_ICON[w.type] || 'tabler:point'} width={15} className='mt-0.5 shrink-0' />
                  {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <GanttChart data={t} canEdit={editable} onReschedule={onReschedule} />
    </div>
  )
}

export default ProjectTimeline
