/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Table, Upload, Menu, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { checkConnection, supabase } from './lib/supabaseClient';
import EmployeeSelectorModal from './components/EmployeeSelectorModal';
import Sidebar from './components/Sidebar';
import EmployeeSection from './components/EmployeeSection';
import AttendanceSection from './components/AttendanceSection';
import ComparisonSection from './components/ComparisonSection';
import MonthlyReportSection from './components/MonthlyReportSection';
import TimeCardSection from './components/TimeCardSection';
import LateReportSection from './components/LateReportSection';
import OvertimeSection from './components/OvertimeSection';
import LocationSection from './components/LocationSection';
import UploadSection from './components/UploadSection';
import ManualEntrySection from './components/ManualEntrySection';
import LiveLocationMap from './components/LiveLocationMap';
import { getTodayShiftDate, formatSystemDate, getEmployeeShift, getShiftDateForTime, parseCombinedDateTimeToLocal, getShiftRelativeMinutes, cacheDbShift, parseEducationAndShift, normalizeToYYYYMMDD, getPossibleDateFormats, isEmployeeActive } from './lib/dateUtils';

interface AttendanceRecord {
  name: string;
  no: string;
  date: string;
  dateISO: string;
  sysInTime: string;
  sysOutTime: string;
  manualInTime?: string;
  manualOutTime?: string;
  status: string;
  locationId: string;
  idNumber: string;
  live_location?: string;
  live_location_in?: string;
  live_location_out?: string;
  late_remark?: string;
}

interface Employee {
  id: string;
  name: string;
  designation: string;
  education: string;
  category: string;
  salary: string;
  joinDate: string;
  phoneNumber: string;
  status?: string;
}

export const STAFF_IDS = [
  '16153', '15439', '16325', '15524', '16135', '16117', '15525', '16254', '15608', '16279', 
  '15590', '15832', '16187', '15548', '16110', '16004', '16114', '16270', '16099', '16193', '16009', '15973', '16156'
];

export const isStaffEmployee = (emp: any) => {
  const idValue = String(emp.id).trim();
  if (STAFF_IDS.includes(idValue)) return true;
  const cat = (emp.category || '').toLowerCase().trim();
  if (cat.includes('staff')) return true;
  if (cat.includes('security') || cat.includes('guard')) return false;
  const desig = (emp.designation || '').toLowerCase().trim();
  if (desig.includes('security') || desig.includes('guard') || desig.includes('ansar')) return false;
  return true;
};

export const isSecurityEmployee = (emp: any) => {
  return !isStaffEmployee(emp);
};

export default function App() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [showProgress, setShowProgress] = useState(false);
  const [showList, setShowList] = useState<'present' | 'absent' | 'present-staff' | 'absent-staff' | 'present-security' | 'absent-security' | null>(null);

  const fetchData = async () => {
    const conn = await checkConnection();
    setDbStatus(conn.connected ? 'connected' : 'error');
    
    if (conn.connected) {
      const { data: emplData, error: emplError } = await supabase.from('employees').select('*');
      if (emplError) console.error('Error fetching employees:', emplError);
      else if (emplData) {
        const normalized = emplData.map((e: any) => {
          const empId = String(e.id).trim();
          const { education, shift } = parseEducationAndShift(e.education);
          
          let finalShift: 'Day' | 'Night' = shift;
          const hasDbShift = e.education && (String(e.education).endsWith('|Day') || String(e.education).endsWith('|Night'));
          
          if (!hasDbShift) {
            // If DB doesn't have an encoded shift yet, check if there is an existing legacy local shift in the browser.
            const savedLocal = localStorage.getItem(`emp_shift_${empId}`);
            if (savedLocal === 'Day' || savedLocal === 'Night') {
              finalShift = savedLocal;
              // Sync legacy local shift to database so it is permanently synchronized and not lost!
              const encodedEducation = `${education}|${finalShift}`;
              supabase.from('employees').update({ education: encodedEducation }).eq('id', empId)
                .then(({ error }) => {
                  if (error) console.error(`Failed to migrate legacy local shift for employee ${empId}:`, error);
                  else console.log(`Migrated legacy local shift for employee ${empId} to DB: ${finalShift}`);
                });
            }
          }
          
          cacheDbShift(empId, finalShift);
          const isKnownInactive = empId === '15641' || empId === '15895' || String(e.name || '').toUpperCase().includes('JUBAIR BIN AHMED');
          const finalStatus = e.status || (isKnownInactive ? 'Resigned' : 'Active');
          return {
            ...e,
            id: empId,
            education: education,
            joinDate: e.join_date || e.joinDate || '',
            phoneNumber: e.phone_number || e.phoneNumber || '',
            status: finalStatus
          };
        });
        setEmployees(normalized as Employee[]);
      }

      const { data: locData, error: locError } = await supabase.from('locations').select('*');
      if (locError) console.error('Error fetching locations:', locError);
      else if (locData) setLocations(locData);

      const { data: attData, error: attError } = await supabase.from('attendance').select('*, employees(name)').order('created_at', { ascending: false }).limit(60000);
      if (attError) {
        console.error('Error fetching attendance in App:', attError);
      } else if (attData) {
        // Group by emp_id + normalized date to merge legacy and new format records
        const mergedMap: Record<string, any> = {};
        
        // Process records - since they are ordered by created_at DESC, we encounter newest updates first
        attData.forEach((a: any) => {
            const empId = a.employee_id ? String(a.employee_id).trim() : '';
            if (!empId) return;
            const normalizedDate = normalizeToYYYYMMDD(a.date_iso || '');
            if (!normalizedDate) return;
            const key = `${empId}_${normalizedDate}`;
            
            const row = {
                no: empId,
                name: a.employees?.name || 'Unknown',
                dateISO: normalizedDate,
                date: normalizedDate,
                sysInTime: a.sys_in_time || '',
                sysOutTime: a.sys_out_time || '',
                manualInTime: a.manual_in_time || '',
                manualOutTime: a.manual_out_time || '',
                status: a.status || 'Absent',
                locationId: a.location_id || '',
                idNumber: a.id_number || '',
                live_location: a.live_location || '',
                live_location_in: a.live_location_in || '',
                live_location_out: a.live_location_out || '',
                late_remark: a.late_remark || '',
            };

            if (!mergedMap[key]) {
                mergedMap[key] = row;
            } else {
                // Merge logic: if existing has no punches and row does, take row
                const existing = mergedMap[key];
                const hasPunches = (r: any) => !!(String(r.sysInTime || '').trim() || String(r.sysOutTime || '').trim() || String(r.manualInTime || '').trim() || String(r.manualOutTime || '').trim());
                
                const rowHasPunches = hasPunches(row);
                const existingHasPunches = hasPunches(existing);

                if (!existingHasPunches && rowHasPunches) {
                    // This row (which is older in created_at but has punches) is better
                    // Keep existing non-punch fields like live_location if row missing them
                    const merged = { ...row };
                    if (!merged.live_location) merged.live_location = existing.live_location;
                    if (!merged.late_remark) merged.late_remark = existing.late_remark;
                    mergedMap[key] = merged;
                } else {
                    // Update existing with fields from this (older) row if existing missing them
                    if (!existing.live_location) existing.live_location = row.live_location;
                    if (!existing.late_remark) existing.late_remark = row.late_remark;
                    if (existing.status === 'Absent' && row.status && row.status !== 'Absent') {
                        existing.status = row.status;
                    }
                }
            }
        });

        const formatted = Object.values(mergedMap);
        setAttendance(formatted as AttendanceRecord[]);
      }
    }
  };

  useEffect(() => {
    fetchData();
    // Prompt for Geolocation permission immediately upon entering the site
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log("Initial geolocation permitted on entry:", pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          console.warn("Initial geolocation prompt handled or denied on load:", err);
        },
        { enableHighAccuracy: false, timeout: 10000 }
      );
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newEmp, setNewEmp] = useState<Partial<Employee>>({});
  const [viewMode, setViewMode] = useState<'admin' | 'user'>('user');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [locations, setLocations] = useState<{id: string, name: string}[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [preSelectedEmployeeId, setPreSelectedEmployeeId] = useState<string | null>(null);


  const handleAdminVerify = () => {
    if (passwordInput === '4957629') {
      setViewMode('admin');
      setShowPasswordPrompt(false);
      setPasswordInput('');
    } else {
      alert('Incorrect Password. Please check with your supervisor.');
    }
  };

  const handleAdminKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdminVerify();
  };

  const setMode = (mode: 'admin' | 'user') => {
    setViewMode(mode);
  };

  const processData = async (parsedLines: any[]) => {
    console.log('Processing data lines:', parsedLines.length);
    if (!parsedLines || parsedLines.length === 0) {
      setUploading(false);
      return;
    }
    
    // Clean BOM/spaces from keys and values for bulletproof parsing
    const rawData = parsedLines.map(row => {
        const cleanedRow: any = {};
        for (const k of Object.keys(row)) {
            const cleanedKey = k.toLowerCase().replace(/^\uFEFF/, '').trim();
            cleanedRow[cleanedKey] = row[k] !== undefined && row[k] !== null ? String(row[k]).trim() : '';
        }
        
        // Comprehensive ID detection including user's specific "No." column
        const rawId = cleanedRow['no.'] || cleanedRow['no'] || cleanedRow['id'] || 
                      cleanedRow['employee id'] || cleanedRow['employeeid'] || 
                      cleanedRow['id number'] || cleanedRow['idnumber'] || 
                      cleanedRow['emp. id'] || cleanedRow['ac-no'] || 
                      cleanedRow['enroll number'] || cleanedRow['userid'] ||
                      cleanedRow['staff id'] || cleanedRow['staffid'];
                      
        let cleanId = rawId ? String(rawId).trim() : '';
        if (cleanId.endsWith('.0')) {
            cleanId = cleanId.slice(0, -2);
        }
        cleanedRow._cleanEmpId = cleanId;
        return cleanedRow;
    }).filter(row => {
        if (!row._cleanEmpId) {
            // Only warn if row has some actual data (skip purely empty rows)
            const hasData = Object.keys(row).some(k => k !== '_cleanEmpId' && row[k] !== '');
            if (hasData) console.warn('Row missing identification column:', row);
        }
        return !!row._cleanEmpId;
    });

    if (rawData.length === 0) {
      alert('Upload failed: Could not find any valid employee IDs.\n\nMake sure your file has a column named "No.", "ID", "No", or "Employee ID".');
      setUploading(false);
      return;
    }
    
    // First, get all current employee IDs from the database
    const { data: allEmps } = await supabase.from('employees').select('id, name');
    const empIdSet = new Set(allEmps?.map(e => String(e.id).trim()) || []);
    const empNameMap = new Map<string, string>(); // name.toLowerCase() -> id
    allEmps?.forEach(e => {
        if (e.name) empNameMap.set(e.name.toLowerCase().trim(), String(e.id).trim());
    });

    // Fetch all current locations
    const { data: allLocs } = await supabase.from('locations').select('id, name');
    const locIdSet = new Set(allLocs?.map(l => String(l.id).trim()) || []);
    const locNameMap = new Map<string, string>();
    allLocs?.forEach(l => {
        if (l.name) locNameMap.set(l.name.toLowerCase().trim(), String(l.id).trim());
    });

    // Auto-registration module for new employees
    const missingEmployeesToRegister = new Map<string, any>();
    for (const rec of rawData) {
        const empId = rec._cleanEmpId;
        if (empId && !empIdSet.has(empId) && !missingEmployeesToRegister.has(empId)) {
            const rawName = (rec['name'] || rec['employee name'] || rec['staff name'] || rec['ename'] || '').trim();
            const empName = rawName || `Employee ${empId}`;
            const designation = (rec['id number'] || rec['designation'] || rec['post'] || rec['title'] || '').trim();
            const category = (rec['department'] || rec['category'] || rec['dept'] || rec['group'] || 'staff').trim();
            
            missingEmployeesToRegister.set(empId, {
                id: empId,
                name: empName,
                designation: designation,
                category: category,
                join_date: null,
                phone_number: '',
                education: 'Graduate|Day',
                salary: '0'
            });
        }
    }

    if (missingEmployeesToRegister.size > 0) {
        const toInsert = Array.from(missingEmployeesToRegister.values());
        const { error: insertError } = await supabase.from('employees').insert(toInsert);
        if (!insertError) {
            toInsert.forEach(emp => {
                empIdSet.add(emp.id);
                cacheDbShift(emp.id, 'Day');
            });
        }
    }

    // Auto-registration for missing locations
    const missingLocationsToRegister = new Map<string, any>();
    for (const rec of rawData) {
        const rawLoc = String(rec['location id'] || rec['location'] || rec['location name'] || rec['area'] || rec['site'] || '').trim();
        if (rawLoc) {
            const rawLocLower = rawLoc.toLowerCase();
            if (!locIdSet.has(rawLoc) && !locNameMap.has(rawLocLower) && !missingLocationsToRegister.has(rawLocLower)) {
                const isNumeric = /^\d+$/.test(rawLoc);
                missingLocationsToRegister.set(rawLocLower, { id: rawLoc, name: isNumeric ? `Location ${rawLoc}` : rawLoc });
            }
        }
    }

    if (missingLocationsToRegister.size > 0) {
        const toInsertLocs = Array.from(missingLocationsToRegister.values());
        const { error: insertLocError } = await supabase.from('locations').insert(toInsertLocs);
        if (!insertLocError) {
            toInsertLocs.forEach(loc => {
                locIdSet.add(loc.id);
                locNameMap.set(loc.name.toLowerCase().trim(), loc.id);
            });
        }
    }

    const groupedData: Record<string, any> = {};
    let skippedCount = 0;

    for (let i = 0; i < rawData.length; i++) {
       const rec = rawData[i];
       const empId = rec._cleanEmpId;
       const datePart = rec['date'] || rec['date/time'] || rec['datetime'] || rec['dateiso'] || rec['logdate'] || rec['punchdate'] || rec['work date'] || '';
       const timePart = rec['time'] || rec['logtime'] || rec['punchtime'] || rec['clock time'] || '';
       const dateTimeStr = (datePart + ' ' + timePart).trim();

       if (empId && dateTimeStr && empIdSet.has(empId)) {
          try {
              const dateObj = parseCombinedDateTimeToLocal(dateTimeStr);
              if (dateObj && !isNaN(dateObj.getTime())) {
                  const empShift = getEmployeeShift(empId);
                  const dateIso = getShiftDateForTime(dateObj, empShift);
                  const hh = String(dateObj.getHours()).padStart(2, '0');
                  const mm = String(dateObj.getMinutes()).padStart(2, '0');
                  const timeStr = `${hh}:${mm}`;
                  const key = `${empId}_${dateIso}`;

                  const rawLoc = String(rec['location id'] || rec['location'] || rec['location name'] || rec['area'] || rec['site'] || '').trim();
                  let resolvedLocId: string | null = null;
                  if (rawLoc) {
                      if (locIdSet.has(rawLoc)) resolvedLocId = rawLoc;
                      else if (locNameMap.has(rawLoc.toLowerCase())) resolvedLocId = locNameMap.get(rawLoc.toLowerCase()) || null;
                  }

                  if (!groupedData[key]) {
                      groupedData[key] = {
                          empId, date: dateIso, punches: [],
                          idKey: rec['id number'] || rec['idkey'] || rec['idnumber'] || rec['title'] || null,
                          locationId: resolvedLocId
                      };
                  } else if (resolvedLocId && !groupedData[key].locationId) {
                      groupedData[key].locationId = resolvedLocId;
                  }
                  groupedData[key].punches.push({ time: dateObj, timeStr });
              }
          } catch (e) { console.error("Error parsing date:", dateTimeStr, e); }
       } else if (empId && !empIdSet.has(empId)) {
          skippedCount++;
       }
       if (i % Math.max(1, Math.floor(rawData.length / 10)) === 0) {
          setUploadProgress(Math.round(((i + 1) / rawData.length) * 30)); 
       }
    }

    const empIdsToFetch = Array.from(new Set(Object.values(groupedData).map((g: any) => g.empId)));
    const datesToFetchSet = new Set<string>();
    Object.values(groupedData).forEach((g: any) => {
        datesToFetchSet.add(g.date);
        const parts = g.date.split('-');
        if (parts.length === 3) {
            const nextDay = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 1);
            datesToFetchSet.add(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`);
        }
    });
    const datesToFetch = Array.from(datesToFetchSet);

    const existingMap: Record<string, any> = {};
    if (empIdsToFetch.length > 0 && datesToFetch.length > 0) {
        const fetchChunkSize = 100;
        for (let i = 0; i < empIdsToFetch.length; i += fetchChunkSize) {
            const { data: records } = await supabase.from('attendance').select('*')
                .in('employee_id', empIdsToFetch.slice(i, i + fetchChunkSize))
                .in('date_iso', datesToFetch);
            records?.forEach((r: any) => {
                const key = `${String(r.employee_id).trim()}_${normalizeToYYYYMMDD(r.date_iso || '')}`;
                const hasPunches = (rec: any) => !!(rec.sys_in_time || rec.sys_out_time || rec.manual_in_time || rec.manual_out_time);
                if (!existingMap[key] || (!hasPunches(existingMap[key]) && hasPunches(r))) existingMap[key] = r;
            });
        }
    }

    setUploadProgress(35);

    const attendanceData = Object.values(groupedData).map((group: any) => {
        const { empId, date: dateIso } = group;
        const key = `${empId}_${dateIso}`;
        const existing = existingMap[key];
        const firstDayPunches: any[] = [];
        const nextDayLatePunches: any[] = [];

        if (dateIso) {
            try {
                const parts = dateIso.split('-');
                const nextDayStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 1, 0, 0, 0);
                const nextDayEnd = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) + 1, 6, 0, 0);
                group.punches.forEach((p: any) => {
                    if (p.time.getTime() >= nextDayStart.getTime() && p.time.getTime() <= nextDayEnd.getTime()) nextDayLatePunches.push(p);
                    else firstDayPunches.push(p);
                });
            } catch (e) { firstDayPunches.push(...group.punches); }
        } else firstDayPunches.push(...group.punches);

        const uniqueFirst = Array.from(new Set(firstDayPunches.map(p => p.timeStr))).map(t => firstDayPunches.find(p => p.timeStr === t)!).sort((a, b) => a.time.getTime() - b.time.getTime());
        const uniqueNext = Array.from(new Set(nextDayLatePunches.map(p => p.timeStr))).map(t => nextDayLatePunches.find(p => p.timeStr === t)!).sort((a, b) => a.time.getTime() - b.time.getTime());

        let inTime = uniqueFirst.length > 0 ? uniqueFirst[0].timeStr : null;
        let outTime = uniqueNext.length > 0 ? uniqueNext[uniqueNext.length-1].timeStr : (uniqueFirst.length > 1 ? uniqueFirst[uniqueFirst.length-1].timeStr : null);

        return {
            ...(existing || {}), employee_id: empId, date_iso: dateIso,
            sys_in_time: inTime, sys_out_time: outTime,
            manual_in_time: inTime, manual_out_time: outTime,
            id_number: group.idKey || (existing ? existing.id_number : null),
            location_id: group.locationId || (existing ? existing.location_id : null),
            status: (existing && existing.status && existing.status !== 'Absent') ? existing.status : 'Present'
        };
    });

    const finalAttendanceMap: Record<string, any> = { ...existingMap };
    attendanceData.forEach(item => finalAttendanceMap[`${item.employee_id}_${item.date_iso}`] = item);

    const sanitizedAttendanceData = Object.values(finalAttendanceMap).filter((item: any) => 
        item.employee_id && item.date_iso && (!!existingMap[`${item.employee_id}_${item.date_iso}`] || !!(item.sys_in_time || item.sys_out_time || item.manual_in_time || item.manual_out_time) || (item.status && item.status !== 'Absent'))
    );

    setUploadProgress(40);
    let errorCount = 0;
    let lastErrorMsg = '';
    const chunkSize = 50;
    for (let i = 0; i < sanitizedAttendanceData.length; i += chunkSize) {
      const chunk = sanitizedAttendanceData.slice(i, i + chunkSize);
      const cleanedChunk = chunk.map((item: any) => {
          const c: any = {
              employee_id: String(item.employee_id).trim(), date_iso: item.date_iso,
              sys_in_time: item.sys_in_time || null, sys_out_time: item.sys_out_time || null,
              manual_in_time: item.manual_in_time || item.sys_in_time || null,
              manual_out_time: item.manual_out_time || item.sys_out_time || null,
              status: item.status || 'Present', location_id: item.location_id || null,
              id_number: item.id_number || null, live_location_in: item.live_location_in || null,
              live_location_out: item.live_location_out || null, late_remark: item.late_remark || null
          };
          if (item.live_location) c.live_location = item.live_location;
          return c;
      });

      const { error: upsertError } = await supabase.from('attendance').upsert(cleanedChunk, { onConflict: 'employee_id,date_iso' });
      if (upsertError) { errorCount += chunk.length; lastErrorMsg = upsertError.message; }
      setUploadProgress(40 + Math.round(((i + chunk.length) / sanitizedAttendanceData.length) * 60));
    }

    alert(`Upload finished!\n- ${sanitizedAttendanceData.length - errorCount} records updated.\n${errorCount > 0 ? `- ${errorCount} failed records.\n` : ''}${skippedCount > 0 ? `- ${skippedCount} items skipped.` : ''}`);
    fetchData();
    setUploading(false);
    setUploadProgress(0);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: "greedy",
        error: (err) => {
          console.error('Papa.parse error:', err);
          alert('CSV Parsing Error: ' + err.message);
          setUploading(false);
        },
        complete: (results) => processData(results.data)
      });
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          processData(jsonData);
        } catch (err: any) {
          console.error('Excel parse error:', err);
          alert('Excel Parsing Error: ' + err.message);
          setUploading(false);
        }
      };
      reader.onerror = () => {
        alert('File reading failed');
        setUploading(false);
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('Unsupported file format. Please upload .CSV or .XLSX');
      setUploading(false);
    }
  };

  const renderMetricsGrid = () => {
    const activeStaff = employees.filter(isEmployeeActive).filter(isStaffEmployee);
    const activeSecurity = employees.filter(isEmployeeActive).filter(isSecurityEmployee);

    return (
    <div className="pt-4 border-t border-stone-200">
      <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-stone-400 mb-4 font-mono">Present Status Summary / বর্তমান পরিসংখ্যান</h4>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Staff Force */}
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-stone-100 pb-2.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <h3 className="font-serif italic text-stone-900 text-sm font-bold uppercase tracking-wider">
                Staff (স্টাফ)
              </h3>
            </div>
            <span className="text-[9px] bg-amber-50 border border-amber-200/50 text-amber-800 px-1.5 py-0.5 rounded-sm font-bold">
              OFFICE / ADMIN
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-stone-150">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider">Total</span>
              <span className="text-xl md:text-2xl font-serif italic text-stone-900 mt-1 font-bold">
                {activeStaff.length}
              </span>
            </div>
            <button 
              onClick={() => setShowList('present-staff')}
              className="flex flex-col hover:bg-green-50 rounded py-1 transition-colors group cursor-pointer"
            >
              <span className="text-[9px] uppercase font-bold text-green-600 tracking-wider group-hover:underline">Present</span>
              <span className="text-xl md:text-2xl font-serif italic text-green-700 mt-1 font-bold">
                {(() => {
                  return activeStaff.filter(emp => {
                    const shift = getEmployeeShift(emp.id);
                    const targetDate = getTodayShiftDate(shift);
                    return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                  }).length;
                })()}
              </span>
            </button>
            <button 
              onClick={() => setShowList('absent-staff')}
              className="flex flex-col hover:bg-red-50 rounded py-1 transition-colors group cursor-pointer"
            >
              <span className="text-[9px] uppercase font-bold text-red-500 tracking-wider group-hover:underline">Absent</span>
              <span className="text-xl md:text-2xl font-serif italic text-red-600 mt-1 font-bold">
                {(() => {
                  const presentCount = activeStaff.filter(emp => {
                    const shift = getEmployeeShift(emp.id);
                    const targetDate = getTodayShiftDate(shift);
                    return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                  }).length;
                  return Math.max(0, activeStaff.length - presentCount);
                })()}
              </span>
            </button>
          </div>
        </div>

        {/* Card 2: Security Force */}
        <div className="bg-white border border-stone-200 shadow-sm rounded-sm p-5 flex flex-col justify-between">
          <div className="flex justify-between items-center border-b border-stone-100 pb-2.5 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <h3 className="font-serif italic text-stone-900 text-sm font-bold uppercase tracking-wider">
                Security (নিরাপত্তা)
              </h3>
            </div>
            <span className="text-[9px] bg-indigo-50 border border-indigo-200/50 text-indigo-800 px-1.5 py-0.5 rounded-sm font-bold">
              GUARD FORCE
            </span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-stone-150">
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-stone-400 tracking-wider">Total</span>
              <span className="text-xl md:text-2xl font-serif italic text-stone-900 mt-1 font-bold">
                {activeSecurity.length}
              </span>
            </div>
            <button 
              onClick={() => setShowList('present-security')}
              className="flex flex-col hover:bg-green-50 rounded py-1 transition-colors group cursor-pointer"
            >
              <span className="text-[9px] uppercase font-bold text-green-600 tracking-wider group-hover:underline">Present</span>
              <span className="text-xl md:text-2xl font-serif italic text-green-700 mt-1 font-bold">
                {(() => {
                  return activeSecurity.filter(emp => {
                    const shift = getEmployeeShift(emp.id);
                    const targetDate = getTodayShiftDate(shift);
                    return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                  }).length;
                })()}
              </span>
            </button>
            <button 
              onClick={() => setShowList('absent-security')}
              className="flex flex-col hover:bg-red-50 rounded py-1 transition-colors group cursor-pointer"
            >
              <span className="text-[9px] uppercase font-bold text-red-500 tracking-wider group-hover:underline">Absent</span>
              <span className="text-xl md:text-2xl font-serif italic text-red-600 mt-1 font-bold">
                {(() => {
                  const presentCount = activeSecurity.filter(emp => {
                    const shift = getEmployeeShift(emp.id);
                    const targetDate = getTodayShiftDate(shift);
                    return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                  }).length;
                  return Math.max(0, activeSecurity.length - presentCount);
                })()}
              </span>
            </button>
          </div>
        </div>

        {/* Card 3: Date & System Sync Status */}
        <div className="bg-stone-900 text-stone-100 rounded-sm p-5 flex flex-col justify-between border border-stone-950">
          <div className="flex justify-between items-center pb-2.5 border-b border-stone-800">
            <div className="flex items-center gap-1.5 text-amber-500 font-bold uppercase text-[9px] tracking-wider leading-none">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping shrink-0" />
              Live System Date
            </div>
            <span className="text-[8px] font-mono bg-stone-800 text-stone-400 border border-stone-700 px-1.5 py-0.5 rounded uppercase font-bold">
              ACTIVE CONTROL
            </span>
          </div>
          
          <div className="flex flex-col mt-2">
            <div className="text-[9px] uppercase font-bold text-stone-450 tracking-wider">Date Tracked</div>
            <div className="text-sm md:text-md font-bold text-white leading-tight mt-1">
              {formatSystemDate(getTodayShiftDate())}
            </div>
          </div>
          
          <p className="text-[8.5px] text-stone-500 mt-2 font-mono leading-relaxed">
            Day: 08:00 AM - 06:00 AM • Night: 08:00 PM - 08:00 AM
          </p>
        </div>
      </div>
    </div>
  );
};

  return (
      <div className="flex bg-stone-100 min-h-screen relative overflow-x-hidden">
      <Sidebar 
        activeSection={activeSection} 
        setActiveSection={(s) => {
          setActiveSection(s);
          setIsSidebarOpen(false);
        }} 
        viewMode={viewMode}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main className="flex-grow p-3 md:p-10 w-full max-w-full overflow-x-hidden">
        <header className="flex justify-between items-center mb-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 bg-white rounded-sm shadow-sm border border-stone-200"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-xl md:text-2xl font-serif italic text-stone-900 tracking-wide">HR Assistant</h1>
          </div>
          <div className="flex gap-4">
             {showPasswordPrompt ? (
               <div className="flex gap-2">
                 <input 
                   type="password" 
                   value={passwordInput} 
                   onChange={e => setPasswordInput(e.target.value)} 
                   onKeyDown={handleAdminKeyPress}
                   placeholder="Enter Password"
                   className="bg-white border border-stone-300 text-xs p-2 rounded focus:ring-1 focus:ring-amber-400 outline-none w-32" 
                   autoFocus
                 />
                 <button onClick={handleAdminVerify} className="bg-amber-400 text-black px-4 py-2 text-xs font-bold uppercase rounded shadow-sm hover:bg-amber-500 transition-colors">Verify</button>
                 <button onClick={() => setShowPasswordPrompt(false)} className="text-stone-400 hover:text-stone-600">
                   <X size={18} />
                 </button>
               </div>
             ) : (
                <button 
                  onClick={() => viewMode === 'admin' ? setViewMode('user') : setShowPasswordPrompt(true)} 
                  className={`px-4 py-2 text-xs font-bold uppercase rounded transition-all ${viewMode === 'admin' ? 'bg-amber-400 text-black shadow-md' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                >
                  {viewMode === 'admin' ? '✓ Admin Mode' : 'Admin Login'}
                </button>
             )}
          </div>
        </header>

        {dbStatus === 'error' && (
          <div className="bg-red-50 border border-red-100 p-4 rounded-sm mb-8 flex flex-col gap-2">
            <h2 className="text-red-800 font-bold text-sm uppercase tracking-tight">Database Connection Failed</h2>
            <p className="text-red-600 text-xs">
              Please ensure your Supabase environment variables (URL and ANON KEY) are correctly configured in the project secrets.
            </p>
            <button 
              onClick={fetchData}
              className="text-[10px] font-bold uppercase bg-red-800 text-white px-3 py-1.5 w-fit rounded hover:bg-red-900 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        )}

        {dbStatus === 'checking' && (
          <div className="flex items-center justify-center p-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-stone-800"></div>
          </div>
        )}        {dbStatus === 'connected' && (
          <>
            {/* Status List Modal */}
            {showList && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white w-full max-w-md rounded-sm shadow-xl flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b flex justify-between items-center bg-stone-50">
                    <h3 className="font-serif italic text-stone-900 text-lg">
                      {showList === 'present-staff' ? 'Present Staff Today (স্টাফ উপস্থিত)' :
                       showList === 'absent-staff' ? 'Absent Staff Today (স্টাফ অনুপস্থিত)' :
                       showList === 'present-security' ? 'Present Security Today (সিকিউরিটি উপস্থিত)' :
                       showList === 'absent-security' ? 'Absent Security Today (সিকিউরিটি অনুপস্থিত)' :
                       showList === 'present' ? 'Present Employees Today' : 'Absent Employees Today'}
                    </h3>
                    <button onClick={() => setShowList(null)} className="p-2 hover:bg-stone-200 rounded-full transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                  <div className="overflow-y-auto p-2">
                    {(() => {
                      const isEmpPresent = (empId: string) => {
                        const shift = getEmployeeShift(empId);
                        const targetDate = getTodayShiftDate(shift);
                        return attendance.some(a => a.no === empId && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                      };
                      
                      const activeEmployees = employees.filter(isEmployeeActive);
                      const list = (() => {
                        if (showList === 'present-staff') return activeEmployees.filter(isStaffEmployee).filter(e => isEmpPresent(e.id));
                        if (showList === 'absent-staff') return activeEmployees.filter(isStaffEmployee).filter(e => !isEmpPresent(e.id));
                        if (showList === 'present-security') return activeEmployees.filter(isSecurityEmployee).filter(e => isEmpPresent(e.id));
                        if (showList === 'absent-security') return activeEmployees.filter(isSecurityEmployee).filter(e => !isEmpPresent(e.id));
                        if (showList === 'present') return activeEmployees.filter(e => isEmpPresent(e.id));
                        return activeEmployees.filter(e => !isEmpPresent(e.id));
                      })();

                      if (list.length === 0) {
                        return <div className="p-8 text-center text-stone-400 italic">No records found.</div>;
                      }

                      return (
                        <div className="divide-y divide-stone-100">
                          {list.map(emp => {
                            const shift = getEmployeeShift(emp.id);
                            const targetDate = getTodayShiftDate(shift);
                            const isAdmin = viewMode === 'admin';
                            return (
                              <div 
                                key={emp.id} 
                                onClick={() => {
                                  if (isAdmin) {
                                    setPreSelectedEmployeeId(emp.id);
                                    setActiveSection('dashboard');
                                    setShowList(null);
                                  }
                                }}
                                className={`p-3 flex justify-between items-center transition-all ${
                                  isAdmin 
                                    ? 'hover:bg-amber-50 cursor-pointer border-l-2 border-transparent hover:border-amber-500' 
                                    : 'hover:bg-stone-50'
                                }`}
                                title={isAdmin ? "Click to open Manual Entry / হাজিরা ফরম খুলতে ক্লিক করুন" : undefined}
                              >
                                <div>
                                  <div className={`text-sm font-bold ${isAdmin ? 'text-stone-800 hover:text-amber-700' : 'text-stone-800'}`}>{emp.name}</div>
                                  <div className="text-[10px] text-stone-500 uppercase tracking-tighter flex items-center gap-1">
                                    <span>ID: {emp.id} • {emp.designation}</span>
                                    <span className={`px-1 rounded-[2px] leading-tight text-[8px] font-bold ${
                                      shift === 'Night' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {shift === 'Night' ? 'NIGHT' : 'DAY'}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono text-right flex flex-col items-end">
                                  <span>
                                    {isEmpPresent(emp.id) ? (
                                      attendance.find(a => a.dateISO === targetDate && a.no === emp.id)?.sysInTime || 
                                      attendance.find(a => a.dateISO === targetDate && a.no === emp.id)?.manualInTime || '-'
                                    ) : (
                                      'OFFLINE'
                                    )}
                                  </span>
                                  {isAdmin && (
                                    <span className="text-[8px] text-amber-600 font-sans font-bold mt-0.5">EDIT / ইডিট</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="p-4 border-t bg-stone-50 flex justify-end">
                    <button 
                      onClick={() => setShowList(null)}
                      className="px-6 py-2 bg-stone-800 text-white text-xs font-bold uppercase rounded-sm hover:bg-stone-900 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'dashboard' && (
              <div className="space-y-8">
                {/* Visual Assistance Banner right at the absolute top of the Dashboard */}
                <div className="bg-amber-500/15 border-l-4 border-amber-500 p-4 rounded-r-sm shadow-xs flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                    <h3 className="text-xs font-bold uppercase tracking-widest text-amber-900 font-sans">
                      Attendance Panel / হাজিরা প্যানেল
                    </h3>
                  </div>
                  <p className="text-[11px] text-stone-700 leading-normal font-medium">
                    হাজিরা দিতে প্রথমে আপনার নাম সিলেক্ট করুন, জিপিএস লোড হলে <strong>'SET TIME & GPS'</strong> বাটনে চাপ দিন এবং নিচে <strong>'Submit Attendance'</strong> চাপুন।
                  </p>
                </div>

                {/* If ADMIN: Show Statistics & Metrics Dashboard at the absolute top */}
                {viewMode === 'admin' && renderMetricsGrid()}

                {/* Manual/Auto Attendance Entry Form */}
                <ManualEntrySection 
                  employees={employees.filter(isEmployeeActive)} 
                  locations={locations} 
                  onRefresh={fetchData} 
                  viewMode={viewMode} 
                  selectedEmployeeId={preSelectedEmployeeId}
                  onClearPreSelected={() => setPreSelectedEmployeeId(null)}
                />

                {/* If USER/EMPLOYEE: Show Statistics & Metrics at the bottom */}
                {viewMode !== 'admin' && renderMetricsGrid()}

                {/* Dashboard bottom: Quick Actions & Maps */}
                <div className="pt-4 border-t border-stone-200">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500">Quick Actions</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <button onClick={() => setActiveSection('attendance')} className="bg-stone-800 text-white p-4 text-xs font-bold uppercase hover:bg-stone-900 transition-colors">Daily Entry</button>
                        <button onClick={() => setActiveSection('monthly')} className="bg-stone-200 text-stone-800 p-4 text-xs font-bold uppercase hover:bg-stone-300 transition-colors">Monthly Report</button>
                      </div>
                      
                      {viewMode === 'admin' && (
                        <div className="pt-4">
                          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-2">Live Location (Admin Only)</h3>
                          <LiveLocationMap attendance={attendance} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
        {activeSection === 'employees' && <EmployeeSection employees={employees} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'locations' && <LocationSection locations={locations} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'attendance' && <AttendanceSection attendance={attendance} employees={employees.filter(isEmployeeActive)} locations={locations} viewMode={viewMode} onUpdateAttendance={async (r) => {
            // First find existing to preserve live_location, handling legacy date formats
            const { data: existingRecords } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', String(r.empId).trim())
                .in('date_iso', getPossibleDateFormats(r.date));
                
            const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;
            
            const { error } = await supabase.from('attendance').upsert([{ 
                employee_id: String(r.empId).trim(), 
                date_iso: r.date, 
                manual_in_time: r.inTime || null, 
                manual_out_time: r.outTime || null, 
                location_id: r.locationId || null,
                id_number: existing?.idNumber || String(r.empId).trim(),
                live_location: existing?.live_location || null,
                live_location_in: existing?.live_location_in || null,
                live_location_out: existing?.live_location_out || null,
                late_remark: r.lateRemark || null,
                status: 'Manual' 
            }], { onConflict: 'employee_id,date_iso' });
            
            if (error) {
                console.error('Save error:', error);
                alert('Database Error: ' + error.message + '\n\nPlease ensure your Supabase table has a unique constraint on (employee_id, date_iso).');
            } else {
                await fetchData();
                // We don't alert here to avoid annoying the user on every row save if they are doing it many times,
                // but let's at least show a console log or small toast if we had one.
                console.log('Saved attendance for', r.empId);
            }
        }} />}
        {activeSection === 'upload' && <UploadSection onUpload={handleFileUpload} inputRef={fileInputRef} uploading={uploading} progress={uploadProgress} />}
        {activeSection === 'comparison' && viewMode === 'admin' && (
          <ComparisonSection 
            employees={employees.filter(isEmployeeActive)} 
            attendance={attendance} 
            locations={locations} 
            onEmployeeClick={(empId) => {
              setPreSelectedEmployeeId(empId);
              setActiveSection('dashboard');
            }}
          />
        )}
        {activeSection === 'monthly' && <MonthlyReportSection employees={employees.filter(isEmployeeActive)} attendance={attendance} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'timecard' && <TimeCardSection employees={employees.filter(isEmployeeActive)} attendance={attendance} locations={locations} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'late' && <LateReportSection employees={employees.filter(isEmployeeActive)} locations={locations} />}
        {activeSection === 'overtime' && <OvertimeSection employees={employees.filter(isEmployeeActive)} locations={locations} />}
          </>
        )}
      </main>
    </div>
  );
}
