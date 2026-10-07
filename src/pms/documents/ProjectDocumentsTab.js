import React from 'react'
import DocumentsPanel from './DocumentsPanel'

// Project Details > Files: every file of the project (including task attachments and deliverables). The panel shows
// upload / edit / delete by the person's Documents rights.
const ProjectDocumentsTab = ({ project }) => <DocumentsPanel project={project} />

export default ProjectDocumentsTab
