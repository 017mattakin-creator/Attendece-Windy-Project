import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import EmployeeSelectorModal from './EmployeeSelectorModal';

interface Employee {
  id: string;
  name: string;
  designation: string;
  education: string;
  category: string;
  salary: string;
  joinDate: string;
  phoneNumber: string;
}

interface Props {
  employees: Employee[];
  locations: {id: string, name: string}[];
  onRefresh: () => void;
}

export default function ManualEntrySection({ employees, locations, onRefresh }: Props) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [date, setDate] = useState('');
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [location, setLocation] = useState('');
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    const fetchExisting = async () => {
      if (!selectedEmp || !date) return;
      setFetching(true);
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', selectedEmp.id)
          .eq('date_iso', date)
          .maybeSingle();
        
        if (!error && data) {
          const formatTime = (t: string) => {
            if (!t) return '';
            const match = t.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})/);
            if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
            return t;
          };
          setInTime(formatTime(data.manual_in_time || data.sys_in_time || ''));
          setOutTime(formatTime(data.manual_out_time || data.sys_out_time || ''));
          setLocation(data.location_id || '');
        } else if (error) {
           console.error('Fetch existing error:', error);
        } else {
          setInTime('');
          setOutTime('');
          setLocation('');
        }
      } catch (err) {
        console.error('Fetch existing catch:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchExisting();
  }, [selectedEmp, date]);

  const handleSubmit = async () => {
    if (!selectedEmp || !date) return alert('Select employee and date');
    setSaving(true);
    try {
      const { error } = await supabase.from('attendance').upsert([{
        employee_id: String(selectedEmp.id).trim(),
        date_iso: date,
        manual_in_time: inTime || null,
        manual_out_time: outTime || null,
        location_id: location || null,
        status: 'Manual'
      }], { onConflict: 'employee_id,date_iso' });

      if (error) {
        console.error('Manual Save error:', error);
        alert('Error: ' + error.message);
      } else {
          alert('Attendance Saved');
          onRefresh();
      }
    } catch (err: any) {
      alert('Network Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm max-w-lg">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6">Manual Attendance Entry</h2>
      
        <div className="flex flex-col gap-4 relative">
          {fetching && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest animate-pulse">Checking records...</span>
            </div>
          )}
          <button 
             onClick={() => setShowModal(true)}
             className="border p-2 text-xs text-left bg-white"
          >
             {selectedEmp ? `${selectedEmp.id} - ${selectedEmp.name}` : 'Select Employee'}
          </button>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-stone-500">Date</label>
            <input type="date" className="border p-2 text-xs" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-stone-500">In Time</label>
              <input type="time" className="border p-2 text-xs" value={inTime} onChange={e => setInTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase font-bold text-stone-500">Out Time</label>
              <input type="time" className="border p-2 text-xs" value={outTime} onChange={e => setOutTime(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-stone-500">Location</label>
            <select className="border p-2 text-xs" value={location} onChange={e => setLocation(e.target.value)}>
               <option value="">Select Location</option>
               {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>
          <button 
            onClick={handleSubmit} 
            disabled={fetching || saving}
            className="bg-stone-800 text-white p-2 text-xs font-bold uppercase hover:bg-stone-900 disabled:opacity-50"
          >
            {saving ? 'Saving...' : fetching ? 'Please wait...' : 'Save Attendance'}
          </button>
        </div>

      {showModal && <EmployeeSelectorModal employees={employees} onSelect={setSelectedEmp} onClose={() => setShowModal(false)} />}
    </section>
  );
}
