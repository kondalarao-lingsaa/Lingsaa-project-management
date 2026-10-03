import React, { useEffect, useMemo, useState } from 'react'
import PmsPagination from './PmsPagination'

// Pages a list that is already fully loaded (same pagination bar as the server-paged lists).
// resetKey: when filters/search change, go back to page 1.
const usePagedRows = (rows, { pageSize = 10, resetKey = '' } = {}) => {
  const [pagination, setPagination] = useState({ currentPage: 1, itemsPerPage: pageSize })
  const total = rows?.length || 0

  useEffect(() => setPagination(prev => ({ ...prev, currentPage: 1 })), [resetKey])

  // A delete on the last page can leave it empty: step back to the last page that has rows.
  const pageCount = Math.max(1, Math.ceil(total / pagination.itemsPerPage))
  const currentPage = Math.min(pagination.currentPage, pageCount)

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pagination.itemsPerPage

    return (rows || []).slice(start, start + pagination.itemsPerPage)
  }, [rows, currentPage, pagination.itemsPerPage])

  const pager =
    total > 5 ? (
      <div data-pager>
        <PmsPagination
          pagination={{ ...pagination, currentPage }}
          handleChange={page => setPagination(prev => ({ ...prev, currentPage: page }))}
          handleipp={value => setPagination({ itemsPerPage: value, currentPage: 1 })}
          total={total}
        />
      </div>
    ) : null

  return { pageRows, pager, total }
}

export default usePagedRows
