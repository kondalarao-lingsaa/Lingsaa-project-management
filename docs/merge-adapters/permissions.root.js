// ROOT (Lingsaa_Accounts) version of src/pms/adapters/permissions.js.
// At merge time copy this file to Lingsaa_Accounts/src/pms/adapters/permissions.js
// (do not copy the standalone one).
import { useEffect } from 'react'
import usePermissionId from 'src/pages/appModules/fetchPermissionId'
import { usePermissions } from 'src/pages/appModules/userActionPermissions'

// permissionName = the component name registered in Master Admin -> Nav Items
export const usePmsPermissions = permissionName => {
  const { permissionId } = usePermissionId(permissionName)
  const { userPermissions, permissionLoaded, fetchPermissions } = usePermissions()

  useEffect(() => {
    if (permissionId) fetchPermissions(permissionId)
  }, [permissionId])

  return { userPermissions, permissionLoaded }
}
