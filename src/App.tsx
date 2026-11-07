/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Table, Upload, Menu, X, UserCheck } from 'lucide-react';
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
import VisitorSection from './components/VisitorSection';
import { getTodayShiftDate, formatSystemDate, getEmployeeShift, getShiftDateForTime, parseCombinedDateTimeToLocal, getShiftRelativeMinutes, cacheDbShift, parseEducationAndShift, normalizeToYYYYMMDD, getPossibleDateFormats, isEmployeeActive } from './lib/dateUtils';
import { 
  UploadStats, 
  findHeaderRow, 
  readExcelToArray, 
  readCsvToArray, 
  extractPunchesFromRows 
} from './lib/uploadParser';

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
  const [uploadStage, setUploadStage] = useState('Processing records...');
  const [uploadResult, setUploadResult] = useState<UploadStats | null>(null);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCsv && !isExcel) {
      setUploadResult({
        success: false,
        totalRowsRead: 0,
        totalPunches: 0,
        recordsUpserted: 0,
        failedCount: 0,
        skippedInactiveCount: 0,
        newEmployeesCreated: 0,
        detectedHeaders: [],
        sampleDates: [],
        errorMessage: 'Unsupported file format. Please upload .CSV or .XLSX / .XLS files.'
      });
      return;
    }

    setUploading(true);
    setUploadProgress(5);
    setUploadStage('Reading file data...');
    setUploadResult(null);

    try {
      let rawRows: any[][] = [];
      if (isCsv) {
        const text = await file.text();
        rawRows = await readCsvToArray(text);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        rawRows = readExcelToArray(arrayBuffer);
      }

      if (!rawRows || rawRows.length === 0) {
        setUploadResult({
          success: false,
          totalRowsRead: 0,
          totalPunches: 0,
          recordsUpserted: 0,
          failedCount: 0,
          skippedInactiveCount: 0,
          newEmployeesCreated: 0,
          detectedHeaders: [],
          sampleDates: [],
          errorMessage: 'File appears to be empty or contains no readable rows.'
        });
        setUploading(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(15);
      setUploadStage('Detecting biometric headers and columns...');
      const { headerIndex, headers } = findHeaderRow(rawRows);

      setUploadProgress(25);
      setUploadStage('Checking employee records in database...');
      const { data: allEmps, error: empErr } = await supabase.from('employees').select('id, name, education, category');
      if (empErr) console.warn('Employee fetch error:', empErr);
      const empIdSet = new Set(allEmps?.map(e => String(e.id).trim()) || []);
      const empNameMap = new Map<string, string>();
      allEmps?.forEach(e => {
        if (e.name) empNameMap.set(String(e.name).toLowerCase().trim(), String(e.id).trim());
      });

      const { data: allLocs } = await supabase.from('locations').select('id, name');
      const locIdSet = new Set(allLocs?.map(l => String(l.id).trim()) || []);
      const locNameMap = new Map<string, string>();
      allLocs?.forEach(l => {
        if (l.name) locNameMap.set(String(l.name).toLowerCase().trim(), String(l.id).trim());
      });

      setUploadProgress(35);
      setUploadStage('Extracting punches and assigning shifts...');
      const { punches, skippedCount, skippedInactive, rawRowsCount } = extractPunchesFromRows(
        rawRows, 
        headerIndex, 
        headers, 
        empNameMap
      );

      if (punches.length === 0) {
        const sampleHeaders = headers.filter(h => !h.startsWith('column_')).join(', ');
        setUploadResult({
          success: false,
          totalRowsRead: rawRowsCount,
          totalPunches: 0,
          recordsUpserted: 0,
          failedCount: skippedCount,
          skippedInactiveCount: skippedInactive,
          newEmployeesCreated: 0,
          detectedHeaders: headers.filter(h => !h.startsWith('column_')),
          sampleDates: [],
          errorMessage: `No valid attendance punches could be identified. Detected columns: [${sampleHeaders || 'None'}]. Please verify that the file contains employee IDs (e.g. No., ID, AC-No, Employee ID) and punch dates/times.`
        });
        setUploading(false);
        setUploadProgress(0);
        return;
      }

      // Auto-register missing employees
      setUploadStage('Registering any new employees...');
      const missingEmployees = new Map<string, any>();
      for (const p of punches) {
        if (p.empId && !empIdSet.has(p.empId) && !missingEmployees.has(p.empId)) {
          missingEmployees.set(p.empId, {
            id: p.empId,
            name: p.rawName || `Employee ${p.empId}`,
            designation: p.designation || null,
            category: p.category || 'staff',
            salary: '0',
            education: 'Graduate|Day',
            join_date: null,
            phone_number: null,
            status: 'Active'
          });
        }
      }

      let newEmployeesCreated = 0;
      if (missingEmployees.size > 0) {
        const toInsert = Array.from(missingEmployees.values());
        const { error: insErr } = await supabase.from('employees').insert(toInsert);
        if (!insErr) {
          toInsert.forEach(e => {
            empIdSet.add(e.id);
            cacheDbShift(e.id, 'Day');
          });
          newEmployeesCreated = toInsert.length;
        } else {
          // If bulk insert fails, try inserting row-by-row
          for (const emp of toInsert) {
            const { error: singleInsErr } = await supabase.from('employees').insert([emp]);
            if (!singleInsErr) {
              empIdSet.add(emp.id);
              cacheDbShift(emp.id, 'Day');
              newEmployeesCreated++;
            }
          }
        }
      }

      // Auto-register missing locations
      const missingLocs = new Map<string, any>();
      for (const p of punches) {
        if (p.locationRaw) {
          const lower = p.locationRaw.toLowerCase();
          if (!locIdSet.has(p.locationRaw) && !locNameMap.has(lower) && !missingLocs.has(lower)) {
            const isNumeric = /^\d+$/.test(p.locationRaw);
            missingLocs.set(lower, {
              id: p.locationRaw,
              name: isNumeric ? `Location ${p.locationRaw}` : p.locationRaw
            });
          }
        }
      }

      if (missingLocs.size > 0) {
        const toInsertLocs = Array.from(missingLocs.values());
        const { error: insLocErr } = await supabase.from('locations').insert(toInsertLocs);
        if (!insLocErr) {
          toInsertLocs.forEach(l => {
            locIdSet.add(l.id);
            locNameMap.set(l.name.toLowerCase().trim(), l.id);
          });
        }
      }

      setUploadProgress(50);
      setUploadStage('Grouping punches by shift date & calculating In/Out times...');

      // Group punches by employee and shift date
      const groupedData: Record<string, {
        empId: string;
        date: string;
        punches: { time: Date; timeStr: string }[];
        idKey: string | null;
        locationId: string | null;
      }> = {};

      const distinctDatesSet = new Set<string>();

      for (const p of punches) {
        // Double check inactive employee filter
        if (!isEmployeeActive({ id: p.empId, name: p.rawName })) continue;

        const empShift = getEmployeeShift(p.empId);
        const dateIso = getShiftDateForTime(p.punchDate, empShift);
        if (!dateIso) continue;
        distinctDatesSet.add(dateIso);

        const key = `${p.empId}_${dateIso}`;

        let resolvedLocId: string | null = null;
        if (p.locationRaw) {
          if (locIdSet.has(p.locationRaw)) resolvedLocId = p.locationRaw;
          else if (locNameMap.has(p.locationRaw.toLowerCase())) {
            resolvedLocId = locNameMap.get(p.locationRaw.toLowerCase()) || null;
          }
        }

        if (!groupedData[key]) {
          groupedData[key] = {
            empId: p.empId,
            date: dateIso,
            punches: [],
            idKey: p.designation || null,
            locationId: resolvedLocId
          };
        } else if (resolvedLocId && !groupedData[key].locationId) {
          groupedData[key].locationId = resolvedLocId;
        }

        groupedData[key].punches.push({
          time: p.punchDate,
          timeStr: p.timeStr
        });
      }

      setUploadProgress(60);
      setUploadStage('Checking existing attendance in database...');

      const empIdsToFetch = Array.from(new Set(Object.values(groupedData).map(g => g.empId)));
      const datesToFetch = Array.from(distinctDatesSet);

      const existingMap: Record<string, any> = {};
      if (empIdsToFetch.length > 0 && datesToFetch.length > 0) {
        const fetchChunkSize = 80;
        for (let i = 0; i < empIdsToFetch.length; i += fetchChunkSize) {
          const slice = empIdsToFetch.slice(i, i + fetchChunkSize);
          const { data: records, error: fetchErr } = await supabase
            .from('attendance')
            .select('*')
            .in('employee_id', slice)
            .in('date_iso', datesToFetch);
          
          if (!fetchErr && records) {
            records.forEach((r: any) => {
              const k = `${String(r.employee_id).trim()}_${normalizeToYYYYMMDD(r.date_iso || '')}`;
              existingMap[k] = r;
            });
          }
        }
      }

      setUploadProgress(70);
      setUploadStage('Preparing attendance records for upsert...');

      const rowsToUpsert: any[] = [];

      for (const group of Object.values(groupedData)) {
        const { empId, date: dateIso } = group;
        if (!empIdSet.has(empId)) {
          console.warn(`Skipping attendance upsert for employee ${empId}: not found in employees table.`);
          continue;
        }

        const cleanDateIso = normalizeToYYYYMMDD(dateIso);
        if (!cleanDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDateIso)) {
          console.warn(`Skipping attendance upsert for employee ${empId}: invalid date ${dateIso}`);
          continue;
        }

        const key = `${empId}_${cleanDateIso}`;
        const existing = existingMap[key];

        // Sort punches chronologically
        const sortedPunches = [...group.punches].sort((a, b) => a.time.getTime() - b.time.getTime());

        // Extract first punch as In, last punch as Out
        const inPunch = sortedPunches[0];
        const outPunch = sortedPunches.length > 1 ? sortedPunches[sortedPunches.length - 1] : null;

        const inTime = inPunch ? inPunch.timeStr : (existing?.sys_in_time || null);
        const outTime = outPunch ? outPunch.timeStr : (existing?.sys_out_time || null);

        // Location: ensure it's valid in locIdSet to avoid foreign key errors
        let finalLocId = group.locationId || existing?.location_id || null;
        if (finalLocId && !locIdSet.has(finalLocId)) {
          finalLocId = null;
        }

        rowsToUpsert.push({
          employee_id: empId,
          date_iso: cleanDateIso,
          sys_in_time: inTime,
          sys_out_time: outTime,
          manual_in_time: existing?.manual_in_time || inTime,
          manual_out_time: existing?.manual_out_time || outTime,
          id_number: group.idKey || existing?.id_number || null,
          location_id: finalLocId,
          status: (existing?.status && existing.status !== 'Absent') ? existing.status : 'Present',
          live_location: existing?.live_location || null,
          live_location_in: existing?.live_location_in || null,
          live_location_out: existing?.live_location_out || null,
          late_remark: existing?.late_remark || null
        });
      }

      setUploadProgress(75);
      setUploadStage('Upserting attendance records to Supabase...');

      let recordsUpserted = 0;
      let failedCount = 0;
      const failedDetails: string[] = [];

      const batchSize = 50;
      for (let i = 0; i < rowsToUpsert.length; i += batchSize) {
        const chunk = rowsToUpsert.slice(i, i + batchSize);
        const { error: upsertErr } = await supabase
          .from('attendance')
          .upsert(chunk, { onConflict: 'employee_id,date_iso' });

        if (!upsertErr) {
          recordsUpserted += chunk.length;
        } else {
          console.warn('Batch upsert error, retrying individual rows:', upsertErr.message);
          // Fallback: Retry rows individually to salvage all valid rows and pinpoint specific failures
          for (const item of chunk) {
            const { error: singleErr } = await supabase
              .from('attendance')
              .upsert([item], { onConflict: 'employee_id,date_iso' });
            if (!singleErr) {
              recordsUpserted++;
            } else {
              failedCount++;
              if (failedDetails.length < 5) {
                failedDetails.push(`Emp ${item.employee_id} (${item.date_iso}): ${singleErr.message}`);
              }
            }
          }
        }

        const pct = 75 + Math.round(((i + chunk.length) / rowsToUpsert.length) * 22);
        setUploadProgress(Math.min(97, pct));
      }

      setUploadProgress(98);
      setUploadStage('Synchronizing dashboard data...');
      await fetchData();

      setUploadProgress(100);
      setUploadStage('Upload finished!');
      setUploading(false);

      const sampleDates = Array.from(distinctDatesSet).slice(0, 10);
      const isOverallSuccess = recordsUpserted > 0;

      setUploadResult({
        success: isOverallSuccess,
        totalRowsRead: rawRowsCount,
        totalPunches: punches.length,
        recordsUpserted,
        failedCount,
        skippedInactiveCount: skippedInactive,
        newEmployeesCreated,
        detectedHeaders: headers.filter(h => !h.startsWith('column_')),
        sampleDates,
        failedDetails: failedDetails.length > 0 ? failedDetails : undefined,
        errorMessage: isOverallSuccess 
          ? undefined 
          : (failedDetails[0] || 'Could not save any attendance records. Please check Supabase table constraints.')
      });

      // Clear input so file can be uploaded again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err: any) {
      console.error('File upload error:', err);
      setUploading(false);
      setUploadProgress(0);
      setUploadResult({
        success: false,
        totalRowsRead: 0,
        totalPunches: 0,
        recordsUpserted: 0,
        failedCount: 0,
        skippedInactiveCount: 0,
        newEmployeesCreated: 0,
        detectedHeaders: [],
        sampleDates: [],
        errorMessage: 'Upload failed: ' + (err.message || 'Unknown parsing error')
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <button onClick={() => setActiveSection('attendance')} className="bg-stone-800 text-white p-3 text-xs font-bold uppercase hover:bg-stone-900 transition-colors">Daily Entry</button>
                        <button onClick={() => setActiveSection('visitors')} className="bg-amber-500 text-stone-900 p-3 text-xs font-bold uppercase hover:bg-amber-600 transition-colors flex items-center justify-center gap-1.5 shadow-sm">
                          <UserCheck size={14} /> Visitor In-Out
                        </button>
                        <button onClick={() => setActiveSection('monthly')} className="bg-stone-200 text-stone-800 p-3 text-xs font-bold uppercase hover:bg-stone-300 transition-colors">Monthly Report</button>
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
            const cleanDate = normalizeToYYYYMMDD(r.date);
            const empId = String(r.empId).trim();
            if (!empId || !cleanDate) return;

            // First find existing to preserve live_location, handling legacy date formats
            const { data: existingRecords } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', empId)
                .in('date_iso', getPossibleDateFormats(cleanDate));
                
            const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

            // Validate location foreign key
            let locId = r.locationId ? String(r.locationId).trim() : null;
            if (locId && !locations.some(l => l.id === locId)) {
                locId = null;
            }
            
            const { error } = await supabase.from('attendance').upsert([{ 
                employee_id: empId, 
                date_iso: cleanDate, 
                manual_in_time: r.inTime || null, 
                manual_out_time: r.outTime || null, 
                location_id: locId,
                id_number: existing?.id_number || empId,
                live_location: existing?.live_location || null,
                live_location_in: existing?.live_location_in || null,
                live_location_out: existing?.live_location_out || null,
                late_remark: r.lateRemark || null,
                status: 'Manual' 
            }], { onConflict: 'employee_id,date_iso' });
            
            if (error) {
                console.error('Save error:', error);
                alert('Database Error: ' + error.message);
            } else {
                await fetchData();
                console.log('Saved attendance for', empId);
            }
        }} />}
        {activeSection === 'upload' && (
          <UploadSection 
            onUpload={handleFileUpload} 
            inputRef={fileInputRef} 
            uploading={uploading} 
            progress={uploadProgress} 
            uploadStage={uploadStage}
            uploadResult={uploadResult}
            onClearResult={() => setUploadResult(null)}
            onNavigateToAttendance={() => setActiveSection('attendance')}
          />
        )}
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
        {activeSection === 'visitors' && (
          <VisitorSection 
            employees={employees.filter(isEmployeeActive)} 
            viewMode={viewMode} 
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
