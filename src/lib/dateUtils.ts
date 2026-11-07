const dbShiftsCache: Record<string, 'Day' | 'Night'> = {};

export function parseEducationAndShift(educationObj: string | null): { education: string; shift: 'Day' | 'Night' } {
  if (!educationObj) return { education: '', shift: 'Day' };
  const str = String(educationObj).trim();
  if (str.endsWith('|Night')) {
    return {
      education: str.split('|')[0] || '',
      shift: 'Night'
    };
  }
  if (str.endsWith('|Day')) {
    return {
      education: str.split('|')[0] || '',
      shift: 'Day'
    };
  }
  return {
    education: str,
    shift: 'Day'
  };
}

export function cacheDbShift(empId: string, shift: 'Day' | 'Night') {
  if (!empId) return;
  const id = String(empId).trim();
  dbShiftsCache[id] = shift;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`emp_shift_${id}`, shift);
  }
}

export function getEmployeeShift(empId: string, dbShift?: string): 'Day' | 'Night' {
  if (!empId) return 'Day';
  const id = String(empId).trim();

  // 1. Check in runtime cache
  if (dbShiftsCache[id] === 'Day' || dbShiftsCache[id] === 'Night') {
    return dbShiftsCache[id];
  }

  // 2. Check in passed dbShift (could be encoded)
  if (dbShift) {
    const { shift } = parseEducationAndShift(dbShift);
    return shift;
  }

  // 3. Fallback to localStorage
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(`emp_shift_${id}`);
    if (saved === 'Day' || saved === 'Night') {
      return saved;
    }
  }

  return 'Day';
}

export function setEmployeeShift(empId: string, shift: 'Day' | 'Night') {
  if (!empId) return;
  const id = String(empId).trim();
  dbShiftsCache[id] = shift;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`emp_shift_${id}`, shift);
  }
}

export function getTodayShiftDate(shift: 'Day' | 'Night' = 'Day'): string {
  return getShiftDateForTime(new Date(), shift);
}

export function getShiftDateForTime(now: Date, shift: 'Day' | 'Night' = 'Day'): string {
  const hours = now.getHours();
  let useYesterday = false;

  if (shift === 'Night') {
    // Night shift: 8:00 PM (20:00) to 08:00 AM (08:00) next day
    // If clocked in before 8:00 AM, it belongs to yesterday's night shift
    if (hours < 8) {
      useYesterday = true;
    }
  } else {
    // Day shift: 08:00 AM (08:00) to 06:00 AM next day (06:00)
    // If clocked in before 6:00 AM, it belongs to yesterday's day shift
    if (hours < 6) {
      useYesterday = true;
    }
  }

  const targetDate = useYesterday ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPossibleDateFormats(dateISO: string): string[] {
  if (!dateISO) return [];
  const formats = [dateISO];
  const parts = dateISO.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    // M/D/YYYY
    formats.push(`${m}/${d}/${y}`);
    // MM/DD/YYYY
    formats.push(`${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`);
  }
  return Array.from(new Set(formats));
}

export function formatSystemDate(dateISO: string): string {
  if (!dateISO) return '';
  try {
    const parts = dateISO.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch (e) {
    console.error(e);
  }
  return dateISO;
}

export function excelSerialToDate(serial: number): Date {
  // Excel base date: Dec 30 1899 (accounting for the 1900 leap year bug)
  // Whole number is days since 1899-12-30, fraction is time of day.
  const utcMillis = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(utcMillis);
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds()
  );
}

export function parseDateTimeToLocal(
  dateStr: string, 
  timeStr: string,
  preferredFormat: 'MDY' | 'DMY' | 'auto' = 'auto'
): Date | null {
  if (!dateStr && !timeStr) return null;
  
  const dStr = (dateStr || '').trim();
  const tStr = (timeStr || '').trim();

  // 1. Check if dateStr itself is an Excel serial number (e.g., 45443 or 45443.375)
  if (dStr && !isNaN(Number(dStr)) && Number(dStr) > 1000 && Number(dStr) < 100000) {
    const baseDate = excelSerialToDate(Number(dStr));
    if (!isNaN(baseDate.getTime())) {
      if (tStr) {
        // Override with explicit timeStr if given
        const tMatch = tStr.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*(am|pm|AM|PM))?/i);
        if (tMatch) {
          let h = parseInt(tMatch[1], 10);
          const m = parseInt(tMatch[2], 10);
          const ampm = tMatch[4]?.toLowerCase();
          if (ampm === 'pm' && h < 12) h += 12;
          if (ampm === 'am' && h === 12) h = 0;
          baseDate.setHours(h, m, 0, 0);
        }
      }
      return baseDate;
    }
  }

  let year = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-based
  let day = new Date().getDate();
  
  // 2. Check for DD-MMM-YY or DD-MMM-YYYY (e.g., 20-May-2026, 20-May-26, 20 May 2026)
  const dmyMatch = dStr.match(/^(\d{1,2})[-/.\s]\s*([A-Za-z]{3,9})\s*[-/.\s]\s*(\d{2,4})$/i);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    const monthMap: Record<string, number> = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
      may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
      sep: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    const mStr = dmyMatch[2].toLowerCase();
    if (mStr in monthMap) {
      month = monthMap[mStr];
    }
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;
    year = y;
  } 
  // 3. Check for YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  else if (/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.test(dStr)) {
    const ymdMatch = dStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
      year = parseInt(ymdMatch[1], 10);
      month = parseInt(ymdMatch[2], 10) - 1;
      day = parseInt(ymdMatch[3], 10);
    }
  }
  // 4. Check for DD-MM-YYYY or MM-DD-YYYY or DD/MM/YYYY or MM/DD/YYYY
  else {
    const dmyNumericMatch = dStr.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmyNumericMatch) {
      const part1 = parseInt(dmyNumericMatch[1], 10);
      const part2 = parseInt(dmyNumericMatch[2], 10);
      let y = parseInt(dmyNumericMatch[3], 10);
      if (y < 100) y += 2000;
      year = y;

      if (preferredFormat === 'MDY') {
        day = part2;
        month = part1 - 1;
      } else if (preferredFormat === 'DMY') {
        day = part1;
        month = part2 - 1;
      } else {
        // Smart format auto-detection:
        if (part2 > 12) {
          // part2 > 12 means part2 is definitely the day -> MM/DD/YYYY (MDY)
          day = part2;
          month = part1 - 1;
        } else if (part1 > 12) {
          // part1 > 12 means part1 is definitely the day -> DD/MM/YYYY (DMY)
          day = part1;
          month = part2 - 1;
        } else {
          // Both <= 12: if part1 matches 10 in 2026 (current month), it's Month 10 (October)
          if (part1 === 10 && y === 2026) {
            day = part2;
            month = part1 - 1;
          } else {
            day = part1;
            month = part2 - 1;
          }
        }
      }
    } else {
      const fallbackDate = new Date(dStr);
      if (!isNaN(fallbackDate.getTime())) {
        year = fallbackDate.getFullYear();
        month = fallbackDate.getMonth();
        day = fallbackDate.getDate();
        if (!tStr) {
          // If fallback already had time embedded:
          return fallbackDate;
        }
      } else {
        return null;
      }
    }
  }
  
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  
  if (tStr) {
    // Regex supports HH:MM, HH:MM:SS with or without AM/PM
    const tMatch = tStr.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?(?:\s*(am|pm|AM|PM))?/i);
    if (tMatch) {
      let h = parseInt(tMatch[1], 10);
      const m = parseInt(tMatch[2], 10);
      const s = tMatch[3] ? parseInt(tMatch[3], 10) : 0;
      const ampm = tMatch[4]?.toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      hours = h;
      minutes = m;
      seconds = s;
    } else if (!isNaN(Number(tStr)) && Number(tStr) >= 0 && Number(tStr) < 1) {
      // Excel fractional time serial (e.g. 0.3541666667)
      const frac = Number(tStr);
      hours = Math.floor(frac * 24);
      minutes = Math.floor((frac * 24 * 60) % 60);
      seconds = Math.round((frac * 86400) % 60);
    }
  }
  
  const result = new Date(year, month, day, hours, minutes, seconds, 0);
  return isNaN(result.getTime()) ? null : result;
}

export function normalizeToYYYYMMDD(dateStr: string, preferredFormat: 'MDY' | 'DMY' | 'auto' = 'auto'): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  // If already in clean YYYY-MM-DD format, return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  
  const d = parseCombinedDateTimeToLocal(trimmed, preferredFormat) || parseDateTimeToLocal(trimmed, '00:00', preferredFormat);
  if (!d || isNaN(d.getTime())) return trimmed;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseCombinedDateTimeToLocal(
  dateTimeStr: string,
  preferredFormat: 'MDY' | 'DMY' | 'auto' = 'auto'
): Date | null {
  if (!dateTimeStr) return null;
  const trimmed = String(dateTimeStr).trim().replace(/\s+/g, ' ');
  
  // 1. Direct Excel serial check
  if (!isNaN(Number(trimmed)) && Number(trimmed) > 1000 && Number(trimmed) < 100000) {
    return excelSerialToDate(Number(trimmed));
  }
  
  // 2. ISO 8601 string
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Split by space or 'T'
  const parts = trimmed.split(/[\sT]/);
  if (parts.length >= 2) {
    // If format is like "10/05/2026 08:30:00 PM" -> parts: ["10/05/2026", "08:30:00", "PM"]
    const dateStr = parts[0];
    const timeStr = parts.slice(1).join(' ');
    const res = parseDateTimeToLocal(dateStr, timeStr, preferredFormat);
    if (res && !isNaN(res.getTime())) return res;
  }
  
  return parseDateTimeToLocal(trimmed, '', preferredFormat);
}

export function getShiftRelativeMinutes(timeStr: string, shift: 'Day' | 'Night' = 'Day', locationId?: string, employeeId?: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;

  if (shift === 'Night') {
    // Night shift starts at 20:00 (8:00 PM)
    if (h >= 20) {
      return (h - 20) * 60 + m;
    } else {
      return (h + 4) * 60 + m;
    }
  } else {
    // Day shift thresholds
    let baseH = 8;
    let baseM = 0;

    const loc = String(locationId || '').trim();
    const emp = String(employeeId || '').trim();

    if (emp === '16153') {
      // MD. GHULAM KEBRIA: 09:30 AM
      baseH = 9;
      baseM = 30;
    } else if (loc === '101') {
      // Location 101 (ETP): 08:10 AM
      baseH = 8;
      baseM = 10;
    } else {
      // Others: 09:15 AM
      baseH = 9;
      baseM = 15;
    }

    const currentTotalMinutes = h * 60 + m;
    const baseTotalMinutes = baseH * 60 + baseM;

    // If it's early morning (e.g., 5 AM), it's probably very early for the shift, 
    // so we should handle the wrap-around if needed, but for Day shift 8/9 AM is normal.
    if (h >= 5) {
      return currentTotalMinutes - baseTotalMinutes;
    } else {
      // If it's before 5 AM, it might be late for a previous shift or very early for next.
      // For simplicity in Day shift:
      return (currentTotalMinutes + 24 * 60) - baseTotalMinutes;
    }
  }
}

export function isEmployeeActive(emp: any): boolean {
  if (!emp) return false;
  const id = String(emp.id || emp.no || '').trim();
  // Jubair Bin Ahmed resigned (ID 15641 / 15895)
  if (id === '15641' || id === '15895') return false;
  const name = String(emp.name || '').toUpperCase();
  if (name.includes('JUBAIR BIN AHMED')) return false;
  const status = String(emp.status || '').toLowerCase().trim();
  if (status === 'resigned' || status === 'inactive' || status === 'left') return false;
  const education = String(emp.education || '').toLowerCase();
  if (education.includes('resigned') || education.includes('inactive')) return false;
  if (id && typeof localStorage !== 'undefined') {
    const localStatus = localStorage.getItem(`emp_status_${id}`);
    if (localStatus === 'resigned' || localStatus === 'inactive') return false;
  }
  return true;
}


