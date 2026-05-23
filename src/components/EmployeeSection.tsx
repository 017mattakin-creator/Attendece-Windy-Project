import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Sun, Moon, Pencil, Trash2, Check, X } from 'lucide-react';
import { getEmployeeShift, setEmployeeShift, parseEducationAndShift } from '../lib/dateUtils';

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
    viewMode: 'admin' | 'user';
}

export default function EmployeeSection({ employees, onRefresh, viewMode }: Props) {
    const [newEmp, setNewEmp] = useState<Partial<Employee>>({});
    const [tempShift, setTempShift] = useState<'Day' | 'Night'>('Day');
    const [renderTrigger, setRenderTrigger] = useState(0);
    const [statusMsg, setStatusMsg] = useState<string | null>(null);
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'staff' | 'security'>('all');

    const STAFF_IDS = [
      '16153', '15439', '16325', '15524', '16135', '16117', '15525', '15641', '16254', '15608', '16279', 
      '15590', '15832', '16187', '15548', '16110', '16004', '16114', '16270', '16099', '16193', '16009', '15973', '16156'
    ];

    const isStaffEmployee = (emp: any) => {
      const idStr = String(emp.id).trim();
      if (STAFF_IDS.includes(idStr)) return true;
      const cat = (emp.category || '').toLowerCase().trim();
      if (cat.includes('staff')) return true;
      if (cat.includes('security') || cat.includes('guard')) return false;
      const desig = (emp.designation || '').toLowerCase().trim();
      if (desig.includes('security') || desig.includes('guard') || desig.includes('ansar')) return false;
      return true;
    };

    const filteredEmployees = employees.filter(emp => {
      if (categoryFilter === 'staff') return isStaffEmployee(emp);
      if (categoryFilter === 'security') return !isStaffEmployee(emp);
      return true;
    });

    // Edit employee state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{
        name: string;
        designation: string;
        category: string;
        joinDate: string;
        phoneNumber: string;
    }>({
        name: '',
        designation: '',
        category: '',
        joinDate: '',
        phoneNumber: ''
    });

    const handleAdd = async () => {
        if (!newEmp.id || !newEmp.name) return alert('ID and Name required');
        const empId = String(newEmp.id).trim();
        const originalEducation = newEmp.education || '';
        const encodedEducation = `${originalEducation}|${tempShift}`;

        const cleaned = {
            id: empId,
            name: newEmp.name,
            designation: newEmp.designation || '',
            category: newEmp.category || '',
            join_date: newEmp.joinDate || null,
            phone_number: newEmp.phoneNumber || '',
            education: encodedEducation,
            salary: newEmp.salary || ''
        };

        const { error } = await supabase.from('employees').insert([cleaned]);
        if (error) alert('Error: ' + error.message);
        else {
            setEmployeeShift(cleaned.id, tempShift);
            setNewEmp({});
            setTempShift('Day');
            onRefresh();
            alert('Employee Added successfully with ' + tempShift + ' Shift');
        }
    };

    const startEditing = (emp: Employee) => {
        setEditingId(emp.id);
        setEditForm({
            name: emp.name || '',
            designation: emp.designation || '',
            category: emp.category || '',
            joinDate: emp.joinDate || '',
            phoneNumber: emp.phoneNumber || ''
        });
    };

    const handleSaveEdit = async (empId: string) => {
        if (!editForm.name) return alert('Name is required');
        
        const { error } = await supabase
            .from('employees')
            .update({
                name: editForm.name,
                designation: editForm.designation,
                category: editForm.category,
                join_date: editForm.joinDate || null,
                phone_number: editForm.phoneNumber
            })
            .eq('id', empId);

        if (error) {
            alert('Error updating employee: ' + error.message);
        } else {
            setEditingId(null);
            onRefresh();
            setStatusMsg('Employee updated successfully!');
            setTimeout(() => setStatusMsg(null), 3000);
        }
    };

    const handleDeleteEmployee = async (empId: string, empName: string) => {
        if (!confirm(`Are you sure you want to delete ${empName} (ID: ${empId})?`)) return;
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', empId);

        if (error) {
            alert('Error deleting employee: ' + error.message);
        } else {
            onRefresh();
            setStatusMsg(`Employee ${empName} has been deleted.`);
            setTimeout(() => setStatusMsg(null), 3000);
        }
    };

    const handleShiftChange = async (empId: string, shift: 'Day' | 'Night') => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;

        const { education } = parseEducationAndShift(emp.education);
        const encodedEducation = `${education}|${shift}`;

        const { error } = await supabase
            .from('employees')
            .update({ education: encodedEducation })
            .eq('id', empId);

        if (error) {
            alert('Error: ' + error.message);
        } else {
            setEmployeeShift(empId, shift);
            setRenderTrigger(prev => prev + 1);
            setStatusMsg(`Success: Shift for ${emp.name} has been updated to "${shift === 'Day' ? 'Day Shift' : 'Night Shift'}"!`);
            setTimeout(() => setStatusMsg(null), 5000);
            onRefresh();
        }
    };

    // Date formatter for beautiful preview
    const renderDatePreview = (dateStr: string) => {
        if (!dateStr) return '-';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const idx = parseInt(parts[1], 10) - 1;
        const monthName = months[idx] || parts[1];
        return `${parseInt(parts[2], 10)}-${monthName}-${parts[0]}`;
    };

    return (
        <section id="employee-management" className="bg-white p-6 rounded-sm shadow-sm border border-stone-200">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[#1e272e] mb-2">Employee Directory & Shift Control</h2>
            
            {statusMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-sm transition-opacity duration-300">
                    {statusMsg}
                </div>
            )}
            
            {viewMode === 'admin' ? (
                <div className="bg-stone-50 p-4 border border-stone-200 rounded-sm mb-6">
                    <h3 className="text-xs font-bold text-stone-800 mb-3 uppercase tracking-wider">নতুন কর্মচারী যোগ করুন (Add New Employee)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
                        <input placeholder="ID" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400" value={newEmp.id || ''} onChange={e => setNewEmp({...newEmp, id: e.target.value})} />
                        <input placeholder="Name" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400" value={newEmp.name || ''} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                        <input placeholder="Designation" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400" value={newEmp.designation || ''} onChange={e => setNewEmp({...newEmp, designation: e.target.value})} />
                        <input placeholder="Category" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400" value={newEmp.category || ''} onChange={e => setNewEmp({...newEmp, category: e.target.value})} />
                        
                        <div className="flex flex-col">
                            <input type="date" title="Join Date" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400 text-stone-600 w-full" value={newEmp.joinDate || ''} onChange={e => setNewEmp({...newEmp, joinDate: e.target.value})} />
                        </div>
                        
                        <input placeholder="Phone Number" className="border bg-white p-2 text-xs rounded-sm focus:outline-none focus:ring-1 focus:ring-stone-400" value={newEmp.phoneNumber || ''} onChange={e => setNewEmp({...newEmp, phoneNumber: e.target.value})} />
                        
                        <div className="flex gap-2">
                            <select 
                                value={tempShift} 
                                onChange={e => setTempShift(e.target.value as 'Day' | 'Night')} 
                                className="border bg-white p-2 text-xs rounded-sm flex-1 font-bold focus:outline-none focus:ring-1 focus:ring-stone-400"
                            >
                                <option value="Day">☀️ Day Shift</option>
                                <option value="Night">🌙 Night Shift</option>
                            </select>
                            <button onClick={handleAdd} className="bg-stone-800 hover:bg-black text-white px-4 py-2 font-bold uppercase text-xs rounded-sm transition-all active:scale-95 leading-none">Add</button>
                        </div>
                    </div>
                    <p className="text-[10px] text-stone-500 font-semibold mt-2">
                        * ডে শিফট: সকাল ০৮:০০ - পরদিন ভোর ০৬:০০ | নাইট শিফট: রাত ০৮:০০ - পরদিন সকাল ০৮:০০
                    </p>
                </div>
            ) : (
                <div className="mb-6 p-4 bg-stone-50 border border-stone-100 text-[10px] uppercase font-bold text-stone-400 tracking-wider">
                    Only administrators can add new employees and configure shifts
                </div>
            )}

            {/* Category Directory Filter Tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
                <button 
                    onClick={() => setCategoryFilter('all')}
                    className={`px-4 py-2 text-xs font-bold uppercase rounded-sm border transition-all ${categoryFilter === 'all' ? 'bg-stone-800 border-stone-800 text-white shadow-xs' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                >
                    All Employees ({employees.length})
                </button>
                <button 
                    onClick={() => setCategoryFilter('staff')}
                    className={`px-4 py-2 text-xs font-bold uppercase rounded-sm border transition-all ${categoryFilter === 'staff' ? 'bg-amber-500 border-amber-500 text-white shadow-xs' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                >
                    Staff Directory ({employees.filter(isStaffEmployee).length})
                </button>
                <button 
                    onClick={() => setCategoryFilter('security')}
                    className={`px-4 py-2 text-xs font-bold uppercase rounded-sm border transition-all ${categoryFilter === 'security' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                >
                    Security Directory ({employees.filter(emp => !isStaffEmployee(emp)).length})
                </button>
            </div>

            <div className="overflow-x-auto border border-stone-200 rounded-sm">
                <table className="w-full text-xs text-left text-stone-800 min-w-[700px]">
                    <thead className="text-[10px] text-stone-600 uppercase bg-stone-50 border-b border-stone-200">
                        <tr>
                            <th className="px-3 py-3 w-16">ID</th>
                            <th className="px-3 py-3">Name</th>
                            <th className="px-3 py-3">Designation</th>
                            <th className="px-3 py-3">Category</th>
                            <th className="px-3 py-3">Join Date</th>
                            <th className="px-3 py-3">Phone Number</th>
                            <th className="px-3 py-3 w-36">Shift / শিফট</th>
                            {viewMode === 'admin' && <th className="px-3 py-3 w-28 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                        {filteredEmployees.map(emp => {
                            const currentShift = getEmployeeShift(emp.id);
                            const isEditing = editingId === emp.id;

                            return (
                                <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors">
                                    {/* ID Column */}
                                    <td className="px-3 py-2 font-mono font-bold text-stone-600">{emp.id}</td>

                                    {/* Name Column */}
                                    <td className="px-3 py-2 font-semibold">
                                        {isEditing ? (
                                            <input 
                                                className="border bg-white px-2 py-1 text-xs rounded-sm w-full outline-none focus:ring-1 focus:ring-stone-400 font-sans font-normal" 
                                                value={editForm.name} 
                                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            />
                                        ) : (
                                            <span className="text-stone-900">{emp.name}</span>
                                        )}
                                    </td>

                                    {/* Designation Column */}
                                    <td className="px-3 py-2">
                                        {isEditing ? (
                                            <input 
                                                className="border bg-white px-2 py-1 text-xs rounded-sm w-full outline-none focus:ring-1 focus:ring-stone-400 font-sans" 
                                                value={editForm.designation} 
                                                onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                                            />
                                        ) : (
                                            <span className="text-stone-600">{emp.designation || '-'}</span>
                                        )}
                                    </td>

                                    {/* Category Column */}
                                    <td className="px-3 py-2">
                                        {isEditing ? (
                                            <input 
                                                className="border bg-white px-2 py-1 text-xs rounded-sm w-full outline-none focus:ring-1 focus:ring-stone-400 font-sans" 
                                                value={editForm.category} 
                                                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                            />
                                        ) : (
                                            <span className="bg-stone-100 px-1.5 py-0.5 rounded text-[10px] font-sans text-stone-600">{emp.category || '-'}</span>
                                        )}
                                    </td>

                                    {/* Join Date Column */}
                                    <td className="px-3 py-2">
                                        {isEditing ? (
                                            <input 
                                                type="date"
                                                className="border bg-white px-2 py-1 text-xs rounded-sm w-full outline-none focus:ring-1 focus:ring-stone-400 font-sans" 
                                                value={editForm.joinDate} 
                                                onChange={e => setEditForm({ ...editForm, joinDate: e.target.value })}
                                            />
                                        ) : (
                                            <span className="font-mono text-stone-700">{renderDatePreview(emp.joinDate)}</span>
                                        )}
                                    </td>

                                    {/* Phone Number Column */}
                                    <td className="px-3 py-2">
                                        {isEditing ? (
                                            <input 
                                                className="border bg-white px-2 py-1 text-xs rounded-sm w-full outline-none focus:ring-1 focus:ring-stone-400 font-sans" 
                                                value={editForm.phoneNumber} 
                                                onChange={e => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                                            />
                                        ) : (
                                            <span className="font-mono text-stone-700">{emp.phoneNumber || '-'}</span>
                                        )}
                                    </td>

                                    {/* Shift Selection Column */}
                                    <td className="px-3 py-2">
                                        <select 
                                            value={currentShift} 
                                            onChange={evt => handleShiftChange(emp.id, evt.target.value as 'Day' | 'Night')} 
                                            disabled={viewMode !== 'admin'}
                                            className={`text-[10px] font-bold p-1 rounded-sm border focus:outline-none transition-all cursor-pointer ${
                                                currentShift === 'Night' 
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-800 focus:ring-1 focus:ring-indigo-400' 
                                                    : 'bg-amber-50 border-amber-200 text-amber-800 focus:ring-1 focus:ring-amber-400'
                                            } disabled:opacity-90 disabled:cursor-default`}
                                        >
                                            <option value="Day">☀️ Day (সকাল ৮ - ভোর ৬)</option>
                                            <option value="Night">🌙 Night (রাত ৮ - সকাল ৮)</option>
                                        </select>
                                    </td>

                                    {/* Actions for Admins */}
                                    {viewMode === 'admin' && (
                                        <td className="px-3 py-2 text-right">
                                            {isEditing ? (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button 
                                                        onClick={() => handleSaveEdit(emp.id)} 
                                                        title="Save Changes" 
                                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all active:scale-90"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => setEditingId(null)} 
                                                        title="Cancel Editing" 
                                                        className="p-1 text-[#e15252] hover:bg-red-50 rounded transition-all active:scale-90"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button 
                                                        onClick={() => startEditing(emp)} 
                                                        title="Edit Employee" 
                                                        className="p-1 text-stone-600 hover:bg-stone-100 rounded transition-all active:scale-90"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteEmployee(emp.id, emp.name)} 
                                                        title="Delete Employee" 
                                                        className="p-1 text-[#e15252] hover:bg-red-50 rounded transition-all active:scale-90"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
