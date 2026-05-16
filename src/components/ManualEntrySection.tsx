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

  const handleSubmit = async () => {
    if (!selectedEmp || !date) return alert('Select employee and date');
    
    const { error } = await supabase.from('attendance').insert([{
      employee_id: selectedEmp.id,
      date_iso: date,
      manual_in_time: inTime,
      manual_out_time: outTime,
      location_id: location,
      status: 'Manual'
    }]);

    if (error) alert('Error: ' + error.message);
    else {
        alert('Attendance Added');
        setDate('');
        setInTime('');
        setOutTime('');
        setLocation('');
        setSelectedEmp(null);
        onRefresh();
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm max-w-lg">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6">Manual Attendance Entry</h2>
      
      <div className="flex flex-col gap-4">
        <button 
           onClick={() => setShowModal(true)}
           className="border p-2 text-xs text-left"
        >
           {selectedEmp ? `${selectedEmp.id} - ${selectedEmp.name}` : 'Select Employee'}
        </button>
        <input type="date" className="border p-2 text-xs" value={date} onChange={e => setDate(e.target.value)} />
        <input type="time" className="border p-2 text-xs" value={inTime} onChange={e => setInTime(e.target.value)} />
        <input type="time" className="border p-2 text-xs" value={outTime} onChange={e => setOutTime(e.target.value)} />
        <select className="border p-2 text-xs" value={location} onChange={e => setLocation(e.target.value)}>
           <option value="">Select Location</option>
           {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <button onClick={handleSubmit} className="bg-stone-800 text-white p-2 text-xs font-bold uppercase">Submit</button>
      </div>

      {showModal && <EmployeeSelectorModal employees={employees} onSelect={setSelectedEmp} onClose={() => setShowModal(false)} />}
    </section>
  );
}
