import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Card, CardContent } from '@mui/material'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen, getScreenTabs } from 'src/pms/config/pmsModules'
import PmsErrorBoundary from 'src/pms/components/PmsErrorBoundary'

// Common shell for every PMS screen: title row, permission check and an error boundary around the
// screen's `children`. Screens read `userPermissions` themselves for add/edit/delete.
const PmsPage = ({ screenId, children, actions }) => {
  const screen = getScreen(screenId)
  const { userPermissions, permissionLoaded } = usePmsPermissions(screen?.permissionName)
  const router = useRouter()
  const tabs = getScreenTabs(screenId)
  // Switching tab keeps the project picked on this screen.
  const tabHref = path => ({ pathname: `${path}/`, query: router.query.projectId ? { projectId: router.query.projectId } : {} })

  if (!screen) return null

  return (
    <div className='pms-root'>
      <div className={ThemeStyles.titleAndCreateBtnAdj}>
        <div>
          <h1 className={ThemeStyles.textTitle}>{screen.title}</h1>
        </div>
        {actions && <div className={ThemeStyles.createEyeBtnAlignments}>{actions}</div>}
      </div>

      {tabs.length > 1 && (
        <div className='mb-4 flex gap-1 overflow-x-auto border-b border-gray-200' role='tablist'>
          {tabs.map(tab => (
            <Link
              key={tab.id}
              href={tabHref(tab.path)}
              role='tab'
              aria-selected={tab.id === screenId}
              data-screen-tab={tab.id}
              className={`whitespace-nowrap border-b-2 px-4 py-2 text-[14px] font-semibold ${
                tab.id === screenId
                  ? 'border-[var(--theme-solid)] text-[var(--theme-solid)]'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.tabLabel}
            </Link>
          ))}
        </div>
      )}

      {permissionLoaded && !userPermissions?.view ? (
        <Card className={ThemeStyles.tableColor}>
          <CardContent>
            <p className={ThemeStyles.textSummary}>You do not have access to this screen.</p>
          </CardContent>
        </Card>
      ) : (
        <PmsErrorBoundary key={screenId}>{children}</PmsErrorBoundary>
      )}
    </div>
  )
}

export default PmsPage
