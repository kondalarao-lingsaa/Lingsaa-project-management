// PMS role design: who can do what.
// This is the *recommended default* the Super Admin starts from when creating roles in
// Roles/Users. The real enforcement lives in Master (plan -> module -> permission) and the
// per-role action flags; the PMS API re-checks the same flags server-side.
//
// Actions map to the existing permission action names (lowercase): view, add, edit, delete,
// plus 'approve' for workflow steps. 'approve' must be registered once in Master Admin ->
// Action Access; screens read it as userPermissions.approve like the other actions.

export const PMS_ACTIONS = ['view', 'add', 'edit', 'delete', 'approve']

export const PMS_ROLES = [
  { key: 'superAdmin', title: 'Super Admin', responsibility: 'System configuration' },
  { key: 'projectDirector', title: 'Project Director', responsibility: 'Approvals and high-level monitoring' },
  { key: 'projectManager', title: 'Project Manager', responsibility: 'Complete project management' },
  { key: 'teamLead', title: 'Project Lead / Team Lead', responsibility: 'Team and task management' },
  { key: 'employee', title: 'Employee', responsibility: 'Tasks, timesheets, daily updates' },
  { key: 'financeUser', title: 'Finance User', responsibility: 'Budget, expenses, invoices' },
  { key: 'hrUser', title: 'HR User', responsibility: 'Employee / resource information' },
  { key: 'client', title: 'Client', responsibility: 'View project, deliverables, approvals' },
  { key: 'vendor', title: 'Vendor', responsibility: 'Assigned work / deliverables' }
]

const ALL = ['view', 'add', 'edit', 'delete', 'approve']
const VAE = ['view', 'add', 'edit']
const V = ['view']

// Default matrix: role -> module group key (see pmsModules.js) -> allowed actions.
// A missing group means NO ACCESS.
export const PMS_ROLE_MATRIX = {
  superAdmin: Object.fromEntries(
    ['dashboard', 'projects', 'planning', 'tasks', 'sprints', 'resources', 'timesheets', 'budget', 'deliverables',
      'risks', 'documents', 'communication', 'billing', 'reports', 'settings'].map(k => [k, ALL])
  ),
  projectDirector: {
    dashboard: V, projects: ['view', 'approve'], planning: V, tasks: V, sprints: V, resources: V,
    timesheets: ['view', 'approve'], budget: ['view', 'approve'], deliverables: ['view', 'approve'],
    risks: ['view', 'approve'], documents: V, communication: V, billing: ['view', 'approve'], reports: V
  },
  projectManager: {
    dashboard: V, projects: [...VAE, 'approve'], planning: VAE, tasks: VAE, sprints: VAE, resources: VAE,
    timesheets: ['view', 'approve'], budget: V, deliverables: VAE, risks: VAE, documents: ['view', 'add', 'edit'],
    communication: VAE, billing: V, reports: V, settings: V
  },
  teamLead: {
    dashboard: V, projects: V, planning: VAE, tasks: VAE, sprints: VAE, resources: V,
    timesheets: ['view', 'approve'], deliverables: V, risks: VAE, documents: ['view', 'add'], communication: VAE, reports: V
  },
  employee: {
    dashboard: V, projects: V, tasks: ['view', 'edit'], timesheets: VAE, documents: ['view', 'add'],
    communication: ['view', 'add'], reports: V
  },
  financeUser: {
    dashboard: V, projects: V, timesheets: V, budget: VAE, billing: [...VAE, 'approve'], reports: V
  },
  hrUser: {
    dashboard: V, resources: VAE, timesheets: V, reports: V
  },
  client: {
    projects: V, deliverables: ['view', 'approve'], documents: V, communication: ['view', 'add']
  },
  vendor: {
    tasks: ['view', 'edit'], deliverables: ['view', 'add'], documents: ['view', 'add'], communication: ['view', 'add']
  }
}

// Actions a Developer-type (Employee) must never have, kept explicit so tests can assert it.
export const EMPLOYEE_FORBIDDEN = [
  { group: 'projects', action: 'add' },
  { group: 'budget', action: 'approve' },
  { group: 'billing', action: 'approve' },
  { group: 'projects', action: 'approve' }
]

export const can = (roleKey, groupKey, action) =>
  !!PMS_ROLE_MATRIX[roleKey]?.[groupKey]?.includes(action)
