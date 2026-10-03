import PmsPage from 'src/pms/components/PmsPage'
import RisksWorkspace from 'src/pms/risks/RisksWorkspace'

// Every project's issues. Add and edit them from Project Details > Risks.
const RisksIssuesPage = () => (
  <PmsPage screenId='risks.issues'>
    <RisksWorkspace mode='issues' />
  </PmsPage>
)

export default RisksIssuesPage
