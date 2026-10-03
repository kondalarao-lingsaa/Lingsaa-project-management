import PmsPage from 'src/pms/components/PmsPage'
import RisksWorkspace from 'src/pms/risks/RisksWorkspace'

// Every project's change requests. Add and edit them from Project Details > Risks.
const RisksChangeRequestsPage = () => (
  <PmsPage screenId='risks.changeRequests'>
    <RisksWorkspace mode='changes' />
  </PmsPage>
)

export default RisksChangeRequestsPage
