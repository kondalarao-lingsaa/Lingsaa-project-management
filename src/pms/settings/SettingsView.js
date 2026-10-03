import React, { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import toast from 'react-hot-toast'
import PmsPage from 'src/pms/components/PmsPage'
import ConfirmDialog from 'src/pms/components/ConfirmDialog'
import { formatDate, GhostButton, PrimaryButton, timeAgo } from 'src/pms/components/ui'
import { capitalizeWords } from 'src/pms/utils/validation'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'
import IndustryCard from './IndustryCard'
import Card from './SettingsCard'
import UsersRolesCard from './UsersRolesCard'
import ApprovalRulesCard from './ApprovalRulesCard'
import {
  useAddHolidayMutation,
  useDeleteHolidayMutation,
  useGetSettingsQuery,
  useSaveCalendarMutation
} from 'src/store/apps/pms/settingsApi'

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const errorText = msg => (msg ? <span className='!mt-1 block text-xs font-semibold text-red-500'>{msg}</span> : null)

export const hoursError = v => {
  if (v === '' || v === null || v === undefined) return 'Please Enter Hours per Day'
  const n = Number(v)
  if (Number.isNaN(n) || n < 1 || n > 24) return 'Hours per day must be between 1 and 24'
  if ((n * 2) % 1) return 'Use steps of 0.5 (e.g. 7.5)'

  return null
}

export const holidayNameError = v => {
  const t = (v || '').trim()
  if (!t) return 'Please Enter Holiday Name'
  if (t.length < 2) return 'Holiday name must be at least 2 characters'
  if (!/[A-Za-z]/.test(t)) return 'Holiday name must contain letters'

  return null
}

const SettingsView = () => {
  const [year, setYear] = useState(new Date().getFullYear())
  const { data, isFetching } = useGetSettingsQuery(year)
  const s = data?.detail
  const [saveCalendar, { isLoading: saving }] = useSaveCalendarMutation()
  const [addHoliday, { isLoading: adding }] = useAddHolidayMutation()
  const [deleteHoliday, { isLoading: deleting }] = useDeleteHolidayMutation()

  const [hours, setHours] = useState('')
  const [days, setDays] = useState([])
  const [calErrors, setCalErrors] = useState({})
  const [holiday, setHoliday] = useState({ holiday_date: '', name: '' })
  const [holErrors, setHolErrors] = useState({})
  const [removing, setRemoving] = useState(null)

  // Load the saved calendar into the form (again after every save).
  useEffect(() => {
    if (!s) return
    setHours(String(s.hours_per_day))
    setDays(s.working_days)
  }, [s?.hours_per_day, s?.working_days?.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = s && (Number(hours) !== s.hours_per_day || days.join(',') !== s.working_days.join(','))
  const weekHours = hoursError(hours) ? null : Math.round(Number(hours) * days.length * 10) / 10

  const submitCalendar = async () => {
    const found = {}
    const h = hoursError(hours)
    if (h) found.hours_per_day = h
    if (!days.length) found.working_days = 'Please Select at least one Working Day'
    setCalErrors(found)
    if (Object.keys(found).length) return toast.error(Object.values(found)[0])
    try {
      const resp = await saveCalendar({ hours_per_day: Number(hours), working_days: days }).unwrap()
      toast.success(resp.detail)
    } catch (e) {
      if (e?.data?.errors) setCalErrors(e.data.errors)
    }
  }

  const submitHoliday = async () => {
    const found = {}
    if (!holiday.holiday_date) found.holiday_date = 'Please Select Date'
    const n = holidayNameError(holiday.name)
    if (n) found.name = n
    setHolErrors(found)
    if (Object.keys(found).length)
      return toast.error(
        Object.keys(found).length === 1 ? Object.values(found)[0] : 'Please fix the 2 highlighted fields'
      )
    try {
      const resp = await addHoliday({ holiday_date: holiday.holiday_date, name: holiday.name.trim() }).unwrap()
      toast.success(resp.detail)
      setHoliday({ holiday_date: '', name: '' })
      const y = Number(holiday.holiday_date.slice(0, 4))
      if (y !== year) setYear(y)
    } catch (e) {
      if (e?.data?.errors) setHolErrors(e.data.errors)
    }
  }

  const border = (errs, id) => (errs[id] ? ' !border !border-red-500' : '')
  const holidays = s?.holidays || []
  const weekdayHolidays = holidays.filter(h => s.working_days.includes(SHORT.indexOf(h.weekday.slice(0, 3))))

  return (
    <PmsPage screenId='settings'>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            const resp = await deleteHoliday(removing.id).unwrap()
            toast.success(resp.detail)
          } catch {
            // shown by the shared error toast
          }
          setRemoving(null)
        }}
        title='Remove holiday?'
        message={
          removing ? `${removing.name} (${formatDate(removing.holiday_date)}) becomes a normal working day again.` : ''
        }
        confirmText='Remove'
        cancelText='Cancel'
        busy={deleting}
      />

      <UsersRolesCard />
      <ApprovalRulesCard />
      <IndustryCard />

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-2'>
        <Card
          icon='tabler:calendar-cog'
          title='Working Calendar'
          subtitle='Used by Capacity, Utilization, Sprint capacity and Reports'
          action={
            s?.updated_at && (
              <span className='text-xs text-gray-400'>
                Changed {timeAgo(s.updated_at)} by {s.updated_by_name}
              </span>
            )
          }
        >
          <div className='grid grid-cols-1 gap-4'>
            <div className='max-w-[220px] space-y-1'>
              <span className={ThemeStyles.formLabels}>
                Hours per Working Day <span className='text-red-500'>*</span>
              </span>
              <input
                id='hours_per_day'
                type='number'
                step='0.5'
                min='1'
                max='24'
                value={hours}
                onChange={e => {
                  setHours(e.target.value)
                  setCalErrors(p => ({ ...p, hours_per_day: null }))
                }}
                onBlur={() => setCalErrors(p => ({ ...p, hours_per_day: hoursError(hours) }))}
                className={`${ThemeStyles.formsInputs}${border(calErrors, 'hours_per_day')}`}
              />
              {errorText(calErrors.hours_per_day)}
            </div>
            <div className='space-y-1'>
              <span className={ThemeStyles.formLabels}>
                Working Days <span className='text-red-500'>*</span>
              </span>
              <div className='flex flex-wrap gap-2' id='working_days'>
                {SHORT.map((label, i) => {
                  const on = days.includes(i)

                  return (
                    <button
                      key={label}
                      type='button'
                      data-weekday={i}
                      aria-pressed={on}
                      onClick={() => {
                        setDays(prev => (on ? prev.filter(d => d !== i) : [...prev, i].sort()))
                        setCalErrors(p => ({ ...p, working_days: null }))
                      }}
                      className={`h-10 w-14 cursor-pointer rounded-lg border text-sm font-semibold transition ${
                        on
                          ? 'border-transparent text-white'
                          : 'border-gray-300 bg-white text-slate-500 hover:bg-gray-50'
                      }`}
                      style={on ? { background: 'var(--theme-solid)' } : undefined}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              {errorText(calErrors.working_days)}
            </div>
            <div className='rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-slate-600'>
              {weekHours !== null && days.length ? (
                <>
                  A full-time person has <b>{weekHours} h</b> a week ({days.length} days x {Number(hours)} h). Someone
                  at 50% on a project gives it {Math.round(weekHours * 5) / 10} h a week.
                </>
              ) : (
                'Pick the working days and hours to see the weekly hours.'
              )}
              {s && !dirty && (
                <div className='mt-1 text-xs text-gray-500'>
                  {s.year}: {s.year_working_days} working days, {s.year_working_hours} hours per full-time person (after{' '}
                  {holidays.length} holiday{holidays.length === 1 ? '' : 's'}).
                </div>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <PrimaryButton onClick={submitCalendar} disabled={saving || !dirty}>
                <Icon icon='tabler:device-floppy' width={16} /> {saving ? 'Saving...' : 'Save Calendar'}
              </PrimaryButton>
              {dirty && (
                <GhostButton
                  onClick={() => {
                    setHours(String(s.hours_per_day))
                    setDays(s.working_days)
                    setCalErrors({})
                  }}
                >
                  Undo changes
                </GhostButton>
              )}
              {s?.is_default && (
                <span className='text-xs text-gray-500'>Using the default: Monday to Friday, 8 h.</span>
              )}
            </div>
          </div>
        </Card>

        <Card
          icon='tabler:beach'
          title='Holidays'
          subtitle='Company days off; they do not count as working days anywhere'
          action={
            <div className='flex items-center gap-1'>
              <button
                type='button'
                onClick={() => setYear(y => y - 1)}
                className='cursor-pointer rounded-md p-1 text-slate-600 hover:bg-gray-100'
                aria-label='Previous year'
              >
                <Icon icon='tabler:chevron-left' width={18} />
              </button>
              <span className='w-12 text-center text-sm font-semibold text-slate-700' data-year>
                {year}
              </span>
              <button
                type='button'
                onClick={() => setYear(y => y + 1)}
                className='cursor-pointer rounded-md p-1 text-slate-600 hover:bg-gray-100'
                aria-label='Next year'
              >
                <Icon icon='tabler:chevron-right' width={18} />
              </button>
            </div>
          }
        >
          <div className='mb-3 grid grid-cols-1 gap-2 md:grid-cols-[170px_1fr_auto] md:items-start'>
            <div>
              <input
                id='holiday_date'
                type='date'
                value={holiday.holiday_date}
                onChange={e => {
                  setHoliday(p => ({ ...p, holiday_date: e.target.value }))
                  setHolErrors(p => ({ ...p, holiday_date: null }))
                }}
                className={`${ThemeStyles.formsInputs}${border(holErrors, 'holiday_date')}`}
                aria-label='Holiday date'
              />
              {errorText(holErrors.holiday_date)}
            </div>
            <div>
              <input
                id='holiday_name'
                type='text'
                maxLength={100}
                value={holiday.name}
                placeholder='e.g. Diwali'
                onChange={e => {
                  setHoliday(p => ({ ...p, name: capitalizeWords(e.target.value) }))
                  setHolErrors(p => ({ ...p, name: null }))
                }}
                onBlur={() => holiday.name && setHolErrors(p => ({ ...p, name: holidayNameError(holiday.name) }))}
                onKeyDown={e => e.key === 'Enter' && submitHoliday()}
                className={`${ThemeStyles.formsInputs}${border(holErrors, 'name')}`}
                aria-label='Holiday name'
              />
              {errorText(holErrors.name)}
            </div>
            <PrimaryButton onClick={submitHoliday} disabled={adding}>
              <Icon icon='tabler:plus' width={16} /> Add
            </PrimaryButton>
          </div>

          <div
            className={`overflow-hidden rounded-lg border border-gray-200 transition-opacity ${
              isFetching ? 'opacity-60' : ''
            }`}
          >
            {holidays.length === 0 ? (
              <div className='py-8 text-center text-sm text-gray-500'>
                No holidays in {year}. Add the company&apos;s festival and national holidays above.
              </div>
            ) : (
              <ul className='divide-y divide-gray-100'>
                {holidays.map(h => {
                  const onWorkday = s.working_days.includes(SHORT.indexOf(h.weekday.slice(0, 3)))

                  return (
                    <li key={h.id} className='flex items-center gap-3 px-3 py-2' data-holiday={h.name}>
                      <div className='w-12 shrink-0 rounded-md border border-gray-200 text-center'>
                        <div className='text-[10px] font-bold uppercase text-gray-500'>
                          {formatDate(h.holiday_date).slice(3, 6)}
                        </div>
                        <div className='text-[15px] font-bold text-slate-800'>{h.holiday_date.slice(8, 10)}</div>
                      </div>
                      <div className='min-w-0 flex-1'>
                        <div className='pms-td-text truncate font-semibold'>{h.name}</div>
                        <div className='text-xs text-gray-500'>
                          {h.weekday}
                          {onWorkday ? '' : ' · already a day off'}
                        </div>
                      </div>
                      <button
                        type='button'
                        onClick={() => setRemoving(h)}
                        className='cursor-pointer rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600'
                        aria-label={`Remove ${h.name}`}
                      >
                        <Icon icon='tabler:trash' width={17} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {holidays.length > 0 && (
            <div className='mt-2 text-xs text-gray-500'>
              {holidays.length} holiday{holidays.length === 1 ? '' : 's'} in {year}, {weekdayHolidays.length} on working
              days.
            </div>
          )}
        </Card>
      </div>
    </PmsPage>
  )
}

export default SettingsView
