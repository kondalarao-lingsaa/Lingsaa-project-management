import React from 'react'
import { useTheme } from '@mui/material/styles'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'

// Same markup, classes and light/dark colours as CustomPagination in Lingsaa_Accounts
// (src/@core/reusable_components/customPagination.js).
const PAGE_SIZES = [5, 10, 20, 50, 100]

const pageNumbers = (currentPage, pageCount) => {
  const delta = 2
  const pages = []
  if (pageCount <= 7) {
    for (let i = 1; i <= pageCount; i++) pages.push(i)

    return pages
  }
  pages.push(1)
  if (currentPage > delta + 3) pages.push('...')
  for (let i = Math.max(2, currentPage - delta); i <= Math.min(pageCount - 1, currentPage + delta); i++) pages.push(i)
  if (currentPage < pageCount - delta - 2) pages.push('...')
  pages.push(pageCount)

  return pages
}

const PmsPagination = ({ pagination, handleChange, handleipp, total }) => {
  const isLight = useTheme().palette.mode === 'light'
  const { currentPage, itemsPerPage } = pagination
  const pageCount = Math.ceil(total / itemsPerPage) || 1
  const nav = 'flex items-center justify-center w-8 h-8 !rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer'
  const muted = isLight ? 'text-slate-600' : 'text-gray-300'
  const strong = isLight ? 'text-slate-800' : 'text-white'

  return (
    <div className='flex w-full flex-col items-center justify-between gap-3 p-3 shadow-sm backdrop-blur-sm md:flex-row'>
      <div className='flex flex-row items-center gap-2 md:ms-3'>
        <div className='relative w-20'>
          <select value={itemsPerPage} onChange={e => handleipp(Number(e.target.value))} className={ThemeStyles.paginationTheme}>
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <div className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'>
            <svg className='h-4 w-4 text-slate-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 9l-7 7-7-7' />
            </svg>
          </div>
        </div>
        <span className={`text-nowrap text-sm font-medium ${muted}`}>Per Page</span>
      </div>

      <div className='my-2 flex flex-wrap items-center justify-center md:my-0'>
        <button type='button' onClick={() => handleChange(currentPage - 1)} disabled={currentPage === 1} className={`${nav} ${ThemeStyles.paginationPrevNextBtn}`} aria-label='Previous page'>
          <ChevronLeft size={18} />
        </button>
        <div className='mx-1 flex flex-wrap items-center justify-center gap-1 sm:mx-2'>
          {pageNumbers(currentPage, pageCount).map((page, index) =>
            page === '...' ? (
              <div key={`gap-${index}`} className={`flex h-8 w-8 items-center justify-center ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                <MoreHorizontal size={16} />
              </div>
            ) : (
              <button
                key={page}
                type='button'
                onClick={() => handleChange(page)}
                className={`${nav} text-sm font-semibold ${currentPage === page ? ThemeStyles.paginationActiveBtn : ThemeStyles.paginationInactiveBtn}`}
              >
                {page}
              </button>
            )
          )}
        </div>
        <button type='button' onClick={() => handleChange(currentPage + 1)} disabled={currentPage === pageCount} className={`${nav} ${ThemeStyles.paginationPrevNextBtn}`} aria-label='Next page'>
          <ChevronRight size={18} />
        </button>
      </div>

      <div className={`text-sm font-medium md:me-3 ${muted}`}>
        Page <span className={`font-bold ${strong}`}>{currentPage}</span> of <span className={`font-bold ${strong}`}>{pageCount}</span>
      </div>
    </div>
  )
}

export default PmsPagination
