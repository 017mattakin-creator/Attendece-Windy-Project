import React, { useState } from 'react';
import { X, Search } from 'lucide-react';

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
  onSelect: (emp: Employee) => void;
  onClose: () => void;
}

export default function EmployeeSelectorModal({ employees, onSelect, onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEmployees = employees.filter(e => 
    e.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
    e.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-sm shadow-xl flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-stone-200 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest text-stone-700">Select Employee</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-stone-200">
           <div className="flex items-center gap-2 border border-stone-300 px-3 py-2 bg-stone-50">
             <Search size={16} className="text-stone-400" />
             <input 
               type="text" 
               placeholder="Search by ID or Name..." 
               value={searchTerm} 
               onChange={e => setSearchTerm(e.target.value)} 
               className="bg-transparent border-none outline-none text-xs w-full"
               autoFocus
             />
           </div>
        </div>
        <div className="overflow-y-auto flex-grow p-2">
            {filteredEmployees.map(e => (
                <div key={e.id} className="p-3 border-b border-stone-100 hover:bg-stone-50 cursor-pointer flex justify-between items-center" onClick={() => { onSelect(e); onClose(); }}>
                    <div>
                        <div className="text-xs font-bold text-stone-800">{e.name}</div>
                        <div className="text-[10px] text-stone-500">ID: {e.id}</div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
