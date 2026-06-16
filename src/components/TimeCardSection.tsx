import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText, Loader2, MapPin, Search } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getTodayShiftDate, getEmployeeShift, getPossibleDateFormats, normalizeToYYYYMMDD } from '../lib/dateUtils';

interface Props {
    employees: any[];
    attendance: any[];
    locations: any[];
    onRefresh?: () => void;
    viewMode?: 'admin' | 'user';
}

export default function TimeCardSection({ employees, attendance, locations, onRefresh, viewMode }: Props) {
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [updating, setUpdating] = useState<string | null>(null);
    const [localAttendance, setLocalAttendance] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const employee = employees.find(e => e.id === selectedEmpId);

    // Fetch employee specific data when employee/month/year changes
    React.useEffect(() => {
        if (!selectedEmpId) {
            setLocalAttendance([]);
            return;
        }

        const fetchEmpData = async () => {
            setIsLoading(true);
            try {
                // Get all possible ISO strings for this month/year for better coverage
                // Or just fetch all for this employee and filter in JS using normalize
                const { data, error } = await supabase
                    .from('attendance')
                    .select('*')
                    .eq('employee_id', selectedEmpId);
                
                if (error) throw error;
                if (data) {
                    const mapped = data.map((a: any) => ({
                        no: String(a.employee_id).trim(),
                        dateISO: normalizeToYYYYMMDD(a.date_iso || ''),
                        sysInTime: a.sys_in_time || '',
                        sysOutTime: a.sys_out_time || '',
                        manualInTime: a.manual_in_time || '',
                        manualOutTime: a.manual_out_time || '',
                        status: a.status || 'Absent',
                        locationId: a.location_id || '',
                        late_remark: a.late_remark || '',
                        live_location: a.live_location || '',
                    }));
                    
                    // Merge same-day records
                    const merged: Record<string, any> = {};
                    mapped.forEach(row => {
                        const key = row.dateISO;
                        if (!merged[key]) {
                            merged[key] = row;
                        } else {
                            const existing = merged[key];
                            const hasPunches = (r: any) => !!(String(r.sysInTime || '').trim() || String(r.sysOutTime || '').trim() || String(r.manualInTime || '').trim() || String(r.manualOutTime || '').trim());
                            if (!hasPunches(existing) && hasPunches(row)) {
                                merged[key] = { ...row, live_location: row.live_location || existing.live_location, late_remark: row.late_remark || existing.late_remark };
                            } else {
                                if (!existing.live_location) existing.live_location = row.live_location;
                                if (!existing.late_remark) existing.late_remark = row.late_remark;
                                if (existing.status === 'Absent' && row.status !== 'Absent') existing.status = row.status;
                            }
                        }
                    });

                    // Filter for selected month/year
                    const filtered = Object.values(merged).filter((a: any) => {
                        if (!a.dateISO) return false;
                        const [y, m] = a.dateISO.split('-').map(Number);
                        return y === year && m === month;
                    });

                    setLocalAttendance(filtered);
                }
            } catch (err) {
                console.error('Error fetching employee attendance:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchEmpData();
    }, [selectedEmpId, month, year]);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    let maxDay;
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        maxDay = new Date(year, month, 0).getDate();
    } else if (year === currentYear && month === currentMonth) {
        maxDay = currentDay;
    } else {
        maxDay = 0; // Future month
    }
    const days = Array.from({ length: maxDay }, (_, i) => i + 1);

    const getStatusDisplay = (record: any, isFuture: boolean) => {
        if (!record) return isFuture ? { label: '-', color: 'text-stone-300', bg: '' } : { label: 'A', color: 'text-red-400', value: 'Absent', bg: 'bg-red-50' };
        
        const hasTimes = !!(String(record.manualInTime || '').trim() || String(record.sysInTime || '').trim() || String(record.manualOutTime || '').trim() || String(record.sysOutTime || '').trim());
        const currentStatus = record.status;
        
        // FESTIVAL override! If the CSV or DB says Festival, keep it!
        if (currentStatus === 'Festival') {
            return { label: 'F', color: 'text-purple-500', value: 'Festival', bg: 'bg-purple-50' };
        }
        
        let effectiveStatus = currentStatus || 'Present';
        if (hasTimes && (effectiveStatus === 'Absent' || !effectiveStatus)) {
            effectiveStatus = record.manualInTime || record.manualOutTime ? 'Manual' : 'Present';
        }
        
        const opt = STATUS_OPTIONS.find(o => o.value === effectiveStatus);
        return opt ? { label: opt.label, color: opt.color, value: effectiveStatus, bg: opt.bg } : { label: 'P', color: 'text-green-600', value: 'Present', bg: 'bg-green-50' };
    };

    const summary = {
        totalDays: days.length,
        present: 0,
        absent: 0,
        cl: 0,
        sl: 0,
        holiday: 0,
        festival: 0,
        offDay: 0,
        workingDays: 0 
    };

    const STATUS_OPTIONS = [
        { label: 'P', value: 'Present', color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'P', value: 'Manual', color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'A', value: 'Absent', color: 'text-red-400', bg: 'bg-red-50' },
        { label: 'CL', value: 'CL', color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'SL', value: 'SL', color: 'text-orange-600', bg: 'bg-orange-50' },
        { label: 'H', value: 'Holiday', color: 'text-blue-500', bg: 'bg-blue-50' },
        { label: 'F', value: 'Festival', color: 'text-purple-500', bg: 'bg-purple-50' },
        { label: 'O', value: 'OffDay', color: 'text-stone-500', bg: 'bg-stone-50' },
    ];

    days.forEach(d => {
        const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const record = localAttendance.find(a => a.dateISO === dateISO);
        const isFuture = dateISO > getTodayShiftDate(getEmployeeShift(selectedEmpId));
        const status = getStatusDisplay(record, isFuture);

        if (status.label === '-') return;

        if (status.value === 'Present' || status.value === 'Manual') {
            summary.present++;
            summary.workingDays++;
        } else if (status.value === 'Absent') {
            summary.absent++;
        } else if (status.value === 'CL') {
            summary.cl++;
            summary.workingDays++;
        } else if (status.value === 'SL') {
            summary.sl++;
            summary.workingDays++;
        } else if (status.value === 'Holiday') {
            summary.holiday++;
        } else if (status.value === 'Festival') {
            summary.festival++;
        } else if (status.value === 'OffDay') {
            summary.offDay++;
        }
    });

    const ensureTime24h = (timeStr: string) => {
        if (!timeStr) return '';
        const trimmed = timeStr.trim();
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
            const [h, m] = trimmed.split(':');
            return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        }
        const match = trimmed.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (match) {
            let h = parseInt(match[1], 10);
            const m = match[2];
            const ampm = match[3].toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:${m}`;
        }
        return trimmed;
    };

    const handleAttendanceUpdate = async (empId: string, dateISO: string, field: string, newValue: string) => {
        setUpdating(`${empId}_${dateISO}_${field}`);
        
        try {
            const { data: existingRecords } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', empId)
                .in('date_iso', getPossibleDateFormats(dateISO));
            
            const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

            const updatePayload: any = {
                ...(existing || {}),
                employee_id: empId,
                date_iso: dateISO,
            };

            if (field === 'status') updatePayload.status = newValue;
            if (field === 'in') {
                updatePayload.manual_in_time = newValue;
                if (updatePayload.status === 'Absent' || !updatePayload.status) {
                    updatePayload.status = 'Manual';
                }
            }
            if (field === 'out') {
                updatePayload.manual_out_time = newValue;
                if (updatePayload.status === 'Absent' || !updatePayload.status) {
                    updatePayload.status = 'Manual';
                }
            }
            if (field === 'remarks') updatePayload.late_remark = newValue;
            if (field === 'location') updatePayload.location_id = newValue || null;

            const { error } = await supabase.from('attendance').upsert([updatePayload], { onConflict: 'employee_id,date_iso' });

            if (error) {
                alert('Update failed: ' + error.message);
            } else {
                if (onRefresh) onRefresh();
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setUpdating(null);
        }
    };

    const exportToExcel = () => {
        if (!employee) return;
        const data = days.map(d => {
            const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = localAttendance.find(a => a.dateISO === dateISO);
            const isFuture = dateISO > getTodayShiftDate(getEmployeeShift(selectedEmpId));
            const status = getStatusDisplay(record, isFuture);
            return {
                'Date': dateISO,
                'In Time': record ? (record.manualInTime || record.sysInTime) : '-',
                'Out Time': record ? (record.manualOutTime || record.sysOutTime) : '-',
                'Project Location': record ? (locations.find(l => l.id === record.locationId)?.name || record.locationId || '-') : '-',
                'Status': status.label === '-' ? '-' : (status.value === 'Manual' || status.value === 'Present' ? 'Present' : (status.value || 'Absent')),
                'Remarks / Comments': record?.late_remark || '-'
            };
        });

        const summaryData = [
            {}, 
            { 'Date': 'SUMMARY REPORT' },
            { 'Date': `Total Days`, 'In Time': summary.totalDays },
            { 'Date': 'Working Days (P+CL+SL)', 'In Time': summary.workingDays },
            { 'Date': 'Present', 'In Time': summary.present },
            { 'Date': 'Absent', 'In Time': summary.absent },
            { 'Date': 'Attendance %', 'In Time': (summary.workingDays > 0 ? ((summary.present / (summary.workingDays)) * 100).toFixed(1) : '0') + '%' }
        ];

        const worksheet = XLSX.utils.json_to_sheet([...data, ...summaryData as any]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Card');
        XLSX.writeFile(workbook, `TimeCard_${employee.id}_${month}_${year}.xlsx`);
    };

    const exportToPDF = () => {
        try {
            if (!employee) return;
            const doc = new jsPDF();
            
            doc.setFontSize(18);
            doc.setTextColor(41, 41, 41);
            doc.text(`TIME CARD REPORT`, 14, 15);
            
            doc.setFontSize(11);
            doc.text(`Employee: ${employee.name} (${employee.id})`, 14, 22);
            doc.text(`Period: ${month}/${year}`, 14, 27);
            doc.text(`Designation: ${employee.designation}`, 14, 32);
            doc.text(`Category: ${employee.category}`, 14, 37);

            doc.setFontSize(14);
            doc.text("Attendance Summary", 14, 45);
            const attnPercent = summary.workingDays > 0 ? ((summary.present / (summary.workingDays)) * 100).toFixed(1) : '0';
            autoTable(doc, {
                startY: 48,
                head: [['Days', 'Working', 'Present', 'Absent', 'CL', 'SL', 'Hol', 'Fest', 'Off', 'Attn %']],
                body: [[
                    summary.totalDays,
                    summary.workingDays,
                    summary.present,
                    summary.absent,
                    summary.cl,
                    summary.sl,
                    summary.holiday,
                    summary.festival,
                    summary.offDay,
                    attnPercent + "%"
                ]],
                theme: 'grid',
                headStyles: { fillColor: [80, 80, 80] },
                styles: { fontSize: 9 }
            });
            
            const head = [['Date', 'In', 'Out', 'Location', 'Status', 'Remarks']];
            const body = days.map(d => {
                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const record = localAttendance.find(a => a.dateISO === dateISO);
                const isFuture = dateISO > getTodayShiftDate(getEmployeeShift(selectedEmpId));
                const status = getStatusDisplay(record, isFuture);
                const statusLine = status.label === '-' ? '-' : (status.value === 'Manual' || status.value === 'Present' ? 'Present' : (status.value || 'Absent'));
                return [
                    dateISO,
                    record ? (record.manualInTime || record.sysInTime || '-') : '-',
                    record ? (record.manualOutTime || record.sysOutTime || '-') : '-',
                    record ? (locations.find(l => l.id === record.locationId)?.name || record.locationId || '-') : '-',
                    statusLine,
                    record?.late_remark || '-'
                ];
            });

            autoTable(doc, {
                head: head,
                body: body,
                startY: (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 4 : 62,
                headStyles: { fillColor: [41, 41, 41] },
                styles: { fontSize: 9 }
            });

            doc.save(`TimeCard_${employee.id}_${month}_${year}.pdf`);
        } catch (err: any) {
            console.error('PDF Error:', err);
            alert('Failed to generate PDF: ' + err.message);
        }
    };

    return (
        <section className="bg-white p-4 md:p-8 rounded-lg shadow-sm border border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Time Card & Analysis</h2>
            {employee && (
                <div className="flex gap-2">
                    <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-green-800 transition-colors">
                        <FileSpreadsheet size={14} /> Excel
                    </button>
                    <button onClick={exportToPDF} className="flex items-center gap-2 bg-red-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-red-800 transition-colors">
                        <FileText size={14} /> PDF
                    </button>
                </div>
            )}
          </div>
          
          <div className="flex flex-wrap gap-4 mb-8 bg-stone-50 p-4 rounded-md border border-stone-100">
            <div className="flex flex-col gap-1 relative">
                <label className="text-[10px] uppercase font-bold text-stone-500">Select Employee (Search by ID or Name)</label>
                <div className="relative w-72">
                    <div 
                        onClick={() => setIsSearchOpen(!isSearchOpen)}
                        className="flex items-center justify-between border border-stone-200 rounded p-2 text-xs bg-white cursor-pointer hover:border-stone-400 transition-colors"
                    >
                        <span className="truncate">
                            {selectedEmpId ? (employees.find(e => e.id === selectedEmpId)?.id + ' - ' + employees.find(e => e.id === selectedEmpId)?.name) : 'Choose an employee...'}
                        </span>
                        <Search size={14} className="text-stone-400" />
                    </div>

                    {isSearchOpen && (
                        <div className="absolute z-50 mt-1 w-full bg-white border border-stone-200 rounded shadow-xl max-h-64 overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-stone-100 bg-stone-50">
                                <input 
                                    type="text" 
                                    autoFocus
                                    placeholder="Search ID or Name..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full p-1.5 text-xs border border-stone-200 rounded outline-none focus:ring-1 focus:ring-stone-400"
                                />
                            </div>
                            <div className="overflow-y-auto">
                                {employees
                                    .filter(e => 
                                        String(e.id).toLowerCase().includes(searchTerm.toLowerCase()) || 
                                        e.name.toLowerCase().includes(searchTerm.toLowerCase())
                                    )
                                    .slice(0, 100)
                                    .map(e => (
                                        <div 
                                            key={e.id}
                                            onClick={() => {
                                                setSelectedEmpId(e.id);
                                                setIsSearchOpen(false);
                                                setSearchTerm('');
                                            }}
                                            className={`p-2 text-xs cursor-pointer hover:bg-stone-50 border-b border-stone-50 last:border-0 ${selectedEmpId === e.id ? 'bg-amber-50 font-bold border-l-2 border-l-amber-400' : ''}`}
                                        >
                                            <div className="font-bold text-stone-800">{e.id}</div>
                                            <div className="text-stone-600 truncate">{e.name}</div>
                                        </div>
                                    ))}
                                {employees.filter(e => String(e.id).toLowerCase().includes(searchTerm.toLowerCase()) || e.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                    <div className="p-4 text-center text-xs text-stone-400">No results found</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Month</label>
                <input type="number" min="1" max="12" value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20 focus:ring-1 focus:ring-stone-400 outline-none" placeholder="MM" />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Year</label>
                <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24 focus:ring-1 focus:ring-stone-400 outline-none" placeholder="YYYY" />
            </div>
          </div>

          {employee && (
              <div className={`mt-8 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {isLoading && (
                      <div className="flex items-center gap-2 text-amber-600 font-bold text-xs mb-4">
                          <Loader2 className="animate-spin" size={16} /> Fetching records...
                      </div>
                  )}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-stone-100 pb-8">
                      <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-stone-800 text-white rounded-full flex items-center justify-center font-bold text-xl ring-4 ring-stone-50 shadow-sm">{employee.name.charAt(0)}</div>
                          <div>
                              <h3 className="font-bold text-xl text-stone-900">{employee.name}</h3>
                              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider flex flex-wrap gap-2">
                                  <span>{employee.designation} • Cat: {employee.category} • ID: {employee.id}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getEmployeeShift(employee.id) === 'Night' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'}`}>
                                      {getEmployeeShift(employee.id) === 'Night' ? '🌙 NIGHT' : '☀️ DAY'}
                                  </span>
                              </p>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="bg-stone-50 p-2.5 rounded border border-stone-100 text-center">
                              <p className="text-[9px] uppercase font-bold text-stone-400">Total</p>
                              <p className="text-lg font-bold text-stone-800">{summary.totalDays}</p>
                          </div>
                          <div className="bg-green-50 p-2.5 rounded border border-green-100 text-center">
                              <p className="text-[9px] uppercase font-bold text-green-600">Present</p>
                              <p className="text-lg font-bold text-green-700">{summary.present}</p>
                          </div>
                          <div className="bg-red-50 p-2.5 rounded border border-red-100 text-center">
                              <p className="text-[9px] uppercase font-bold text-red-400">Absent</p>
                              <p className="text-lg font-bold text-red-600">{summary.absent}</p>
                          </div>
                          <div className="bg-blue-50 p-2.5 rounded border border-blue-100 text-center">
                              <p className="text-[9px] uppercase font-bold text-blue-600">Working</p>
                              <p className="text-lg font-bold text-blue-700">{summary.workingDays}</p>
                          </div>
                          <div className="bg-amber-50 p-2.5 rounded border border-amber-100 text-center">
                              <p className="text-[9px] uppercase font-bold text-amber-600">Attn. %</p>
                              <p className="text-lg font-bold text-amber-700">{summary.workingDays > 0 ? ((summary.present / summary.workingDays) * 100).toFixed(1) : '0'}%</p>
                          </div>
                      </div>
                  </div>

                  <div className="overflow-x-auto bg-white border border-stone-100 rounded">
                    <table className="min-w-full text-xs text-left text-stone-700">
                       <thead className="text-[10px] bg-stone-50 text-stone-500 uppercase font-bold border-b border-stone-200">
                          <tr>
                             <th className="px-3 py-3 w-28">Date</th>
                             <th className="px-3 py-3 w-32">In Time</th>
                             <th className="px-3 py-3 w-32">Out Time</th>
                             <th className="px-3 py-3">Location</th>
                             <th className="px-3 py-3 w-28">Status</th>
                             <th className="px-3 py-3">Remarks</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-stone-100">
                            {days.map(d => {
                                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                const record = localAttendance.find(a => a.dateISO === dateISO);
                                const isFuture = dateISO > getTodayShiftDate(getEmployeeShift(selectedEmpId));
                                const status = getStatusDisplay(record, isFuture);

                                return (
                                    <tr key={d} className="hover:bg-stone-50 transition-colors">
                                        <td className="px-3 py-3 font-medium text-stone-900">{dateISO}</td>
                                        <td className="px-3 py-3 font-semibold text-stone-700">
                                            {viewMode === 'admin' ? (
                                                <input 
                                                    type="time"
                                                    key={`${selectedEmpId}_${dateISO}_in_${record?.manualInTime || record?.sysInTime}_${record?.status}`}
                                                    defaultValue={record ? ensureTime24h(record.manualInTime || record.sysInTime || '') : ''}
                                                    onBlur={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'in', e.target.value)}
                                                    className="w-24 text-[10px] border border-stone-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-400"
                                                />
                                            ) : (
                                                record ? (record.manualInTime || record.sysInTime || record.manualOutTime || record.sysOutTime ? (record.manualInTime || record.sysInTime || '-') : '-') : '-'
                                            )}
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-stone-700">
                                            {viewMode === 'admin' ? (
                                                <input 
                                                    type="time"
                                                    key={`${selectedEmpId}_${dateISO}_out_${record?.manualOutTime || record?.sysOutTime}_${record?.status}`}
                                                    defaultValue={record ? ensureTime24h(record.manualOutTime || record.sysOutTime || '') : ''}
                                                    onBlur={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'out', e.target.value)}
                                                    className="w-24 text-[10px] border border-stone-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-400"
                                                />
                                            ) : (
                                                record ? (record.manualOutTime || record.sysOutTime || '-') : '-'
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {viewMode === 'admin' ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        value={record?.locationId || ''}
                                                        onChange={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'location', e.target.value)}
                                                        className="text-[10px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-stone-400 bg-white text-stone-700 w-36"
                                                    >
                                                        <option value="">- Location -</option>
                                                        {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                                                    </select>
                                                </div>
                                            ) : (
                                                <span className="font-medium text-stone-800">
                                                    {record ? (locations.find(l => l.id === record.locationId)?.name || record.locationId || (record.live_location ? 'Live Location' : '-')) : '-'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {viewMode === 'admin' ? (
                                                <select
                                                    value={status.value || 'Absent'}
                                                    onChange={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'status', e.target.value)}
                                                    className={`text-[10px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-stone-400 ${status.color} ${status.bg}`}
                                                >
                                                    {STATUS_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.value}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className={`font-bold ${status.color}`}>
                                                    {status.label === '-' ? '-' : (status.value === 'Manual' || status.value === 'Present' ? 'Present' : (status.value || 'Absent'))}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            {viewMode === 'admin' ? (
                                                <input 
                                                    type="text"
                                                    placeholder="মন্তব্য..."
                                                    defaultValue={record?.late_remark || ''}
                                                    onBlur={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'remarks', e.target.value)}
                                                    className="w-36 text-xs border border-stone-200 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-amber-400 font-medium text-stone-800"
                                                />
                                            ) : (
                                                <span className="italic text-stone-600 font-medium text-[11px]">
                                                    {record?.late_remark || <span className="text-stone-300">-</span>}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                       </tbody>
                    </table>
                  </div>
              </div>
          )}
        </section>
    );
}
