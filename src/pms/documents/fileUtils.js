// Small helpers shared by the document screens.

export const formatBytes = bytes => {
  if (!bytes && bytes !== 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const extensionOf = name => (name && name.includes('.') ? name.split('.').pop().toLowerCase() : '')

const ICONS = {
  pdf: ['tabler:file-type-pdf', '#dc2626'],
  doc: ['tabler:file-type-doc', '#2563eb'],
  docx: ['tabler:file-type-docx', '#2563eb'],
  xls: ['tabler:file-type-xls', '#16a34a'],
  xlsx: ['tabler:file-spreadsheet', '#16a34a'],
  csv: ['tabler:file-type-csv', '#16a34a'],
  ppt: ['tabler:file-type-ppt', '#ea580c'],
  pptx: ['tabler:presentation', '#ea580c'],
  png: ['tabler:photo', '#7c3aed'],
  jpg: ['tabler:photo', '#7c3aed'],
  jpeg: ['tabler:photo', '#7c3aed'],
  gif: ['tabler:photo', '#7c3aed'],
  webp: ['tabler:photo', '#7c3aed'],
  zip: ['tabler:file-zip', '#64748b'],
  txt: ['tabler:file-text', '#64748b'],
  md: ['tabler:markdown', '#64748b']
}

export const fileIcon = ext => ICONS[ext] || ['tabler:file', '#64748b']

// Saves a Blob as a file with the given name (the browser's normal download).
export const saveBlob = (blob, fileName) => {
  const link = document.createElement('a')
  const href = URL.createObjectURL(blob)
  link.href = href
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(href), 1000)
}

// Checks a chosen file before it is sent (the server checks again, including the file's real content).
export const fileError = (file, meta) => {
  if (!file) return 'Please Choose a File'
  const ext = extensionOf(file.name)
  const allowed = meta?.extensions || []
  if (allowed.length && !allowed.includes(ext)) return `'.${ext || '?'}' files are not allowed. Allowed: ${allowed.join(', ')}`
  if (file.size === 0) return 'The file is empty'
  const maxMb = meta?.max_mb || 15
  if (file.size > maxMb * 1024 * 1024) return `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The largest allowed is ${maxMb} MB`

  return null
}
