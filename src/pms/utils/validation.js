import { toCamelCaseTextLive } from 'src/helpers/textFormatters'

// Field rules for every PMS form. They follow the Add Customer form in Lingsaa_Accounts
// (getFieldError on blur and on submit, same regexes and wording) and are repeated on the server
// (backend/pms_api/app/schemas/rules.py), so the two must be changed together.

export const MOBILE_REGEX = /^[6-9]\d{9}$/
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
export const PERSON_NAME_REGEX = /^[A-Za-z][A-Za-z .'-]*$/
export const TITLE_REGEX = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/:+#_-]*$/
export const LABEL_REGEX = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/
export const AMOUNT_REGEX = /^\d{1,10}(\.\d{1,2})?$/
export const HOURS_REGEX = /^\d{1,3}(\.\d{1,2})?$/
// Same patterns as the Add Customer form in Lingsaa_Accounts.
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/* ------------------------- live formatting while typing ------------------------- */

export const capitalizeFirst = v => v.replace(/^(\s*)(\S)/, (_, space, c) => space + c.toUpperCase())
export const capitalizeWords = v => v.replace(/(^|\s)(\S)/g, (_, space, c) => space + c.toUpperCase())
export const digitsOnly = v => v.replace(/\D/g, '')
export const personName = v => toCamelCaseTextLive(v.replace(/[0-9]/g, ''))
export const noSpaces = v => v.replace(/\s/g, '')
// GSTIN / PAN input masks, copied from the Add Customer form in Lingsaa_Accounts: a character is
// accepted only if it fits its position, so "all letters" cannot even be typed into a PAN.
export const maskPan = raw => {
  let result = ''
  for (const ch of raw.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    const i = result.length // position in the PAN being built, not in what was typed
    if (i >= 10) break
    if ((i < 5 || i === 9) && /[A-Z]/.test(ch)) result += ch // letters: 1-5 and 10
    else if (i >= 5 && i < 9 && /\d/.test(ch)) result += ch // digits: 6-9
  }

  return result
}

export const maskGstin = raw => {
  const allowed = i =>
    i <= 1 || (i >= 7 && i <= 10) ? /\d/ : (i >= 2 && i <= 6) || i === 11 ? /[A-Z]/ : i === 13 ? /Z/ : /[A-Z0-9]/
  let result = ''
  for (const ch of raw.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    if (result.length >= 15) break
    if (allowed(result.length).test(ch)) result += ch
  }

  return result
}

// "12.345" -> "12.34"; keeps digits and one dot only.
export const decimalOnly = (v, decimals = 2) => {
  const cleaned = v.replace(/[^\d.]/g, '')
  const [whole, ...rest] = cleaned.split('.')

  return rest.length ? `${whole}.${rest.join('').slice(0, decimals)}` : whole
}

/* ------------------------------ per-field checks ------------------------------ */

const trimmed = v => (typeof v === 'string' ? v.trim() : v)
const empty = v => v === '' || v === null || v === undefined

const titleError = (t, label, required, min = 3) => {
  if (!t) return required ? `Please Enter ${label}` : null
  if (t.length < min) return `${label} must be at least ${min} characters`
  if (!/[A-Za-z]/.test(t) || !TITLE_REGEX.test(t))
    return `${label} must contain letters and only common symbols (. , & ( ) - / : + #)`

  return null
}

// Same messages as the Add Customer form (getFieldError 'pan_number' / 'gstin').
const panError = t => (t && !PAN_REGEX.test(t) ? 'Enter a valid 10-character PAN (e.g. ABCDE1234F)' : null)
const gstinError = t => (t && !GSTIN_REGEX.test(t) ? 'Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)' : null)

// Only Internal projects may skip the client.
export const isClientRequired = form => form.project_type !== 'Internal'

export const getProjectFieldError = (field, value, form = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'project_name':
      return titleError(t, 'Project Name', true)
    case 'customer_name':
      return titleError(t, 'Client Name', isClientRequired(form), 2)
    case 'customer_gstin':
      return gstinError(t)
    case 'customer_pan': {
      const error = panError(t)
      if (error) return error
      const g = trimmed(form.customer_gstin)

      return t && g && GSTIN_REGEX.test(g) && g.slice(2, 12) !== t
        ? 'PAN does not match the GSTIN (characters 3 to 12 of the GSTIN are the PAN)'
        : null
    }
    case 'start_date':
      return t ? null : 'Please Select Start Date'
    case 'project_type':
      return t ? null : 'Please Select Project Type'
    case 'customer_contact_name':
      if (!t) return isClientRequired(form) ? 'Please Enter Contact Person Name' : null

      return PERSON_NAME_REGEX.test(t) ? null : 'Contact person name should contain only letters, no numbers'
    case 'customer_mobile':
      if (!t) return isClientRequired(form) ? 'Please Enter Mobile Number' : null

      return MOBILE_REGEX.test(t) ? null : 'Enter a valid 10-digit mobile number starting with 6-9'
    case 'customer_email':
      return t && !EMAIL_REGEX.test(t) ? 'Enter a valid email address (e.g. name@example.com)' : null
    case 'project_manager_name':
      if (!t) return 'Please Enter Project Manager'

      return PERSON_NAME_REGEX.test(t) ? null : 'Manager name should contain only letters, no numbers'
    case 'end_date':
      return t && form.start_date && t < form.start_date ? 'End date cannot be before start date' : null
    case 'budget':
      return !empty(t) && !AMOUNT_REGEX.test(String(t))
        ? 'Budget must be a valid amount (up to 10 digits, up to 2 decimal places)'
        : null
    case 'description':
      return t && t.length > 2000 ? 'Description can be at most 2000 characters' : null
    default:
      return null
  }
}

export const PROJECT_VALIDATED_FIELDS = [
  'project_name',
  'customer_name',
  'project_type',
  'customer_contact_name',
  'customer_mobile',
  'customer_email',
  'customer_gstin',
  'customer_pan',
  'start_date',
  'project_manager_name',
  'end_date',
  'budget',
  'description'
]

export const getTaskFieldError = (field, value, form = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'project_id':
      return empty(t) ? 'Please Select Project' : null
    case 'title':
      return titleError(t, 'Task Name', true)
    case 'assignee_name':
      return t && !PERSON_NAME_REGEX.test(t) ? 'Assignee name should contain only letters, no numbers' : null
    case 'due_date':
      return t && form.start_date && t < form.start_date ? 'Due date cannot be before start date' : null
    case 'estimated_hours':
    case 'actual_hours':
      return !empty(t) && (!HOURS_REGEX.test(String(t)) || Number(t) > 999.99)
        ? 'Hours must be between 0 and 999.99 (up to 2 decimal places)'
        : null
    case 'labels': {
      const labels = String(t || '')
        .split(',')
        .map(l => l.trim())
        .filter(Boolean)
      if (labels.length > 10) return 'A task can have at most 10 labels'
      if (labels.some(l => l.length > 50 || !LABEL_REGEX.test(l)))
        return 'Labels can use letters, numbers, spaces, - and _ (up to 50 characters each)'

      return null
    }
    case 'description':
      return t && t.length > 4000 ? 'Description can be at most 4000 characters' : null
    default:
      return null
  }
}

export const TASK_VALIDATED_FIELDS = [
  'project_id',
  'title',
  'assignee_name',
  'due_date',
  'estimated_hours',
  'actual_hours',
  'labels',
  'description'
]

// Team member form (Project Details > Team). `project` gives the project's dates.
export const ALLOCATION_REGEX = /^\d{1,3}$/

export const getMemberFieldError = (field, value, form = {}, project = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'member_name':
      if (!t) return 'Please Enter Member Name'
      if (t.length < 2) return 'Member name must be at least 2 characters'

      return PERSON_NAME_REGEX.test(t) ? null : 'Member name should contain only letters, no numbers'
    case 'role':
      return t ? null : 'Please Select Role'
    case 'allocation_pct':
      if (empty(t)) return 'Please Enter Allocation'

      // 0 = on the team, time not planned yet (backend MemberIn: 0 to 100).
      return ALLOCATION_REGEX.test(String(t)) && Number(t) >= 0 && Number(t) <= 100
        ? null
        : 'Allocation must be a whole number from 0 to 100'
    case 'email':
      return t && !EMAIL_REGEX.test(t) ? 'Enter a valid email address (e.g. name@example.com)' : null
    case 'hourly_rate':
    case 'bill_rate':
      return !empty(t) && (!AMOUNT_REGEX.test(String(t)) || Number(t) > 99999999.99)
        ? 'Rate must be a valid amount (up to 8 digits, up to 2 decimal places)'
        : null
    case 'start_date':
      return t && project.start_date && t < project.start_date
        ? `Cannot start before the project starts (${project.start_date})`
        : null
    case 'end_date':
      if (t && form.start_date && t < form.start_date) return 'End date cannot be before start date'

      return t && project.end_date && t > project.end_date
        ? `Cannot stay after the project ends (${project.end_date})`
        : null
    default:
      return null
  }
}

export const MEMBER_VALIDATED_FIELDS = [
  'member_name',
  'role',
  'allocation_pct',
  'email',
  'hourly_rate',
  'bill_rate',
  'start_date',
  'end_date'
]

// Milestone form (Project Details > Milestones). `project` gives the project's dates.
export const MILESTONE_AMOUNT_REGEX = /^\d{1,12}(\.\d{1,2})?$/

export const getMilestoneFieldError = (field, value, form = {}, project = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'name':
      return titleError(t, 'Milestone Name', true)
    case 'due_date':
      if (t && project.start_date && t < project.start_date)
        return `Cannot be before the project starts (${project.start_date})`

      return t && project.end_date && t > project.end_date
        ? `Cannot be after the project ends (${project.end_date})`
        : null
    case 'amount':
      return !empty(t) && !MILESTONE_AMOUNT_REGEX.test(String(t))
        ? 'Amount must be a valid amount (up to 12 digits, up to 2 decimal places)'
        : null
    case 'description':
      return t && t.length > 2000 ? 'Description can be at most 2000 characters' : null
    default:
      return null
  }
}

export const MILESTONE_VALIDATED_FIELDS = ['name', 'due_date', 'amount', 'description']

// Create Invoice form (Billing). `today` is yyyy-mm-dd.
export const getInvoiceFieldError = (field, value, form = {}, today = '') => {
  const t = trimmed(value)

  switch (field) {
    case 'project_id':
      return empty(t) ? 'Please Select Project' : null
    case 'invoice_type':
      return empty(t) ? 'Please Select Invoice Type' : null
    case 'milestone_id':
      return form.invoice_type === 'Milestone' && empty(t) ? 'Please Select Milestone' : null
    case 'period_from':
      return form.invoice_type === 'Time & Material' && !t ? 'Please Select Period From' : null
    case 'period_to':
      if (form.invoice_type !== 'Time & Material') return null
      if (!t) return 'Please Select Period To'
      if (form.period_from && t < form.period_from) return 'Period To cannot be before Period From'

      return today && t > today ? 'Period To cannot be in the future' : null
    case 'notes':
      return t && t.length > 1000 ? 'Notes can be at most 1000 characters' : null
    default:
      return null
  }
}

export const INVOICE_VALIDATED_FIELDS = [
  'project_id',
  'invoice_type',
  'milestone_id',
  'period_from',
  'period_to',
  'notes'
]

// Risk register (Project Details > Risks). Score = probability x impact: 15+ High, 8+ Medium, else Low.
export const riskLevel = score => (score >= 15 ? 'High' : score >= 8 ? 'Medium' : 'Low')

export const getRiskFieldError = (field, value, form = {}, today = '') => {
  const t = trimmed(value)

  switch (field) {
    case 'title':
      return titleError(t, 'Risk Title', true)
    case 'category':
      return t ? null : 'Please Select Category'
    case 'probability':
      return t ? null : 'Please Select Probability'
    case 'impact':
      return t ? null : 'Please Select Impact'
    case 'mitigation': {
      const high =
        form.probability && form.impact && riskLevel(Number(form.probability) * Number(form.impact)) === 'High'

      return high && (!t || t.length < 10)
        ? 'Please Enter a Mitigation plan (at least 10 characters) - it is required for High risks'
        : null
    }
    case 'review_date':
      return t && today && t < today && t !== form.original_review_date ? 'Review date cannot be in the past' : null
    default:
      return null
  }
}

export const RISK_VALIDATED_FIELDS = ['title', 'category', 'probability', 'impact', 'mitigation', 'review_date']

export const getIssueFieldError = (field, value, form = {}, today = '') => {
  const t = trimmed(value)

  switch (field) {
    case 'title':
      return titleError(t, 'Issue Title', true)
    case 'severity':
      return t ? null : 'Please Select Severity'
    case 'due_date':
      return t && today && t < today && t !== form.original_due_date ? 'Due date cannot be in the past' : null
    default:
      return null
  }
}

export const ISSUE_VALIDATED_FIELDS = ['title', 'severity', 'due_date']

export const SIGNED_AMOUNT_REGEX = /^-?\d{1,12}(\.\d{1,2})?$/
export const SIGNED_DAYS_REGEX = /^-?\d{1,3}$/

const noImpact = v => empty(v) || Number(v) === 0

export const getChangeFieldError = (field, value, form = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'title':
      return titleError(t, 'Change Title', true)
    case 'change_type':
      return t ? null : 'Please Select Change Type'
    case 'reason':
      return !t || t.length < 10 ? 'Please Enter the Reason for the change (at least 10 characters)' : null
    case 'cost_impact':
      if (!empty(t) && !SIGNED_AMOUNT_REGEX.test(String(t))) return 'Cost impact must be an amount, e.g. 15000 or -5000'
      // 0 is no impact at all (the backend treats it as missing), so it counts as empty here too.
      if (form.change_type === 'Cost' && noImpact(t) && noImpact(trimmed(form.days_impact)))
        return 'A Cost change needs a cost impact'
      if (form.milestone_id && noImpact(t)) return 'Enter the cost impact to add to the milestone'

      return null
    case 'days_impact':
      if (!empty(t) && !SIGNED_DAYS_REGEX.test(String(t))) return 'Days impact must be a whole number, e.g. 10 or -5'
      if (!empty(t) && (Number(t) < -365 || Number(t) > 730)) return 'Days impact must be between -365 and 730'
      if (form.change_type === 'Schedule' && noImpact(t) && noImpact(trimmed(form.cost_impact)))
        return 'A Schedule change needs a days impact'

      return null
    default:
      return null
  }
}

export const CHANGE_VALIDATED_FIELDS = ['title', 'change_type', 'reason', 'cost_impact', 'days_impact']

// Sprint form. `project` gives the project's dates.
export const getSprintFieldError = (field, value, form = {}, project = {}) => {
  const t = trimmed(value)

  switch (field) {
    case 'name':
      return titleError(t, 'Sprint Name', true, 2)
    case 'start_date':
      if (!t) return 'Please Select Start Date'

      return project.start_date && t < project.start_date
        ? `Cannot start before the project (${project.start_date})`
        : null
    case 'end_date': {
      if (!t) return 'Please Select End Date'
      if (form.start_date && t < form.start_date) return 'End date cannot be before start date'
      if (form.start_date) {
        const days = Math.round((Date.parse(t) - Date.parse(form.start_date)) / 86400000) + 1
        if (days > 28) return `A sprint lasts at most 28 days (this is ${days})`
      }

      return project.end_date && t > project.end_date ? `Cannot end after the project (${project.end_date})` : null
    }
    case 'goal':
      return t && t.length > 1000 ? 'Goal can be at most 1000 characters' : null
    default:
      return null
  }
}

export const SPRINT_VALIDATED_FIELDS = ['name', 'start_date', 'end_date', 'goal']

export const collectErrors = (fields, getError, form) => {
  const errors = {}
  fields.forEach(field => {
    const message = getError(field, form[field], form)
    if (message) errors[field] = message
  })

  return errors
}

// ---------------------------------------------------------------- project templates (mirrors schemas/settings.py)
export const TEMPLATE_MAX_DAYS = 1095

const dayNumber = (v, label, { min = 0, max = TEMPLATE_MAX_DAYS, required = false } = {}) => {
  if (v === '' || v === null || v === undefined) return required ? `Please Enter ${label}` : null
  const n = Number(v)
  if (!Number.isInteger(n)) return `${label} must be a whole number`
  if (n < min || n > max) return `${label} must be between ${min} and ${max}`

  return null
}

// Returns { field: message } for the header and { 'm<i>.field' / 't<i>.field': message } for rows.
export const getTemplateErrors = form => {
  const e = {}
  const put = (k, v) => v && (e[k] = v)
  put('name', titleError(trimmed(form.name), 'Template Name', true))
  put('duration_days', dayNumber(form.duration_days, 'Project Length', { min: 1, required: true }))
  if ((form.description || '').length > 1000) e.description = 'Description can be at most 1000 characters'
  const length = Number(form.duration_days) || 0
  const names = {}
  form.milestones.forEach((m, i) => {
    put(`m${i}.name`, titleError(trimmed(m.name), 'Milestone name', true))
    const key = trimmed(m.name).toLowerCase()
    if (key && names[key]) e[`m${i}.name`] = 'Two milestones have this name'
    names[key] = true
    put(`m${i}.due_offset`, dayNumber(m.due_offset, 'Due day'))
    // Day 0 is the start date, so a project of N days ends on day N-1 (same rule as the backend).
    if (!e[`m${i}.due_offset`] && m.due_offset !== '' && length && Number(m.due_offset) > length - 1)
      e[`m${i}.due_offset`] = `After the last day (day ${length - 1})`
    if (m.amount !== '' && (Number.isNaN(Number(m.amount)) || Number(m.amount) < 0))
      e[`m${i}.amount`] = 'Amount cannot be negative'
    else if (m.amount !== '' && !MILESTONE_AMOUNT_REGEX.test(String(m.amount).trim()))
      e[`m${i}.amount`] = 'Use at most 2 decimals, e.g. 150000.50'
  })
  form.tasks.forEach((t, i) => {
    put(`t${i}.title`, titleError(trimmed(t.title), 'Task name', true))
    put(`t${i}.start_offset`, dayNumber(t.start_offset, 'Start day'))
    put(`t${i}.duration_days`, dayNumber(t.duration_days, 'Days', { min: 1 }))
    if (t.duration_days !== '' && t.start_offset === '') e[`t${i}.start_offset`] = 'Set the start day too'
    if (
      !e[`t${i}.start_offset`] &&
      !e[`t${i}.duration_days`] &&
      t.start_offset !== '' &&
      length &&
      Number(t.start_offset) + (Number(t.duration_days) || 1) - 1 > length - 1
    )
      e[`t${i}.duration_days`] = `Ends after the last day (day ${length - 1})`
    if (
      t.estimated_hours !== '' &&
      (Number.isNaN(Number(t.estimated_hours)) || Number(t.estimated_hours) < 0 || Number(t.estimated_hours) > 999.99)
    )
      e[`t${i}.estimated_hours`] = 'Between 0 and 999.99'
    else if (t.estimated_hours !== '' && !/^\d{1,3}(\.\d{1,2})?$/.test(String(t.estimated_hours).trim()))
      e[`t${i}.estimated_hours`] = 'Use at most 2 decimals, e.g. 7.5'
  })
  if (!form.milestones.length && !form.tasks.length) e.plan = 'Add at least one task or milestone'

  return e
}

// ---------------------------------------------------------------- expenses (mirrors schemas/expenses.py + repositories/expenses.py)
export const getExpenseFieldError = (field, value, form = {}, project = {}, today = '') => {
  const t = trimmed(value)
  switch (field) {
    case 'project_id':
      return t ? null : 'Please Select Project'
    case 'category':
      return t ? null : 'Please Select Category'
    case 'description':
      if (!t) return 'Please Enter Description'

      return t.length < 3 ? 'Description must be at least 3 characters' : null
    case 'expense_date':
      if (!t) return 'Please Select Date'
      if (today && t > today) return 'Expense date cannot be in the future'
      if (project.start_date && t < project.start_date) return `Before the project starts (${project.start_date})`

      return project.end_date && t > project.end_date ? `After the project ends (${project.end_date})` : null
    case 'amount': {
      if (t === '' || t === undefined || t === null) return 'Please Enter Amount'
      const n = Number(t)
      if (Number.isNaN(n) || n <= 0) return 'Amount must be more than 0'
      if (n > 999999999) return 'Amount is too large'

      return /^\d+(\.\d{1,2})?$/.test(String(t)) ? null : 'Use at most 2 decimals'
    }
    default:
      return null
  }
}

export const EXPENSE_VALIDATED_FIELDS = ['project_id', 'category', 'description', 'expense_date', 'amount']
