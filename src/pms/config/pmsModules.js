// Single source of truth for the Project Management module structure.
// Drives: sidebar (pmsNav.js), page shells (pages/appModules/projects/**), role matrix (pmsRoles.js).
// A screen's route is `${PMS_BASE}/${group.key}/${screen.key}` (or `${PMS_BASE}/${group.key}` for single-screen groups).
// That route MUST equal the nav_link_fe registered in Master Admin -> Nav Items, and
// `permissionName` is the component name passed to usePermissionId().

export const PMS_BASE = '/appModules/projects'

export const PMS_MODULES = [
  {
    key: 'dashboard',
    title: 'Dashboard',
    icon: 'tabler:layout-dashboard',
    screens: [{ key: null, title: 'Dashboard', permissionName: 'PMS Dashboard' }]
  },
  {
    key: 'projects',
    title: 'Projects',
    icon: 'tabler:briefcase',
    screens: [
      { key: 'allProjects', title: 'All Projects', permissionName: 'PMS All Projects' },
      { key: 'myProjects', title: 'My Projects', permissionName: 'PMS My Projects' },
      { key: 'projectDetails', title: 'Project Details', permissionName: 'PMS Project Details', hidden: true },
      { key: 'projectSettings', title: 'Project Settings', permissionName: 'PMS Project Settings' },
      { key: 'projectTemplates', title: 'Project Templates', permissionName: 'PMS Project Templates' }
    ]
  },
  {
    key: 'planning',
    title: 'Planning',
    icon: 'tabler:timeline',
    screens: [
      { key: 'roadmap', title: 'Roadmap', permissionName: 'PMS Roadmap' },
      { key: 'wbs', title: 'WBS', permissionName: 'PMS WBS' },
      { key: 'milestones', title: 'Milestones', permissionName: 'PMS Milestones' },
      { key: 'dependencies', title: 'Dependencies', permissionName: 'PMS Dependencies' },
      { key: 'gantt', title: 'Gantt / Timeline', permissionName: 'PMS Gantt' }
    ]
  },
  {
    key: 'tasks',
    title: 'Tasks',
    icon: 'tabler:checklist',
    screens: [
      { key: 'myTasks', title: 'My Tasks', permissionName: 'PMS My Tasks' },
      { key: 'allTasks', title: 'All Tasks', permissionName: 'PMS All Tasks' },
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
      { key: 'team', title: 'Team', permissionName: 'PMS Team' },
      { key: 'allocation', title: 'Resource Allocation', permissionName: 'PMS Resource Allocation' },
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
      { key: 'teamTimesheets', title: 'Team Timesheets', permissionName: 'PMS Team Timesheets' },
      { key: 'approval', title: 'Approval', permissionName: 'PMS Timesheet Approval' }
    ]
  },
  {
    key: 'budget',
    title: 'Budget & Costs',
    icon: 'tabler:coin',
    screens: [
      { key: 'budget', title: 'Budget', permissionName: 'PMS Budget' },
      { key: 'expenses', title: 'Expenses', permissionName: 'PMS Expenses' },
      { key: 'actualCost', title: 'Actual Cost', permissionName: 'PMS Actual Cost' },
      { key: 'variance', title: 'Variance', permissionName: 'PMS Variance' }
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
      { key: 'comments', title: 'Comments', permissionName: 'PMS Comments' },
      { key: 'mentions', title: 'Mentions', permissionName: 'PMS Mentions' },
      { key: 'activity', title: 'Activity', permissionName: 'PMS Activity' }
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
    screens: [{ key: null, title: 'Settings', permissionName: 'PMS Settings' }]
  }
]

export const screenPath = (group, screen) =>
  screen.key ? `${PMS_BASE}/${group.key}/${screen.key}` : `${PMS_BASE}/${group.key}`

// Flat list used by page shells: [{ id: 'tasks.kanban', path, title, groupTitle, permissionName }]
export const PMS_SCREENS = PMS_MODULES.flatMap(group =>
  group.screens.map(screen => ({
    id: screen.key ? `${group.key}.${screen.key}` : group.key,
    path: screenPath(group, screen),
    title: screen.title,
    groupTitle: group.title,
    permissionName: screen.permissionName,
    hidden: !!screen.hidden
  }))
)

export const getScreen = id => PMS_SCREENS.find(s => s.id === id)
