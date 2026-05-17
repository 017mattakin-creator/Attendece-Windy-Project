import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';

interface AttendanceRecord {
  name: string;
  no: string;
  date: string;
  dateISO: string;
  sysInTime: string;
  sysOutTime: string;
  manualInTime: string;
  manualOutTime: string;
  status: string;
  locationId: string;
  idNumber: string;
}

interface Props {
    attendance: AttendanceRecord[];
    employees: any[];
    locations: any[];
    viewMode: 'admin' | 'user';
    onUpdateAttendance: (record: any) => void;
}

export default function AttendanceSection({ attendance, employees, locations, viewMode, onUpdateAttendance }: Props) {
    const [filterEmp, setFilterEmp] = useState('');
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Create matrix view
    const renderData = employees.map(emp => {
        const record = attendance.find(a => String(a.no).trim() === String(emp.id).trim() && a.dateISO === filterDate);
        return {
            emp,
            record: record || { manualInTime: '', manualOutTime: '', sysInTime: '', sysOutTime: '', locationId: '' }
        };
    }).filter(item => filterEmp === '' || item.emp.id === filterEmp);

    const exportToExcel = () => {
        const data = renderData.map(item => ({
            'ID': item.emp.id,
            'Name': item.emp.name,
            'Designation': item.emp.designation,
            'Category': item.emp.category,
            'In Time': item.record.manualInTime || item.record.sysInTime || '-',
            'Out Time': item.record.manualOutTime || item.record.sysOutTime || '-',
            'Location': locations.find(l => l.id === (item.record as any).locationId)?.name || (item.record as any).locationId || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
        XLSX.writeFile(workbook, `Attendance_Report_${filterDate}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text(`Attendance Report: ${filterDate}`, 14, 15);
        
        const head = [['ID', 'Name', 'In Time', 'Out Time', 'Location']];
        const body = renderData.map(item => [
            item.emp.id,
            item.emp.name,
            item.record.manualInTime || item.record.sysInTime || '-',
            item.record.manualOutTime || item.record.sysOutTime || '-',
            locations.find(l => l.id === (item.record as any).locationId)?.name || (item.record as any).locationId || '-'
        ]);

        autoTable(doc, {
            head: head,
            body: body,
            startY: 25,
            headStyles: { fillColor: [41, 41, 41] }
        });

        doc.save(`Attendance_Report_${filterDate}.pdf`);
    };

    return (
        <section className="bg-white p-4 md:p-8 rounded-lg shadow-sm border border-stone-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Attendance Report</h2>
                <div className="flex gap-2">
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 bg-green-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-green-800 transition-colors"
                    >
                        <FileSpreadsheet size={14} />
                        Excel
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 bg-red-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-red-800 transition-colors"
                    >
                        <FileText size={14} />
                        PDF
                    </button>
                </div>
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
                            <th className="px-3 py-3">In Time</th>
                            <th className="px-3 py-3">Out Time</th>
                            <th className="px-3 py-3">Location</th>
                            <th className="px-3 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {renderData.map((item, i) => (
                            <EditableRow key={i} item={item} date={filterDate} locations={locations} onSave={onUpdateAttendance} viewMode={viewMode} />
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function EditableRow({ item, date, locations, onSave, viewMode }: { item: any, date: string, locations: any[], onSave: any, viewMode: 'admin' | 'user', key?: any }) {
    const [inTime, setInTime] = useState(item.record.manualInTime || item.record.sysInTime || '');
    const [outTime, setOutTime] = useState(item.record.manualOutTime || item.record.sysOutTime || '');
    const [locationId, setLocationId] = useState(item.record.locationId || '');

    useEffect(() => {
        setInTime(item.record.manualInTime || item.record.sysInTime || '');
        setOutTime(item.record.manualOutTime || item.record.sysOutTime || '');
        setLocationId(item.record.locationId || '');
    }, [item.record]);

    return (
        <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
            <td className="px-3 py-3 font-medium text-stone-900">{item.emp.id}</td>
            <td className="px-3 py-3 font-medium text-stone-800">{item.emp.name}</td>
            <td className="px-3 py-3">
                <input 
                    type="text" 
                    placeholder={item.record.sysInTime || "00:00"} 
                    value={inTime} 
                    onChange={e => setInTime(e.target.value)} 
                    disabled={viewMode !== 'admin'}
                    className={`border border-stone-200 rounded px-2 py-1.5 w-24 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all ${viewMode !== 'admin' ? 'bg-stone-50 text-stone-400' : ''}`}
                />
            </td>
            <td className="px-3 py-3">
                <input 
                    type="text" 
                    placeholder={item.record.sysOutTime || "00:00"} 
                    value={outTime} 
                    onChange={e => setOutTime(e.target.value)} 
                    disabled={viewMode !== 'admin'}
                    className={`border border-stone-200 rounded px-2 py-1.5 w-24 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all ${viewMode !== 'admin' ? 'bg-stone-50 text-stone-400' : ''}`}
                />
            </td>
            <td className="px-3 py-3">
                <select 
                    value={locationId} 
                    onChange={e => setLocationId(e.target.value)}
                    disabled={viewMode !== 'admin'}
                    className={`border border-stone-200 rounded px-2 py-1.5 w-32 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all ${viewMode !== 'admin' ? 'bg-stone-50 text-stone-400' : ''}`}
                >
                    <option value="">Select Location</option>
                    {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                </select>
            </td>
            <td className="px-3 py-3">
                {viewMode === 'admin' ? (
                  <button 
                      onClick={() => onSave({ empId: item.emp.id, date, inTime, outTime, locationId })} 
                      className="bg-stone-800 text-white hover:bg-stone-900 px-3 py-1.5 rounded text-[10px] uppercase font-bold tracking-wider transition-colors"
                  >
                      Save
                  </button>
                ) : (
                  <span className="text-[10px] text-stone-400 font-bold uppercase">View Only</span>
                )}
            </td>
        </tr>
    );
}
