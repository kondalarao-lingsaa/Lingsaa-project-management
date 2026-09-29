import React from 'react'
import { Card, CardContent, Chip } from '@mui/material'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import { PMS_ROLES, PMS_ROLE_MATRIX } from 'src/pms/config/pmsRoles'

// Common shell for every PMS screen: title row, permission check, and (for now) a scaffold
// body. Real screens pass their own `children` and read `userPermissions` for add/edit/delete.
const PmsPage = ({ screenId, children }) => {
  const screen = getScreen(screenId)
  const { userPermissions, permissionLoaded } = usePmsPermissions(screen?.permissionName)

  if (!screen) return null

  const groupKey = screen.id.split('.')[0]
  const rolesWithAccess = PMS_ROLES.filter(r => PMS_ROLE_MATRIX[r.key]?.[groupKey]?.includes('view'))

  return (
    <div>
      <div className={ThemeStyles.titleAndCreateBtnAdj}>
        <div>
          <h1 className={ThemeStyles.textTitle}>{screen.title}</h1>
          <p className={ThemeStyles.textSummary}>Project Management / {screen.groupTitle}</p>
        </div>
      </div>

      {permissionLoaded && !userPermissions?.view ? (
        <Card className={ThemeStyles.tableColor}>
          <CardContent>
            <p className={ThemeStyles.textSummary}>You do not have access to this screen.</p>
          </CardContent>
        </Card>
      ) : (
        children ?? (
          <Card className={ThemeStyles.tableColor}>
            <CardContent className='flex flex-col gap-3'>
              <p className={ThemeStyles.textSummary}>
                Screen scaffold is ready. Content for &quot;{screen.title}&quot; is built in a later step.
              </p>
              <div className='flex flex-wrap gap-2'>
                {rolesWithAccess.map(r => (
                  <Chip key={r.key} size='small' label={r.title} />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}

export default PmsPage
