import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileSpreadsheet, FileText } from 'lucide-react';

interface Props {
    employees: any[];
    attendance: any[];
}

export default function MonthlyReportSection({ employees, attendance }: Props) {
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [year, setYear] = useState(new Date().getFullYear());

    const daysInMonth = new Date(year, month, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const todayISO = new Date().toISOString().split('T')[0];

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
                const record = attendance.find(a => a.no === emp.id && a.dateISO === dateISO);
                const isFuture = dateISO > todayISO;
                row[`Day ${d}`] = record ? 'P' : (isFuture ? '-' : 'A');
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
        
        const head = [['ID', 'Name', ...days.map(String)]];
        const body = employees.map(emp => {
            const row = [emp.id, emp.name];
            days.forEach(d => {
                const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const record = attendance.find(a => a.no === emp.id && a.dateISO === dateISO);
                const isFuture = dateISO > todayISO;
                row.push(record ? 'P' : (isFuture ? '-' : 'A'));
            });
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
                     <th className="px-3 py-3 sticky left-0 bg-white">ID</th>
                     <th className="px-3 py-3 sticky left-12 bg-white">Name</th>
                     {days.map(d => <th key={d} className="px-1 py-3 text-center">{d}</th>)}
                  </tr>
               </thead>
               <tbody className="divide-y divide-stone-100">
                  {employees.map(emp => (
                      <tr key={emp.id} className="hover:bg-stone-50 transition-colors">
                          <td className="px-3 py-3 font-medium text-stone-900 sticky left-0 bg-white">{emp.id}</td>
                          <td className="px-3 py-3 whitespace-nowrap sticky left-12 bg-white">{emp.name}</td>
                          {days.map(d => {
                              const dateISO = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                              const record = attendance.find(a => a.no === emp.id && a.dateISO === dateISO);
                              const isFuture = dateISO > todayISO;
                              
                              return (
                                  <td key={d} className="px-1 py-3 text-center">
                                      {record ? (
                                          <span className="text-green-600 font-bold">P</span>
                                      ) : isFuture ? (
                                          <span className="text-stone-300">-</span>
                                      ) : (
                                          <span className="text-red-400">A</span>
                                      )}
                                  </td>
                              )
                          })}
                      </tr>
                  ))}
               </tbody>
            </table>
          </div>
        </section>
    );
}
