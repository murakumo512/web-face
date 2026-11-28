/**
 * Format a Date object as YYYY-MM-DD in local server time.
 */
export function toLocalDateKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date object cleanly as DD/MM/YYYY HH:mm:ss for CSV export.
 */
export function formatDateTimeID(dateInput) {
  const d = new Date(dateInput);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/**
 * Format YYYY-MM-DD as "27 November 2026".
 */
export function formatDateLongID(dateKey = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return String(dateKey || '-');
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return `${d} ${MONTHS_ID[m - 1] || m} ${y}`;
}

/**
 * Format YYYY-MM-DD as "27/11/2026".
 */
export function formatDateSlashID(dateKey = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return String(dateKey || '-');
  const [y, m, d] = String(dateKey).split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Classify a timestamp or HH:mm string into "Gereja Pagi" (< 14:00) or "Gereja Sore" (>= 14:00).
 */
export function getChurchSessionLabel(dateInput = new Date(), cutoffHour = 14) {
  if (typeof dateInput === 'string' && /^([01]\d|2[0-3]):[0-5]\d/.test(dateInput.trim())) {
    const hour = Number.parseInt(dateInput.trim().split(':')[0], 10);
    if (Number.isFinite(hour)) {
      return hour < cutoffHour ? 'Gereja Pagi' : 'Gereja Sore';
    }
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return d.getHours() < cutoffHour ? 'Gereja Pagi' : 'Gereja Sore';
}

/**
 * Escape a value for RFC-4180 CSV cells.
 */
export function escapeCsvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
