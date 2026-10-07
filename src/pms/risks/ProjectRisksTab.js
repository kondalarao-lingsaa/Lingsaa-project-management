import React, { useState } from 'react'
import RisksWorkspace from './RisksWorkspace'

const VIEWS = [
  { key: 'risks', label: 'Risks' },
  { key: 'issues', label: 'Issues' },
  { key: 'changes', label: 'Change Requests' }
]

// Project Details > Risks: what might go wrong (risks), what did (issues) and agreed changes (change requests).
const ProjectRisksTab = ({ project }) => {
  const [view, setView] = useState('risks')

  return (
    <div>
      <div className='mb-3 inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm'>
        {VIEWS.map(v => (
          <button
            key={v.key}
            type='button'
            onClick={() => setView(v.key)}
            className={`cursor-pointer rounded-md px-4 py-1.5 text-[14px] font-semibold transition ${view === v.key ? 'text-white' : 'text-slate-600 hover:bg-gray-100'}`}
            style={view === v.key ? { background: 'linear-gradient(to right, var(--theme-grad-start), var(--theme-grad-end))' } : undefined}
          >
            {v.label}
          </button>
        ))}
      </div>
      <RisksWorkspace mode={view} project={project} />
    </div>
  )
}

export default ProjectRisksTab
