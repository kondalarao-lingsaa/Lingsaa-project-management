import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'

// Project picker. Remembers the choice in the URL (?projectId=).
// Default: screens that work on one project at a time (Gantt, WBS, Sprints, Backlog) start on the first Active project.
// allowAll: company-wide screens (Calendar, Capacity, Utilization) start on "All Projects".
const useProjectPicker = ({ allowAll = false } = {}) => {
  const router = useRouter()
  const { data } = useGetProjectOptionsQuery(undefined)
  const projects = useMemo(() => (Array.isArray(data?.detail) ? data.detail : []), [data])
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    if (!router.isReady || projectId) return
    const fromUrl = router.query.projectId && String(router.query.projectId)
    const firstActive = projects.find(p => p.status === 'Active') || projects[0]
    if (fromUrl) setProjectId(fromUrl)
    else if (firstActive && !allowAll) setProjectId(String(firstActive.id))
  }, [router.isReady, router.query.projectId, projects, projectId, allowAll])

  const choose = id => {
    setProjectId(id)
    const { projectId: _, ...rest } = router.query
    router.replace({ pathname: router.pathname, query: id ? { ...rest, projectId: id } : rest }, undefined, {
      shallow: true
    })
  }

  const project = projects.find(p => String(p.id) === projectId) || null

  const picker = (
    <select
      id='planning_project'
      value={projectId}
      onChange={e => choose(e.target.value)}
      className={`${ThemeStyles.formsInputsDropdown} min-w-[280px] md:max-w-md`}
      aria-label='Project'
    >
      <option value=''>{allowAll ? 'All Projects' : 'Select project'}</option>
      {projects.map(p => (
        <option key={p.id} value={p.id}>
          {p.project_code} - {p.project_name}
        </option>
      ))}
    </select>
  )

  // ready: the URL has been read, so screens do not first load "All Projects" and then flip to ?projectId.
  // Only after mounting, so the browser's first render matches the server's (no hydration mismatch).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const ready = mounted && router.isReady && (Boolean(projectId) || !router.query.projectId)

  return { projectId, project, projects, picker, ready }
}

export default useProjectPicker
