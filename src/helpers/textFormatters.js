// STANDALONE COPY of the helpers PMS uses from Lingsaa_Accounts' src/helpers/textFormatters.js
// (same names, same behaviour). The root file is NOT overwritten at merge time.

// Title Case for names: "ravi kumar" -> "Ravi Kumar"
export const toCamelCaseText = (value = '') => {
  if (value === null || value === undefined) return ''
  const str = String(value).trim()
  if (!str) return ''

  return str
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// Live-typing safe version: keeps a trailing space so the cursor doesn't eat the gap between words.
export const toCamelCaseTextLive = (value = '') => {
  if (value === null || value === undefined) return ''

  return String(value)
    .split('\n')
    .map(line => toCamelCaseText(line) + (/\s$/.test(line) ? ' ' : ''))
    .join('\n')
}

// "Lingsaa Tech" => "LT" (limit 1 => "L")
export const getInitials = (name = '', limit = 2) => {
  if (!name) return ''

  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .map(word => word.charAt(0).toUpperCase())
    .join('')
}
