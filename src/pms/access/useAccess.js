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
