import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Menu, MenuItem } from '@mui/material'
import { Edit, Eye, PlusCircle, Trash2, Ellipsis } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import StatCard from 'src/pms/components/StatCard'
import PmsPagination from 'src/pms/components/PmsPagination'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import ListToolbar, { useHiddenColumns } from 'src/pms/components/ListToolbar'
import { Chip, formatDate, inr, NameAvatar, PrimaryButton, PRIORITY_TONE, ProgressBar, StatusPill } from 'src/pms/components/ui'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { runsProject, useMe } from 'src/pms/access/useAccess'
import { getScreen, PMS_BASE } from 'src/pms/config/pmsModules'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import ProjectDrawer from './ProjectDrawer'
import { useDeleteProjectMutation, useGetProjectListQuery, useGetProjectMetaQuery } from 'src/store/apps/pms/projectsApi'

export const projectDetailsPath = id => `${PMS_BASE}/projects/projectDetails/?id=${id}`

const COLUMNS = [
  { key: 'project_code', label: 'Project Code', sortable: true, fixed: true },
  { key: 'project_name', label: 'Project', sortable: true, fixed: true },
  { key: 'status', label: 'Status', sortable: true, align: 'center' },
  { key: 'project_manager_name', label: 'Manager' },
  { key: 'start_date', label: 'Timeline', sortable: true },
  { key: 'progress', label: 'Progress' },
  { key: 'budget', label: 'Budget', sortable: true, align: 'right' },
  { key: 'priority', label: 'Priority', sortable: true, align: 'center' },
  { key: 'actions', label: 'Actions', align: 'center', fixed: true }
]

const useDebouncedValue = (value, delay = 600) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

// scope 'all' lists every project in the company; 'mine' lists the ones the user created or manages.
const ProjectsListView = ({ screenId, scope = 'all', subtitle }) => {
  const mine = scope === 'mine'
  const router = useRouter()
  const screen = getScreen(screenId)
  const { userPermissions } = usePmsPermissions(screen?.permissionName)

  const [pagination, setPagination] = useState({
    search: '',
    status: '',
    priority: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    currentPage: 1,
    itemsPerPage: 5
  })
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput)

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [anchorEl, setAnchorEl] = useState(null)
  const [menuRow, setMenuRow] = useState(null)
  const { me } = useMe()

  // Same rules as the project's details page (and the server): only whoever runs the project edits or deletes it;
  // no edits while it waits for approval; after approval only an Admin deletes (others close it).
  const runsRow = runsProject(me, menuRow)
  const canEditRow = Boolean(userPermissions?.edit) && runsRow && !['Closed', 'Pending Approval'].includes(menuRow?.status)
  const canDeleteRow =
    Boolean(userPermissions?.delete) && runsRow && (['Draft', 'Pending Approval'].includes(menuRow?.status) || me?.role === 'admin')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [hiddenColumns, toggleColumn] = useHiddenColumns(`pms.columns.${screenId}`)
  const visibleColumns = COLUMNS.filter(col => col.fixed || !hiddenColumns.includes(col.key))

  const { data: listResp, isFetching } = useGetProjectListQuery({ ...pagination, mine })
  const { data: metaResp } = useGetProjectMetaQuery()
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()

  const rows = Array.isArray(listResp?.detail) ? listResp.detail : []
  const total = listResp?.stack_values?.count_pg || 0
  const counts = useMemo(() => listResp?.stack_values?.status_counts || {}, [listResp])
  const allCount = listResp?.stack_values?.all_count || 0
  const meta = metaResp?.detail

  useEffect(() => {
    setPagination(prev => (prev.search === debouncedSearch ? prev : { ...prev, search: debouncedSearch, currentPage: 1 }))
  }, [debouncedSearch])

  // Sidebar "+" quick-add lands here with ?openCreate=1.
  useEffect(() => {
    if (router.isReady && router.query.openCreate === '1' && userPermissions?.add) {
      setSelectedId(null)
      setDrawerOpen(true)
      router.replace(router.pathname, undefined, { shallow: true })
    }
  }, [router, router.isReady, router.query.openCreate, userPermissions?.add])

  const stats = useMemo(
    () => [
      { label: mine ? 'My Projects' : 'Total', value: allCount, icon: 'tabler:briefcase', tone: 'indigo' },
      { label: 'Active', value: counts.Active || 0, icon: 'tabler:circle-check', tone: 'emerald' },
      { label: 'Pending Approval', value: counts['Pending Approval'] || 0, icon: 'tabler:file-time', tone: 'amber' },
      { label: 'On Hold', value: counts['On Hold'] || 0, icon: 'tabler:player-pause', tone: 'orange' },
      { label: 'Closed', value: counts.Closed || 0, icon: 'tabler:archive', tone: 'violet' }
    ],
    [allCount, counts, mine]
  )

  const setFilter = (name, value) => setPagination(prev => ({ ...prev, [name]: value, currentPage: 1 }))

  const handleSort = key =>
    setPagination(prev => ({
      ...prev,
      sortBy: key,
      sortOrder: prev.sortBy === key && prev.sortOrder === 'asc' ? 'desc' : 'asc',
      currentPage: 1
    }))

  const closeMenu = () => {
    setAnchorEl(null)
    setMenuRow(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const resp = await deleteProject(deleteTarget.id).unwrap()
      toast.success(resp?.detail || 'Project deleted')
      if (rows.length === 1 && pagination.currentPage > 1) {
        setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))
      }
    } catch {
      // The shared base query already showed the error.
    } finally {
      setDeleteTarget(null)
    }
  }

  const renderCell = (row, col) => {
    switch (col.key) {
      case 'project_code':
        return (
          <Link href={projectDetailsPath(row.id)} className={ThemeStyles.listNoColor}>
            {row.project_code}
          </Link>
        )
      case 'project_name':
        return (
          <div className='flex min-w-0 items-center gap-3'>
            <NameAvatar name={row.project_name} />
            <div className='min-w-0'>
              <Link href={projectDetailsPath(row.id)} title={row.project_name} className={`${ThemeStyles.tablePartyNameText} block max-w-[230px] truncate hover:underline`}>
                {row.project_name}
              </Link>
              <div className='max-w-[230px] truncate text-xs text-gray-500'>{row.customer_name || 'No client'}</div>
            </div>
          </div>
        )
      case 'project_manager_name':
        return row.project_manager_name || '-'
      case 'start_date':
        if (!row.start_date && !row.end_date) return <span className='text-[13px] text-gray-400'>Not scheduled</span>

        return (
          <div className='leading-tight'>
            <div>{formatDate(row.start_date)}</div>
            <div className='text-gray-500'>to {formatDate(row.end_date)}</div>
          </div>
        )
      case 'progress':
        return (
          <div className='w-28'>
            <div className='mb-1 flex justify-between text-xs text-gray-500'>
              <Link href={`${projectDetailsPath(row.id)}&tab=tasks`} className='hover:underline' style={{ color: 'var(--theme-solid)' }}>
                {row.task_count} tasks
              </Link>
              <span className='pms-td-text font-semibold'>{row.progress}%</span>
            </div>
            <ProgressBar value={row.progress} />
          </div>
        )
      case 'budget':
        return row.budget === null ? '-' : inr(row.budget)
      case 'priority':
        return <Chip tone={PRIORITY_TONE[row.priority]}>{row.priority}</Chip>
      case 'status':
        return <StatusPill status={row.status} />
      case 'actions':
        return <Ellipsis className={ThemeStyles.tableActionsIcon} onClick={e => { setAnchorEl(e.currentTarget); setMenuRow(row) }} />
      default:
        return row[col.key] || '-'
    }
  }

  const alignClass = align => (align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : '')
  const filtered = Boolean(pagination.search || pagination.status || pagination.priority)

  const addButton = userPermissions?.add ? (
    <PrimaryButton onClick={() => { setSelectedId(null); setDrawerOpen(true) }}>
      Add Project <PlusCircle size={16} />
    </PrimaryButton>
  ) : null

  return (
    <PmsPage screenId={screenId} actions={addButton}>
      <ProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={selectedId}
        meta={meta}
        // A new project opens in Project Details, where the setup checklist shows what to do next.
        onSuccess={resp => !selectedId && resp?.data?.id && router.push(projectDetailsPath(resp.data.id))}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title='Delete project?'
        message={deleteTarget ? `${deleteTarget.project_code} - ${deleteTarget.project_name} will be removed from the list.` : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      {subtitle && <p className='-mt-1 mb-3 text-sm text-gray-500'>{subtitle}</p>}

      <div className='mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5'>
        {stats.map(stat => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className={`overflow-hidden rounded-lg ${ThemeStyles.tableColor}`}>
        <ListToolbar
          searchValue={searchInput}
          onSearch={setSearchInput}
          placeholder='Search with Project Name, Code, Client, Manager...'
          activeFilterCount={pagination.priority ? 1 : 0}
          columns={COLUMNS}
          hidden={hiddenColumns}
          onToggleColumn={toggleColumn}
          filterPanel={
            <div className='w-full md:w-[23%] xl:w-[23%] 2xl:w-[18%]'>
              <span className={ThemeStyles.formLabels}>Priority</span>
              <select value={pagination.priority} onChange={e => setFilter('priority', e.target.value)} className={ThemeStyles.formsInputsDropdown}>
                <option value=''>All Priorities</option>
                {(meta?.priorities || []).map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          }
        />

        <div className='flex flex-wrap gap-2 px-3 pb-3 pt-1'>
          {[['', 'All', allCount], ...(meta?.statuses || []).map(s => [s, s, counts[s] || 0])].map(([value, label, count]) => {
            const active = pagination.status === value

            return (
              <button
                key={label}
                type='button'
                onClick={() => setFilter('status', value)}
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition ${
                  active ? 'border-transparent text-white' : 'border-gray-300 bg-white text-slate-600 hover:bg-gray-50'
                }`}
                style={active ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' } : undefined}
              >
                {label} <span className={active ? 'opacity-90' : 'text-gray-400'}>({count})</span>
              </button>
            )
          })}
        </div>

        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[1080px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {visibleColumns.map(col => (
                  <th key={col.key} className={`${ThemeStyles.tableHeadCellsHeight} !px-3 ${col.sortable ? 'cursor-pointer select-none' : ''} ${col.key === 'actions' ? 'pms-sticky-head sticky right-0 z-[1]' : ''}`} onClick={() => col.sortable && handleSort(col.key)}>
                    <div className={`flex items-center gap-1 pms-th-text ${alignClass(col.align)}`}>
                      {col.label}
                      {pagination.sortBy === col.key && <span className='text-xs'>{pagination.sortOrder === 'asc' ? '▲' : '▼'}</span>}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map(row => (
                  <tr key={row.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    {visibleColumns.map(col => (
                      <td key={col.key} className={`${ThemeStyles.tableBodyCellsHeight} !px-3 pms-td-text ${col.key === 'actions' ? 'pms-sticky-cell sticky right-0' : ''}`}>
                        <div className={`flex ${alignClass(col.align)}`}>{renderCell(row, col)}</div>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={visibleColumns.length} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading projects...'
                      : filtered
                        ? 'No projects match your search or filters.'
                        : mine
                          ? "You aren't part of any project yet. Projects you create or manage will appear here."
                          : "You don't have any projects yet, please create a new one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PmsPagination
          pagination={pagination}
          handleChange={page => setPagination(prev => ({ ...prev, currentPage: page }))}
          handleipp={value => setPagination(prev => ({ ...prev, itemsPerPage: value, currentPage: 1 }))}
          total={total}
        />
      </div>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} autoFocus={false}>
        <MenuItem
          className={ThemeStyles.actionMenuItem}
          onClick={() => {
            router.push(projectDetailsPath(menuRow.id))
            closeMenu()
          }}
        >
          <div className={ThemeStyles.actionMenuBox}>
            <Eye className={ThemeStyles.actionMenuIcon} />
            View
          </div>
        </MenuItem>
        {canEditRow && (
          <MenuItem
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              setSelectedId(menuRow.id)
              setDrawerOpen(true)
              closeMenu()
            }}
          >
            <div className={ThemeStyles.actionMenuBox}>
              <Edit className={ThemeStyles.actionMenuIcon} />
              Edit
            </div>
          </MenuItem>
        )}
        {canDeleteRow && (
          <MenuItem
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              setDeleteTarget(menuRow)
              closeMenu()
            }}
          >
            <div className={`${ThemeStyles.actionMenuBox} text-red-600`}>
              <Trash2 className={`${ThemeStyles.actionMenuIcon} text-red-600`} />
              Delete
            </div>
          </MenuItem>
        )}
      </Menu>
    </PmsPage>
  )
}

export default ProjectsListView
