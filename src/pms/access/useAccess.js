import { useGetMeQuery } from 'src/store/apps/pms/accessApi'

// The signed-in person's PMS role (GET /api/me): role, role_title, permissions { group: [actions] }.
// The server checks every request itself; screens use this only to hide what the person cannot use.
export const useMe = () => {
  const { data, isLoading, isError } = useGetMeQuery()

  return { me: data?.detail, loading: isLoading, failed: isError }
}

export const canDo = (me, group, action = 'view') => Boolean(me?.permissions?.[group]?.includes(action))

// const can = useCan(); can('projects', 'add')
export const useCan = () => {
  const { me } = useMe()

  return (group, action = 'view') => canDo(me, group, action)
}

export const isClient = me => me?.role === 'client'

// The project's own manager (or its creator while it has no manager login), a Director or an Admin: they edit,
// delete and move the project (server: runs_project).
export const runsProject = (me, project) =>
  Boolean(me && project) &&
  (['admin', 'director'].includes(me.role) ||
    (Boolean(me.user_id) &&
      (project.project_manager_id === me.user_id || (!project.project_manager_id && project.created_by === me.user_id))))

// The team is changed by whoever runs the project, or a Resource Manager (who staffs projects).
export const staffsProject = (me, project) => runsProject(me, project) || me?.role === 'resource_manager'
