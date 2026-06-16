import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText, MapPin, Search } from 'lucide-react';
import { getTodayShiftDate, getEmployeeShift } from '../lib/dateUtils';

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
  live_location?: string;
  live_location_in?: string;
  live_location_out?: string;
  late_remark?: string;
  idNumber: string;
}

interface Props {
    attendance: AttendanceRecord[];
    employees: any[];
    locations: any[];
    viewMode: 'admin' | 'user';
    onUpdateAttendance: (record: any) => void;
}

const STAFF_IDS = [
  '16153', '15439', '16325', '15524', '16135', '16117', '15525', '15641', '16254', '15608', '16279', 
  '15590', '15832', '16187', '15548', '16110', '16004', '16114', '16270', '16099', '16193', '16009', '15973', '16156'
];

const isStaffEmployee = (emp: any) => {
  const idValue = String(emp.id).trim();
  if (STAFF_IDS.includes(idValue)) return true;
  const cat = (emp.category || '').toLowerCase().trim();
  if (cat.includes('staff')) return true;
  if (cat.includes('security') || cat.includes('guard')) return false;
  const desig = (emp.designation || '').toLowerCase().trim();
  if (desig.includes('security') || desig.includes('guard') || desig.includes('ansar')) return false;
  return true;
};

export default function AttendanceSection({ attendance, employees, locations, viewMode, onUpdateAttendance }: Props) {
    const [filterEmp, setFilterEmp] = useState('');
    const [filterDate, setFilterDate] = useState(getTodayShiftDate());
    
    // Create matrix view
    const rawRenderData = employees.map(emp => {
        const record = attendance.find(a => String(a.no).trim() === String(emp.id).trim() && a.dateISO === filterDate);
        return {
            emp,
            record: record || { manualInTime: '', manualOutTime: '', sysInTime: '', sysOutTime: '', locationId: '', live_location: '', live_location_in: '', live_location_out: '', late_remark: '' }
        };
    }).filter(item => {
        if (filterEmp === '') return true;
        const search = filterEmp.toLowerCase();
        return String(item.emp.id).toLowerCase().includes(search) || 
               item.emp.name.toLowerCase().includes(search);
    });

    const renderData = [...rawRenderData].sort((a, b) => {
        const isStaffA = isStaffEmployee(a.emp);
        const isStaffB = isStaffEmployee(b.emp);
        if (isStaffA && !isStaffB) return -1;
        if (!isStaffA && isStaffB) return 1;
        
        if (isStaffA && isStaffB) {
            const idxA = STAFF_IDS.indexOf(String(a.emp.id).trim());
            const idxB = STAFF_IDS.indexOf(String(b.emp.id).trim());
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
        }
        return String(a.emp.id).localeCompare(String(b.emp.id));
    });

    const staffAttendance = renderData.filter(item => isStaffEmployee(item.emp));
    const securityAttendance = renderData.filter(item => !isStaffEmployee(item.emp));

    const exportToExcel = () => {
        const data = renderData.map(item => {
            const base = {
                'ID': item.emp.id,
                'Name': item.emp.name,
                'Designation': item.emp.designation,
                'Category': item.emp.category,
                'In Time': item.record.manualInTime || item.record.sysInTime || '-',
                'Out Time': item.record.manualOutTime || item.record.sysOutTime || '-',
                'Location': locations.find(l => l.id === (item.record as any).locationId)?.name || (item.record as any).locationId || '-',
                'IN GPS Address': (() => {
                    try {
                        const raw = item.record.live_location_in || item.record.live_location || '{}';
                        let loc = JSON.parse(raw);
                        // Deep fallback check
                        if (!loc.lat && loc.in) loc = loc.in;
                        
                        if (loc && loc.address) return loc.address;
                        if (loc && loc.lat) return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;
                        return '-';
                    } catch { return '-'; }
                })(),
                'OUT GPS Address': (() => {
                    try {
                        const raw = item.record.live_location_out || item.record.live_location || '{}';
                        let loc = JSON.parse(raw);
                        // Deep fallback check
                        if (loc.out) loc = loc.out;
                        else if (!item.record.live_location_out) return '-'; // Don't show IN info as OUT
                        
                        if (loc && loc.address) return loc.address;
                        if (loc && loc.lat) return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;
                        return '-';
                    } catch { return '-'; }
                })(),
                'Late Remark': (item.record as any).late_remark || '-'
            };
            if (viewMode === 'admin') {
                (base as any)['Live Location'] = item.record.live_location || '-';
            }
            return base;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
        XLSX.writeFile(workbook, `Attendance_Report_${filterDate}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.text(`Attendance Report: ${filterDate}`, 14, 15);
        
        const head = [
            ['ID', 'Name', 'In Time', 'Out Time', 'Location', 'Late Remark', 'IN GPS Address', ...(viewMode === 'admin' ? ['Live Loc'] : [])]
        ];
        const body = renderData.map(item => [
            item.emp.id,
            item.emp.name,
            item.record.manualInTime || item.record.sysInTime || '-',
            item.record.manualOutTime || item.record.sysOutTime || '-',
            locations.find(l => l.id === (item.record as any).locationId)?.name || (item.record as any).locationId || '-',
            (item.record as any).late_remark || '-',
            (() => {
                try {
                    const raw = item.record.live_location_in || item.record.live_location || '{}';
                    let loc = JSON.parse(raw);
                    if (!loc.lat && loc.in) loc = loc.in;
                    if (loc && loc.address) return loc.address;
                    if (loc && loc.lat) return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;
                    return '-';
                } catch { return '-'; }
            })(),
            (() => {
                try {
                    const raw = item.record.live_location_out || item.record.live_location || '{}';
                    let loc = JSON.parse(raw);
                    if (loc.out) loc = loc.out;
                    else if (!item.record.live_location_out) return '-';
                    if (loc && loc.address) return loc.address;
                    if (loc && loc.lat) return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;
                    return '-';
                } catch { return '-'; }
            })(),
            ...(viewMode === 'admin' ? [item.record.live_location || '-'] : [])
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
            
            <div className="flex flex-wrap items-end gap-4 mb-6 bg-stone-50 p-4 rounded-md">
                <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase font-bold text-stone-500">Search Staff (ID or Name)</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                        <input 
                            type="text" 
                            placeholder="Type ID or Name..." 
                            value={filterEmp} 
                            onChange={e => setFilterEmp(e.target.value)} 
                            className="w-full border border-stone-200 rounded p-2 pl-9 text-xs outline-none focus:ring-1 focus:ring-stone-400 bg-white" 
                        />
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase font-bold text-stone-500">Select Date</label>
                    <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-stone-200 rounded p-2 text-xs outline-none focus:ring-1 focus:ring-stone-400" />
                </div>
            </div>

            {/* Table 1: Staff Attendance */}
            <div className="mb-8 bg-amber-50/10 border border-amber-100 p-4 md:p-6 rounded-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b border-amber-100">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-amber-905 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                        Staff Attendance Report (স্টাফ হাজিরা - {staffAttendance.length})
                    </h3>
                    <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-sm font-bold uppercase mt-1 sm:mt-0">
                      Office / Support Force
                    </span>
                </div>
                {staffAttendance.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 italic text-xs">No Staff matched criteria.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-stone-700">
                            <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                                <tr>
                                    <th className="px-3 py-3">ID</th>
                                    <th className="px-3 py-3">Name</th>
                                    <th className="px-3 py-3">In Time</th>
                                    <th className="px-3 py-3">Out Time</th>
                                    <th className="px-3 py-3">Location</th>
                                    <th className="px-3 py-3">Remarks</th>
                                    <th className="px-3 py-3">IN Address</th>
                                    <th className="px-3 py-3">OUT Address</th>
                                    {viewMode === 'admin' && <th className="px-3 py-3 text-center">Live Loc</th>}
                                    <th className="px-3 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {staffAttendance.map((item, i) => (
                                    <EditableRow key={i} item={item} date={filterDate} locations={locations} onSave={onUpdateAttendance} viewMode={viewMode} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Table 2: Security Attendance */}
            <div className="bg-indigo-50/10 border border-indigo-100 p-4 md:p-6 rounded-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 pb-2 border-b border-indigo-100">
                    <h3 className="text-xs font-extrabold uppercase tracking-widest text-indigo-950 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                        Security Guard Force (সিকিউরিটি গার্ড হাজিরা - {securityAttendance.length})
                    </h3>
                    <span className="text-[9px] bg-indigo-50 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-sm font-bold uppercase mt-1 sm:mt-0">
                      Guard Force
                    </span>
                </div>
                {securityAttendance.length === 0 ? (
                    <div className="p-8 text-center text-stone-400 italic text-xs">No Security guards matched criteria.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-stone-700">
                            <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                                <tr>
                                    <th className="px-3 py-3">ID</th>
                                    <th className="px-3 py-3">Name</th>
                                    <th className="px-3 py-3">In Time</th>
                                    <th className="px-3 py-3">Out Time</th>
                                    <th className="px-3 py-3">Location</th>
                                    <th className="px-3 py-3">Remarks</th>
                                    <th className="px-3 py-3">IN Address</th>
                                    <th className="px-3 py-3">OUT Address</th>
                                    {viewMode === 'admin' && <th className="px-3 py-3 text-center">Live Loc</th>}
                                    <th className="px-3 py-3">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {securityAttendance.map((item, i) => (
                                    <EditableRow key={i} item={item} date={filterDate} locations={locations} onSave={onUpdateAttendance} viewMode={viewMode} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function EditableRow({ item, date, locations, onSave, viewMode }: { item: any, date: string, locations: any[], onSave: any, viewMode: 'admin' | 'user', key?: any }) {
    const [inTime, setInTime] = useState(item.record.manualInTime || item.record.sysInTime || '');
    const [outTime, setOutTime] = useState(item.record.manualOutTime || item.record.sysOutTime || '');
    const [locationId, setLocationId] = useState(item.record.locationId || '');
    const [lateRemark, setLateRemark] = useState((item.record as any).late_remark || '');

    useEffect(() => {
        setInTime(item.record.manualInTime || item.record.sysInTime || '');
        setOutTime(item.record.manualOutTime || item.record.sysOutTime || '');
        setLocationId(item.record.locationId || '');
        setLateRemark((item.record as any).late_remark || '');
    }, [item.record]);

    return (
        <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
            <td className="px-3 py-3 font-medium text-stone-900">{item.emp.id}</td>
            <td className="px-3 py-3">
                <div className="font-medium text-stone-800">{item.emp.name}</div>
                <div className="text-[9px] mt-0.5 whitespace-nowrap">
                    {getEmployeeShift(item.emp.id) === 'Night' ? (
                        <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-sm font-semibold tracking-wide">🌙 Night Shift</span>
                    ) : (
                        <span className="bg-amber-50 border border-amber-100/50 text-amber-800 px-1.5 py-0.5 rounded-sm font-semibold tracking-wide">☀️ Day Shift</span>
                    )}
                </div>
            </td>
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
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    (item.record.status === 'Absent' || !item.record.status) && !(item.record.manualInTime || item.record.sysInTime) 
                        ? 'bg-red-50 text-red-600' 
                        : 'bg-green-50 text-green-600'
                }`}>
                    {item.record.status === 'Manual' || item.record.status === 'Present' ? 'Present' : (item.record.status || ( (item.record.manualInTime || item.record.sysInTime) ? 'Present' : 'Absent'))}
                </span>
            </td>
            <td className="px-3 py-3">
                <select 
                    value={locationId || ''} 
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
                    <input 
                        type="text" 
                        placeholder="মন্তব্য লিখুন..." 
                        value={lateRemark} 
                        onChange={e => setLateRemark(e.target.value)} 
                        className="border border-stone-200 rounded px-2 py-1.5 w-36 text-xs focus:ring-1 focus:ring-stone-400 outline-none transition-all bg-white font-medium text-stone-800"
                    />
                ) : (
                    <div className="max-w-[120px]">
                        {lateRemark ? (
                            <span className="text-[10px] text-red-600 font-bold leading-tight line-clamp-2 italic">
                                {lateRemark}
                            </span>
                        ) : (
                            <span className="text-stone-300 italic text-[9px]">-</span>
                        )}
                    </div>
                )}
            </td>
            <td className="px-3 py-3">
                <div className="max-w-[150px]">
                    {item.record.live_location_in || item.record.live_location ? (() => {
                        try {
                            const raw = item.record.live_location_in || item.record.live_location;
                            let loc = JSON.parse(raw);
                            if (!loc.lat && loc.in) loc = loc.in;
                            
                            if (loc && loc.address) return (
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-stone-800 font-bold leading-tight uppercase tracking-tight line-clamp-2">{loc.address}</span>
                                    <span className="text-[8px] text-stone-400 font-mono mt-0.5">{Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>
                                </div>
                            );
                            if (loc && loc.lat) return <span className="text-[9px] text-stone-400 font-mono italic">{Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>;
                            return <span className="text-stone-300">-</span>;
                        } catch { return <span className="text-stone-300">-</span>; }
                    })() : <span className="text-stone-300 italic text-[9px]">Not Tracked</span>}
                </div>
            </td>
            <td className="px-3 py-3">
                <div className="max-w-[150px]">
                    {item.record.live_location_out || item.record.live_location ? (() => {
                        try {
                            const raw = item.record.live_location_out || item.record.live_location;
                            let loc = JSON.parse(raw);
                            if (loc.out) loc = loc.out;
                            else if (!item.record.live_location_out) return <span className="text-stone-300">-</span>;
                            
                            if (loc && loc.address) return (
                                <div className="flex flex-col">
                                    <span className="text-[9px] text-stone-800 font-bold leading-tight uppercase tracking-tight line-clamp-2">{loc.address}</span>
                                    <span className="text-[8px] text-stone-400 font-mono mt-0.5">{Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>
                                </div>
                            );
                            if (loc && loc.lat) return <span className="text-[9px] text-stone-400 font-mono italic">{Number(loc.lat).toFixed(4)}, {Number(loc.lng).toFixed(4)}</span>;
                            return <span className="text-stone-300">-</span>;
                        } catch { return <span className="text-stone-300">-</span>; }
                    })() : <span className="text-stone-300 italic text-[9px]">Not Tracked</span>}
                </div>
            </td>
            {viewMode === 'admin' && (
                <td className="px-3 py-3 text-center">
                    {item.record.live_location ? (() => {
                        try {
                            const loc = JSON.parse(item.record.live_location);
                            return (
                                <a 
                                    href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100 hover:bg-red-100 transition-colors"
                                    title={`${loc.lat}, ${loc.lng}`}
                                >
                                    <MapPin size={10} /> Map
                                </a>
                            );
                        } catch (e) {
                            return <span className="text-stone-300">-</span>;
                        }
                    })() : (
                        <span className="text-stone-300">-</span>
                    )}
                </td>
            )}
            <td className="px-3 py-3">
                {viewMode === 'admin' ? (
                  <button 
                      onClick={() => onSave({ empId: item.emp.id, date, inTime, outTime, locationId, lateRemark })} 
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
