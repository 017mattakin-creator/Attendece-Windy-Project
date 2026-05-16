/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Table, Upload } from 'lucide-react';
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
  
  const fetchData = async () => {
    const conn = await checkConnection();
    setDbStatus(conn.connected ? 'connected' : 'error');
    
    if (conn.connected) {
      const { data: emplData, error: emplError } = await supabase.from('employees').select('*');
      if (emplError) console.error('Error fetching employees:', emplError);
      else if (emplData) setEmployees(emplData as Employee[]);

      const { data: locData, error: locError } = await supabase.from('locations').select('*');
      if (locError) console.error('Error fetching locations:', locError);
      else if (locData) setLocations(locData);

      const { data: attData, error: attError } = await supabase.from('attendance').select('*, employees(name)');
      if (attError) console.error('Error fetching attendance:', attError);
      else if (attData) {
        console.log('Fetched raw attendance data:', attData);
        const formatted = attData.map((a: any) => ({
            no: a.employee_id,
            name: a.employees?.name || 'Unknown',
            dateISO: a.date_iso,
            date: a.date_iso,
            sysInTime: a.sys_in_time,
            sysOutTime: a.sys_out_time,
            manualInTime: a.manual_in_time,
            manualOutTime: a.manual_out_time,
            status: a.status,
            locationId: a.location_id,
            idNumber: a.id_number,
        }));
        console.log('Formatted attendance data:', formatted);
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
      alert('Incorrect Password');
    }
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
          const empIdSet = new Set(allEmps?.map(e => e.id) || []);

          // Group by empId and date to find min/max times
          const groupedData: Record<string, { empId: string, date: string, times: string[], idKey?: string }> = {};

          for (let i = 0; i < rawData.length; i++) {
             const rec = rawData[i];
             const empId = rec['No.'] || rec.no || rec.ID || rec.id;
             const dateTimeStr = rec['Date/Time'] || rec.dateISO || rec.Date || rec.date;

             if (empId && dateTimeStr && empIdSet.has(empId)) {
                try {
                    // Handle "5/1/2026 7:40 AM" format
                    const dateObj = new Date(dateTimeStr);
                    if (!isNaN(dateObj.getTime())) {
                        const dateIso = dateObj.toISOString().split('T')[0];
                        const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                        const key = `${empId}_${dateIso}`;

                        if (!groupedData[key]) {
                            groupedData[key] = {
                                empId,
                                date: dateIso,
                                times: [],
                                idKey: rec['ID Number'] || rec.idKey || rec.idNumber || null
                            };
                        }
                        groupedData[key].times.push(timeStr);
                    }
                } catch (e) {
                    console.error("Error parsing date:", dateTimeStr, e);
                }
             }

             if (i % Math.max(1, Math.floor(rawData.length / 10)) === 0) {
                setUploadProgress(Math.round(((i + 1) / rawData.length) * 40)); 
             }
          }

          const attendanceData = Object.values(groupedData).map(group => {
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
                  status: 'Present'
              };
          });

          // Batch upsert in chunks
          const chunkSize = 50;
          for (let i = 0; i < attendanceData.length; i += chunkSize) {
            const chunk = attendanceData.slice(i, i + chunkSize);
            const { error: upsertError } = await supabase
              .from('attendance')
              .upsert(chunk, { onConflict: 'employee_id,date_iso' });
            
            if (upsertError) {
              console.error('Upsert index error:', upsertError);
            }
            
            setUploadProgress(40 + Math.round(((i + chunk.length) / attendanceData.length) * 60));
          }

          alert('Upload complete!');
          fetchData();
          setUploading(false);
          setUploadProgress(0);
        }
      });
    }
  };

  return (
    <div className="flex bg-stone-100 min-h-screen">
      <Sidebar activeSection={activeSection} setActiveSection={setActiveSection} viewMode={viewMode} />
      <main className="flex-grow p-10">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-serif italic text-stone-900 tracking-wide">HR Attendance Assistant</h1>
          </div>
          <div className="flex gap-4">
             {showPasswordPrompt ? (
               <div className="flex gap-2">
                 <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="bg-white border text-xs p-2" />
                 <button onClick={handleAdminVerify} className="bg-amber-400 text-black px-4 py-2 text-xs font-bold uppercase">Verify</button>
               </div>
             ) : (
                <button onClick={() => viewMode === 'admin' ? setMode('admin') : setShowPasswordPrompt(true)} className={`px-4 py-2 text-xs font-bold uppercase ${viewMode === 'admin' ? 'bg-amber-400' : 'bg-white border'}`}>Admin</button>
             )}
          </div>
        </header>

        {activeSection === 'dashboard' && (
          <div>
            <div className="text-sm mb-6">Welcome to HR Attendance Dashboard.</div>
            <ManualEntrySection employees={employees} locations={locations} onRefresh={fetchData} />
          </div>
        )}
        {activeSection === 'employees' && <EmployeeSection employees={employees} onRefresh={fetchData} />}
        {activeSection === 'locations' && <LocationSection locations={locations} onRefresh={fetchData} />}
        {activeSection === 'attendance' && <AttendanceSection attendance={attendance} employees={employees} locations={locations} onUpdateAttendance={async (r) => {
            const { error } = await supabase.from('attendance').upsert({ 
                employee_id: r.empId, 
                date_iso: r.date, 
                manual_in_time: r.inTime, 
                manual_out_time: r.outTime, 
                location_id: r.locationId,
                status: 'Manual' 
            }, { onConflict: 'employee_id,date_iso' });
            
            if (error) {
                alert('Error saving: ' + error.message);
            } else {
                fetchData();
                alert('Saved');
            }
        }} />}
        {activeSection === 'upload' && <UploadSection onUpload={handleFileUpload} inputRef={fileInputRef} uploading={uploading} progress={uploadProgress} />}
        {activeSection === 'comparison' && <ComparisonSection employees={employees} attendance={attendance} />}
        {activeSection === 'monthly' && <MonthlyReportSection employees={employees} attendance={attendance} />}
        {activeSection === 'timecard' && <TimeCardSection employees={employees} attendance={attendance} />}
      </main>
    </div>
  );
}
