/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Table, Upload, Menu, X } from 'lucide-react';
import Papa from 'papaparse';
import { checkConnection, supabase } from './lib/supabaseClient';
import EmployeeSelectorModal from './components/EmployeeSelectorModal';
import Sidebar from './components/Sidebar';
import EmployeeSection from './components/EmployeeSection';
import AttendanceSection from './components/AttendanceSection';
import ComparisonSection from './components/ComparisonSection';
import MonthlyReportSection from './components/MonthlyReportSection';
import TimeCardSection from './components/TimeCardSection';
import LocationSection from './components/LocationSection';
import UploadSection from './components/UploadSection';
import ManualEntrySection from './components/ManualEntrySection';
import LiveLocationMap from './components/LiveLocationMap';
import { getTodayShiftDate, formatSystemDate, getEmployeeShift, getShiftDateForTime, parseCombinedDateTimeToLocal, getShiftRelativeMinutes, cacheDbShift, parseEducationAndShift } from './lib/dateUtils';

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
}

export default function App() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [showProgress, setShowProgress] = useState(false);
  const [showList, setShowList] = useState<'present' | 'absent' | null>(null);

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
          return {
            ...e,
            id: empId,
            education: education,
            joinDate: e.join_date || e.joinDate || '',
            phoneNumber: e.phone_number || e.phoneNumber || ''
          };
        });
        setEmployees(normalized as Employee[]);
      }

      const { data: locData, error: locError } = await supabase.from('locations').select('*');
      if (locError) console.error('Error fetching locations:', locError);
      else if (locData) setLocations(locData);

      const { data: attData, error: attError } = await supabase.from('attendance').select('*, employees(name)');
      if (attError) console.error('Error fetching attendance:', attError);
      else if (attData) {
        console.log('Fetched raw attendance data count:', attData.length);
        const formatted = attData.map((a: any) => {
            const row = {
                no: a.employee_id ? String(a.employee_id).trim() : '',
                name: a.employees?.name || 'Unknown',
                dateISO: a.date_iso || '',
                date: a.date_iso || '',
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
            if (row.name === 'Unknown') {
              console.warn('Employee JOIN failed for record:', a);
            }
            return row;
        });
        setAttendance(formatted);
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploading(true);
      setUploadProgress(0);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rawData = results.data as any[];
          console.log('Upload data:', rawData);
          if (rawData.length === 0) {
            setUploading(false);
            return;
          }
          
          // First, get all employee IDs for validation
          const { data: allEmps } = await supabase.from('employees').select('id');
          // Store trimmed IDs
          const empIdSet = new Set(allEmps?.map(e => String(e.id).trim()) || []);
          console.log('Valid employee IDs:', Array.from(empIdSet));

          // Group by empId and shift-aware date to find min/max times chronologically
          const groupedData: Record<string, { empId: string, date: string, punches: Array<{ time: Date, timeStr: string }>, idKey?: string, locationId?: string }> = {};
          let skippedCount = 0;
          let uniqueSkippedIds = new Set<string>();

          for (let i = 0; i < rawData.length; i++) {
             const rec = rawData[i];
             // Trim IDs and handle all common column variations
             const rawId = rec['No.'] || rec['No'] || rec['ID'] || rec['id'] || rec['Employee ID'] || rec['EmployeeID'] || rec.no || rec.ID || rec.id;
             const empId = rawId ? String(rawId).trim() : null;
             
             // Support combined DateTime or separate Date/Time columns
             const datePart = rec['Date'] || rec['date'] || rec['Date/Time'] || rec['DateTime'] || rec.dateISO || '';
             const timePart = rec['Time'] || rec['time'] || '';
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

                        if (!groupedData[key]) {
                            groupedData[key] = {
                                empId,
                                date: dateIso,
                                punches: [],
                                idKey: rec['ID Number'] || rec.idKey || rec.idNumber || null,
                                locationId: rec['Location ID'] || rec.locationId || null
                            };
                        }
                        groupedData[key].punches.push({
                            time: dateObj,
                            timeStr: timeStr
                        });
                    }
                } catch (e) {
                    console.error("Error parsing date:", dateTimeStr, e);
                }
             } else if (empId && !empIdSet.has(empId)) {
                skippedCount++;
                uniqueSkippedIds.add(empId);
                console.warn(`Employee ID ${empId} not found in employees table. Skipping record.`);
             }

             if (i % Math.max(1, Math.floor(rawData.length / 10)) === 0) {
                setUploadProgress(Math.round(((i + 1) / rawData.length) * 30)); 
             }
          }

          // Gather unique employee IDs and shift dates involved in this file upload
          const empIdsToFetch = Array.from(new Set(Object.values(groupedData).map((g: any) => g.empId)));
          
          const datesToFetchSet = new Set<string>();
          Object.values(groupedData).forEach((g: any) => {
              datesToFetchSet.add(g.date);
              // Also add the next day ISO to fetch any pre-existing duplicates that may have slipped to tomorrow
              const parts = g.date.split('-');
              if (parts.length === 3) {
                  const [ystr, mstr, dstr] = parts;
                  const dateObj = new Date(parseInt(ystr, 10), parseInt(mstr, 10) - 1, parseInt(dstr, 10) + 1);
                  const y = dateObj.getFullYear();
                  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                  const d = String(dateObj.getDate()).padStart(2, '0');
                  datesToFetchSet.add(`${y}-${m}-${d}`);
              }
          });
          const datesToFetch = Array.from(datesToFetchSet);

          // Fetch existing attendance records from the DB in chunks to prevent URL length limits, or fully if small
          const existingMap: Record<string, any> = {};
          
          if (empIdsToFetch.length > 0 && datesToFetch.length > 0) {
              const fetchChunkSize = 100;
              for (let i = 0; i < empIdsToFetch.length; i += fetchChunkSize) {
                  const empChunk = empIdsToFetch.slice(i, i + fetchChunkSize);
                  const { data: records, error: fetchError } = await supabase
                      .from('attendance')
                      .select('*')
                      .in('employee_id', empChunk)
                      .in('date_iso', datesToFetch);
                  
                  if (!fetchError && records) {
                      records.forEach((r: any) => {
                          const key = `${String(r.employee_id).trim()}_${r.date_iso}`;
                          existingMap[key] = r;
                      });
                  }
              }
          }

          setUploadProgress(35);

          // Now merge existing check-in/out times with newly uploaded punches
          const attendanceData = Object.values(groupedData).map((group: any) => {
              const empId = group.empId;
              const dateIso = group.date;
              const key = `${empId}_${dateIso}`;
              const existing = existingMap[key];
              const empShift = getEmployeeShift(empId);

              // Split the punches in group.punches based on the user's rule:
              // Starting from the first day, starting from after midnight (12:00 AM) of the next day, up to morning 06:00 AM will be the Out Time.
              const firstDayPunches: Array<{ time: Date; timeStr: string }> = [];
              const nextDayLatePunches: Array<{ time: Date; timeStr: string }> = [];

              if (dateIso) {
                  try {
                      const [ystr, mstr, dstr] = dateIso.split('-');
                      const year = parseInt(ystr, 10);
                      const month = parseInt(mstr, 10) - 1;
                      const day = parseInt(dstr, 10);
                      
                      // Midnight (00:00:00) of the next day
                      const nextDayStart = new Date(year, month, day + 1, 0, 0, 0, 0);
                      // 06:00 AM of the next day
                      const nextDayEnd = new Date(year, month, day + 1, 6, 0, 0, 0);

                      group.punches.forEach((p: any) => {
                          const tVal = p.time.getTime();
                          if (tVal >= nextDayStart.getTime() && tVal <= nextDayEnd.getTime()) {
                              nextDayLatePunches.push(p);
                          } else {
                              firstDayPunches.push(p);
                          }
                      });
                  } catch (e) {
                      console.error("Error classifying punches based on dates:", e);
                      firstDayPunches.push(...group.punches);
                  }
              } else {
                  firstDayPunches.push(...group.punches);
              }

              // De-duplicate and sort times within lists
              const uniqueFirst = Array.from(new Set(firstDayPunches.map(p => p.timeStr)))
                  .map(tStr => firstDayPunches.find(p => p.timeStr === tStr)!)
                  .sort((a, b) => a.time.getTime() - b.time.getTime());

              const uniqueNext = Array.from(new Set(nextDayLatePunches.map(p => p.timeStr)))
                  .map(tStr => nextDayLatePunches.find(p => p.timeStr === tStr)!)
                  .sort((a, b) => a.time.getTime() - b.time.getTime());

              let inTime: string | null = null;
              let outTime: string | null = null;

              if (uniqueFirst.length > 0) {
                  inTime = uniqueFirst[0].timeStr;
                  if (uniqueNext.length > 0) {
                      outTime = uniqueNext[uniqueNext.length - 1].timeStr;
                  } else if (uniqueFirst.length > 1) {
                      outTime = uniqueFirst[uniqueFirst.length - 1].timeStr;
                  }
              } else if (uniqueNext.length > 0) {
                  // Only next-day midnight-to-6am punches exist (missed check-in on first day)
                  outTime = uniqueNext[uniqueNext.length - 1].timeStr;
              }

              return {
                  ...(existing || {}),
                  employee_id: empId,
                  date_iso: dateIso,
                  sys_in_time: inTime,
                  sys_out_time: outTime,
                  manual_in_time: inTime,
                  manual_out_time: outTime,
                  id_number: group.idKey || (existing ? existing.id_number : null),
                  location_id: group.locationId || (existing ? existing.location_id : null),
                  status: (existing && existing.status) ? existing.status : 'Present'
              };
          });

          // Inline helper to subtract 1 day from Date ISO (e.g. "2026-05-23" -> "2026-05-22")
          const getPreviousDateISO = (dateStr: string): string => {
              const parts = dateStr.split('-');
              if (parts.length !== 3) return dateStr;
              const [ystr, mstr, dstr] = parts;
              const dateObj = new Date(parseInt(ystr, 10), parseInt(mstr, 10) - 1, parseInt(dstr, 10) - 1);
              const y = dateObj.getFullYear();
              const m = String(dateObj.getMonth() + 1).padStart(2, '0');
              const d = String(dateObj.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
          };

          // Post-processing sanitation of early morning checkins:
          // If any record in attendanceData has a sys_in_time between 12:00 AM and 06:00 AM (Day shift) or 08:00 AM (Night shift),
          // it belongs to the previous day's shift as an out-time.
          const finalAttendanceMap: Record<string, any> = {};
          
          // Seed with all fetched existing database records so mismatching duplicates from any previously uploaded date
          // can be cleaned up automatically during any re-upload!
          Object.keys(existingMap).forEach((key) => {
              finalAttendanceMap[key] = { ...existingMap[key] };
          });
          
          attendanceData.forEach((item: any) => {
              const key = `${item.employee_id}_${item.date_iso}`;
              finalAttendanceMap[key] = { ...item };
          });

          // Scan all entries for early morning check-ins and redirect them to the previous day as a check-out
          Object.keys(finalAttendanceMap).forEach((key) => {
              const item = finalAttendanceMap[key];
              if (!item.sys_in_time) return;

              const [hhStr] = item.sys_in_time.split(':');
              const hh = parseInt(hhStr, 10);
              const empShift = getEmployeeShift(item.employee_id);
              const thresholdHour = empShift === 'Night' ? 8 : 6;

              if (hh < thresholdHour) {
                  const shiftTimeVal = item.sys_in_time;
                  const prevDateIso = getPreviousDateISO(item.date_iso);
                  const prevKey = `${item.employee_id}_${prevDateIso}`;

                  if (finalAttendanceMap[prevKey]) {
                      finalAttendanceMap[prevKey].sys_out_time = shiftTimeVal;
                      finalAttendanceMap[prevKey].manual_out_time = shiftTimeVal;
                      finalAttendanceMap[prevKey].status = finalAttendanceMap[prevKey].status === 'OffDay' ? 'OffDay' : 'Present';
                  } else {
                      const prevExisting = existingMap[prevKey];
                      finalAttendanceMap[prevKey] = {
                          ...(prevExisting || {}),
                          employee_id: item.employee_id,
                          date_iso: prevDateIso,
                          sys_in_time: prevExisting ? prevExisting.sys_in_time : null,
                          sys_out_time: shiftTimeVal,
                          manual_in_time: prevExisting ? prevExisting.manual_in_time : null,
                          manual_out_time: shiftTimeVal,
                          id_number: item.id_number,
                          location_id: item.location_id,
                          status: (prevExisting && prevExisting.status) ? prevExisting.status : 'Present'
                      };
                  }

                  // Clear current day's misplaced check-in/out times
                  item.sys_in_time = null;
                  item.sys_out_time = null;
                  item.manual_in_time = null;
                  item.manual_out_time = null;
                  item.status = 'Absent';
              }
          });

          const sanitizedAttendanceData = Object.values(finalAttendanceMap).filter((item: any) => {
              const existed = !!(item.id || existingMap[`${item.employee_id}_${item.date_iso}`]);
              const hasPunches = !!(item.sys_in_time || item.sys_out_time || item.manual_in_time || item.manual_out_time);
              const isNonAbsent = item.status && item.status !== 'Absent';
              return existed || hasPunches || isNonAbsent;
          });

          setUploadProgress(40);

          let errorCount = 0;
          // Batch upsert in chunks
          const chunkSize = 50;
          for (let i = 0; i < sanitizedAttendanceData.length; i += chunkSize) {
            const chunk = sanitizedAttendanceData.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase
              .from('attendance')
              .upsert(chunk, { onConflict: 'employee_id,date_iso' });
            
            if (upsertError) {
              console.error('Upsert index error:', upsertError);
              errorCount += chunk.length;
            }
            
            setUploadProgress(40 + Math.round(((i + chunk.length) / sanitizedAttendanceData.length) * 60));
          }

          let msg = `Upload process finished.\n- ${sanitizedAttendanceData.length - errorCount} records updated successfully.`;
          if (errorCount > 0) msg += `\n- ${errorCount} records failed to save.`;
          if (skippedCount > 0) msg += `\n- ${skippedCount} items skipped because employee IDs were not found in directory.`;
          
          alert(msg);
          fetchData();
          setUploading(false);
          setUploadProgress(0);
        }
      });
    }
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
        )}

        {dbStatus === 'connected' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* Card 1: Employees & Present */}
              <div className="bg-white border border-stone-200 shadow-sm rounded-sm flex overflow-hidden">
                <div className="flex-1 p-4 md:p-6 flex flex-col gap-1">
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-stone-400 tracking-widest leading-tight">Total Employees</div>
                  <div className="text-xl md:text-3xl font-serif italic text-stone-900 leading-none">{employees.length}</div>
                </div>
                <div className="w-px bg-stone-100 my-4"></div>
                <button 
                  onClick={() => setShowList('present')}
                  className="flex-1 p-4 md:p-6 flex flex-col gap-1 text-right hover:bg-green-50 transition-colors group cursor-pointer"
                >
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-green-600 tracking-widest leading-tight group-hover:underline">Present Today</div>
                  <div className="text-xl md:text-3xl font-serif italic text-green-700 leading-none">
                    {(() => {
                      const presentCount = employees.filter(emp => {
                        const shift = getEmployeeShift(emp.id);
                        const targetDate = getTodayShiftDate(shift);
                        return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                      }).length;
                      return presentCount;
                    })()}
                  </div>
                </button>
              </div>

              {/* Card 2: Absent & Date */}
              <div className="bg-white border border-stone-200 shadow-sm rounded-sm flex overflow-hidden">
                <button 
                  onClick={() => setShowList('absent')}
                  className="flex-1 p-4 md:p-6 flex flex-col gap-1 hover:bg-red-50 transition-colors group cursor-pointer"
                >
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-red-500 tracking-widest leading-tight group-hover:underline">Absent Today</div>
                  <div className="text-xl md:text-3xl font-serif italic text-red-600 leading-none">
                    {(() => {
                      const presentCount = employees.filter(emp => {
                        const shift = getEmployeeShift(emp.id);
                        const targetDate = getTodayShiftDate(shift);
                        return attendance.some(a => a.no === emp.id && a.dateISO === targetDate && (a.status === 'Present' || a.status === 'Manual'));
                      }).length;
                      return employees.length - presentCount;
                    })()}
                  </div>
                </button>
                <div className="w-px bg-stone-100 my-4"></div>
                <div className="flex-1 p-4 md:p-6 flex flex-col gap-1 text-right">
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-stone-500 tracking-widest leading-tight">System Date</div>
                  <div className="text-xs md:text-sm font-bold text-stone-800 leading-none uppercase">{formatSystemDate(getTodayShiftDate())}</div>
                </div>
              </div>
            </div>

            {/* Status List Modal */}
            {showList && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white w-full max-w-md rounded-sm shadow-xl flex flex-col max-h-[80vh]">
                  <div className="p-4 border-b flex justify-between items-center bg-stone-50">
                    <h3 className="font-serif italic text-stone-900 text-lg">
                      {showList === 'present' ? 'Present Employees Today' : 'Absent Employees Today'}
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
                      
                      const list = showList === 'present' 
                        ? employees.filter(e => isEmpPresent(e.id))
                        : employees.filter(e => !isEmpPresent(e.id));

                      if (list.length === 0) {
                        return <div className="p-8 text-center text-stone-400 italic">No records found.</div>;
                      }

                      return (
                        <div className="divide-y divide-stone-100">
                          {list.map(emp => {
                            const shift = getEmployeeShift(emp.id);
                            const targetDate = getTodayShiftDate(shift);
                            return (
                              <div key={emp.id} className="p-3 flex justify-between items-center hover:bg-stone-50">
                                <div>
                                  <div className="text-sm font-bold text-stone-800">{emp.name}</div>
                                  <div className="text-[10px] text-stone-500 uppercase tracking-tighter flex items-center gap-1">
                                    <span>ID: {emp.id} • {emp.designation}</span>
                                    <span className={`px-1 rounded-[2px] leading-tight text-[8px] font-bold ${
                                      shift === 'Night' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {shift === 'Night' ? 'NIGHT' : 'DAY'}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {showList === 'present' ? (
                                    attendance.find(a => a.dateISO === targetDate && a.no === emp.id)?.sysInTime || 
                                    attendance.find(a => a.dateISO === targetDate && a.no === emp.id)?.manualInTime || '-'
                                  ) : (
                                    'OFFLINE'
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
               
               <ManualEntrySection employees={employees} locations={locations} onRefresh={fetchData} viewMode={viewMode} />
            </div>
          </div>
        )}
        {activeSection === 'employees' && <EmployeeSection employees={employees} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'locations' && <LocationSection locations={locations} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'attendance' && <AttendanceSection attendance={attendance} employees={employees} locations={locations} viewMode={viewMode} onUpdateAttendance={async (r) => {
            // First find existing to preserve live_location
            const existing = attendance.find(a => a.no === String(r.empId).trim() && a.dateISO === r.date);
            
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
        {activeSection === 'comparison' && viewMode === 'admin' && <ComparisonSection employees={employees} attendance={attendance} locations={locations} />}
        {activeSection === 'monthly' && <MonthlyReportSection employees={employees} attendance={attendance} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'timecard' && <TimeCardSection employees={employees} attendance={attendance} onRefresh={fetchData} viewMode={viewMode} />}
          </>
        )}
      </main>
    </div>
  );
}
