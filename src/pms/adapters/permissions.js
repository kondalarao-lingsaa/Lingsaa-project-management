// ADAPTER (standalone version) - the only place PMS code touches the host app's permission system.
//
// Standalone, the rights come from the login's PMS role (GET /api/me, Settings > Users & Roles), mapped to the
// screen's module group (pmsModules.js `perm`). When merging into Lingsaa_Accounts this file is NOT copied; use
// docs/merge-adapters/permissions.root.js instead (it combines the Master screen flags with the same PMS role).
// Screens only ever call usePmsPermissions(), so nothing else changes.
import { getScreenByPermission } from 'src/pms/config/pmsModules'
import { useMe } from 'src/pms/access/useAccess'

export const rolePermissions = (me, permissionName) => {
  const screen = getScreenByPermission(permissionName)
  const group = screen?.perm?.group
  const actions = me?.permissions?.[group] || []

  return {
    view: actions.includes(screen?.perm?.action || 'view'),
    add: actions.includes('add'),
    edit: actions.includes('edit'),
    delete: actions.includes('delete'),
    approve: actions.includes('approve')
  }
}

export const usePmsPermissions = permissionName => {
  const { me, loading } = useMe()

  // Until the role is known (or if it cannot be read) nothing is hidden: the server still refuses what is not allowed.
  return { userPermissions: me ? rolePermissions(me, permissionName) : { view: true }, permissionLoaded: !loading && Boolean(me) }
}
