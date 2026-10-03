import React from 'react'
import { usePmsPermissions } from 'src/pms/adapters/permissions'
import { getScreen } from 'src/pms/config/pmsModules'
import DocumentsPanel from './DocumentsPanel'

// Project Details > Files: every file of the project (including task attachments and deliverables).
const ProjectDocumentsTab = ({ project }) => {
  const { userPermissions } = usePmsPermissions(getScreen('documents')?.permissionName)

  return <DocumentsPanel project={project} canEdit={Boolean(userPermissions?.edit)} />
}

export default ProjectDocumentsTab
