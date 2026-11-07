import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { 
  parseDateTimeToLocal, 
  parseCombinedDateTimeToLocal, 
  normalizeToYYYYMMDD, 
  getEmployeeShift, 
  getShiftDateForTime,
  excelSerialToDate,
  isEmployeeActive
} from './dateUtils';
import { supabase } from './supabaseClient';

export interface UploadStats {
  success: boolean;
  totalRowsRead: number;
  totalPunches: number;
  recordsUpserted: number;
  failedCount: number;
  skippedInactiveCount: number;
  newEmployeesCreated: number;
  detectedHeaders: string[];
  sampleDates: string[];
  errorMessage?: string;
  failedDetails?: string[];
}

// Keywords to match employee identifier column
const ID_HEADER_REGEX = /^(ac[-_ .]?no\.?|emp(loyee)?[-_ .]?(id|no|code)?|user[-_ .]?id|enroll[-_ .]?(no|id|number)?|staff[-_ .]?(id|no)?|badge[-_ .]?(number|no)?|card[-_ .]?no\.?|pin[-_ .]?(number)?|id[-_ .]?(number|no)?|id|no\.?)$/i;

// Keywords to match date / time / punch
const DATE_TIME_HEADER_REGEX = /(date|time|punch|clock|in[-_ ]?time|out[-_ ]?time|datetime|logdate|workdate)/i;

/**
 * Automatically locate header row in a 2D array of rows
 * (Handles files with title banners, date ranges, or empty top rows)
 */
export function findHeaderRow(rows: any[][]): { headerIndex: number; headers: string[] } {
  const maxScan = Math.min(25, rows.length);
  
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    
    let hasIdCol = false;
    let hasDateTimeCol = false;

    for (const cell of row) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim();
      if (!str) continue;

      if (ID_HEADER_REGEX.test(str)) {
        hasIdCol = true;
      }
      if (DATE_TIME_HEADER_REGEX.test(str)) {
        hasDateTimeCol = true;
      }
    }

    if (hasIdCol) {
      // Clean headers
      const headers = row.map((c, idx) => {
        const val = c !== null && c !== undefined ? String(c).trim() : '';
        return val || `column_${idx + 1}`;
      });
      return { headerIndex: i, headers };
    }
  }

  // Fallback: row 0
  const firstRow = rows[0] || [];
  const fallbackHeaders = firstRow.map((c, idx) => {
    const val = c !== null && c !== undefined ? String(c).trim() : '';
    return val || `column_${idx + 1}`;
  });
  return { headerIndex: 0, headers: fallbackHeaders };
}

/**
 * Read Excel file (XLSX, XLS) into 2D row array
 */
export function readExcelToArray(buffer: ArrayBuffer): any[][] {
  const workbook = XLSX.read(new Uint8Array(buffer), { 
    type: 'array', 
    cellDates: true, 
    cellNF: false, 
    cellText: false 
  });
  
  // Find first non-empty sheet
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheet && sheet['!ref']) {
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { 
        header: 1, 
        defval: '', 
        raw: true 
      });
      if (rows && rows.length > 0) {
        return rows;
      }
    }
  }
  return [];
}

/**
 * Read CSV into 2D row array
 */
export function readCsvToArray(csvText: string): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(csvText, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (results) => resolve(results.data),
      error: (err) => reject(err)
    });
  });
}

interface ParsedPunch {
  empId: string;
  rawName: string;
  designation: string;
  category: string;
  locationRaw: string;
  punchDate: Date;
  timeStr: string;
}

/**
 * Automatically determine if the dates in this file are Month/Day/Year (MDY) or Day/Month/Year (DMY).
 * If any row has part2 > 12 (e.g. 10/24/2026), that proves part1 is Month and part2 is Day (MDY).
 * If any row has part1 > 12 (e.g. 24/10/2026), that proves part1 is Day and part2 is Month (DMY).
 */
export function detectFileDateFormat(rows: any[][], headerIndex: number, headers: string[]): 'MDY' | 'DMY' {
  let mdyEvidence = 0;
  let dmyEvidence = 0;

  const normalizedHeaders = headers.map(h => 
    String(h).toLowerCase().replace(/^\uFEFF/, '').trim()
  );
  const dateColIdx = normalizedHeaders.findIndex(h => 
    h === 'date/time' || h === 'datetime' || h === 'date' || h === 'punch date' || h === 'work date'
  );

  const startIdx = Math.max(0, headerIndex + 1);
  const endIdx = Math.min(rows.length, startIdx + 500);

  for (let i = startIdx; i < endIdx; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;

    const cellsToCheck = dateColIdx !== -1 && row[dateColIdx] !== undefined ? [row[dateColIdx]] : row;
    for (const cell of cellsToCheck) {
      if (cell === null || cell === undefined) continue;
      const str = String(cell).trim();
      const match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
      if (match) {
        const p1 = parseInt(match[1], 10);
        const p2 = parseInt(match[2], 10);
        if (p1 > 12 && p2 <= 12) dmyEvidence++;
        if (p2 > 12 && p1 <= 12) mdyEvidence++;
      }
    }
  }

  if (mdyEvidence > 0 && dmyEvidence === 0) return 'MDY';
  if (dmyEvidence > 0 && mdyEvidence === 0) return 'DMY';
  return mdyEvidence >= dmyEvidence ? 'MDY' : 'DMY';
}

/**
 * Comprehensive parser that handles both:
 * 1) Raw punch logs (1 punch per row)
 * 2) Attendance summary sheets (In-Time & Out-Time columns on the same row)
 */
export function extractPunchesFromRows(
  rows: any[][], 
  headerIndex: number, 
  headers: string[],
  existingEmpNames?: Map<string, string>
): { punches: ParsedPunch[]; skippedCount: number; skippedInactive: number; rawRowsCount: number; detectedDateFormat: 'MDY' | 'DMY' } {
  const normalizedHeaders = headers.map(h => 
    String(h).toLowerCase().replace(/^\uFEFF/, '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
  );

  const fileDateFormat = detectFileDateFormat(rows, headerIndex, headers);

  let skippedCount = 0;
  let skippedInactive = 0;
  const punches: ParsedPunch[] = [];
  const dataRows = rows.slice(headerIndex + 1);

  for (const row of dataRows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const rowHasAnyData = row.some(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (!rowHasAnyData) continue;

    const rowObj: Record<string, any> = {};
    normalizedHeaders.forEach((key, colIdx) => {
      rowObj[key] = row[colIdx];
    });

    // 1. Resolve Employee ID
    let rawId = (
      rowObj['no.'] ?? rowObj['no'] ?? rowObj['id'] ?? 
      rowObj['ac-no.'] ?? rowObj['ac-no'] ?? rowObj['ac no'] ?? rowObj['acno'] ??
      rowObj['enroll no.'] ?? rowObj['enroll no'] ?? rowObj['enroll id'] ?? rowObj['enrollid'] ?? rowObj['enroll number'] ??
      rowObj['user id'] ?? rowObj['userid'] ?? rowObj['user_id'] ??
      rowObj['emp id'] ?? rowObj['empid'] ?? rowObj['emp. id'] ??
      rowObj['employee id'] ?? rowObj['employeeid'] ?? rowObj['employee_id'] ??
      rowObj['emp no'] ?? rowObj['empno'] ?? rowObj['emp. no.'] ??
      rowObj['staff id'] ?? rowObj['staffid'] ?? rowObj['staff no'] ??
      rowObj['id number'] ?? rowObj['idnumber'] ?? rowObj['id_number'] ??
      rowObj['badgenumber'] ?? rowObj['badge number'] ?? rowObj['badge'] ??
      rowObj['pin'] ?? rowObj['card no'] ?? rowObj['cardno'] ??
      rowObj['emp code'] ?? rowObj['empcode'] ?? rowObj['employee code'] ?? ''
    );

    let cleanId = '';
    if (rawId !== null && rawId !== undefined) {
      cleanId = String(rawId).trim();
      if (cleanId.endsWith('.0')) {
        cleanId = cleanId.slice(0, -2);
      }
    }

    // 2. Resolve Name
    const rawName = String(
      rowObj['name'] ?? rowObj['employee name'] ?? rowObj['emp name'] ?? 
      rowObj['staff name'] ?? rowObj['ename'] ?? rowObj['worker name'] ?? 
      rowObj['full name'] ?? rowObj['user name'] ?? rowObj['username'] ?? ''
    ).trim();

    // If ID is missing but Name matches an existing employee in DB, resolve ID from Name!
    if (!cleanId && rawName && existingEmpNames && existingEmpNames.has(rawName.toLowerCase())) {
      cleanId = existingEmpNames.get(rawName.toLowerCase()) || '';
    }

    if (!cleanId) {
      skippedCount++;
      continue;
    }

    // Inactive employee check (e.g. 15641 / 15895 Jubair Bin Ahmed)
    if (!isEmployeeActive({ id: cleanId, name: rawName })) {
      skippedInactive++;
      continue;
    }

    // Designation and category
    const designation = String(
      rowObj['designation'] ?? rowObj['id number'] ?? rowObj['idnumber'] ?? 
      rowObj['post'] ?? rowObj['title'] ?? rowObj['position'] ?? ''
    ).trim();

    const category = String(
      rowObj['department'] ?? rowObj['category'] ?? rowObj['dept'] ?? 
      rowObj['dept.'] ?? rowObj['division'] ?? rowObj['section'] ?? rowObj['group'] ?? 'staff'
    ).trim();

    // Location
    const locationRaw = String(
      rowObj['location id'] ?? rowObj['location'] ?? rowObj['location name'] ?? 
      rowObj['area'] ?? rowObj['site'] ?? rowObj['device'] ?? 
      rowObj['device name'] ?? rowObj['terminal'] ?? rowObj['terminal name'] ?? 
      rowObj['machine'] ?? rowObj['station'] ?? ''
    ).trim();

    // Check for paired In-Time / Out-Time columns (Timesheet / Summary Report Format)
    const inPart = rowObj['in time'] ?? rowObj['in-time'] ?? rowObj['intime'] ?? 
                   rowObj['time in'] ?? rowObj['timein'] ?? rowObj['clock in'] ?? 
                   rowObj['clockin'] ?? rowObj['first in'] ?? rowObj['firstin'] ?? 
                   rowObj['in'] ?? rowObj['entry'] ?? rowObj['check in'] ?? rowObj['checkin'];

    const outPart = rowObj['out time'] ?? rowObj['out-time'] ?? rowObj['outtime'] ?? 
                    rowObj['time out'] ?? rowObj['timeout'] ?? rowObj['clock out'] ?? 
                    rowObj['clockout'] ?? rowObj['last out'] ?? rowObj['lastout'] ?? 
                    rowObj['out'] ?? rowObj['exit'] ?? rowObj['check out'] ?? rowObj['checkout'];

    const datePart = rowObj['date'] ?? rowObj['att date'] ?? rowObj['attendance date'] ?? 
                     rowObj['punch date'] ?? rowObj['log date'] ?? rowObj['work date'] ?? 
                     rowObj['workdate'] ?? rowObj['dateiso'] ?? rowObj['date_iso'] ?? '';

    const singleTimePart = rowObj['time'] ?? rowObj['punch time'] ?? rowObj['punchtime'] ?? 
                           rowObj['log time'] ?? rowObj['logtime'] ?? rowObj['clock time'] ?? 
                           rowObj['clocktime'] ?? '';

    const combinedDateTimePart = rowObj['date/time'] ?? rowObj['datetime'] ?? rowObj['date_time'] ?? 
                                 rowObj['date & time'] ?? rowObj['date time'] ?? rowObj['timestamp'] ?? '';

    // Handle Paired Format (In Time AND/OR Out Time)
    if (inPart !== undefined || outPart !== undefined) {
      const baseDateStr = String(datePart || combinedDateTimePart || '').trim();
      
      // Add In punch if exists
      if (inPart !== undefined && inPart !== null && String(inPart).trim() !== '' && String(inPart).trim() !== '--:--') {
        const inStr = String(inPart).trim();
        let inDateObj: Date | null = null;
        if (inPart instanceof Date) {
          inDateObj = inPart;
        } else if (baseDateStr) {
          inDateObj = parseDateTimeToLocal(baseDateStr, inStr);
        } else {
          inDateObj = parseCombinedDateTimeToLocal(inStr);
        }
        if (inDateObj && !isNaN(inDateObj.getTime())) {
          const hh = String(inDateObj.getHours()).padStart(2, '0');
          const mm = String(inDateObj.getMinutes()).padStart(2, '0');
          punches.push({
            empId: cleanId,
            rawName,
            designation,
            category,
            locationRaw,
            punchDate: inDateObj,
            timeStr: `${hh}:${mm}`
          });
        }
      }

      // Add Out punch if exists
      if (outPart !== undefined && outPart !== null && String(outPart).trim() !== '' && String(outPart).trim() !== '--:--') {
        const outStr = String(outPart).trim();
        let outDateObj: Date | null = null;
        if (outPart instanceof Date) {
          outDateObj = outPart;
        } else if (baseDateStr) {
          outDateObj = parseDateTimeToLocal(baseDateStr, outStr);
        } else {
          outDateObj = parseCombinedDateTimeToLocal(outStr);
        }
        if (outDateObj && !isNaN(outDateObj.getTime())) {
          const hh = String(outDateObj.getHours()).padStart(2, '0');
          const mm = String(outDateObj.getMinutes()).padStart(2, '0');
          punches.push({
            empId: cleanId,
            rawName,
            designation,
            category,
            locationRaw,
            punchDate: outDateObj,
            timeStr: `${hh}:${mm}`
          });
        }
      }
      continue;
    }

    // Handle Single Punch format (Date + Time or Combined DateTime)
    let punchDateObj: Date | null = null;
    const dateVal = datePart || combinedDateTimePart;
    const timeVal = singleTimePart;

    if (dateVal instanceof Date) {
      punchDateObj = new Date(dateVal.getTime());
      if (timeVal) {
        const tObj = parseDateTimeToLocal('2000-01-01', String(timeVal));
        if (tObj) {
          punchDateObj.setHours(tObj.getHours(), tObj.getMinutes(), tObj.getSeconds(), 0);
        }
      }
    } else if (dateVal !== undefined && dateVal !== null && String(dateVal).trim() !== '') {
      const dStr = String(dateVal).trim();
      const tStr = timeVal !== undefined && timeVal !== null ? String(timeVal).trim() : '';
      if (tStr) {
        punchDateObj = parseDateTimeToLocal(dStr, tStr);
      } else {
        punchDateObj = parseCombinedDateTimeToLocal(dStr);
      }
    } else if (timeVal !== undefined && timeVal !== null && String(timeVal).trim() !== '') {
      punchDateObj = parseCombinedDateTimeToLocal(String(timeVal).trim());
    }

    if (punchDateObj && !isNaN(punchDateObj.getTime())) {
      const hh = String(punchDateObj.getHours()).padStart(2, '0');
      const mm = String(punchDateObj.getMinutes()).padStart(2, '0');
      punches.push({
        empId: cleanId,
        rawName,
        designation,
        category,
        locationRaw,
        punchDate: punchDateObj,
        timeStr: `${hh}:${mm}`
      });
    } else {
      skippedCount++;
    }
  }

  return {
    punches,
    skippedCount,
    skippedInactive,
    rawRowsCount: dataRows.length,
    detectedDateFormat: fileDateFormat
  };
}
