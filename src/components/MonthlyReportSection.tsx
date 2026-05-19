import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Props {
    employees: any[];
    attendance: any[];
    onRefresh: () => void;
    viewMode: 'admin' | 'user';
}

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

export default function MonthlyReportSection({ employees, attendance, onRefresh, viewMode }: Props) {
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());
    const [updating, setUpdating] = useState<string | null>(null);

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const todayISO = new Date().toISOString().split('T')[0];

    const getStatusInfo = (status: string) => {
        return STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[1]; // default to Absent if not found but record exists? No, typically if record exists it has a status.
    };

    const handleStatusChange = async (empId: string, dateISO: string, newStatus: string) => {
        setUpdating(`${empId}_${dateISO}`);
        
        try {
            // First find if there's an existing record to preserve other fields
            const { data: existing } = await supabase
                .from('attendance')
                .select('*')
                .eq('employee_id', empId)
                .eq('date_iso', dateISO)
                .maybeSingle();

            const { error } = await supabase.from('attendance').upsert([{
                ...(existing || {}),
                employee_id: empId,
                date_iso: dateISO,
                status: newStatus,
            }], { onConflict: 'employee_id,date_iso' });

            if (error) {
                alert('Update failed: ' + error.message);
            } else {
                onRefresh();
            }
        } catch (err: any) {
            alert('Error: ' + err.message);
        } finally {
            setUpdating(null);
        }
    };

    const exportToExcel = () => {
        const data = employees.map(emp => {
            const row: any = {
                'Employee ID': emp.id,
                'Name': emp.name,
                'Designation': emp.designation,
                'Category': emp.category
            };
            days.forEach(d => {
                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const record = attendance.find(a => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dateISO);
                const isFuture = dateISO > todayISO;
                
                let label = '';
                if (record) {
                    const opt = STATUS_OPTIONS.find(o => o.value === record.status);
                    label = opt ? opt.label : 'P';
                } else {
                    label = isFuture ? '-' : 'A';
                }
                row[`Day ${d}`] = label;
                
                if (label !== '-') {
                    row[label] = (row[label] || 0) + 1;
                }
            });
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');
        XLSX.writeFile(workbook, `Monthly_Report_${month}_${year}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF('l', 'mm', 'a4');
        doc.text(`Monthly Attendance Report - ${month}/${year}`, 14, 15);
        
        const uniqueLabels = Array.from(new Set(STATUS_OPTIONS.map(o => o.label)));
        const head = [['ID', 'Name', ...days.map(String), ...uniqueLabels]];
        const body = employees.map(emp => {
            const counts: Record<string, number> = {};
            uniqueLabels.forEach(l => counts[l] = 0);
            counts['A'] = 0;

            const row = [emp.id, emp.name];
            days.forEach(d => {
                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const record = attendance.find(a => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dateISO);
                const isFuture = dateISO > todayISO;
                
                let label = '';
                if (record) {
                    const opt = STATUS_OPTIONS.find(o => o.value === record.status);
                    label = opt ? opt.label : 'P';
                } else {
                    label = isFuture ? '-' : 'A';
                }
                row.push(label);
                if (label !== '-') counts[label] = (counts[label] || 0) + 1;
            });
            uniqueLabels.forEach(l => row.push(String(counts[l] || 0)));
            return row;
        });

        autoTable(doc, {
            head: head,
            body: body,
            startY: 20,
            styles: { fontSize: 6, cellPadding: 1 },
            headStyles: { fillColor: [41, 41, 41] }
        });

        doc.save(`Monthly_Report_${month}_${year}.pdf`);
    };

    return (
        <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Monthly Attendance Report</h2>
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
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Month</label>
                <input type="number" value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20" placeholder="Month" />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Year</label>
                <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24" placeholder="Year" />
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-stone-700">
               <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                  <tr>
                     <th className="px-3 py-3 sticky left-0 bg-white z-10 border-r border-stone-50">ID</th>
                     <th className="px-3 py-3 sticky left-12 bg-white z-10 border-r border-stone-50">Name</th>
                     {days.map(d => <th key={d} className="px-1 py-3 text-center min-w-[32px]">{d}</th>)}
                     {STATUS_OPTIONS.filter((s, i, self) => i === self.findIndex(t => t.label === s.label)).map(s => (
                         <th key={s.label} className="px-2 py-3 text-center border-l border-stone-50 bg-stone-50/50">{s.label}</th>
                     ))}
                  </tr>
               </thead>
               <tbody className="divide-y divide-stone-100">
                  {employees.map(emp => {
                      const counts: Record<string, number> = {};
                      STATUS_OPTIONS.forEach(s => counts[s.label] = 0);
                      counts['A'] = 0; // Ensure A is there even if not in options label

                      return (
                        <tr key={emp.id} className="hover:bg-stone-50 transition-colors">
                            <td className="px-3 py-3 font-medium text-stone-900 sticky left-0 bg-white border-r border-stone-50">{emp.id}</td>
                            <td className="px-3 py-3 whitespace-nowrap sticky left-12 bg-white border-r border-stone-50">{emp.name}</td>
                            {days.map(d => {
                                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                const record = attendance.find(a => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dateISO);
                                const isFuture = dateISO > todayISO;
                                let currentStatus = record ? record.status : (isFuture ? '-' : 'Absent');
                                
                                if (currentStatus === 'Manual') currentStatus = 'Present';
                                
                                const opt = STATUS_OPTIONS.find(o => o.value === currentStatus);
                                const label = opt ? opt.label : (isFuture ? '-' : 'A');
                                
                                if (label !== '-') {
                                    counts[label] = (counts[label] || 0) + 1;
                                }
                                
                                const displayOpt = opt || { label: isFuture ? '-' : 'A', color: 'text-stone-300', value: currentStatus };
                                const isThisCellUpdating = updating === `${emp.id}_${dateISO}`;

                                return (
                                    <td key={d} className={`px-0 py-1 text-center group relative ${isThisCellUpdating ? 'opacity-50' : ''}`}>
                                        <select 
                                          value={currentStatus || 'Absent'} 
                                          onChange={(e) => handleStatusChange(emp.id, dateISO, e.target.value)}
                                          disabled={isFuture || isThisCellUpdating || viewMode !== 'admin'}
                                          className={`w-full h-full appearance-none bg-transparent text-center font-bold py-2 outline-none rounded ${displayOpt.color} ${viewMode === 'admin' ? 'cursor-pointer hover:bg-stone-100' : 'cursor-default'} focus:ring-1 focus:ring-stone-300`}
                                          title={viewMode !== 'admin' ? 'Only Admins can edit attendance' : ''}
                                        >
                                            {!record && isFuture && <option value="-">-</option>}
                                            {/* Unique display options for selection */}
                                            {STATUS_OPTIONS.filter((s, i, self) => i === self.findIndex(t => t.label === s.label)).map(s => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                    </td>
                                );
                            })}
                            {STATUS_OPTIONS.filter((s, i, self) => i === self.findIndex(t => t.label === s.label)).map(s => (
                                <td key={s.label} className={`px-2 py-3 text-center font-bold border-l border-stone-50 bg-stone-50/30 ${s.color}`}>
                                    {counts[s.label] || 0}
                                </td>
                            ))}
                        </tr>
                      );
                  })}
               </tbody>
            </table>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 pt-4 border-t border-stone-100">
              {STATUS_OPTIONS.filter((s, i, self) => i === self.findIndex(t => t.label === s.label)).map(s => (
                  <div key={s.value} className="flex items-center gap-2 text-[10px] uppercase font-bold text-stone-500">
                      <span className={`w-8 h-6 flex items-center justify-center rounded border border-stone-100 ${s.bg} ${s.color}`}>{s.label}</span>
                      <span>{s.value === 'Manual' || s.value === 'Present' ? 'Present' : s.value}</span>
                  </div>
              ))}
          </div>
        </section>
    );
}

