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
          
          const attendanceData = [];
          for (let i = 0; i < rawData.length; i++) {
             const rec = rawData[i];
             const empId = rec.no || rec.ID || rec.id;
             const dateIso = rec.dateISO || rec.Date || rec.date;

             const { data: emp, error: empError } = await supabase.from('employees').select('id').eq('id', empId).single();
             if (!empError && emp) {
                const sysInTime = rec.sysInTime || rec['In Time'] || rec['In'] || null;
                const sysOutTime = rec.sysOutTime || rec['Out Time'] || rec['Out'] || null;
                
                const record = {
                  employee_id: empId,
                  date_iso: dateIso,
                  sys_in_time: sysInTime,
                  sys_out_time: sysOutTime,
                  manual_in_time: sysInTime,
                  manual_out_time: sysOutTime,
                  id_number: rec.idKey || rec.idNumber || null,
                  status: rec.status || 'Present',
                };

                // Check if record exists to decide between insert or update
                const { data: existing } = await supabase
                  .from('attendance')
                  .select('id')
                  .eq('employee_id', empId)
                  .eq('date_iso', dateIso)
                  .single();

                if (existing) {
                  await supabase.from('attendance').update(record).eq('id', existing.id);
                } else {
                  await supabase.from('attendance').insert(record);
                }
             }
             setUploadProgress(Math.round(((i + 1) / rawData.length) * 100));
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
        {activeSection === 'attendance' && <AttendanceSection attendance={attendance} employees={employees} onUpdateAttendance={async (r) => {
            const { data: existing } = await supabase.from('attendance').select('id').eq('employee_id', r.empId).eq('date_iso', r.date).single();
            if (existing) await supabase.from('attendance').update({ manual_in_time: r.inTime, manual_out_time: r.outTime, status: 'Manual' }).eq('id', existing.id);
            else await supabase.from('attendance').insert({ employee_id: r.empId, date_iso: r.date, manual_in_time: r.inTime, manual_out_time: r.outTime, status: 'Manual' });
            fetchData();
            alert('Saved');
        }} />}
        {activeSection === 'upload' && <UploadSection onUpload={handleFileUpload} inputRef={fileInputRef} uploading={uploading} progress={uploadProgress} />}
        {activeSection === 'comparison' && <ComparisonSection employees={employees} attendance={attendance} />}
        {activeSection === 'monthly' && <MonthlyReportSection employees={employees} attendance={attendance} />}
        {activeSection === 'timecard' && <TimeCardSection employees={employees} attendance={attendance} />}
      </main>
    </div>
  );
}
