import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem } from '@mui/material'
import { Icon } from '@iconify/react'
import { Ellipsis, PlusCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import StatCard from 'src/pms/components/StatCard'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { Chip, formatDate, GhostButton, PrimaryButton, timeAgo } from 'src/pms/components/ui'
import { projectDetailsPath } from 'src/pms/projects/ProjectsListView'
import { taskDetailsPath } from 'src/pms/tasks/paths'
import { capitalizeFirst } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useCan } from 'src/pms/access/useAccess'
import {
  useDeleteDocumentMutation,
  useDownloadDocumentMutation,
  useGetDocumentMetaQuery,
  useGetDocumentsQuery,
  useGetDocumentVersionsQuery,
  useUpdateDocumentMutation
} from 'src/store/apps/pms/documentsApi'
import { fileIcon, formatBytes, saveBlob } from './fileUtils'
import UploadDrawer from './UploadDrawer'
import usePagedRows from 'src/pms/components/usePagedRows'

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const useDownload = () => {
  const [download] = useDownloadDocumentMutation()

  return async doc => {
    try {
      const blob = await download(doc.id).unwrap()
      saveBlob(blob, doc.file_name)
    } catch {
      // The shared base query already showed why (e.g. file missing).
    }
  }
}

const FileBadge = ({ ext }) => {
  const [icon, color] = fileIcon(ext)

  return (
    <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg' style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
      <Icon icon={icon} width={20} />
    </span>
  )
}

const VersionsDialog = ({ doc, onClose }) => {
  const { data, isFetching } = useGetDocumentVersionsQuery(doc?.id, { skip: !doc })
  const download = useDownload()

  return (
    <Dialog open={Boolean(doc)} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Version History</DialogTitle>
      <DialogContent>
        <p className='mb-3 text-sm text-gray-500'>{doc?.title}</p>
        {isFetching && !data ? (
          <div className='py-6 text-center text-sm text-gray-500'>Loading...</div>
        ) : (
          <ul className='flex flex-col gap-2'>
            {(data?.detail || []).map(v => (
              <li key={v.id} className='flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2'>
                <FileBadge ext={v.extension} />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2 text-[14px] font-semibold text-slate-800'>
                    Version {v.version} {v.is_latest && <Chip tone='green'>Latest</Chip>}
                  </div>
                  <div className='truncate text-xs text-gray-500'>
                    {v.file_name} · {formatBytes(v.size_bytes)} · {v.uploaded_by_name || '-'} · {formatDate(v.created_at)}
                  </div>
                </div>
                <GhostButton onClick={() => download(v)} className='!px-2' aria-label={`Download version ${v.version}`}>
                  <Icon icon='tabler:download' width={16} />
                </GhostButton>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Close</GhostButton>
      </DialogActions>
    </Dialog>
  )
}

const DetailsDialog = ({ doc, categories, onClose }) => {
  const [update, { isLoading }] = useUpdateDocumentMutation()
  const [form, setForm] = useState({ title: '', category: '', notes: '', client_visible: false })
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (doc) {
      setForm({ title: doc.title, category: doc.category, notes: doc.notes || '', client_visible: Boolean(doc.client_visible) })
      setErrors({})
    }
  }, [doc])

  const save = async () => {
    const found = {}
    if (form.title.trim().length < 2) found.title = 'Please Enter a Title (at least 2 characters)'
    if (!form.category) found.category = 'Please Select Category'
    setErrors(found)
    if (Object.keys(found).length) return
    try {
      const resp = await update({ id: doc.id, body: { title: form.title.trim(), category: form.category, notes: form.notes.trim() || null, client_visible: form.client_visible } }).unwrap()
      toast.success(resp?.detail || 'Updated')
      onClose()
    } catch {
      // The shared base query already showed why.
    }
  }

  return (
    <Dialog open={Boolean(doc)} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle className='!text-[17px] !font-semibold'>Edit Details</DialogTitle>
      <DialogContent className='flex flex-col gap-3'>
        <div className='space-y-1'>
          <span className={ThemeStyles.formLabels}>
            Title <span className='text-red-500'>*</span>
          </span>
          <input id='doc_title' type='text' maxLength={200} value={form.title} onChange={e => setForm(p => ({ ...p, title: capitalizeFirst(e.target.value) }))} className={`${ThemeStyles.formsInputs}${errors.title ? ' !border !border-red-500' : ''}`} />
          {errors.title && <span className='block text-xs font-semibold text-red-500'>{errors.title}</span>}
        </div>
        <div className='space-y-1'>
          <span className={ThemeStyles.formLabels}>
            Category <span className='text-red-500'>*</span>
          </span>
          <select id='doc_category' value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={`${ThemeStyles.formsInputsDropdown}${errors.category ? ' !border !border-red-500' : ''}`}>
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className='space-y-1'>
          <span className={ThemeStyles.formLabels}>Notes</span>
          <textarea id='doc_notes' rows={2} maxLength={1000} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: capitalizeFirst(e.target.value) }))} className={ThemeStyles.formsInputs} />
        </div>
        <label className='flex items-center gap-2 text-sm text-slate-700'>
          <input type='checkbox' id='doc_client_visible' checked={form.client_visible} onChange={e => setForm(p => ({ ...p, client_visible: e.target.checked }))} />
          Share with client (they can download the latest version in the client portal)
        </label>
        <span className='text-xs text-gray-500'>Details apply to every version of this document.</span>
      </DialogContent>
      <DialogActions className='!px-6 !pb-4'>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
        <PrimaryButton onClick={save} disabled={isLoading}>
          Save
        </PrimaryButton>
      </DialogActions>
    </Dialog>
  )
}

const RowMenu = ({ doc, rights, onVersion, onHistory, onEdit, onDelete }) => {
  const [anchor, setAnchor] = useState(null)
  const items = [
    rights.add && { label: 'Upload New Version', icon: 'tabler:upload', onClick: onVersion },
    { label: `Version History (${doc.version_count})`, icon: 'tabler:history', onClick: onHistory },
    rights.edit && { label: 'Edit Details', icon: 'tabler:pencil', onClick: onEdit },
    rights.delete && { label: 'Delete', icon: 'tabler:trash', onClick: onDelete, danger: true }
  ].filter(Boolean)

  return (
    <>
      <Ellipsis className={ThemeStyles.tableActionsIcon} onClick={e => setAnchor(e.currentTarget)} />
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} autoFocus={false}>
        {items.map(item => (
          <MenuItem
            key={item.label}
            className={ThemeStyles.actionMenuItem}
            onClick={() => {
              setAnchor(null)
              item.onClick()
            }}
          >
            <div className={`${ThemeStyles.actionMenuBox} ${item.danger ? 'text-red-600' : ''}`}>
              <Icon icon={item.icon} width={16} />
              {item.label}
            </div>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

// scope: { projectId, taskId } narrows the list; `project` (with status) enables uploading there.
// compact = the small list inside Task Details (no stats, no filters).
const DocumentsPanel = ({ project, taskId, compact = false, canEdit = true, preset }) => {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const debounced = useDebouncedValue(search)
  const { data, isFetching } = useGetDocumentsQuery({ projectId: project?.id, taskId, search: debounced, category })
  const { data: metaResp } = useGetDocumentMetaQuery()
  const [remove, { isLoading: isDeleting }] = useDeleteDocumentMutation()
  const download = useDownload()
  const [uploading, setUploading] = useState(null) // { replaces } or {} for a new file
  const [history, setHistory] = useState(null)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const rows = data?.detail || []
  const { pageRows, pager } = usePagedRows(rows, { resetKey: `${search}|${category}` })
  const sv = data?.stack_values || {}
  const categories = metaResp?.detail?.categories || []
  const can = useCan()
  const open = canEdit && (!project || project.status !== 'Closed')
  const rights = { add: open && can('documents', 'add'), edit: open && can('documents', 'edit'), delete: open && can('documents', 'delete') }
  const editable = rights.add
  // The global page (and Task Details) has no project status of its own, so each row checks its project's.
  const closedRights = { add: false, edit: false, delete: false }
  const rowRights = d => (d.project_status === 'Closed' ? closedRights : rights)

  const doDelete = async () => {
    try {
      const resp = await remove(deleting.id).unwrap()
      toast.success(resp?.detail || 'Deleted')
    } catch {
      // The shared base query already showed why.
    } finally {
      setDeleting(null)
    }
  }

  const uploadButton = editable && (
    <PrimaryButton onClick={() => setUploading({})}>
      {compact ? 'Attach File' : 'Upload File'} <PlusCircle size={16} />
    </PrimaryButton>
  )

  return (
    <div>
      <UploadDrawer open={Boolean(uploading)} onClose={() => setUploading(null)} replaces={uploading?.replaces || null} preset={{ projectId: project?.id, taskId, ...(preset || {}) }} />
      <VersionsDialog doc={history} onClose={() => setHistory(null)} />
      <DetailsDialog doc={editing} categories={categories} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        title='Delete file?'
        message={deleting ? (deleting.version > 1 ? `Version ${deleting.version} of '${deleting.title}' is removed; version ${deleting.version - 1} becomes the latest again.` : `'${deleting.title}' will be removed.`) : ''}
        confirmText='Delete'
        cancelText='Cancel'
        busy={isDeleting}
      />

      {!compact && (
        <div className='mb-3 grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4'>
          <StatCard icon='tabler:files' tone='indigo' label='Documents' value={sv.count_pg || 0} hint='latest versions' />
          <StatCard icon='tabler:database' tone='violet' label='Storage' value={formatBytes(sv.total_bytes || 0)} hint='latest versions only' />
          <StatCard icon='tabler:file-certificate' tone='emerald' label='Contracts' value={sv.by_category?.Contract || 0} hint='category Contract' />
          <StatCard icon='tabler:package' tone='amber' label='Deliverables' value={sv.by_category?.Deliverable || 0} hint='category Deliverable' />
        </div>
      )}

      <div className={compact ? '' : `${ThemeStyles.tableColor} rounded-md`}>
        {compact ? (
          <div className='mb-2 flex items-center justify-between'>
            <span className='text-xs text-gray-500'>{rows.length ? `${rows.length} file${rows.length === 1 ? '' : 's'}` : ''}</span>
            {uploadButton}
          </div>
        ) : (
          <div className='flex flex-col gap-2 p-3 md:flex-row md:items-center'>
            <input type='text' value={search} onChange={e => setSearch(e.target.value)} placeholder='Search with Title, File name, Project...' className={`${ThemeStyles.formsInputs} search-input text-gray-900 md:max-w-sm`} />
            <select value={category} onChange={e => setCategory(e.target.value)} className={`${ThemeStyles.formsInputsDropdown} md:max-w-[200px]`} aria-label='Category'>
              <option value=''>All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className='md:ms-auto'>{uploadButton}</div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className={`text-center text-sm text-slate-600 ${compact ? 'py-4' : 'py-10'}`}>
            {isFetching ? 'Loading...' : compact ? 'No files attached.' : search || category ? 'No files match.' : 'No files yet. Upload contracts, designs, reports and deliverables here.'}
          </div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
            <table className={`w-full text-left text-sm ${compact ? '' : 'min-w-[980px]'}`}>
              {!compact && (
                <thead className={ThemeStyles.tableHeaderBg}>
                  <tr>
                    {['Document', !project && 'Project', 'Category', 'Attached To', 'Size', 'Uploaded', 'Actions'].filter(Boolean).map(h => (
                      <th key={h} className={`${ThemeStyles.tableHeadCellsHeight} !px-3`}>
                        <div className={`pms-th-text ${h === 'Actions' ? 'text-center' : ''}`}>{h}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {pageRows.map(d => (
                  <tr key={d.id} className='border-t border-gray-200 hover:bg-gray-50/70'>
                    <td className='px-3 py-2'>
                      <div className='flex items-center gap-3'>
                        <FileBadge ext={d.extension} />
                        <div className='min-w-0'>
                          <button type='button' onClick={() => download(d)} className='pms-td-text block max-w-[320px] cursor-pointer truncate text-left font-semibold hover:underline' title='Download'>
                            {d.title}
                          </button>
                          <div className='flex items-center gap-2 text-xs text-gray-500'>
                            {d.client_visible && (
                              <span className='rounded bg-pink-50 px-1.5 py-0.5 text-[11px] font-semibold text-pink-700' title='Shared with the client'>
                                Client
                              </span>
                            )}
                            <span className='max-w-[220px] truncate'>{d.file_name}</span>
                            {d.version > 1 && <Chip tone='blue'>v{d.version}</Chip>}
                            {compact && <span>· {formatBytes(d.size_bytes)}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    {!compact && !project && (
                      <td className='px-3 py-2'>
                        <Link href={`${projectDetailsPath(d.project_id)}&tab=files`} className={`${ThemeStyles.listNoColor} text-[13px]`}>
                          {d.project_code}
                        </Link>
                        <div className='max-w-[180px] truncate text-xs text-gray-500'>{d.project_name}</div>
                      </td>
                    )}
                    {!compact && (
                      <>
                        <td className='px-3 py-2'>
                          <Chip tone='slate'>{d.category}</Chip>
                        </td>
                        <td className='px-3 py-2 text-xs text-gray-600'>
                          {d.task_key && (
                            <Link href={taskDetailsPath(d.task_id)} className='block hover:underline'>
                              <span className={ThemeStyles.listNoColor}>{d.task_key}</span> {d.task_title}
                            </Link>
                          )}
                          {d.milestone_name && <div>Milestone: {d.milestone_name}</div>}
                          {d.deliverable_name && <div>Deliverable: {d.deliverable_name}</div>}
                          {!d.task_key && !d.milestone_name && <span className='text-gray-400'>Project</span>}
                        </td>
                        <td className='pms-td-text px-3 py-2'>{formatBytes(d.size_bytes)}</td>
                        <td className='px-3 py-2 text-xs text-gray-600'>
                          <div className='pms-td-text'>{d.uploaded_by_name || '-'}</div>
                          <div title={d.created_at}>{timeAgo(d.created_at)}</div>
                        </td>
                      </>
                    )}
                    <td className='px-3 py-2'>
                      <div className='flex items-center justify-center gap-2'>
                        <button type='button' onClick={() => download(d)} className='cursor-pointer text-gray-500 hover:text-[var(--theme-solid)]' aria-label={`Download ${d.title}`} title='Download'>
                          <Icon icon='tabler:download' width={20} />
                        </button>
                        <RowMenu
                          doc={d}
                          rights={rowRights(d)}
                          onVersion={() => setUploading({ replaces: d })}
                          onHistory={() => setHistory(d)}
                          onEdit={() => setEditing(d)}
                          onDelete={() => setDeleting(d)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pager}
      </div>
    </div>
  )
}

export default DocumentsPanel
