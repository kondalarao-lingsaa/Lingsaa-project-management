import React, { useState } from 'react'
import { Menu, MenuItem } from '@mui/material'
import { Edit, Ellipsis, PlusCircle, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { AllocationBar, Chip, formatDate, inr, NameAvatar, PrimaryButton } from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { staffsProject, useMe } from 'src/pms/access/useAccess'
import { useGetProjectMembersQuery, useRemoveProjectMemberMutation } from 'src/store/apps/pms/teamApi'
import MemberDrawer from './MemberDrawer'
import usePagedRows from 'src/pms/components/usePagedRows'

const ROLE_TONE = { 'Project Manager': 'violet', 'Team Lead': 'blue', Developer: 'blue', 'Tester / QA': 'amber', Designer: 'orange', 'Business Analyst': 'green' }

// Project Details > Team: who works on the project, their share of time, rate and workload.
const ProjectTeamTab = ({ project }) => {
  const { userPermissions } = usePmsPermissions(getScreen('resources.team')?.permissionName)
  const { me } = useMe()
  const canEdit = Boolean(userPermissions?.edit) && project.status !== 'Closed' && staffsProject(me, project)

  const { data, isFetching } = useGetProjectMembersQuery(project.id)
  const [removeMember, { isLoading: isRemoving }] = useRemoveProjectMemberMutation()
  const [drawer, setDrawer] = useState(null) // { member } or { member: null } for add
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuRow, setMenuRow] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)

  const members = data?.detail || []
  const { pageRows, pager } = usePagedRows(members)
  const fte = members.reduce((sum, m) => sum + m.allocation_pct, 0) / 100
  const open = members.reduce((sum, m) => sum + m.open_tasks, 0)
  const overdue = members.reduce((sum, m) => sum + m.overdue_tasks, 0)
  const notPlanned = members.filter(m => !m.allocation_pct).length

  const remove = async () => {
    try {
      const resp = await removeMember({ projectId: project.id, memberId: removeTarget.id }).unwrap()
      toast.success(resp?.detail || 'Member removed')
    } catch {
      // The shared base query already showed why (e.g. open tasks).
    } finally {
      setRemoveTarget(null)
    }
  }

  const closeMenu = () => setAnchorEl(null)

  return (
    <div>
      <MemberDrawer open={Boolean(drawer)} onClose={() => setDrawer(null)} project={project} member={drawer?.member || null} />
      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={remove}
        title='Remove from team?'
        message={removeTarget ? `${removeTarget.member_name} will leave ${project.project_code}. Members with open tasks must hand them over first.` : ''}
        confirmText='Remove'
        cancelText='Cancel'
        busy={isRemoving}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard icon='tabler:users' tone='indigo' label='Team Members' value={members.length} hint={notPlanned ? `${notPlanned} without planned time` : 'all planned'} />
        <StatCard icon='tabler:clock-hour-4' tone='violet' label='Planned Effort' value={`${fte.toFixed(1)} FTE`} hint='sum of allocation (1 FTE = full-time)' />
        <StatCard icon='tabler:list-check' tone='blue' label='Open Tasks' value={open} hint='assigned to members' />
        <StatCard icon='tabler:alarm' tone='red' label='Overdue' value={overdue} hint='past due, not done' />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='flex flex-wrap items-center justify-between gap-2 p-3'>
          <div>
            <div className='text-[15px] font-semibold text-slate-800'>Team</div>
            <div className='text-xs text-gray-500'>Only these people can be assigned this project&apos;s tasks.</div>
          </div>
          {canEdit && (
            <PrimaryButton onClick={() => setDrawer({ member: null })}>
              Add Member <PlusCircle size={16} />
            </PrimaryButton>
          )}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[900px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Member', 'Role', 'Allocation', 'Hourly Rate', 'On Project', 'Tasks', 'Actions'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3 ${h === 'Actions' ? 'pms-sticky-head sticky right-0 z-[1]' : ''}`}>
                    <div className={`pms-th-text ${h === 'Actions' ? 'text-center' : ''}`}>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center text-slate-600'>
                    {isFetching ? 'Loading team...' : 'No team yet. Add the people who will work on this project.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(m => (
                  <tr key={m.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text`}>
                      <div className='flex items-center gap-3'>
                        <NameAvatar name={m.member_name} />
                        <div className='min-w-0'>
                          <div className='font-semibold'>{m.member_name}</div>
                          {m.user_id ? (
                            <div className='text-xs text-gray-500'>{m.email || 'Login user'}</div>
                          ) : (
                            // Without a login the person cannot log hours, see the project or approve: Edit and pick them.
                            <div className='text-xs font-semibold text-amber-600' data-login-link='none' title='Edit and pick the person from the list'>
                              Not linked to a login
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3`}>
                      <Chip tone={ROLE_TONE[m.role] || 'slate'}>{m.role}</Chip>
                    </td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3`}>
                      {m.allocation_pct ? <AllocationBar value={m.allocation_pct} /> : <span className='text-xs font-semibold text-amber-600'>Not planned</span>}
                    </td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text`}>{m.hourly_rate === null ? '-' : `${inr(m.hourly_rate)}/hr`}</td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text`}>
                      {m.start_date || m.end_date ? (
                        <div className='leading-tight'>
                          <div>{formatDate(m.start_date)}</div>
                          <div className='text-gray-500'>to {formatDate(m.end_date)}</div>
                        </div>
                      ) : (
                        <span className='text-gray-400'>Whole project</span>
                      )}
                    </td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text`}>
                      <div className='flex flex-wrap gap-1'>
                        <Chip tone='blue'>{m.open_tasks} open</Chip>
                        <Chip tone='green'>{m.done_tasks} done</Chip>
                        {m.overdue_tasks > 0 && <Chip tone='red'>{m.overdue_tasks} overdue</Chip>}
                      </div>
                    </td>
                    <td className={`${ThemeStyles.tableBodyCellsHeight} pms-sticky-cell sticky right-0 !px-3`}>
                      <div className='flex justify-center'>
                        {canEdit ? (
                          <Ellipsis
                            className={ThemeStyles.tableActionsIcon}
                            onClick={e => {
                              setAnchorEl(e.currentTarget)
                              setMenuRow(m)
                            }}
                          />
                        ) : (
                          '-'
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pager}
      </div>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} autoFocus={false}>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setDrawer({ member: menuRow })
            closeMenu()
          }}
        >
          <div className={ThemeStyles.actionMenuBox}>
            <Edit className={ThemeStyles.actionMenuIcon} />
            Edit
          </div>
        </MenuItem>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            setRemoveTarget(menuRow)
            closeMenu()
          }}
        >
          <div className={`${ThemeStyles.actionMenuBox} text-red-600`}>
            <Trash2 className={`${ThemeStyles.actionMenuIcon} text-red-600`} />
            Remove
          </div>
        </MenuItem>
      </Menu>
    </div>
  )
}

export default ProjectTeamTab
