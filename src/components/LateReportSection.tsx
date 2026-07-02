import React, { useState, useEffect } from 'react';
import { Search, Clock, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getEmployeeShift, normalizeToYYYYMMDD, getShiftRelativeMinutes } from '../lib/dateUtils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  employees: any[];
  locations: any[];
}

export default function LateReportSection({ employees, locations }: Props) {
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

  useEffect(() => {
    fetchLateRecords();
  }, [month, year]);

  const fetchLateRecords = async () => {
    setIsLoading(true);
    try {
      const monthStr = String(month).padStart(2, '0');
      const yearStr = String(year);
      
      // Fetch a substantial set of recent records to ensure current and selected month data is captured.
      // Filtering is then handled in JS to maintain reliability across various date formats.
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15000); 
      
      if (error) {
        console.error('Supabase error fetching late records:', error);
        throw error;
      }
      
      if (data) {
        // Process records - normalize dates and handle potential duplicates
        const mapped = data.map((a: any) => ({
          ...a,
          dateISO: normalizeToYYYYMMDD(a.date_iso || '')
        }));

        // Merge logic to ensure only the best record per day is used
        const mergedMap: Record<string, any> = {};
        mapped.forEach(row => {
          const key = `${row.employee_id}_${row.dateISO}`;
          if (!mergedMap[key]) {
            mergedMap[key] = row;
          } else {
            const existing = mergedMap[key];
            const hasPunches = (r: any) => !!(String(r.sys_in_time || '').trim() || String(r.sys_out_time || '').trim() || String(r.manual_in_time || '').trim() || String(r.manual_out_time || '').trim());
            
            if (!hasPunches(existing) && hasPunches(row)) {
              mergedMap[key] = row;
            }
          }
        });

        // Filter strictly for selected month/year
        const finalRecords = Object.values(mergedMap).filter((a: any) => {
          if (!a.dateISO) return false;
          const [y, m] = a.dateISO.split('-').map(Number);
          return y === year && m === month;
        });

        setAttendanceRecords(finalRecords);
      }
    } catch (err) {
      console.error('Error fetching late records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getLateInfo = (record: any) => {
    const inTime = record.manual_in_time || record.sys_in_time;
    if (!inTime) return { isLate: false, minutes: 0 };

    const shift = getEmployeeShift(record.employee_id);
    const minutes = getShiftRelativeMinutes(inTime, shift, record.location_id, record.employee_id);
    
    // We consider it late if it's > 0 minutes past shift start
    // Usually there might be a 15 min grace period, but we'll show any positive delay
    return {
      isLate: minutes > 0 && minutes < 600, // 600 mins is 10 hours, to avoid night shift overlap confusion
      minutes: minutes > 0 ? minutes : 0
    };
  };

  const lateData = employees.map(emp => {
    const empRecords = attendanceRecords.filter(a => String(a.employee_id).trim() === String(emp.id).trim());
    const lateOccurrences = empRecords
      .map(r => ({ ...r, late: getLateInfo(r) }))
      .filter(r => r.late.isLate);

    const totalMinutes = lateOccurrences.reduce((sum, r) => sum + r.late.minutes, 0);

    return {
      emp,
      lateOccurrences,
      totalLateDays: lateOccurrences.length,
      totalLateMinutes: totalMinutes
    };
  }).filter(item => 
    item.totalLateDays > 0 && 
    (String(item.emp.id).toLowerCase().includes(searchTerm.toLowerCase()) || 
     item.emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToExcel = () => {
    const rows: any[] = [];
    lateData.forEach(item => {
      item.lateOccurrences.forEach(occ => {
        rows.push({
          'Employee ID': item.emp.id,
          'Employee Name': item.emp.name,
          'Date': normalizeToYYYYMMDD(occ.date_iso),
          'In Time': occ.manual_in_time || occ.sys_in_time || '-',
          'Late (Minutes)': occ.late.minutes,
          'Status': occ.status,
          'Location': locations.find(l => l.id === occ.location_id)?.name || occ.location_id || '-'
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Late Report");
    XLSX.writeFile(wb, `Late_Report_${month}_${year}.xlsx`);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Late Attendance Report - ${month}/${year}`, 14, 20);
    
    const body: any[] = [];
    lateData.forEach(item => {
      item.lateOccurrences.forEach(occ => {
        body.push([
          item.emp.id,
          item.emp.name,
          normalizeToYYYYMMDD(occ.date_iso),
          occ.manual_in_time || occ.sys_in_time || '-',
          `${occ.late.minutes} min`,
          locations.find(l => l.id === occ.location_id)?.name || occ.location_id || '-'
        ]);
      });
    });

    autoTable(doc, {
      head: [['ID', 'Name', 'Date', 'In Time', 'Delay', 'Location']],
      body: body,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] }
    });

    doc.save(`Late_Report_${month}_${year}.pdf`);
  };

  return (
    <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Clock className="text-amber-500" /> Late Report
          </h2>
          <p className="text-stone-500 text-sm mt-1">Summary and detailed analysis of late arrivals</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-md text-xs font-bold hover:bg-green-700 transition-colors shadow-sm">
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button onClick={exportToPDF} className="flex items-center gap-2 bg-stone-800 text-white px-4 py-2 rounded-md text-xs font-bold hover:bg-stone-900 transition-colors shadow-sm">
            <FileText size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-8 bg-stone-50 p-4 rounded-md border border-stone-100">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Month</label>
          <input type="number" value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-20 outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Year</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="border border-stone-200 rounded p-2 text-xs w-24 outline-none focus:ring-1 focus:ring-stone-400" />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase font-bold text-stone-500">Search Employee (ID or Name)</label>
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
          <p className="text-sm font-medium">Calculating late statistics...</p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Summary Section */}
          <div>
            <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4 border-l-4 border-amber-400 pl-3">Late Summary (Monthly)</h3>
            <div className="overflow-x-auto border border-stone-100 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-800 text-white">
                  <tr>
                    <th className="px-4 py-3 font-bold">ID</th>
                    <th className="px-4 py-3 font-bold">Name</th>
                    <th className="px-4 py-3 font-bold text-center">Total Late Days</th>
                    <th className="px-4 py-3 font-bold text-center">Total Late Minutes</th>
                    <th className="px-4 py-3 font-bold">Average Delay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {lateData.map(item => (
                    <tr key={item.emp.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-stone-600">{item.emp.id}</td>
                      <td className="px-4 py-3 font-bold text-stone-800">{item.emp.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-red-50 text-red-600 px-2 py-1 rounded font-bold">{item.totalLateDays}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-bold">{item.totalLateMinutes} min</span>
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {Math.round(item.totalLateMinutes / item.totalLateDays)} min / day
                      </td>
                    </tr>
                  ))}
                  {lateData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-stone-400 italic">No late records found for the selected criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Section */}
          <div>
            <h3 className="text-sm font-bold text-stone-700 uppercase tracking-wider mb-4 border-l-4 border-stone-800 pl-3">Individual Late Details</h3>
            <div className="overflow-x-auto border border-stone-100 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-100 text-stone-600 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 font-bold">Date</th>
                    <th className="px-4 py-3 font-bold">Staff ID</th>
                    <th className="px-4 py-3 font-bold">Staff Name</th>
                    <th className="px-4 py-3 font-bold">In Time</th>
                    <th className="px-4 py-3 font-bold">Delay</th>
                    <th className="px-4 py-3 font-bold">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {lateData.flatMap(item => 
                    item.lateOccurrences.map((occ, idx) => (
                      <tr key={`${item.emp.id}-${idx}`} className="hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-stone-900">{normalizeToYYYYMMDD(occ.date_iso)}</td>
                        <td className="px-4 py-3 font-mono text-stone-500">{item.emp.id}</td>
                        <td className="px-4 py-3 text-stone-700">{item.emp.name}</td>
                        <td className="px-4 py-3 font-bold text-stone-800">{occ.manual_in_time || occ.sys_in_time}</td>
                        <td className="px-4 py-3">
                          <span className="text-red-500 font-bold">+{occ.late.minutes} min</span>
                        </td>
                        <td className="px-4 py-3 text-stone-500 text-[10px]">
                          {locations.find(l => l.id === occ.location_id)?.name || occ.location_id || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                  {lateData.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-stone-400 italic">No detailed occurrences to display.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
