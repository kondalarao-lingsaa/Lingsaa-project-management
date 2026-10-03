import React from 'react'
import PmsPage from 'src/pms/components/PmsPage'
import UsersRolesCard from './UsersRolesCard'
import PermissionMatrixCard from './PermissionMatrixCard'
import ApprovalRulesCard from './ApprovalRulesCard'

// Settings > Users & Access: who uses the PMS (Users & Roles), what each role can do (Permission Matrix) and who
// approves what by amount (Approval Rules).
const AccessView = () => (
  <PmsPage screenId='settings.access'>
    <UsersRolesCard />
    <PermissionMatrixCard />
    <ApprovalRulesCard />
  </PmsPage>
)

export default AccessView
