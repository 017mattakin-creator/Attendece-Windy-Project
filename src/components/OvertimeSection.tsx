import React, { useState, useEffect } from 'react';
import { Search, Timer, FileText, FileSpreadsheet, Loader2, Coffee, Moon, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { normalizeToYYYYMMDD, getEmployeeShift, isEmployeeActive } from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  employees: any[];
  locations: any[];
}

export default function OvertimeSection({ employees, locations }: Props) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [day, setDay] = useState<number | string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);

  useEffect(() => {
    fetchOvertimeRecords();
  }, [month, year]);

  const fetchOvertimeRecords = async () => {
    setIsLoading(true);
    try {
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year);
      
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15000);
      
      if (error) throw error;
      
      if (data) {
        const filtered = data.filter(a => {
          const dateISO = normalizeToYYYYMMDD(a.date_iso || '');
          if (!dateISO) return false;
          const [y, m] = dateISO.split('-').map(Number);
          return y === year && m === month;
        });
        setAttendanceRecords(filtered);
      }
    } catch (err) {
      console.error('Error fetching overtime records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getOvertimeInfo = (record: any) => {
    const outTime = record.manual_out_time || record.sys_out_time;
    if (!outTime) return { hasSnacks: false, hasDinner: false };

    const parts = outTime.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]) || 0;
    
    // Total minutes since start of day
    const totalMinutes = h * 60 + m;
    
    // Logic:
    // 09:00 PM = 21:00 = 1260 minutes
    // 04:00 AM = 04:00 (next day) = 240 minutes
    
    // If it's between 9:00 PM (1260m) and 3:59 AM (239m), it's Snacks.
    // Note: 00:00 to 03:59 are technically low minute values.
    const isSnacks = (totalMinutes >= 21 * 60) || (totalMinutes < 4 * 60);
    
    // If it's between 4:00 AM (240m) and, say, 8:00 AM (480m), it's Dinner Bill (Full Night).
    const isDinner = totalMinutes >= 4 * 60 && totalMinutes < 8 * 60;

    // Dinner overrides snacks if it reaches that threshold
    return { 
      hasSnacks: isSnacks && !isDinner, 
      hasDinner: isDinner 
    };
  };

  const overtimeData = employees.filter(isEmployeeActive).map(emp => {
    const empRecords = attendanceRecords.filter(a => String(a.employee_id).trim() === String(emp.id).trim());
    const allowances = empRecords.map(r => ({
      ...r,
      ...getOvertimeInfo(r)
    })).filter(r => r.hasSnacks || r.hasDinner)
    .sort((a, b) => {
      const dateA = normalizeToYYYYMMDD(a.date_iso);
      const dateB = normalizeToYYYYMMDD(b.date_iso);
      return dateB.localeCompare(dateA); // Sort by date descending
    });

    const snacksCount = allowances.filter(a => a.hasSnacks).length;
    const dinnerCount = allowances.filter(a => a.hasDinner).length;

    return {
      emp,
      allowances,
      snacksCount,
      dinnerCount
    };
  }).filter(item => 
    (item.snacksCount > 0 || item.dinnerCount > 0) && 
    (String(item.emp.id).toLowerCase().includes(searchTerm.toLowerCase()) || 
     item.emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToExcel = () => {
    const rows: any[] = [];
    overtimeData.forEach(item => {
      item.allowances.forEach(occ => {
        rows.push({
          'Employee ID': item.emp.id,
          'Employee Name': item.emp.name,
          'Date': normalizeToYYYYMMDD(occ.date_iso),
          'Out Time': occ.manual_out_time || occ.sys_out_time || '-',
          'Allowance Type': occ.hasDinner ? 'Dinner (Full Night)' : 'Snacks',
          'Location': locations.find(l => l.id === occ.location_id)?.name || occ.location_id || '-'
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Overtime Report");
    XLSX.writeFile(wb, `Overtime_Report_${month}_${year}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Overtime & Allowance Report - ${month}/${year}`, 14, 20);
    
    const body: any[] = [];
    overtimeData.forEach(item => {
      item.allowances.forEach(occ => {
        body.push([
          item.emp.id,
          item.emp.name,
          normalizeToYYYYMMDD(occ.date_iso),
          occ.manual_out_time || occ.sys_out_time || '-',
          occ.hasDinner ? 'Dinner (Full Night)' : 'Snacks',
          locations.find(l => l.id === occ.location_id)?.name || occ.location_id || '-'
        ]);
      });
    });

    autoTable(doc, {
      head: [['ID', 'Name', 'Date', 'Out Time', 'Allowance', 'Location']],
      body: body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] }
    });

    doc.save(`Overtime_Report_${month}_${year}.pdf`);
  };

  return (
    <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Timer className="text-indigo-600" /> Overtime & Allowance
          </h2>
          <p className="text-stone-500 text-sm mt-1">Snacks (after 9PM) and Dinner Bill (after 4AM)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md text-xs font-bold hover:bg-green-700 transition-colors">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={exportToPDF} className="flex items-center gap-2 bg-stone-800 text-white px-4 py-2 rounded-md text-xs font-bold hover:bg-stone-900 transition-colors">
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-8 bg-stone-50 p-4 rounded-md border border-stone-100">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Day (Optional)</label>
          <input 
            type="number" 
            placeholder="All"
            value={day} 
            onChange={e => setDay(e.target.value)} 
            className="border border-stone-200 rounded p-2 text-xs w-20 outline-none focus:ring-1 focus:ring-stone-400" 
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Month</label>
          <input type="number" value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20 outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Year</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24 outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase font-bold text-stone-500">Search Staff</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
            <input 
              type="text" 
              placeholder="Search ID or Name..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="w-full border border-stone-200 rounded p-2 pl-9 text-xs outline-none focus:ring-1 focus:ring-stone-400 bg-white" 
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-stone-400">
          <Loader2 className="animate-spin mb-4" size={40} />
          <p className="text-sm font-medium">Analyzing overtime patterns...</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Summary */}
          <div>
            <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4 border-l-4 border-indigo-500 pl-3">Monthly Allowance Summary</h3>
            <div className="overflow-x-auto border border-stone-100 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-800 text-white">
                  <tr>
                    <th className="px-4 py-3 font-bold">ID</th>
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold text-center">Snacks Count</th>
                    <th className="px-4 py-3 font-bold text-center">Dinner Bill Count</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {overtimeData.map(item => (
                    <tr key={item.emp.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-stone-600">{item.emp.id}</td>
                      <td className="px-4 py-3 font-bold text-stone-800">
                        <button 
                          onClick={() => setSelectedEmpId(item.emp.id)}
                          className="hover:text-indigo-600 hover:underline cursor-pointer text-left"
                        >
                          {item.emp.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Coffee size={12} className="text-amber-600" />
                          <span className="font-bold text-stone-700">{item.snacksCount}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Moon size={12} className="text-indigo-600" />
                          <span className="font-bold text-stone-700">{item.dinnerCount}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.dinnerCount > 5 ? (
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Regular Night Duty</span>
                        ) : (
                          <span className="text-[10px] bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">Occasional OT</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {overtimeData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-stone-400 italic">No overtime allowances found for this month.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details - Date-wise Summary */}
          <div>
            <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4 border-l-4 border-stone-800 pl-3">Date-Wise Detailed Summary</h3>
            <div className="overflow-x-auto border border-stone-100 rounded-lg shadow-sm">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-stone-100 text-stone-600">
                  <tr>
                    <th className="px-4 py-2 border-b border-stone-200">Date</th>
                    <th className="px-4 py-2 border-b border-stone-200">ID</th>
                    <th className="px-4 py-2 border-b border-stone-200">Employee Name</th>
                    <th className="px-4 py-2 border-b border-stone-200">Out Time</th>
                    <th className="px-4 py-2 border-b border-stone-200">Allowance Type</th>
                    <th className="px-4 py-2 border-b border-stone-200 text-right">Amount (EST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 bg-white">
                  {overtimeData.flatMap(item => 
                    item.allowances
                      .filter(occ => {
                        if (!day) return true;
                        const dateISO = normalizeToYYYYMMDD(occ.date_iso);
                        return dateISO.endsWith(`-${String(day).padStart(2, '0')}`);
                      })
                      .map((occ, idx) => (
                      <tr key={`${item.emp.id}-${idx}`} className="hover:bg-amber-50/20 transition-colors">
                        <td className="px-4 py-2 font-medium text-stone-500">
                            <div className="flex flex-col">
                                <span>{normalizeToYYYYMMDD(occ.date_iso)}</span>
                                {normalizeToYYYYMMDD(occ.date_iso) === normalizeToYYYYMMDD(new Date().toISOString()) && (
                                    <span className="text-[8px] text-green-600 font-bold uppercase">Today</span>
                                )}
                            </div>
                        </td>
                        <td className="px-4 py-2 font-mono text-stone-600">{item.emp.id}</td>
                        <td className="px-4 py-2 font-bold text-stone-800">
                          <button 
                            onClick={() => setSelectedEmpId(item.emp.id)}
                            className="hover:text-indigo-600 hover:underline cursor-pointer text-left"
                          >
                            {item.emp.name}
                          </button>
                        </td>
                        <td className="px-4 py-2 text-stone-700 font-medium">
                          <span className="bg-stone-100 px-2 py-0.5 rounded">{occ.manual_out_time || occ.sys_out_time}</span>
                        </td>
                        <td className="px-4 py-2">
                          {occ.hasDinner ? (
                            <span className="flex items-center gap-1.5 text-indigo-700 font-bold">
                              <Moon size={12} /> Dinner Bill (Full Night)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-amber-700 font-bold">
                              <Coffee size={12} /> Snacks Allowance
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-stone-700">
                          {occ.hasDinner ? '100.00' : '50.00'}
                        </td>
                      </tr>
                    ))
                  )}
                  {overtimeData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-stone-400 italic">No date-wise records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedEmpId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
              <div>
                <h3 className="text-lg font-bold text-stone-800">
                  {employees.find(e => String(e.id) === String(selectedEmpId))?.name || 'Employee Details'}
                </h3>
                <p className="text-xs text-stone-500 font-mono">Employee ID: {selectedEmpId}</p>
              </div>
              <button 
                onClick={() => setSelectedEmpId(null)}
                className="p-2 hover:bg-stone-200 rounded-full transition-colors"
              >
                <X size={20} className="text-stone-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {overtimeData.find(d => String(d.emp.id) === String(selectedEmpId))?.allowances.map((occ, idx) => (
                  <div key={idx} className="flex items-center justify-between p-4 rounded-lg border border-stone-100 bg-stone-50/50">
                    <div>
                      <p className="text-xs font-bold text-stone-400 uppercase">{normalizeToYYYYMMDD(occ.date_iso)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-bold text-stone-800">{occ.manual_out_time || occ.sys_out_time}</span>
                        <span className="text-[10px] text-stone-400 font-medium">
                          ({locations.find(l => l.id === occ.location_id)?.name || occ.location_id || 'Unknown Location'})
                        </span>
                      </div>
                    </div>
                    {occ.hasDinner ? (
                      <span className="bg-indigo-100 text-indigo-700 text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1">
                        <Moon size={12} /> DINNER BILL
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-[10px] px-3 py-1 rounded-full font-bold flex items-center gap-1">
                        <Coffee size={12} /> SNACKS
                      </span>
                    )}
                  </div>
                ))}
                {!overtimeData.find(d => String(d.emp.id) === String(selectedEmpId))?.allowances.length && (
                  <p className="text-center py-10 text-stone-400 italic">No records found for this employee.</p>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-stone-100 bg-stone-50 text-right">
              <button 
                onClick={() => setSelectedEmpId(null)}
                className="px-6 py-2 bg-stone-800 text-white text-xs font-bold rounded-lg hover:bg-stone-900 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
