// ADAPTER (standalone version) - the only place PMS code touches the host app's permission system.
//
// Here in the standalone `frontend` project there is no Master/login service, so this returns
// "allow everything" to let screens be built and tested on their own.
// When merging into Lingsaa_Accounts this file is NOT copied; use
// docs/merge-adapters/permissions.root.js instead (it wraps the real usePermissionId +
// usePermissions hooks). Screens only ever call usePmsPermissions(), so nothing else changes.

const ALLOW_ALL = { view: true, add: true, edit: true, delete: true, approve: true }

export const usePmsPermissions = () => ({
  userPermissions: ALLOW_ALL,
  permissionLoaded: true
})
