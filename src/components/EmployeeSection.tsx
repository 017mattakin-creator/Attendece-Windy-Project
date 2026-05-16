import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
    onRefresh: () => void;
}

export default function EmployeeSection({ employees, onRefresh }: Props) {
    const [newEmp, setNewEmp] = useState<Partial<Employee>>({});

    const handleAdd = async () => {
        if (!newEmp.id || !newEmp.name) return alert('ID and Name required');
        const { error } = await supabase.from('employees').insert([newEmp]);
        if (error) alert('Error: ' + error.message);
        else {
            setNewEmp({});
            onRefresh();
            alert('Employee Added');
        }
    };

    return (
        <section className="bg-white p-6 rounded-sm shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6">Employee Directory</h2>
            
            <div className="flex gap-2 mb-6">
                <input placeholder="ID" className="border p-2 text-xs" value={newEmp.id || ''} onChange={e => setNewEmp({...newEmp, id: e.target.value})} />
                <input placeholder="Name" className="border p-2 text-xs" value={newEmp.name || ''} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                <input placeholder="Designation" className="border p-2 text-xs" value={newEmp.designation || ''} onChange={e => setNewEmp({...newEmp, designation: e.target.value})} />
                <input placeholder="Category" className="border p-2 text-xs" value={newEmp.category || ''} onChange={e => setNewEmp({...newEmp, category: e.target.value})} />
                <button onClick={handleAdd} className="bg-stone-800 text-white px-4 py-2 font-bold uppercase text-xs">Add</button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-stone-800">
                    <thead className="text-[10px] text-stone-600 uppercase border-b border-stone-200">
                        <tr>
                            <th className="px-2 py-2">ID</th>
                            <th className="px-2 py-2">Name</th>
                            <th className="px-2 py-2">Designation</th>
                            <th className="px-2 py-2">Category</th>
                        </tr>
                    </thead>
                    <tbody>
                        {employees.map(e => (
                            <tr key={e.id} className="border-b border-stone-200/50">
                                <td className="px-2 py-2">{e.id}</td>
                                <td className="px-2 py-2">{e.name}</td>
                                <td className="px-2 py-2">{e.designation}</td>
                                <td className="px-2 py-2">{e.category}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
