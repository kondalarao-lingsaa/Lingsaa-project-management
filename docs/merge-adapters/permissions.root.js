// ROOT (Lingsaa_Accounts) version of src/pms/adapters/permissions.js.
// At merge time copy this file to Lingsaa_Accounts/src/pms/adapters/permissions.js
// (do not copy the standalone one).
// A right needs both: the Master screen flag (Master Admin -> Nav Items / user permissions) AND the PMS role
// (Settings > Users & Roles), which also decides approval authority and which projects a person sees.
import { useEffect } from 'react'
import usePermissionId from 'src/pages/appModules/fetchPermissionId'
import { usePermissions } from 'src/pages/appModules/userActionPermissions'
import { getScreenByPermission } from 'src/pms/config/pmsModules'
import { useMe } from 'src/pms/access/useAccess'

const roleRights = (me, permissionName) => {
  const screen = getScreenByPermission(permissionName)
  const actions = me?.permissions?.[screen?.perm?.group] || []

  return {
    view: actions.includes(screen?.perm?.action || 'view'),
    add: actions.includes('add'),
    edit: actions.includes('edit'),
    delete: actions.includes('delete'),
    approve: actions.includes('approve')
  }
}

// permissionName = the component name registered in Master Admin -> Nav Items
export const usePmsPermissions = permissionName => {
  const { permissionId } = usePermissionId(permissionName)
  const { userPermissions, permissionLoaded, fetchPermissions } = usePermissions()
  const { me, loading } = useMe()

  useEffect(() => {
    if (permissionId) fetchPermissions(permissionId)
  }, [permissionId])

  if (!me) return { userPermissions, permissionLoaded: permissionLoaded && !loading }
  const role = roleRights(me, permissionName)
  const both = Object.fromEntries(Object.keys(role).map(k => [k, Boolean(userPermissions?.[k]) && role[k]]))

  return { userPermissions: both, permissionLoaded }
}
