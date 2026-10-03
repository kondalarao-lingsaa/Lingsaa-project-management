import React from 'react'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import ProjectTimeline from './ProjectTimeline'

// Project Details > Planning: the project's Gantt timeline.
const ProjectPlanningTab = ({ project }) => {
  const { userPermissions } = usePmsPermissions(getScreen('planning.gantt')?.permissionName)

  return <ProjectTimeline projectId={project.id} canEdit={Boolean(userPermissions?.edit)} />
}

export default ProjectPlanningTab
