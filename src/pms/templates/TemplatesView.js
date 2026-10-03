import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import StatCard from 'src/pms/components/StatCard'
import { formatDate, PrimaryButton } from 'src/pms/components/ui'
import ProjectDrawer from 'src/pms/projects/ProjectDrawer'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectMetaQuery } from 'src/store/apps/pms/projectsApi'
import { useDeleteTemplateMutation, useGetTemplatesQuery } from 'src/store/apps/pms/settingsApi'
import TemplateEditorDrawer from './TemplateEditorDrawer'
import usePagedRows from 'src/pms/components/usePagedRows'

const useDebouncedValue = (value, delay = 400) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}

const TemplatesView = () => {
  const router = useRouter()
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput)
  const { data, isFetching } = useGetTemplatesQuery({ search: search.trim() || undefined })
  const { data: metaResp } = useGetProjectMetaQuery()
  const [remove, { isLoading: deleting }] = useDeleteTemplateMutation()
  const [editor, setEditor] = useState(null) // { id } | { id: null }
  const [using, setUsing] = useState(null)
  const [deletingRow, setDeletingRow] = useState(null)
  const rows = data?.detail || []
  const { pageRows, pager } = usePagedRows(rows)
  const meta = metaResp?.detail

  const btn = 'cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold'

  return (
    <PmsPage
      screenId='projects.projectTemplates'
      actions={
        <PrimaryButton onClick={() => setEditor({ id: null })}>
          New Template <PlusCircle size={16} />
        </PrimaryButton>
      }
    >
      <TemplateEditorDrawer
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        templateId={editor?.id || null}
        projectTypes={meta?.project_types || []}
      />
      <ProjectDrawer
        open={Boolean(using)}
        onClose={() => setUsing(null)}
        template={using}
        meta={meta}
        onSuccess={resp => resp?.data?.id && router.push(projectDetailsPath(resp.data.id))}
      />
      <ConfirmDialog
        open={Boolean(deletingRow)}
        onClose={() => setDeletingRow(null)}
        onConfirm={async () => {
          try {
            const resp = await remove(deletingRow.id).unwrap()
            toast.success(resp.detail)
          } catch {
            // shown by the shared error toast
          }
          setDeletingRow(null)
        }}
        title='Delete template?'
        message={
          deletingRow ? `'${deletingRow.name}' is removed. Projects already created from it keep their tasks.` : ''
        }
        confirmText='Delete'
        cancelText='Cancel'
        busy={deleting}
      />

      <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
        <StatCard
          icon='tabler:template'
          tone='indigo'
          label='Templates'
          value={rows.length}
          hint='reusable project plans'
        />
        <StatCard
          icon='tabler:rocket'
          tone='emerald'
          label='Projects Started'
          value={rows.reduce((n, r) => n + r.times_used, 0)}
          hint='from templates'
        />
        <StatCard
          icon='tabler:checklist'
          tone='blue'
          label='Tasks in Templates'
          value={rows.reduce((n, r) => n + r.task_count + r.subtask_count, 0)}
          hint='ready to reuse'
        />
        <StatCard
          icon='tabler:bulb'
          tone='amber'
          label='Tip'
          value='Save as Template'
          hint='on any Project Details page'
        />
      </div>

      <div className={`${ThemeStyles.tableColor} rounded-md`}>
        <div className='p-3'>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder='Search with template name...'
            className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`}
            aria-label='Search templates'
          />
        </div>
        <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className='w-full min-w-[950px] text-left text-sm'>
            <thead className={ThemeStyles.tableHeaderBg}>
              <tr>
                {['Template', 'Type', 'Length', 'Plan', 'Estimate', 'Used', 'Actions'].map(h => (
                  <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                    <div className='pms-th-text'>{h}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='py-10 text-center text-slate-600'>
                    {isFetching
                      ? 'Loading...'
                      : 'No templates yet. Create one with New Template, or open a finished project and use Save as Template.'}
                  </td>
                </tr>
              ) : (
                pageRows.map(t => (
                  <tr key={t.id} className='border-t border-gray-200 hover:bg-gray-50/70' data-template={t.name}>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text font-semibold'>{t.name}</div>
                      <div className='max-w-[340px] truncate text-xs text-gray-500' title={t.description || ''}>
                        {t.description ||
                          (t.source_project_code
                            ? `Saved from ${t.source_project_code}`
                            : `Created by ${t.created_by_name || '-'}`)}
                      </div>
                    </td>
                    <td className='pms-td-text px-3 py-2'>{t.project_type || 'Any'}</td>
                    <td className='pms-td-text px-3 py-2'>{t.duration_days} days</td>
                    <td className='pms-td-text px-3 py-2'>
                      {t.milestone_count} milestone{t.milestone_count === 1 ? '' : 's'} · {t.task_count} task
                      {t.task_count === 1 ? '' : 's'}
                      {t.subtask_count ? ` + ${t.subtask_count} subtask${t.subtask_count === 1 ? '' : 's'}` : ''}
                    </td>
                    <td className='pms-td-text px-3 py-2'>{t.estimated_hours} h</td>
                    <td className='px-3 py-2'>
                      <div className='pms-td-text'>{t.times_used}x</div>
                      <div className='text-xs text-gray-500'>updated {formatDate(t.updated_at)}</div>
                    </td>
                    <td className='px-3 py-2'>
                      <div className='flex flex-wrap gap-1'>
                        <button
                          type='button'
                          onClick={() => setUsing(t)}
                          className={`${btn} border-transparent text-white`}
                          style={{ background: 'var(--theme-solid)' }}
                        >
                          <Icon icon='tabler:rocket' width={13} className='-mt-0.5 me-1 inline' />
                          Use
                        </button>
                        <button
                          type='button'
                          onClick={() => setEditor({ id: t.id })}
                          className={`${btn} border-gray-200 text-slate-700`}
                          aria-label={`Edit ${t.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type='button'
                          onClick={() => setDeletingRow(t)}
                          className={`${btn} border-red-200 text-red-600`}
                          aria-label={`Delete ${t.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pager}
      </div>
    </PmsPage>
  )
}

export default TemplatesView
