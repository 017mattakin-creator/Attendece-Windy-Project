import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
    employees: any[];
    attendance: any[];
}

export default function TimeCardSection({ employees, attendance }: Props) {
    const [selectedEmpId, setSelectedEmpId] = useState('');
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const employee = employees.find(e => e.id === selectedEmpId);
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const empAttendance = attendance.filter(a => String(a.no).trim() === String(selectedEmpId).trim() && 
        new Date(a.dateISO).getMonth() + 1 === month && 
        new Date(a.dateISO).getFullYear() === year);

    const exportToExcel = () => {
        if (!employee) return;
        const data = days.map(d => {
            const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = empAttendance.find(a => a.dateISO === dateISO);
            return {
                'Date': dateISO,
                'In Time': record ? (record.manualInTime || record.sysInTime) : '-',
                'Out Time': record ? (record.manualOutTime || record.sysOutTime) : '-',
                'Status': record ? 'Present' : 'Absent'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Card');
        XLSX.writeFile(workbook, `TimeCard_${employee.id}_${month}_${year}.xlsx`);
    };

    const exportToPDF = () => {
        if (!employee) return;
        const doc = new jsPDF();
        doc.text(`Time Card: ${employee.name} (${employee.id})`, 14, 15);
        doc.text(`Period: ${month}/${year}`, 14, 22);
        doc.text(`Designation: ${employee.designation}`, 14, 29);
        
        const head = [['Date', 'In Time', 'Out Time', 'Status']];
        const body = days.map(d => {
            const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const record = empAttendance.find(a => a.dateISO === dateISO);
            return [
                dateISO,
                record ? (record.manualInTime || record.sysInTime) : '-',
                record ? (record.manualOutTime || record.sysOutTime) : '-',
                record ? 'Present' : 'Absent'
            ];
        });

        autoTable(doc, {
            head: head,
            body: body,
            startY: 35,
            headStyles: { fillColor: [41, 41, 41] }
        });

        doc.save(`TimeCard_${employee.id}_${month}_${year}.pdf`);
    };

    return (
        <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">Time Card</h2>
            {employee && (
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
            )}
          </div>
          
          <div className="flex flex-wrap gap-4 mb-8 bg-stone-50 p-4 rounded-md">
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Employee</label>
                <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} className="border border-stone-200 rounded p-2 text-xs w-64">
                    <option value="">Select Employee</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.id} - {e.name}</option>)}
                </select>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Month</label>
                <input type="number" value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20" placeholder="Month" />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Year</label>
                <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24" placeholder="Year" />
            </div>
          </div>

          {employee && (
              <div className="mt-8">
                  <div className="flex items-center gap-4 mb-6">
                      <div className="w-16 h-16 bg-stone-200 rounded-full flex items-center justify-center font-bold text-xl">{employee.name.charAt(0)}</div>
                      <div>
                          <h3 className="font-bold text-lg">{employee.name}</h3>
                          <p className="text-xs text-stone-500">{employee.designation} | {employee.category}</p>
                      </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-stone-700">
                       <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                          <tr>
                             <th className="px-3 py-3">Date</th>
                             <th className="px-3 py-3">In Time</th>
                             <th className="px-3 py-3">Out Time</th>
                             <th className="px-3 py-3">Status</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-stone-100">
                          {days.map(d => {
                              const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                              const record = empAttendance.find(a => a.dateISO === dateISO);
                              return (
                                  <tr key={d} className="hover:bg-stone-50 transition-colors">
                                      <td className="px-3 py-3 font-medium">{dateISO}</td>
                                      <td className="px-3 py-3">{record ? (record.manualInTime || record.sysInTime) : '-'}</td>
                                      <td className="px-3 py-3">{record ? (record.manualOutTime || record.sysOutTime) : '-'}</td>
                                      <td className="px-3 py-3">
                                          {record ? <span className="text-green-600">Present</span> : <span className="text-red-400">Absent</span>}
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
