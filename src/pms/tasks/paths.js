import { PMS_BASE } from 'src/pms/config/pmsModules'

export const taskDetailsPath = id => `${PMS_BASE}/tasks/taskDetails/?id=${id}`
export const kanbanPath = projectId => `${PMS_BASE}/tasks/kanban/${projectId ? `?projectId=${projectId}` : ''}`
