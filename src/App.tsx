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
        const normalized = emplData.map((e: any) => ({
          ...e,
          id: String(e.id).trim()
        }));
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

          // Group by empId and date to find min/max times
          const groupedData: Record<string, { empId: string, date: string, times: string[], idKey?: string, locationId?: string }> = {};
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
                    const cleanDateTime = dateTimeStr.trim();
                    let dateObj = new Date(cleanDateTime);
                    
                    // Specific handler for DD-MMM-YY or DD-MMM-YYYY format with optional time
                    const dmyMatch = cleanDateTime.match(/^(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2,4})(.*)$/i);
                    if (dmyMatch) {
                        const monthMap: Record<string, number> = {
                            jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
                        };
                        const day = parseInt(dmyMatch[1]);
                        const month = monthMap[dmyMatch[2].toLowerCase()];
                        let year = parseInt(dmyMatch[3]);
                        if (year < 100) year += 2000;
                        
                        const timeStrPart = dmyMatch[4].trim();
                        if (timeStrPart) {
                            dateObj = new Date(dateTimeStr); // Try standard parsing if time exists
                            // If standard parsing fails or still gives wrong day, force it
                            if (isNaN(dateObj.getTime()) || dateObj.getDate() !== day) {
                                dateObj = new Date(year, month, day);
                                const tMatch = timeStrPart.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})(?:\s*(am|pm))?/i);
                                if (tMatch) {
                                    let h = parseInt(tMatch[1]);
                                    const m = parseInt(tMatch[2]);
                                    const ampm = tMatch[3]?.toLowerCase();
                                    if (ampm === 'pm' && h < 12) h += 12;
                                    if (ampm === 'am' && h === 12) h = 0;
                                    dateObj.setHours(h, m, 0, 0);
                                }
                            }
                        } else {
                            dateObj = new Date(year, month, day);
                        }
                    }

                    if (!isNaN(dateObj.getTime())) {
                        const y = dateObj.getFullYear();
                        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                        const d = String(dateObj.getDate()).padStart(2, '0');
                        const dateIso = `${y}-${m}-${d}`;
                        
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const key = `${empId}_${dateIso}`;

                        if (!groupedData[key]) {
                            groupedData[key] = {
                                empId,
                                date: dateIso,
                                times: [],
                                idKey: rec['ID Number'] || rec.idKey || rec.idNumber || null,
                                locationId: rec['Location ID'] || rec.locationId || null
                            };
                        }
                        groupedData[key].times.push(timeStr);
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
                setUploadProgress(Math.round(((i + 1) / rawData.length) * 40)); 
             }
          }

          const attendanceData = Object.values(groupedData).map((group: any) => {
              const sortedTimes = group.times.sort();
              const inTime = sortedTimes[0];
              const outTime = sortedTimes.length > 1 ? sortedTimes[sortedTimes.length - 1] : null;

              return {
                  employee_id: group.empId,
                  date_iso: group.date,
                  sys_in_time: inTime,
                  sys_out_time: outTime,
                  manual_in_time: inTime,
                  manual_out_time: outTime,
                  id_number: group.idKey,
                  location_id: group.locationId,
                  status: 'Present'
              };
          });

          let errorCount = 0;
          // Batch upsert in chunks
          const chunkSize = 50;
          for (let i = 0; i < attendanceData.length; i += chunkSize) {
            const chunk = attendanceData.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase
              .from('attendance')
              .upsert(chunk, { onConflict: 'employee_id,date_iso' });
            
            if (upsertError) {
              console.error('Upsert index error:', upsertError);
              errorCount += chunk.length;
            }
            
            setUploadProgress(40 + Math.round(((i + chunk.length) / attendanceData.length) * 60));
          }

          let msg = `Upload process finished.\n- ${attendanceData.length - errorCount} records updated successfully.`;
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
                    {attendance.filter(a => a.dateISO === new Date().toISOString().split('T')[0] && (a.status === 'Present' || a.status === 'Manual')).length}
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
                    {employees.length - attendance.filter(a => a.dateISO === new Date().toISOString().split('T')[0] && (a.status === 'Present' || a.status === 'Manual')).length}
                  </div>
                </button>
                <div className="w-px bg-stone-100 my-4"></div>
                <div className="flex-1 p-4 md:p-6 flex flex-col gap-1 text-right">
                  <div className="text-[9px] md:text-[10px] uppercase font-bold text-stone-500 tracking-widest leading-tight">System Date</div>
                  <div className="text-xs md:text-sm font-bold text-stone-800 leading-none uppercase">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
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
                      const today = new Date().toISOString().split('T')[0];
                      const presentIds = attendance
                        .filter(a => a.dateISO === today && (a.status === 'Present' || a.status === 'Manual'))
                        .map(a => a.no);
                      
                      const list = showList === 'present' 
                        ? employees.filter(e => presentIds.includes(e.id))
                        : employees.filter(e => !presentIds.includes(e.id));

                      if (list.length === 0) {
                        return <div className="p-8 text-center text-stone-400 italic">No records found.</div>;
                      }

                      return (
                        <div className="divide-y divide-stone-100">
                          {list.map(emp => (
                            <div key={emp.id} className="p-3 flex justify-between items-center hover:bg-stone-50">
                              <div>
                                <div className="text-sm font-bold text-stone-800">{emp.name}</div>
                                <div className="text-[10px] text-stone-500 uppercase tracking-tighter">ID: {emp.id} • {emp.designation}</div>
                              </div>
                              <div className="text-[10px] text-stone-400 font-mono">
                                {showList === 'present' ? (
                                  attendance.find(a => a.dateISO === today && a.no === emp.id)?.sysInTime || '-'
                                ) : (
                                  'OFFLINE'
                                )}
                              </div>
                            </div>
                          ))}
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
        {activeSection === 'comparison' && <ComparisonSection employees={employees} attendance={attendance} />}
        {activeSection === 'monthly' && <MonthlyReportSection employees={employees} attendance={attendance} onRefresh={fetchData} viewMode={viewMode} />}
        {activeSection === 'timecard' && <TimeCardSection employees={employees} attendance={attendance} onRefresh={fetchData} viewMode={viewMode} />}
          </>
        )}
      </main>
    </div>
  );
}
