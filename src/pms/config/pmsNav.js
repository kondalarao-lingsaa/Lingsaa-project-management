import { PMS_MODULES, screenPath } from './pmsModules'

// Sidebar tree for the Project Management module, generated from pmsModules.js.
// Single-screen groups render as a plain link; multi-screen groups as a collapsible parent.
// Hidden screens (e.g. Project Details, opened from a list row) are not shown in the sidebar.
export const pmsNavRoutes = PMS_MODULES.map(group => {
  const visible = group.screens.filter(screen => !screen.hidden)

  if (group.screens.length === 1) {
    return { title: group.title, icon: group.icon, path: screenPath(group, group.screens[0]) }
  }

  return {
    title: group.title,
    icon: group.icon,
    children: visible.map(screen => ({ title: screen.title, path: screenPath(group, screen) }))
  }
})
