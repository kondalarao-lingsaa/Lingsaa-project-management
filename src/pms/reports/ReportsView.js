import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Icon } from '@iconify/react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PmsPage from 'src/pms/components/PmsPage'
import { Chip, formatDate, GhostButton, inr, PrimaryButton } from 'src/pms/components/ui'
import { saveBlob } from 'src/pms/documents/fileUtils'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import { useGetProjectOptionsQuery } from 'src/store/apps/pms/projectsApi'
import { useDownloadReportMutation, useGetReportCatalogQuery, useRunReportQuery } from 'src/store/apps/pms/reportsApi'

const ICON = {
  'project-status': 'tabler:briefcase',
  'timesheet-hours': 'tabler:clock-hour-4',
  budget: 'tabler:coin',
  billing: 'tabler:receipt',
  risks: 'tabler:shield-exclamation',
  utilization: 'tabler:users-group',
  'overdue-tasks': 'tabler:alarm'
}
const CHIP_TONE = {
  'On Track': 'green',
  'At Risk': 'amber',
  Delayed: 'red',
  'Over budget': 'red',
  'No budget': 'slate',
  Active: 'green',
  Draft: 'slate',
  'Pending Approval': 'amber',
  Approved: 'blue',
  'On Hold': 'orange',
  Closed: 'violet',
  Issued: 'blue',
  Paid: 'green',
  Cancelled: 'red',
  High: 'red',
  Medium: 'amber',
  Low: 'green',
  Critical: 'red',
  Open: 'red',
  Monitoring: 'amber',
  Mitigated: 'blue',
  Occurred: 'violet',
  'To Do': 'slate',
  'In Progress': 'blue',
  Testing: 'amber',
  Done: 'green'
}
const SERIES_COLORS = ['var(--theme-solid)', '#22c55e', '#f59e0b', '#94a3b8']

const iso = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const firstOfMonth = () => {
  const d = new Date()

  return iso(new Date(d.getFullYear(), d.getMonth(), 1))
}

const format = (value, type) => {
  if (value === null || value === undefined || value === '') return '-'
  switch (type) {
    case 'money':
      return inr(value)
    case 'hours':
      return `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })} h`
    case 'percent':
      return `${value}%`
    case 'date':
      return formatDate(value)
    case 'number':
      return Number(value).toLocaleString('en-IN')
    default:
      return String(value)
  }
}

const useDebouncedValue = (value, delay = 500) => {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

const ReportTable = ({ report }) => {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  useEffect(() => setSort({ key: null, dir: 'asc' }), [report.title])

  const rows = useMemo(() => {
    if (!sort.key) return report.rows
    const col = report.columns.find(c => c.key === sort.key)
    const numeric = ['money', 'hours', 'percent', 'number'].includes(col?.type)

    return [...report.rows].sort((a, b) => {
      const x = a[sort.key]
      const y = b[sort.key]
      if (x === null || x === undefined) return 1
      if (y === null || y === undefined) return -1
      const cmp = numeric ? x - y : String(x).localeCompare(String(y))

      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [report, sort])

  const toggle = key => setSort(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
  const right = type => ['money', 'hours', 'percent', 'number'].includes(type)

  return (
    <div className='overflow-x-auto'>
      <table className='w-full text-left text-sm' style={{ minWidth: Math.max(800, report.columns.length * 110) }}>
        <thead className={ThemeStyles.tableHeaderBg}>
          <tr>
            {report.columns.map(c => (
              <th
                key={c.key}
                className={`${ThemeStyles.tableHeadCellsHeight} cursor-pointer select-none !px-3`}
                onClick={() => toggle(c.key)}
              >
                <div className={`pms-th-text flex items-center gap-1 ${right(c.type) ? 'justify-end' : ''}`}>
                  {c.label}
                  {sort.key === c.key && <span className='text-xs'>{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={report.columns.length} className='py-10 text-center text-slate-600'>
                Nothing to report for these filters.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className='border-t border-gray-200 hover:bg-gray-50/70'>
                {report.columns.map(c => (
                  <td
                    key={c.key}
                    className={`pms-td-text px-3 py-2 ${right(c.type) ? 'text-right tabular-nums' : ''}`}
                    title={c.key === 'health' ? row.health_reason : undefined}
                  >
                    {c.type === 'chip' && row[c.key] ? (
                      <Chip tone={CHIP_TONE[row[c.key]] || 'slate'}>{row[c.key]}</Chip>
                    ) : (
                      <span className={c.key === 'mitigation' ? 'block max-w-[260px] truncate' : ''}>
                        {format(row[c.key], c.type)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {rows.length > 0 && Object.keys(report.totals || {}).length > 0 && (
          <tfoot>
            <tr className='border-t-2 border-gray-300 font-semibold'>
              {report.columns.map((c, i) => (
                <td
                  key={c.key}
                  className={`pms-td-text px-3 py-2 font-bold ${right(c.type) ? 'text-right tabular-nums' : ''}`}
                >
                  {i === 0 ? 'Total' : c.key in report.totals ? format(report.totals[c.key], c.type) : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

const ReportChart = ({ report }) => {
  const chart = report.chart
  const data = useMemo(() => {
    if (!chart?.series?.length || !report.rows.length) return []
    if (chart.group_count) {
      const counts = {}
      report.rows.forEach(r => (counts[r[chart.x]] = (counts[r[chart.x]] || 0) + 1))

      return Object.entries(counts).map(([name, n]) => ({ name, [chart.series[0].key]: n }))
    }

    return report.rows
      .slice(0, 15)
      .map(r => ({ name: r[chart.x], ...Object.fromEntries(chart.series.map(s => [s.key, r[s.key] || 0])) }))
  }, [report, chart])

  if (!data.length) return null
  const type = report.columns.find(c => c.key === chart.series[0].key)?.type
  const series = chart.group_count ? [{ key: chart.series[0].key, label: 'Tasks' }] : chart.series

  return (
    <div className='h-[260px] rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
      <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width='100%' height='100%'>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='name'
            tick={{ fontSize: 11 }}
            interval={0}
            angle={data.length > 6 ? -20 : 0}
            textAnchor={data.length > 6 ? 'end' : 'middle'}
            height={data.length > 6 ? 50 : 30}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={v => (type === 'money' && v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
          />
          <Tooltip formatter={v => (chart.group_count ? v : format(v, type))} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES_COLORS[i]}
              stackId={chart.stacked ? 'a' : undefined}
              radius={chart.stacked ? 0 : [4, 4, 0, 0]}
              maxBarSize={56}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// Reports: pick a report, set its filters, read the summary / chart / table, download as CSV or print as PDF.
const ReportsView = () => {
  const router = useRouter()
  const { data: catalogResp } = useGetReportCatalogQuery()
  const { data: projectsResp } = useGetProjectOptionsQuery(undefined)
  const catalog = catalogResp?.detail || []
  const projects = Array.isArray(projectsResp?.detail) ? projectsResp.detail : []

  const [reportKey, setReportKey] = useState('project-status')
  const [filters, setFilters] = useState({
    projectId: '',
    dateFrom: firstOfMonth(),
    dateTo: iso(new Date()),
    status: ''
  })
  const [personInput, setPersonInput] = useState('')
  const person = useDebouncedValue(personInput)
  const [download, { isLoading: isDownloading }] = useDownloadReportMutation()

  useEffect(() => {
    if (router.isReady && router.query.report) setReportKey(String(router.query.report))
  }, [router.isReady, router.query.report])

  const meta = catalog.find(c => c.key === reportKey)
  // A link (?report=) to a report this role cannot run, or that does not exist.
  const unavailable = Boolean(catalogResp) && !meta
  const uses = f => meta?.filters.includes(f)
  const dateError =
    uses('period') && filters.dateFrom && filters.dateTo && filters.dateTo < filters.dateFrom
      ? 'To date cannot be before From date'
      : ''
  const args = {
    report: reportKey,
    projectId: uses('project') ? filters.projectId : undefined,
    dateFrom: uses('period') ? filters.dateFrom : undefined,
    dateTo: uses('period') ? filters.dateTo : undefined,
    person: uses('person') ? person : undefined,
    status: uses('invoice_status') || uses('risk_status') ? filters.status : undefined
  }
  const { data, isFetching, isError, refetch } = useRunReportQuery(args, { skip: !meta || Boolean(dateError) })
  const report = data?.detail

  const choose = key => {
    setReportKey(key)
    setFilters(prev => ({ ...prev, status: '' }))
    router.replace({ pathname: router.pathname, query: { report: key } }, undefined, { shallow: true })
  }

  const doDownload = async () => {
    try {
      const blob = await download(args).unwrap()
      saveBlob(blob, `${reportKey}-${iso(new Date())}.csv`)
    } catch {
      // The shared base query already showed why.
    }
  }

  return (
    <PmsPage screenId='reports'>
      <div className='grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]'>
        <div className='flex flex-col gap-2 print:hidden'>
          {catalog.map(c => (
            <button
              key={c.key}
              type='button'
              data-report={c.key}
              onClick={() => choose(c.key)}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left shadow-sm transition ${
                c.key === reportKey
                  ? 'border-[var(--theme-solid)] bg-[color-mix(in_srgb,var(--theme-solid)_8%,white)]'
                  : 'border-gray-200 bg-white hover:border-[var(--theme-solid)]'
              }`}
            >
              <span
                className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'
                style={{
                  background: 'color-mix(in srgb, var(--theme-solid) 12%, transparent)',
                  color: 'var(--theme-solid)'
                }}
              >
                <Icon icon={ICON[c.key] || 'tabler:report'} width={18} />
              </span>
              <span className='min-w-0'>
                <span className='block text-[14px] font-semibold text-slate-800'>{c.title}</span>
                <span className='block text-xs text-gray-500'>{c.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className='min-w-0'>
          <div
            className={`${ThemeStyles.tableColor} mb-3 flex flex-col gap-2 rounded-md p-3 md:flex-row md:flex-wrap md:items-start print:hidden`}
          >
            {uses('period') && (
              <>
                <div>
                  <span className='block text-xs font-medium text-gray-500'>From</span>
                  <input
                    id='report_from'
                    type='date'
                    value={filters.dateFrom}
                    max={filters.dateTo || undefined}
                    onChange={e => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
                    className={ThemeStyles.formsInputs}
                  />
                </div>
                <div>
                  <span className='block text-xs font-medium text-gray-500'>To</span>
                  <input
                    id='report_to'
                    type='date'
                    value={filters.dateTo}
                    min={filters.dateFrom || undefined}
                    onChange={e => setFilters(p => ({ ...p, dateTo: e.target.value }))}
                    className={`${ThemeStyles.formsInputs}${dateError ? ' !border !border-red-500' : ''}`}
                  />
                  {dateError && <span className='block text-xs font-semibold text-red-500'>{dateError}</span>}
                </div>
              </>
            )}
            {uses('project') && (
              <div className='md:min-w-[240px]'>
                <span className='block text-xs font-medium text-gray-500'>Project</span>
                <select
                  id='report_project'
                  value={filters.projectId}
                  onChange={e => setFilters(p => ({ ...p, projectId: e.target.value }))}
                  className={ThemeStyles.formsInputsDropdown}
                >
                  <option value=''>All projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.project_code} - {p.project_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {uses('person') && (
              <div>
                <span className='block text-xs font-medium text-gray-500'>Person</span>
                <input
                  id='report_person'
                  type='text'
                  value={personInput}
                  maxLength={100}
                  onChange={e => setPersonInput(e.target.value)}
                  placeholder='Name contains...'
                  className={ThemeStyles.formsInputs}
                />
              </div>
            )}
            {(uses('invoice_status') || uses('risk_status')) && (
              <div>
                <span className='block text-xs font-medium text-gray-500'>Status</span>
                <select
                  id='report_status'
                  value={filters.status}
                  onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
                  className={ThemeStyles.formsInputsDropdown}
                >
                  <option value=''>All</option>
                  {(uses('invoice_status')
                    ? ['Draft', 'Issued', 'Paid', 'Cancelled']
                    : ['Open', 'Monitoring', 'Mitigated', 'Occurred', 'Closed']
                  ).map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className='flex gap-2 md:ms-auto md:self-end'>
              <GhostButton onClick={refetch} disabled={isFetching} aria-label='Refresh report'>
                <Icon icon='tabler:refresh' width={16} className={isFetching ? 'animate-spin' : ''} />
              </GhostButton>
              <GhostButton onClick={() => window.print()} disabled={!report}>
                <Icon icon='tabler:printer' width={16} /> Print / PDF
              </GhostButton>
              <PrimaryButton onClick={doDownload} disabled={!report || isDownloading}>
                <Icon icon='tabler:file-spreadsheet' width={16} /> Download Excel (CSV)
              </PrimaryButton>
            </div>
          </div>

          {!report ? (
            <div className={`${ThemeStyles.tableColor} rounded-md p-10 text-center text-sm text-gray-500`}>
              {isError
                ? 'The report could not be run.'
                : unavailable
                  ? 'This report is not available for your role. Pick a report from the list.'
                  : dateError || 'Running report...'}
            </div>
          ) : (
            <div className={`report-print flex flex-col gap-3 transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
              <div>
                <h2 className='text-xl font-semibold text-slate-900'>{report.title}</h2>
                <p className='text-sm text-gray-500'>
                  {report.description} Generated {formatDate(report.generated_at)}.
                </p>
              </div>
              <div className='grid grid-cols-2 gap-3 xl:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]'>
                {report.summary.map(s => (
                  <div key={s.label} className='rounded-xl border border-gray-200 bg-white p-3 shadow-sm'>
                    <div className='text-xs text-gray-500'>{s.label}</div>
                    <div className='text-[18px] font-semibold tabular-nums' style={{ color: 'var(--theme-solid)' }}>
                      {format(s.value, s.type)}
                    </div>
                  </div>
                ))}
              </div>
              <ReportChart report={report} />
              <div className={`${ThemeStyles.tableColor} rounded-md`}>
                <ReportTable report={report} />
              </div>
              <div className='text-xs text-gray-500'>
                {report.rows.length} row{report.rows.length === 1 ? '' : 's'} · click a column heading to sort
              </div>
            </div>
          )}
        </div>
      </div>
    </PmsPage>
  )
}

export default ReportsView
