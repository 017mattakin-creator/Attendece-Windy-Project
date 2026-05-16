import React, { useState } from 'react';

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

    return (
        <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800 mb-8">Monthly Attendance Report</h2>
          <div className="flex gap-4 mb-6 bg-stone-50 p-4 rounded-md">
            <input type="number" value={month} onChange={e => setMonth(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20" placeholder="Month" />
            <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24" placeholder="Year" />
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
