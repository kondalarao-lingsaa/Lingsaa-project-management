import PmsPage from 'src/pms/components/PmsPage'
import RisksWorkspace from 'src/pms/risks/RisksWorkspace'

// Every project's risks. Add (choose the project first), edit and track them here or in Project Details > Risks.
const RisksRisksPage = () => (
  <PmsPage screenId='risks.risks'>
    <RisksWorkspace mode='risks' />
  </PmsPage>
)

export default RisksRisksPage
