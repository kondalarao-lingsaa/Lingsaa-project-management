import PmsPage from 'src/pms/components/PmsPage'
import DocumentsPanel from 'src/pms/documents/DocumentsPanel'

// Every project's files in one place; upload here (pick the project) or from Project Details > Files.
const DocumentsPage = () => (
  <PmsPage screenId='documents'>
    <DocumentsPanel />
  </PmsPage>
)

export default DocumentsPage
