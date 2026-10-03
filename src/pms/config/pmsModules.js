// Single source of truth for the Project Management module structure.
// Drives: sidebar (pmsNav.js), page shells (pages/appModules/projects/**), role matrix (pmsRoles.js).
// A screen's route is `${PMS_BASE}/${group.key}/${screen.key}` (or `${PMS_BASE}/${group.key}` for single-screen groups).
// That route MUST equal the nav_link_fe registered in Master Admin -> Nav Items, and
// `permissionName` is the component name passed to usePermissionId().
// `perm` = the PMS role right a screen needs ({ group, action }, server groups in app/core/roles.py);
// without it a screen needs "view" on its module group. Screens and the sidebar use it to follow the login's role.

export const PMS_BASE = '/appModules/projects'

export const PMS_MODULES = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    icon: 'tabler:layout-dashboard',
    screens: [{ key: null, title: 'Dashboard', permissionName: 'PMS Dashboard' }]
  },
  {
    key: 'approvals',
    title: 'My Approvals',
    icon: 'tabler:rosette-discount-check',
    screens: [{ key: null, title: 'My Approvals', permissionName: 'PMS Approvals' }]
  },
  {
    // Client logins see only this: their own projects, milestones to accept, shared files, invoices, messages.
    key: 'portal',
    title: 'Client Portal',
    icon: 'tabler:building-store',
    screens: [
      { key: null, title: 'My Projects', permissionName: 'PMS Client Portal' },
      { key: 'project', title: 'Project', permissionName: 'PMS Client Portal', hidden: true }
    ]
  },
  {
    key: 'projects',
    title: 'Projects',
    icon: 'tabler:briefcase',
    screens: [
      { key: 'allProjects', title: 'All Projects', permissionName: 'PMS All Projects' },
      { key: 'myProjects', title: 'My Projects', permissionName: 'PMS My Projects' },
      { key: 'projectDetails', title: 'Project Details', permissionName: 'PMS Project Details', hidden: true },
      // Opened from Project Details > Settings (it needs a project), so not in the sidebar.
      { key: 'projectSettings', title: 'Project Settings', permissionName: 'PMS Project Settings', hidden: true },
      { key: 'projectTemplates', title: 'Project Templates', permissionName: 'PMS Project Templates', perm: { group: 'projects', action: 'add' } }
    ]
  },
  {
    key: 'planning',
    title: 'Planning',
    icon: 'tabler:timeline',
    screens: [
      { key: 'roadmap', title: 'Roadmap', permissionName: 'PMS Roadmap' },
      { key: 'gantt', title: 'Gantt / Timeline', permissionName: 'PMS Gantt', tabs: 'schedule', tabLabel: 'Gantt' },
      { key: 'wbs', title: 'WBS', permissionName: 'PMS WBS', hidden: true, tabs: 'schedule', tabLabel: 'WBS' },
      { key: 'dependencies', title: 'Dependencies', permissionName: 'PMS Dependencies', hidden: true, tabs: 'schedule', tabLabel: 'Dependencies' },
      // Same screen as Milestones & Deliverables; kept only so old links keep working.
      { key: 'milestones', title: 'Milestones', permissionName: 'PMS Milestones', hidden: true }
    ]
  },
  {
    key: 'tasks',
    title: 'Tasks',
    icon: 'tabler:checklist',
    screens: [
      { key: 'myTasks', title: 'My Tasks', permissionName: 'PMS My Tasks' },
      { key: 'allTasks', title: 'All Tasks', permissionName: 'PMS All Tasks' },
      { key: 'taskDetails', title: 'Task Details', permissionName: 'PMS Task Details', hidden: true },
      { key: 'kanban', title: 'Kanban Board', permissionName: 'PMS Kanban Board' },
      { key: 'backlog', title: 'Backlog', permissionName: 'PMS Backlog' },
      { key: 'calendar', title: 'Task Calendar', permissionName: 'PMS Task Calendar' }
    ]
  },
  {
    key: 'sprints',
    title: 'Sprints',
    icon: 'tabler:run',
    screens: [
      { key: 'sprintList', title: 'Sprint List', permissionName: 'PMS Sprint List' },
      { key: 'sprintPlanning', title: 'Sprint Planning', permissionName: 'PMS Sprint Planning' },
      { key: 'sprintBoard', title: 'Sprint Board', permissionName: 'PMS Sprint Board' }
    ]
  },
  {
    key: 'resources',
    title: 'Resources',
    icon: 'tabler:users-group',
    screens: [
      { key: 'team', title: 'Team & Allocation', permissionName: 'PMS Team', tabs: 'people', tabLabel: 'Team' },
      { key: 'allocation', title: 'Resource Allocation', permissionName: 'PMS Resource Allocation', hidden: true, tabs: 'people', tabLabel: 'Allocation' },
      { key: 'utilization', title: 'Utilization', permissionName: 'PMS Utilization' },
      { key: 'capacity', title: 'Capacity', permissionName: 'PMS Capacity' }
    ]
  },
  {
    key: 'timesheets',
    title: 'Timesheets',
    icon: 'tabler:clock-hour-4',
    screens: [
      { key: 'myTimesheets', title: 'My Timesheets', permissionName: 'PMS My Timesheets' },
      { key: 'teamTimesheets', title: 'Team Timesheets', permissionName: 'PMS Team Timesheets', perm: { group: 'timesheets', action: 'approve' } },
      { key: 'approval', title: 'Approval', permissionName: 'PMS Timesheet Approval', perm: { group: 'timesheets', action: 'approve' } }
    ]
  },
  {
    key: 'budget',
    title: 'Budget & Costs',
    icon: 'tabler:coin',
    screens: [
      { key: 'budget', title: 'Budget', permissionName: 'PMS Budget' },
      { key: 'expenses', title: 'Expenses', permissionName: 'PMS Expenses', perm: { group: 'expenses', action: 'view' } },
      { key: 'actualCost', title: 'Cost Analysis', permissionName: 'PMS Actual Cost', tabs: 'cost', tabLabel: 'Actual Cost' },
      { key: 'variance', title: 'Variance', permissionName: 'PMS Variance', hidden: true, tabs: 'cost', tabLabel: 'Variance' }
    ]
  },
  {
    key: 'deliverables',
    title: 'Milestones & Deliverables',
    icon: 'tabler:package',
    screens: [{ key: null, title: 'Milestones & Deliverables', permissionName: 'PMS Deliverables' }]
  },
  {
    key: 'risks',
    title: 'Risks & Issues',
    icon: 'tabler:alert-triangle',
    screens: [
      { key: 'risks', title: 'Risks', permissionName: 'PMS Risks' },
      { key: 'issues', title: 'Issues', permissionName: 'PMS Issues' },
      { key: 'changeRequests', title: 'Change Requests', permissionName: 'PMS Change Requests' }
    ]
  },
  {
    key: 'documents',
    title: 'Documents',
    icon: 'tabler:files',
    screens: [{ key: null, title: 'Documents', permissionName: 'PMS Documents' }]
  },
  {
    key: 'communication',
    title: 'Communication',
    icon: 'tabler:messages',
    screens: [
      { key: 'comments', title: 'Comments', permissionName: 'PMS Comments', tabs: 'comm', tabLabel: 'Comments' },
      { key: 'mentions', title: 'Mentions', permissionName: 'PMS Mentions', hidden: true, tabs: 'comm', tabLabel: 'Mentions' },
      { key: 'activity', title: 'Activity', permissionName: 'PMS Activity', hidden: true, tabs: 'comm', tabLabel: 'Activity' }
    ]
  },
  {
    key: 'billing',
    title: 'Billing',
    icon: 'tabler:receipt',
    screens: [{ key: null, title: 'Billing', permissionName: 'PMS Billing' }]
  },
  {
    key: 'reports',
    title: 'Reports',
    icon: 'tabler:chart-bar',
    screens: [{ key: null, title: 'Reports', permissionName: 'PMS Reports' }]
  },
  {
    key: 'settings',
    title: 'Settings',
    icon: 'tabler:settings',
    screens: [
      { key: null, title: 'Settings', permissionName: 'PMS Settings', tabs: 'settings', tabLabel: 'Company Settings' },
      // Users, the permission matrix and approval rules: who may do what.
      { key: 'access', title: 'Users & Access', permissionName: 'PMS Users & Access', hidden: true, tabs: 'settings', tabLabel: 'Users & Access' }
    ]
  }
]

export const screenPath = (group, screen) =>
  screen.key ? `${PMS_BASE}/${group.key}/${screen.key}` : `${PMS_BASE}/${group.key}`

// Screens that share a `tabs` key are one sidebar entry; the page shows a tab row to switch between them
// (the others are hidden from the sidebar but keep their own route, so links and permissions still work).
// Flat list used by page shells: [{ id: 'tasks.kanban', path, title, groupTitle, permissionName }]
export const PMS_SCREENS = PMS_MODULES.flatMap(group =>
  group.screens.map(screen => ({
    id: screen.key ? `${group.key}.${screen.key}` : group.key,
    path: screenPath(group, screen),
    title: screen.title,
    groupTitle: group.title,
    permissionName: screen.permissionName,
    perm: screen.perm || { group: group.key, action: 'view' },
    hidden: !!screen.hidden,
    tabs: screen.tabs || null,
    tabLabel: screen.tabLabel || screen.title
  }))
)

export const getScreen = id => PMS_SCREENS.find(s => s.id === id)

export const getScreenByPermission = permissionName => PMS_SCREENS.find(s => s.permissionName === permissionName)

// The tab row for a screen: every screen of the same group with the same `tabs` key, in config order.
export const getScreenTabs = id => {
  const screen = getScreen(id)
  if (!screen?.tabs) return []
  const group = id.split('.')[0]

  return PMS_SCREENS.filter(s => s.tabs === screen.tabs && s.id.split('.')[0] === group)
}
