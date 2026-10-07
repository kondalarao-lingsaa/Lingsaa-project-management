import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import ChooseProjectDialog from 'src/pms/components/ChooseProjectDialog'
import usePagedRows from 'src/pms/components/usePagedRows'
import { AllocationBar, allocationTone, Chip, NameAvatar, PrimaryButton } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import { useGetResourceAllocationQuery } from 'src/store/apps/pms/teamApi'
import MemberDrawer from './MemberDrawer'

const LOAD_TONE = { Full: 'red', High: 'amber', Available: 'green' }

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const Th = ({ children, center, sticky }) => (
  <th className={`${ThemeStyles.tableHeadCellsHeight} !px-3 ${sticky ? 'pms-sticky-head sticky left-0 z-[1]' : ''}`}>
    <div className={`pms-th-text ${center ? 'text-center' : ''}`}>{children}</div>
  </th>
)

const PersonCell = ({ person, sticky }) => (
  <td
    className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text ${
      sticky ? 'pms-sticky-cell sticky left-0 z-[1]' : ''
    }`}
  >
    <div className='flex items-center gap-3'>
      <NameAvatar name={person.member_name} />
      <div className='min-w-0'>
        <div className='font-semibold'>{person.member_name}</div>
        <div className='max-w-[220px] truncate text-xs text-gray-500'>{person.roles.join(', ')}</div>
      </div>
    </div>
  </td>
)

// Team directory: everyone on any active project, their projects and how loaded they are.
const TeamTable = ({ people }) => (
  <table className='w-full min-w-[980px] text-left text-sm'>
    <thead className={ThemeStyles.tableHeaderBg}>
      <tr>
        <Th>Person</Th>
        <Th>Projects</Th>
        <Th>Total Allocation</Th>
        <Th center>Free</Th>
        <Th center>Open Tasks</Th>
        <Th center>Load</Th>
      </tr>
    </thead>
    <tbody>
      {people.map(p => (
        <tr key={p.key} className='border-t border-gray-200 hover:bg-gray-50/70'>
          <PersonCell person={p} />
          <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3`}>
            <div className='flex max-w-[380px] flex-wrap gap-1'>
              {p.projects.map(pr => (
                <Link
                  key={pr.member_id}
                  href={`${projectDetailsPath(pr.project_id)}&tab=team`}
                  title={`${pr.project_name} - ${pr.role}`}
                  className='hover:opacity-80'
                >
                  <Chip tone='slate'>
                    {pr.project_code} · {pr.allocation_pct ? `${pr.allocation_pct}%` : 'not planned'}
                  </Chip>
                </Link>
              ))}
              {p.other_allocation > 0 && (
                <span title='Projects you do not have access to'>
                  <Chip tone='slate'>Other projects · {p.other_allocation}%</Chip>
                </span>
              )}
            </div>
          </td>
          <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3`}>
            <AllocationBar value={p.total_allocation} />
          </td>
          <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text text-center`}>{p.free_allocation}%</td>
          <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text text-center`}>
            {p.open_tasks}
            {p.overdue_tasks > 0 && (
              <span className='ms-1 text-xs font-semibold text-red-600'>({p.overdue_tasks} overdue)</span>
            )}
          </td>
          <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 text-center`}>
            <Chip tone={LOAD_TONE[p.load]}>{p.load}</Chip>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

// Allocation grid: people down the side, projects across the top, % in each cell.
const AllocationMatrix = ({ people }) => {
  const projects = useMemo(() => {
    const seen = new Map()
    people.forEach(p => p.projects.forEach(pr => !seen.has(pr.project_id) && seen.set(pr.project_id, pr)))

    return [...seen.values()].sort((a, b) => a.project_code.localeCompare(b.project_code))
  }, [people])

  return (
    <table className='w-full text-left text-sm' style={{ minWidth: 360 + projects.length * 110 }}>
      <thead className={ThemeStyles.tableHeaderBg}>
        <tr>
          <Th sticky>Person</Th>
          {projects.map(pr => (
            <th key={pr.project_id} className={`${ThemeStyles.tableHeadCellsHeight} !px-2`}>
              <Link
                href={`${projectDetailsPath(pr.project_id)}&tab=team`}
                title={pr.project_name}
                className='pms-th-text block text-center hover:underline'
              >
                {pr.project_code.replace(/^PRJ-/, '')}
                <div className='max-w-[110px] truncate text-[11px] font-medium text-gray-500'>{pr.project_name}</div>
              </Link>
            </th>
          ))}
          <th className={`${ThemeStyles.tableHeadCellsHeight} pms-sticky-head sticky right-0 z-[1] !px-3`}>
            <div className='pms-th-text text-center'>Total</div>
          </th>
        </tr>
      </thead>
      <tbody>
        {people.map(p => {
          const byProject = Object.fromEntries(p.projects.map(pr => [pr.project_id, pr]))

          return (
            <tr key={p.key} className='border-t border-gray-200'>
              <PersonCell person={p} sticky />
              {projects.map(pr => {
                const cell = byProject[pr.project_id]

                return (
                  <td key={pr.project_id} className='px-2 py-1.5 text-center'>
                    {cell ? (
                      <span
                        title={`${cell.role} - ${cell.open_tasks} open task(s)`}
                        className='inline-flex min-w-[52px] justify-center rounded-md px-2 py-1 text-xs font-semibold'
                        style={{
                          background: cell.allocation_pct
                            ? `color-mix(in srgb, var(--theme-solid) ${Math.max(
                                10,
                                cell.allocation_pct * 0.6
                              )}%, transparent)`
                            : 'transparent',
                          border: cell.allocation_pct ? 'none' : '1px dashed #d1d5db'
                        }}
                      >
                        {cell.allocation_pct ? `${cell.allocation_pct}%` : '0%'}
                      </span>
                    ) : (
                      <span className='text-gray-300'>·</span>
                    )}
                  </td>
                )
              })}
              <td className='pms-sticky-cell sticky right-0 px-3 py-1.5 text-center'>
                <span
                  className='text-sm font-bold tabular-nums'
                  style={{ color: allocationTone(p.total_allocation) || undefined }}
                >
                  {p.total_allocation}%
                </span>
                {p.other_allocation > 0 && (
                  <div className='text-[11px] text-gray-500' title='Projects you do not have access to'>
                    incl. {p.other_allocation}% other
                  </div>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// mode 'team' = Resources > Team, 'allocation' = Resources > Resource Allocation (same data, two views).
const ResourcesView = ({ mode = 'team' }) => {
  const can = useCan()
  const screenId = mode === 'allocation' ? 'resources.allocation' : 'resources.team'
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const [busyOnly, setBusyOnly] = useState(false)
  const { data, isFetching } = useGetResourceAllocationQuery({ search, overOnly: busyOnly })

  const people = data?.detail || []
  const { pageRows: pagePeople, pager } = usePagedRows(people, { resetKey: `${search}|${busyOnly}` })
  // Add Member: choose the project, then the same form as Project Details > Team.
  const [chooser, setChooser] = useState(false)
  const [memberProject, setMemberProject] = useState(null)
  const sv = data?.stack_values || {}

  return (
    <PmsPage
      screenId={screenId}
      actions={
        can('resources', 'add') && (
          <PrimaryButton onClick={() => setChooser(true)}>
            Add Member <PlusCircle size={16} />
          </PrimaryButton>
        )
      }
    >
      <ChooseProjectDialog
        open={chooser}
        title='Add Member'
        onClose={() => setChooser(false)}
        onChoose={project => {
          setChooser(false)
          setMemberProject(project)
        }}
      />
      <MemberDrawer
        open={Boolean(memberProject)}
        onClose={() => setMemberProject(null)}
        project={memberProject}
        member={null}
      />
      <p className='-mt-1 mb-3 text-sm text-gray-500'>
        {mode === 'allocation'
          ? "How each person's time is split across active projects. 100% = fully booked."
          : 'Everyone working on an active project, and how much of their time is still free.'}
      </p>

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:users-group'
          tone='indigo'
          label='People'
          value={sv.count_pg || 0}
          hint='on active projects'
        />
        <StatCard icon='tabler:battery-4' tone='red' label='Fully Booked' value={sv.full || 0} hint='100% allocated' />
        <StatCard icon='tabler:battery-3' tone='amber' label='Nearly Full' value={sv.high || 0} hint='80% to 99%' />
        <StatCard icon='tabler:battery-1' tone='emerald' label='Available' value={sv.available || 0} hint='below 80%' />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
          <input
            type='text'
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with Person, Role, Project...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
          />
          <button
            type='button'
            onClick={() => setBusyOnly(v => !v)}
            className={`filterCustBtn ${busyOnly ? 'active' : ''}`}
          >
            <Icon icon='tabler:flame' width={16} /> Busy people (80%+)
          </button>
          <span className='text-sm text-gray-500 md:ms-auto'>
            {isFetching ? 'Loading...' : `${people.length} ${people.length === 1 ? 'person' : 'people'}`}
          </span>
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          {people.length === 0 ? (
            <div className='py-12 text-center text-sm text-slate-600'>
              {isFetching
                ? 'Loading...'
                : search || busyOnly
                ? 'Nobody matches your search or filter.'
                : 'No team members yet. Click Add Member to add someone to a project.'}
            </div>
          ) : mode === 'allocation' ? (
            <AllocationMatrix people={pagePeople} />
          ) : (
            <TeamTable people={pagePeople} />
          )}
        </div>
        {pager}
      </div>
    </PmsPage>
  )
}

export default ResourcesView
