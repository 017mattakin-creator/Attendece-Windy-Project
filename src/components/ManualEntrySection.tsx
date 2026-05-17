import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import EmployeeSelectorModal from './EmployeeSelectorModal';
import { UserPlus, Calendar, Clock, MapPin, Save } from 'lucide-react';

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
  viewMode: 'admin' | 'user';
}

export default function ManualEntrySection({ employees, locations, onRefresh, viewMode }: Props) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
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
        alert('Database Error: ' + error.message + '\n\nPlease ensure your Supabase table has a unique constraint on (employee_id, date_iso) for upsert to work.');
      } else {
          alert('Attendance Saved Successfully');
          // Reset form
          setSelectedEmp(null);
          setInTime('');
          setOutTime('');
          setLocation('');
          onRefresh();
      }
    } catch (err: any) {
      alert('Network Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm border border-stone-100 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-stone-50">
        <UserPlus className="w-4 h-4 text-stone-400" />
        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-700">Manual Attendance Entry</h2>
      </div>
      
        <div className="flex flex-col gap-5 relative flex-grow">
          {fetching && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest animate-pulse">Checking records...</span>
            </div>
          )}
          
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Employee
            </label>
            <button 
               onClick={() => setShowModal(true)}
               className="w-full border border-stone-200 p-2.5 text-xs text-left bg-white hover:border-stone-400 transition-colors rounded-sm"
            >
               {selectedEmp ? (
                 <span className="text-stone-900 font-medium">{selectedEmp.id} - {selectedEmp.name}</span>
               ) : (
                 <span className="text-stone-400 italic">Select Employee...</span>
               )}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date
            </label>
            <input type="date" className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> In Time
              </label>
              <input type="time" className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none" value={inTime} onChange={e => setInTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Out Time
              </label>
              <input type="time" className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none" value={outTime} onChange={e => setOutTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location
            </label>
            <select className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none bg-white" value={location} onChange={e => setLocation(e.target.value)}>
               <option value="">Select Location</option>
               {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>

          <div className="pt-4 mt-auto">
            <button 
              onClick={handleSubmit} 
              disabled={fetching || saving}
              className="w-full bg-stone-800 text-white p-3 text-xs font-bold uppercase hover:bg-stone-900 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors rounded-sm"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : fetching ? 'Please wait...' : 'Save Attendance'}
            </button>
          </div>
        </div>

      {showModal && <EmployeeSelectorModal employees={employees} onSelect={setSelectedEmp} onClose={() => setShowModal(false)} />}
    </section>
  );
}
