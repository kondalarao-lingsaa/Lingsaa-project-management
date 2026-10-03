import React, { useEffect, useState } from 'react'
import { Button, Menu, MenuItem } from '@mui/material'
import { Columns3, FunnelPlus, FunnelX } from 'lucide-react'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'

// Remembers which optional columns a user hid, per screen (like the "Custom" columns menu in Lingsaa_Accounts).
export const useHiddenColumns = storageKey => {
  const [hidden, setHidden] = useState([])

  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem(storageKey) || '[]'))
    } catch {
      setHidden([])
    }
  }, [storageKey])

  const toggle = key =>
    setHidden(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Storage can be blocked; the choice then only lasts for this visit.
      }

      return next
    })

  return [hidden, toggle]
}

// The row above every list: pill search box on the left, Filters and Custom buttons on the right,
// and a collapsible filter panel underneath. Same layout and classes as the Customers list.
const ListToolbar = ({ searchValue, onSearch, placeholder, activeFilterCount = 0, columns, hidden, onToggleColumn, filterPanel }) => {
  const [showFilters, setShowFilters] = useState(false)
  const [columnsAnchor, setColumnsAnchor] = useState(null)

  return (
    <>
      <div className={ThemeStyles.searchAndFiltersAlignment}>
        <div className={ThemeStyles.outsideSearchFilter}>
          <input type='text' value={searchValue} onChange={e => onSearch(e.target.value)} placeholder={placeholder} className={`${ThemeStyles.formsInputs} search-input text-gray-900`} />
        </div>

        <div className={ThemeStyles.filtersAndCustomColsAlignment}>
          <Button
            className={`filterCustBtn ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(prev => !prev)}
            startIcon={showFilters ? <FunnelX className='filter-cust-icon' /> : <FunnelPlus className='filter-cust-icon' />}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <Button className='filterCustBtn' onClick={e => setColumnsAnchor(e.currentTarget)} startIcon={<Columns3 className='filter-cust-icon' />}>
            Custom
          </Button>
        </div>
      </div>

      <Menu anchorEl={columnsAnchor} open={Boolean(columnsAnchor)} onClose={() => setColumnsAnchor(null)}>
        {columns.map(col => (
          <MenuItem key={col.key} disabled={col.fixed} onClick={() => !col.fixed && onToggleColumn(col.key)} className={ThemeStyles.customColMenuText}>
            <input type='checkbox' className={ThemeStyles.customColMenuCheckboxGap} checked={col.fixed || !hidden.includes(col.key)} disabled={col.fixed} readOnly />
            {col.label}
          </MenuItem>
        ))}
      </Menu>

      <div className={`${ThemeStyles.filterPanelAdj} ${showFilters ? 'max-h-[600px] translate-y-0 opacity-100' : 'pointer-events-none max-h-0 -translate-y-2 opacity-0'}`}>{filterPanel}</div>
    </>
  )
}

export default ListToolbar
