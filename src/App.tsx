/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Table, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { checkConnection, supabase } from './lib/supabaseClient';

interface AttendanceRecord {
  name: string;
  no: string;
  date: string;
  dateISO: string;
  sysInTime: string; // From CSV
  sysOutTime: string; // From CSV
  manualInTime?: string; // User input
  manualOutTime?: string; // User input
  status: string;
  locationId: string;
  idNumber: string;
}

interface Employee {
  id: string; // This corresponds to 'no' in AttendanceRecord
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
  
  useEffect(() => {
    async function fetchData() {
      const conn = await checkConnection();
      setDbStatus(conn.connected ? 'connected' : 'error');
      
      if (conn.connected) {
        const { data, error } = await supabase.from('employees').select('*');
        if (error) {
          console.error('Error fetching employees:', error);
          setDbStatus('error');
        } else if (data) {
          setEmployees(data as Employee[]);
        }
      }
    }
    fetchData();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<{id: string, name: string}[]>([
    { id: '101', name: 'ETP Project' },
    { id: '102', name: 'Washing Project' },
    { id: '103', name: 'Tanaz Fashions Ltd.' },
    { id: '104', name: 'Vintage Garments Ltd.' },
    { id: '105', name: 'Hollywood Garments (Pvt.) Ltd.' },
    { id: '106', name: 'K.C Washing Plant.' },
    { id: '107', name: 'Windy Washing Ltd.' },
    { id: '108', name: 'Windy Wet & Dry Process Ltd.' },
    { id: '109', name: 'Windy Laundry Ltd.' },
    { id: '110', name: 'M/S Windy Logictic.' },
  ]);
  const [newEmp, setNewEmp] = useState<Employee>({ id: '', name: '', designation: '', education: '', category: '', salary: '', joinDate: '', phoneNumber: '' });
  const [newLoc, setNewLoc] = useState({ id: '', name: '' });
  const [viewMode, setViewMode] = useState<'admin' | 'user'>('user');
  const [userNo, setUserNo] = useState('');
  const [manualIn, setManualIn] = useState('');
  const [manualOut, setManualOut] = useState('');
  const [manualLocation, setManualLocation] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchNo, setSearchNo] = useState('');

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
    if(mode === 'user') {
      setFromDate('');
      setToDate('');
      setSearchNo('');
    }
  };

  const handleSubmitManualAttendance = () => {
    // Basic validation: userNo must be provided
    if (!userNo) return;
    
    // Check if record exists for today
    const today = new Date().toISOString().split('T')[0];
    const userNoTrimmed = userNo.trim();
    const existingIndex = attendance.findIndex(r => r.no.trim() === userNoTrimmed && r.dateISO === today);

    const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    if (existingIndex !== -1) {
      // Record exists, update
      const updatedAttendance = [...attendance];
      const record = { ...updatedAttendance[existingIndex] };
      
      // If InTime is already set, update only OutTime
      if (record.manualInTime && manualOut) {
         record.manualOutTime = manualOut;
         if (record.sysOutTime === '-') record.sysOutTime = currentTime;
      } else if (manualIn && manualOut) {
         // If neither set, set both
         record.manualInTime = manualIn;
         record.manualOutTime = manualOut;
         if (record.sysInTime === '-') record.sysInTime = currentTime;
         if (record.sysOutTime === '-') record.sysOutTime = currentTime;
      }
      
      updatedAttendance[existingIndex] = record;
      setAttendance(updatedAttendance);
    } else {
      // Create new
      if (!manualIn || !manualOut) return; // Need both for new
      const employee = employees.find(e => e.id === userNoTrimmed);
      const newRecord: AttendanceRecord = {
        name: employee ? employee.name : 'Unknown User',
        no: userNoTrimmed,
        date: new Date().toLocaleDateString(),
        dateISO: today,
        sysInTime: currentTime,
        sysOutTime: currentTime,
        manualInTime: manualIn,
        manualOutTime: manualOut,
        status: 'Manual',
        locationId: manualLocation,
        idNumber: '-',
      };
      setAttendance(prev => [...prev, newRecord]);
    }

    setManualIn('');
    setManualOut('');
    setManualLocation('');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData = results.data as any[];
          
          if (rawData.length === 0) {
            console.warn("No data parsed from CSV");
            return;
          }
          
          // 1. Map and parse to structured data
          const allRecords = rawData.map((row: any) => {
            const findKey = (keys: string[]) => Object.keys(row).find(k => keys.includes(k.trim().toLowerCase()));

            const dateTimeKey = findKey(['date/time', 'date', 'time']);
            const nameKey = findKey(['name']);
            const noKey = findKey(['no.', 'no', 'number']);
            const statusKey = findKey(['status']);
            const locationKey = findKey(['location id', 'location']);
            const idKey = findKey(['id number', 'id']);

            const dateTimeStr = (dateTimeKey && row[dateTimeKey]) || '';
            const dateObj = new Date(dateTimeStr);
            
            return {
              name: (nameKey && row[nameKey]) || '',
              no: (noKey && row[noKey]) || '',
              dateTimeStr,
              dateObj,
              status: (statusKey && row[statusKey]) || '',
              locationKey: (locationKey && row[locationKey]) || '',
              idKey: (idKey && row[idKey]) || '',
            };
          });

          // Group by employee AND date
          const groupedByEmpAndDate: { [key: string]: any[] } = {};

          allRecords.forEach(rec => {
            const dateStr = rec.dateObj.toISOString().split('T')[0];
            const groupKey = `${rec.no}_${dateStr}`;
            if (!groupedByEmpAndDate[groupKey]) groupedByEmpAndDate[groupKey] = [];
            groupedByEmpAndDate[groupKey].push(rec);
          });

          const grouped: AttendanceRecord[] = [];
          Object.keys(groupedByEmpAndDate).forEach(key => {
            const empDateRecords = groupedByEmpAndDate[key];
            // Sort by time within the day
            empDateRecords.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
            
            const first = empDateRecords[0];
            const last = empDateRecords[empDateRecords.length > 1 ? empDateRecords.length - 1 : 0];

            grouped.push({
              name: first.name,
              no: first.no,
              date: first.dateObj.toLocaleDateString(),
              dateISO: first.dateObj.toISOString().split('T')[0],
              sysInTime: first.dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
              sysOutTime: empDateRecords.length > 1 ? last.dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '-',
              status: 'C/In - C/Out',
              locationId: first.locationKey,
              idNumber: first.idKey,
            });
          });

          // Sort final grouped records by date, then ID
          grouped.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.no.localeCompare(b.no));

          setAttendance(grouped);
        }
      });
    }
  };

  const filteredData = attendance.filter(emp => {
    let matchDate = true;
    if (fromDate && toDate) {
      matchDate = emp.dateISO >= fromDate && emp.dateISO <= toDate;
    }
    
    if (viewMode === 'user') {
      const matchNo = userNo === '' || emp.no.trim() === userNo.trim();
      return matchDate && matchNo;
    }

    const matchNo = searchNo === '' || emp.no.toLowerCase().includes(searchNo.toLowerCase());
    return matchDate && matchNo;
  });

  const processedData = filteredData;

  return (
    <div className="min-h-screen bg-white text-stone-800 font-sans">
      <header className="h-20 border-b border-stone-200 flex items-center justify-between px-10 bg-white mb-10">
        <div>
          <h1 className="text-2xl font-serif italic text-stone-900 tracking-wide">HR Attendance Assistant</h1>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Professional Reporting & Analysis Engine</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`text-[10px] uppercase font-bold ${dbStatus === 'connected' ? 'text-green-600' : dbStatus === 'error' ? 'text-red-600' : 'text-stone-400'}`}>
             DB: {dbStatus}
          </div>
          {showPasswordPrompt ? (
            <div className="flex gap-2">
              <input type="password" placeholder="Admin Password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs" />
              <button onClick={handleAdminVerify} className="bg-amber-400 text-black px-4 py-2 text-xs font-bold uppercase">Verify</button>
            </div>
          ) : (
            <>
              <button onClick={() => setMode('user')} className={`px-4 py-2 text-xs font-bold uppercase ${viewMode === 'user' ? 'bg-amber-400 text-black' : 'bg-white border border-stone-300'}`}>User View</button>
              <button onClick={() => viewMode === 'admin' ? setMode('admin') : setShowPasswordPrompt(true)} className={`px-4 py-2 text-xs font-bold uppercase ${viewMode === 'admin' ? 'bg-amber-400 text-black' : 'bg-white border border-stone-300'}`}>Admin View</button>
            </>
          )}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-amber-200/20 text-amber-900 px-4 py-2 text-xs uppercase tracking-widest font-bold border border-amber-300 hover:bg-amber-200/30 cursor-pointer"
          >
            <Upload size={14} /> Upload CSV
          </button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
      </header>

      <main className="p-10">
        {viewMode === 'admin' && (
          <section className="bg-stone-50 border border-stone-200 p-6 rounded-sm shadow-sm mb-6">
            <h2 className="text-xs uppercase tracking-widest text-stone-600 mb-4 font-semibold">Filters</h2>
            <div className="flex gap-4">
              <input type="text" placeholder="Search by No..." value={searchNo} onChange={e => setSearchNo(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs w-48" />
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs" />
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs" />
            </div>
          </section>
        )}

        {viewMode === 'admin' && (
          <section className="bg-stone-50 border border-stone-200 p-6 rounded-sm shadow-sm mb-6">
            <h2 className="text-xs uppercase tracking-widest text-stone-600 mb-6 font-semibold flex items-center"><Table className="mr-2" /> Employee Directory</h2>
            
            <div className="bg-white p-4 border border-stone-200 mb-6">
              <h3 className="text-xs uppercase tracking-widest text-stone-600 mb-4">Add New Location</h3>
              <div className="flex gap-4">
                 <input type="text" placeholder="Location ID" value={newLoc.id} onChange={e => setNewLoc({...newLoc, id: e.target.value})} className="border border-stone-300 p-2 text-xs w-32" />
                 <input type="text" placeholder="Location Name" value={newLoc.name} onChange={e => setNewLoc({...newLoc, name: e.target.value})} className="border border-stone-300 p-2 text-xs flex-grow" />
                 <button onClick={() => { setLocations([...locations, newLoc]); setNewLoc({ id: '', name: '' }); }} className="bg-black text-white text-xs p-2 font-bold uppercase">Add Location</button>
              </div>
            </div>

            <div className="bg-white p-4 border border-stone-200 mb-6">
              <h3 className="text-xs uppercase tracking-widest text-stone-600 mb-4">Add New Employee</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 <input type="text" placeholder="ID" value={newEmp.id} onChange={e => setNewEmp({...newEmp, id: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Designation" value={newEmp.designation} onChange={e => setNewEmp({...newEmp, designation: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Education" value={newEmp.education} onChange={e => setNewEmp({...newEmp, education: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Category" value={newEmp.category} onChange={e => setNewEmp({...newEmp, category: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Salary" value={newEmp.salary} onChange={e => setNewEmp({...newEmp, salary: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="date" placeholder="Join Date" value={newEmp.joinDate} onChange={e => setNewEmp({...newEmp, joinDate: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <input type="text" placeholder="Phone" value={newEmp.phoneNumber} onChange={e => setNewEmp({...newEmp, phoneNumber: e.target.value})} className="border border-stone-300 p-2 text-xs" />
                 <button onClick={async () => {
                    const { error } = await supabase.from('employees').insert([newEmp]);
                    if (error) {
                      console.error('Error adding employee:', error);
                      alert('Error adding employee');
                    } else {
                      setEmployees([...employees, newEmp]);
                      setNewEmp({ id: '', name: '', designation: '', education: '', category: '', salary: '', joinDate: '', phoneNumber: '' });
                    }
                 }} className="bg-black text-white text-xs p-2 font-bold uppercase">Add Employee</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-stone-800">
                <thead className="text-[10px] text-stone-600 uppercase border-b border-stone-200">
                  <tr>
                    <th className="px-2 py-2">SL</th>
                    <th className="px-2 py-2">Emp ID</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Designation</th>
                    <th className="px-2 py-2">Education</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Salary</th>
                    <th className="px-2 py-2">Join Date</th>
                    <th className="px-2 py-2">Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => (
                    <tr key={emp.id} className="border-b border-stone-200/50 hover:bg-stone-100">
                      <td className="px-2 py-2">{i + 1}</td>
                      <td className="px-2 py-2">{emp.id}</td>
                      <td className="px-2 py-2">{emp.name}</td>
                      <td className="px-2 py-2">{emp.designation}</td>
                      <td className="px-2 py-2">{emp.education}</td>
                      <td className="px-2 py-2">{emp.category}</td>
                      <td className="px-2 py-2">{emp.salary}</td>
                      <td className="px-2 py-2">{emp.joinDate}</td>
                      <td className="px-2 py-2">{emp.phoneNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {viewMode === 'user' && (
           <section className="bg-stone-50 border border-stone-200 p-6 rounded-sm shadow-sm mb-6">
            <h2 className="text-xs uppercase tracking-widest text-stone-600 mb-4 font-semibold">Track My Attendance</h2>
            <div className="flex gap-4 items-end">
              <input type="text" placeholder="Enter Employee No." value={userNo} onChange={e => setUserNo(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs flex-grow" />
              <div className="text-xs text-stone-500 italic">Enter your ID to view records</div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-stone-200">
               <h3 className="text-xs uppercase tracking-widest text-stone-600 mb-4 font-semibold">Submit Manual Entry</h3>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <input type="time" placeholder="In Time" value={manualIn} onChange={e => setManualIn(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs" />
                  <input type="time" placeholder="Out Time" value={manualOut} onChange={e => setManualOut(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs" />
                  <select value={manualLocation} onChange={e => setManualLocation(e.target.value)} className="bg-white border border-stone-300 p-2 text-xs">
                    <option value="">Select Location</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                  <button onClick={handleSubmitManualAttendance} className="bg-amber-500 text-white px-4 py-2 text-xs font-bold uppercase w-full">Submit</button>
               </div>
            </div>
           </section>
        )}


        <section className="bg-stone-50 border border-stone-200 p-6 rounded-sm shadow-sm">
          <h2 className="text-xs uppercase tracking-widest text-stone-600 mb-6 font-semibold flex items-center"><Table className="mr-2" /> Attendance Report</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-stone-800">
              <thead className="text-[10px] text-stone-600 uppercase border-b border-stone-200">
                <tr>
                  <th className="px-2 py-2">No.</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">ID Number</th>
                  <th className="px-2 py-2">Date</th>
                  {viewMode === 'admin' && (
                    <>
                      <th className="px-2 py-2">SYS IN</th>
                      <th className="px-2 py-2">SYS OUT</th>
                    </>
                  )}
                  <th className="px-2 py-2">Manual IN</th>
                  <th className="px-2 py-2">Manual OUT</th>
                  <th className="px-2 py-2">Location ID</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((emp, i) => (
                  <tr key={i} className="border-b border-stone-200/50 hover:bg-stone-100">
                    <td className="px-2 py-2">{emp.no}</td>
                    <td className="px-2 py-2">{emp.name}</td>
                    <td className="px-2 py-2">{emp.idNumber}</td>
                    <td className="px-2 py-2">{emp.date}</td>
                    {viewMode === 'admin' && (
                      <>
                        <td className="px-2 py-2">{emp.sysInTime}</td>
                        <td className="px-2 py-2">{emp.sysOutTime}</td>
                      </>
                    )}
                    <td className="px-2 py-2">{emp.manualInTime || '-'}</td>
                    <td className="px-2 py-2">{emp.manualOutTime || '-'}</td>
                    <td className="px-2 py-2">{locations.find(l => l.id === emp.locationId)?.name || emp.locationId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
