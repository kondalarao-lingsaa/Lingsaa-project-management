// RTK Query cache for the Project Management (PMS) module - kept separate from any other module's
// cache so tag types never collide. Talks to the standalone PMS FastAPI service.
// Identical in Lingsaa_Accounts (src/store/apps/pms/pmsApiBase.js): copy as is at merge time.
import { createApi } from '@reduxjs/toolkit/query/react'
import { authedBaseQueryWithErrorHandling, getAuthParams } from 'src/store/rtkQuery/baseQuery'

export const PMS_BASE_URL = process.env.NEXT_PUBLIC_PMS_API_URL

// The PMS service takes the company/user from the login token; these params are only its
// fallback until the token is confirmed to carry them.
export const pmsAuthQuery = () => {
  const { username, clientId, userId } = getAuthParams()

  return `user_name=${encodeURIComponent(username)}&client_id=${clientId}&user_id=${userId}`
}

export const pmsApi = createApi({
  reducerPath: 'pmsApi',
  baseQuery: authedBaseQueryWithErrorHandling,
  tagTypes: ['ProjectList', 'ProjectDetail', 'TaskList', 'TaskDetail', 'TaskBoard', 'TaskComments', 'TaskDependencies', 'TaskWatchers', 'TaskActivity', 'ProjectMembers', 'ResourceAllocation', 'MyWeek', 'TimeEntries', 'Approvals', 'ProjectBudget', 'BudgetOverview', 'Milestones', 'Billable', 'Invoices', 'Dashboard', 'Risks', 'Issues', 'ChangeRequests', 'Documents', 'DocumentVersions', 'Timeline', 'Roadmap', 'PlanningDependencies', 'Sprints', 'Backlog', 'Notifications', 'Settings', 'Templates', 'Expenses', 'ProjectSettings', 'TeamMeta', 'Me', 'Users', 'ApprovalInbox', 'Portal', 'ClientMessages', 'Permissions', 'Automation', 'RecurringTasks', 'AssigneeSuggestions'],
  endpoints: () => ({})
})
