import React, { useState } from 'react';
import Papa from 'papaparse';

interface AttendanceRecord {
  name: string;
  no: string;
  date: string;
  dateISO: string;
  sysInTime: string;
  sysOutTime: string;
  manualInTime: string; // Add
  manualOutTime: string; // Add
  status: string;
  locationId: string;
  idNumber: string;
}

interface Props {
    attendance: AttendanceRecord[];
    employees: any[];
    onUpdateAttendance: (record: any) => void;
}

export default function AttendanceSection({ attendance, employees, onUpdateAttendance }: Props) {
    const [filterEmp, setFilterEmp] = useState('');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Create matrix view
    const renderData = employees.map(emp => {
        const record = attendance.find(a => a.no === emp.id && a.dateISO === filterDate);
        console.log(`Checking emp ${emp.id} record:`, record);                
        return {
            emp,
            record: record || { manualInTime: '', manualOutTime: '', sysInTime: '', sysOutTime: '' }
        };
    }).filter(item => filterEmp === '' || item.emp.id === filterEmp);

    return (
        <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Attendance Report</h2>
            </div>
            
            <div className="flex gap-4 mb-6 bg-stone-50 p-4 rounded-md">
                <input type="text" placeholder="Filter by ID" value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="border border-stone-200 rounded p-2 text-xs w-48" />
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-stone-200 rounded p-2 text-xs" />
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-stone-700">
                    <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                        <tr>
                            <th className="px-3 py-3">ID</th>
                            <th className="px-3 py-3">Name</th>
                            <th className="px-3 py-3">Designation</th>
                            <th className="px-3 py-3">Category</th>
                            <th className="px-3 py-3">In Time</th>
                            <th className="px-3 py-3">Out Time</th>
                            <th className="px-3 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderData.map((item, i) => (
                            <EditableRow key={i} item={item} date={filterDate} onSave={onUpdateAttendance} />
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function EditableRow({ item, date, onSave }: { item: any, date: string, onSave: any }) {
    const [inTime, setInTime] = useState(item.record.manualInTime || item.record.sysInTime || '');
    const [outTime, setOutTime] = useState(item.record.manualOutTime || item.record.sysOutTime || '');

    React.useEffect(() => {
        console.log('EditableRow item record:', item.record);
        setInTime(item.record.manualInTime || item.record.sysInTime || '');
        setOutTime(item.record.manualOutTime || item.record.sysOutTime || '');
    }, [item.record]);

    return (
        <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
            <td className="px-3 py-3 font-medium text-stone-900">{item.emp.id}</td>
            <td className="px-3 py-3">{item.emp.name}</td>
            <td className="px-3 py-3 text-stone-500">{item.emp.designation}</td>
            <td className="px-3 py-3 text-stone-500">{item.emp.category}</td>
            <td className="px-3 py-3">
                <input 
                    type="text" 
                    placeholder={item.record.sysInTime || "00:00"} 
                    value={inTime} 
                    onChange={e => setInTime(e.target.value)} 
                    className="border border-stone-200 rounded px-2 py-1.5 w-24 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all"
                />
            </td>
            <td className="px-3 py-3">
                <input 
                    type="text" 
                    placeholder={item.record.sysOutTime || "00:00"} 
                    value={outTime} 
                    onChange={e => setOutTime(e.target.value)} 
                    className="border border-stone-200 rounded px-2 py-1.5 w-24 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all"
                />
            </td>
            <td className="px-3 py-3">
                <button 
                    onClick={() => onSave({ empId: item.emp.id, date, inTime, outTime })} 
                    className="bg-stone-800 text-white hover:bg-stone-900 px-3 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors"
                >
                    Save
                </button>
            </td>
        </tr>
    );
}
