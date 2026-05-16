import React, { useState } from 'react';

interface Props {
    employees: any[];
    attendance: any[];
}

export default function ComparisonSection({ employees, attendance }: Props) {
    const [compareDate1, setCompareDate1] = useState(new Date().toISOString().split('T')[0]);
    const [compareDate2, setCompareDate2] = useState(new Date(Date.now() - 86400000).toISOString().split('T')[0]);

    return (
        <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800 mb-8">Attendance Comparison</h2>
          <div className="flex gap-4 mb-6 bg-stone-50 p-4 rounded-md">
            <input type="date" value={compareDate1} onChange={e => setCompareDate1(e.target.value)} className="border border-stone-200 rounded p-2 text-xs" />
            <input type="date" value={compareDate2} onChange={e => setCompareDate2(e.target.value)} className="border border-stone-200 rounded p-2 text-xs" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-stone-700">
               <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
                  <tr>
                     <th className="px-3 py-3">ID</th>
                     <th className="px-3 py-3">Name</th>
                     <th className="px-3 py-3" colSpan={2}>{compareDate1 || 'Date 1'} (In / Out)</th>
                     <th className="px-3 py-3" colSpan={2}>{compareDate2 || 'Date 2'} (In / Out)</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-stone-100">
                  {employees.map(emp => {
                      const rec1 = attendance.find((a: any) => a.no === emp.id && a.dateISO === compareDate1);
                      const rec2 = attendance.find((a: any) => a.no === emp.id && a.dateISO === compareDate2);
                      
                      const formatTime = (time: string) => time || '--:--';

                      return (
                          <tr key={emp.id} className="hover:bg-stone-50 transition-colors">
                              <td className="px-3 py-3 font-medium text-stone-900">{emp.id}</td>
                              <td className="px-3 py-3">{emp.name}</td>
                              <td className="px-3 py-3 font-mono">{formatTime(rec1?.manualInTime || rec1?.sysInTime)}</td>
                              <td className="px-3 py-3 font-mono">{formatTime(rec1?.manualOutTime || rec1?.sysOutTime)}</td>
                              <td className="px-3 py-3 font-mono">{formatTime(rec2?.manualInTime || rec2?.sysInTime)}</td>
                              <td className="px-3 py-3 font-mono">{formatTime(rec2?.manualOutTime || rec2?.sysOutTime)}</td>
                          </tr>
                      )
                  })}
               </tbody>
            </table>
          </div>
        </section>
    );
}
