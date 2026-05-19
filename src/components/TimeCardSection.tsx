import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText, Loader2, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Props {
    employees: any[];
    attendance: any[];
    onRefresh?: () => void;
    viewMode?: 'admin' | 'user';
}

export default function TimeCardSection({ employees, attendance, onRefresh, viewMode }: Props) {
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [updating, setUpdating] = useState<string | null>(null);

    const employee = employees.find(e => e.id === selectedEmpId);
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

    const empAttendance = attendance.filter(a => {
        if (String(a.no).trim() !== String(selectedEmpId).trim()) return false;
        const [y, m] = a.dateISO.split('-').map(Number);
        return y === year && m === month;
    });

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

    const getStatusDisplay = (record: any, isFuture: boolean) => {
        if (!record) return isFuture ? { label: '-', color: 'text-stone-300', bg: '' } : { label: 'A', color: 'text-red-400', value: 'Absent', bg: 'bg-red-50' };
        const opt = STATUS_OPTIONS.find(o => o.value === record.status);
        return opt ? { label: opt.label, color: opt.color, value: record.status, bg: opt.bg } : { label: 'P', color: 'text-green-600', value: record.status, bg: 'bg-green-50' };
    };

    // Summary calculation
    const summary = {
        totalDays: days.length,
        present: 0,
        absent: 0,
        cl: 0,
        sl: 0,
        holiday: 0,
        festival: 0,
        offDay: 0,
        workingDays: 0 // Present + CL + SL
    };

    days.forEach(d => {
        const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const record = empAttendance.find(a => a.dateISO === dateISO);
        const isFuture = dateISO > new Date().toISOString().split('T')[0];
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

    const handleAttendanceUpdate = async (empId: string, dateISO: string, field: string, newValue: string) => {
        setUpdating(`${empId}_${dateISO}_${field}`);
        
        try {
            const { data: existing } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', empId)
                .eq('date_iso', dateISO)
                .maybeSingle();

            const updatePayload: any = {
                ...(existing || {}),
                employee_id: empId,
                date_iso: dateISO,
            };

            if (field === 'status') updatePayload.status = newValue;
            if (field === 'in') updatePayload.manual_in_time = newValue;
            if (field === 'out') updatePayload.manual_out_time = newValue;

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
        
        // Prepare main data
        const data = days.map(d => {
            const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = empAttendance.find(a => a.dateISO === dateISO);
            const isFuture = dateISO > new Date().toISOString().split('T')[0];
            const status = getStatusDisplay(record, isFuture);
            const base = {
                'Date': dateISO,
                'In Time': record ? (record.manualInTime || record.sysInTime) : '-',
                'Out Time': record ? (record.manualOutTime || record.sysOutTime) : '-',
                'Status': status.label === 'A' ? 'Absent' : (status.label === '-' ? '-' : (status.value === 'Manual' ? 'Present' : (status.value || 'Present')))
            };
            if (viewMode === 'admin') {
                (base as any)['Live Location'] = record?.live_location || '-';
            }
            return base;
        });

        // Add summary row at bottom
        const summaryData = [
            {}, // empty row
            { 'Date': 'SUMMARY REPORT' },
            { 'Date': `Total Days ${year === currentYear && month === currentMonth ? '(Till Date)' : ''}`, 'In Time': summary.totalDays },
            { 'Date': 'Working Days (P+CL+SL)', 'In Time': summary.workingDays },
            { 'Date': 'Present', 'In Time': summary.present },
            { 'Date': 'Absent', 'In Time': summary.absent },
            { 'Date': 'CL', 'In Time': summary.cl },
            { 'Date': 'SL', 'In Time': summary.sl },
            { 'Date': 'Holiday', 'In Time': summary.holiday },
            { 'Date': 'Festival', 'In Time': summary.festival },
            { 'Date': 'Off Day', 'In Time': summary.offDay },
            { 'Date': 'Attendance %', 'In Time': (summary.workingDays > 0 ? ((summary.present / (summary.workingDays)) * 100).toFixed(1) : '0') + '%' }
        ];

        const worksheet = XLSX.utils.json_to_sheet([...data, ...summaryData as any]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Card');
        XLSX.writeFile(workbook, `TimeCard_${employee.id}_${month}_${year}.xlsx`);
    };

    const exportToPDF = () => {
        if (!employee) return;
        const doc = new jsPDF();
        
        // Header
        doc.setFontSize(16);
        doc.setTextColor(41, 41, 41);
        doc.text(`TIME CARD REPORT`, 14, 15);
        
        doc.setFontSize(10);
        doc.text(`Employee: ${employee.name} (${employee.id})`, 14, 25);
        doc.text(`Period: ${month}/${year}`, 14, 30);
        doc.text(`Designation: ${employee.designation}`, 14, 35);
        doc.text(`Category: ${employee.category}`, 14, 40);

        // Summary Table
        doc.setFontSize(12);
        doc.text("Attendance Summary", 14, 52);
        const attnPercent = summary.workingDays > 0 ? ((summary.present / (summary.workingDays)) * 100).toFixed(1) : '0';
        autoTable(doc, {
            startY: 55,
            head: [[`Total Days ${year === currentYear && month === currentMonth ? '(Till Date)' : ''}`, 'Working Days', 'Present', 'Absent', 'CL', 'SL', 'Holiday', 'Festival', 'OffDay', 'Attn %']],
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
            styles: { fontSize: 8 }
        });
        
        // Attendance Details Table
        const head = [['Date', 'In Time', 'Out Time', 'Status', ...(viewMode === 'admin' ? ['Live Loc'] : [])]];
        const body = days.map(d => {
            const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = empAttendance.find(a => a.dateISO === dateISO);
            const isFuture = dateISO > new Date().toISOString().split('T')[0];
            const status = getStatusDisplay(record, isFuture);
            return [
                dateISO,
                record ? (record.manualInTime || record.sysInTime) : '-',
                record ? (record.manualOutTime || record.sysOutTime) : '-',
                status.label === 'A' ? 'Absent' : (status.label === '-' ? '-' : (status.value === 'Manual' ? 'Present' : (status.value || 'Present'))),
                ...(viewMode === 'admin' ? [record?.live_location || '-'] : [])
            ];
        });

        autoTable(doc, {
            head: head,
            body: body,
            startY: (doc as any).lastAutoTable.finalY + 15,
            headStyles: { fillColor: [41, 41, 41] },
            styles: { fontSize: 9 }
        });

        doc.save(`TimeCard_${employee.id}_${month}_${year}.pdf`);
    };

    return (
        <section className="bg-white p-4 md:p-8 rounded-lg shadow-sm border border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Time Card & Analysis</h2>
            {employee && (
                <div className="flex gap-2">
                    <button 
                      onClick={exportToExcel}
                      className="flex items-center gap-2 bg-green-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-green-800 transition-colors"
                    >
                        <FileSpreadsheet size={14} />
                        Excel Report
                    </button>
                    <button 
                      onClick={exportToPDF}
                      className="flex items-center gap-2 bg-red-700 text-white px-3 py-2 rounded text-[10px] font-bold uppercase tracking-wider hover:bg-red-800 transition-colors"
                    >
                        <FileText size={14} />
                        PDF Report
                    </button>
                </div>
            )}
          </div>
          
          <div className="flex flex-wrap gap-4 mb-8 bg-stone-50 p-4 rounded-md border border-stone-100">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Select Employee</label>
                <select value={selectedEmpId || ''} onChange={e => setSelectedEmpId(e.target.value)} className="border border-stone-200 rounded p-2 text-xs w-64 focus:ring-1 focus:ring-stone-400 outline-none">
                    <option value="">Choose an employee...</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
                </select>
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
              <div className="mt-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-stone-100 pb-8">
                      <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-stone-800 text-white rounded-full flex items-center justify-center font-bold text-xl ring-4 ring-stone-50 shadow-sm">{employee.name.charAt(0)}</div>
                          <div>
                              <h3 className="font-bold text-xl text-stone-900">{employee.name}</h3>
                              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">{employee.designation} • Category: {employee.category} • ID: {employee.id}</p>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="bg-stone-50 p-3 rounded border border-stone-100 text-center">
                              <p className="text-[10px] uppercase font-bold text-stone-400">
                                  Total Days {year === currentYear && month === currentMonth ? '(Till Date)' : ''}
                              </p>
                              <p className="text-lg font-bold text-stone-800">{summary.totalDays}</p>
                          </div>
                          <div className="bg-green-50 p-3 rounded border border-green-100 text-center">
                              <p className="text-[10px] uppercase font-bold text-green-600">Present</p>
                              <p className="text-lg font-bold text-green-700">{summary.present}</p>
                          </div>
                          <div className="bg-red-50 p-3 rounded border border-red-100 text-center">
                              <p className="text-[10px] uppercase font-bold text-red-400">Absent</p>
                              <p className="text-lg font-bold text-red-600">{summary.absent}</p>
                          </div>
                          <div className="bg-blue-50 p-3 rounded border border-blue-100 text-center">
                              <p className="text-[10px] uppercase font-bold text-blue-600">Working Days</p>
                              <p className="text-lg font-bold text-blue-700" title="Present + CL + SL">{summary.workingDays}</p>
                          </div>
                          <div className="bg-amber-50 p-3 rounded border border-amber-100 text-center">
                              <p className="text-[10px] uppercase font-bold text-amber-600">Attn. %</p>
                              <p className="text-lg font-bold text-amber-700">
                                  {summary.workingDays > 0 ? ((summary.present / summary.workingDays) * 100).toFixed(1) : '0'}%
                              </p>
                          </div>
                      </div>
                  </div>

                  {/* Detailed Analysis Badges */}
                  <div className="flex flex-wrap gap-2 mb-8">
                      <div className="flex items-center gap-2 px-3 py-1 bg-stone-50 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 uppercase">
                          <span>CL: {summary.cl}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-stone-50 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 uppercase">
                          <span>SL: {summary.sl}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-stone-50 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 uppercase">
                          <span>Holiday: {summary.holiday}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-stone-50 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 uppercase">
                          <span>Festival: {summary.festival}</span>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-stone-50 rounded-full border border-stone-200 text-[10px] font-bold text-stone-600 uppercase">
                          <span>Off Day: {summary.offDay}</span>
                      </div>
                  </div>

                  <div className="overflow-x-auto bg-white border border-stone-100 rounded shadow-sm">
                    <table className="min-w-full text-xs text-left text-stone-700">
                       <thead className="text-[10px] bg-stone-50 text-stone-500 uppercase font-bold border-b border-stone-200">
                          <tr>
                             <th className="px-3 py-3">Date</th>
                             <th className="px-3 py-3">In Time</th>
                             <th className="px-3 py-3">Out Time</th>
                             {viewMode === 'admin' && <th className="px-3 py-3">Live Loc</th>}
                             <th className="px-3 py-3">Status</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-stone-100">
                                  {days.map(d => {
                                      const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                      const record = empAttendance.find(a => a.dateISO === dateISO);
                                      const isFuture = dateISO > new Date().toISOString().split('T')[0];
                                      const status = getStatusDisplay(record, isFuture);

                                      return (
                                          <tr key={d} className="hover:bg-stone-50 transition-colors">
                                              <td className="px-3 py-3 font-medium">{dateISO}</td>
                                              <td className="px-3 py-3">
                                                  {viewMode === 'admin' ? (
                                                      <input 
                                                          type="time"
                                                          defaultValue={record ? (record.manualInTime || record.sysInTime || '') : ''}
                                                          onChange={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'in', e.target.value)}
                                                          className="w-24 text-[10px] border border-stone-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-400"
                                                      />
                                                  ) : (
                                                      record ? (record.manualInTime || record.sysInTime || '-') : '-'
                                                  )}
                                              </td>
                                              <td className="px-3 py-3">
                                                  {viewMode === 'admin' ? (
                                                      <input 
                                                          type="time"
                                                          defaultValue={record ? (record.manualOutTime || record.sysOutTime || '') : ''}
                                                          onChange={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'out', e.target.value)}
                                                          className="w-24 text-[10px] border border-stone-200 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-amber-400"
                                                      />
                                                  ) : (
                                                      record ? (record.manualOutTime || record.sysOutTime || '-') : '-'
                                                  )}
                                              </td>
                                              {viewMode === 'admin' && (
                                                  <td className="px-3 py-3 text-center">
                                                      {record?.live_location ? (() => {
                                                          try {
                                                              const loc = JSON.parse(record.live_location);
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
                                                      <div className="flex items-center gap-2">
                                                          <select
                                                              value={status.value || 'Absent'}
                                                              onChange={(e) => handleAttendanceUpdate(selectedEmpId, dateISO, 'status', e.target.value)}
                                                              disabled={updating?.startsWith(`${selectedEmpId}_${dateISO}`)}
                                                              className={`text-[10px] font-bold border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-stone-400 ${status.color} ${status.bg}`}
                                                          >
                                                              {STATUS_OPTIONS.filter(o => o.value !== 'Manual' || status.value === 'Manual').map(opt => (
                                                                  <option key={opt.value} value={opt.value}>{opt.value}</option>
                                                              ))}
                                                              {!STATUS_OPTIONS.find(o => o.value === status.value) && status.value && (
                                                                  <option value={status.value}>{status.value}</option>
                                                              )}
                                                          </select>
                                                          {updating?.startsWith(`${selectedEmpId}_${dateISO}`) && <Loader2 size={12} className="animate-spin text-stone-400" />}
                                                      </div>
                                                  ) : (
                                                      <span className={`font-bold ${status.color}`}>
                                                          {status.label === 'A' ? 'Absent' : (status.label === '-' ? '-' : (status.value === 'Manual' ? 'Present' : (status.value || 'Present')))}
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
