import { PMS_MODULES, screenPath } from './pmsModules'

// Sidebar tree for the Project Management module, generated from pmsModules.js.
// Single-screen groups render as a plain link; multi-screen groups as a collapsible parent.
// Hidden screens (e.g. Project Details, opened from a list row) are not shown in the sidebar.
// A section heading (like "Business" / "Finance" in Lingsaa_Accounts) is placed before the group whose key is listed here.
const SECTION_BEFORE = {
  dashboard: 'Overview',
  projects: 'Projects & Planning',
  tasks: 'Work',
  resources: 'People & Time',
  budget: 'Money',
  deliverables: 'Delivery & Risk',
  reports: 'Insights & System'
}

// A screen is in the sidebar when the role has its right (pmsModules `perm`). Without a role (not loaded) all are.
const allowed = (screen, group, permissions) => {
  if (!permissions) return true
  const perm = screen.perm || { group: group.key, action: 'view' }

  return Boolean(permissions[perm.group]?.includes(perm.action))
}

export const pmsNavFor = permissions => {
  const out = []
  // A section heading waits for the first group of its section the role can open, so it never shows alone.
  let heading = null

  PMS_MODULES.forEach(group => {
    if (SECTION_BEFORE[group.key]) heading = { sectionTitle: SECTION_BEFORE[group.key] }
    const screens = group.screens.filter(screen => allowed(screen, group, permissions))
    const visible = screens.filter(screen => !screen.hidden)
    if (!visible.length) return
    const hiddenPaths = screens.filter(screen => screen.hidden).map(screen => screenPath(group, screen))
    if (heading) {
      out.push(heading)
      heading = null
    }

    // One screen left in the sidebar (the others are its tabs or not allowed): a plain link named after the group.
    if (visible.length === 1) {
      out.push({ title: group.title, icon: group.icon, path: screenPath(group, visible[0]), hiddenPaths })
    } else {
      out.push({
        title: group.title,
        icon: group.icon,
        children: visible.map(screen => ({ title: screen.title, path: screenPath(group, screen) })),
        // Hidden screens (opened from a row) still belong to this group, so it stays open on them.
        hiddenPaths
      })
    }
  })

  return out
}

export const pmsNavRoutes = pmsNavFor(null)
