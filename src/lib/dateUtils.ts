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
  // Also sync with localStorage for local robustness
  localStorage.setItem(`emp_shift_${id}`, shift);
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
  const saved = localStorage.getItem(`emp_shift_${id}`);
  if (saved === 'Day' || saved === 'Night') {
    return saved;
  }

  return 'Day';
}

export function setEmployeeShift(empId: string, shift: 'Day' | 'Night') {
  if (!empId) return;
  const id = String(empId).trim();
  dbShiftsCache[id] = shift;
  localStorage.setItem(`emp_shift_${id}`, shift);
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

export function parseDateTimeToLocal(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null;
  
  let year = new Date().getFullYear();
  let month = new Date().getMonth(); // 0-based
  let day = new Date().getDate();
  
  const dStr = dateStr.trim();
  const tStr = timeStr.trim();
  
  // 1. Check for DD-MMM-YY or DD-MMM-YYYY (e.g., 20-May-2026, 20-May-26)
  const dmyMatch = dStr.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{2,4})$/i);
  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    const mStr = dmyMatch[2].toLowerCase();
    if (mStr in monthMap) {
      month = monthMap[mStr];
    }
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;
    year = y;
  } 
  // 2. Check for DD-MM-YYYY or MM-DD-YYYY or DD/MM/YYYY or MM/DD/YYYY
  else {
    const dmyNumericMatch = dStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (dmyNumericMatch) {
      const part1 = parseInt(dmyNumericMatch[1], 10);
      const part2 = parseInt(dmyNumericMatch[2], 10);
      let y = parseInt(dmyNumericMatch[3], 10);
      if (y < 100) y += 2000;
      year = y;

      // Smart format detection:
      if (part2 > 12) {
        // part2 is definitely the day, so format is MM/DD/YYYY
        day = part2;
        month = part1 - 1;
      } else if (part1 > 12) {
        // part1 is definitely the day, so format is DD/MM/YYYY
        day = part1;
        month = part2 - 1;
      } else {
        // Both <= 12. Default to MM/DD/YYYY (monthly machine punches standard)
        day = part2;
        month = part1 - 1;
      }
    }
    // 3. Check for YYYY-MM-DD or YYYY/MM/DD
    else {
      const ymdMatch = dStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (ymdMatch) {
        year = parseInt(ymdMatch[1], 10);
        month = parseInt(ymdMatch[2], 10) - 1;
        day = parseInt(ymdMatch[3], 10);
      } else {
        const fallbackDate = new Date(dStr);
        if (isNaN(fallbackDate.getTime())) return null;
        year = fallbackDate.getFullYear();
        month = fallbackDate.getMonth();
        day = fallbackDate.getDate();
      }
    }
  }
  
  let hours = 0;
  let minutes = 0;
  
  if (tStr) {
    const tMatch = tStr.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*(am|pm|AM|PM))?/i);
    if (tMatch) {
      let h = parseInt(tMatch[1], 10);
      const m = parseInt(tMatch[2], 10);
      const ampm = tMatch[3]?.toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      hours = h;
      minutes = m;
    }
  }
  
  const result = new Date(year, month, day, hours, minutes, 0, 0);
  return isNaN(result.getTime()) ? null : result;
}

export function parseCombinedDateTimeToLocal(dateTimeStr: string): Date | null {
  if (!dateTimeStr) return null;
  const trimmed = dateTimeStr.trim();
  
  const spaceIdx = trimmed.search(/[\sT]/);
  let dateStr = trimmed;
  let timeStr = '';
  if (spaceIdx !== -1) {
    dateStr = trimmed.substring(0, spaceIdx);
    timeStr = trimmed.substring(spaceIdx + 1);
  }
  
  return parseDateTimeToLocal(dateStr, timeStr);
}

export function getShiftRelativeMinutes(timeStr: string, shift: 'Day' | 'Night' = 'Day'): number {
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
    // Day shift starts at 08:00 AM
    if (h >= 8) {
      return (h - 8) * 60 + m;
    } else {
      return (h + 16) * 60 + m;
    }
  }
}
