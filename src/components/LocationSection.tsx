import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { MapPin, Plus, Trash2 } from 'lucide-react';

interface Props {
  locations: any[];
  onRefresh: () => void;
}

export default function LocationSection({ locations, onRefresh }: Props) {
  const [newLocId, setNewLocId] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocId || !newLocName) return;
    setLoading(true);
    const { error } = await supabase.from('locations').insert([{ id: newLocId, name: newLocName }]);
    if (error) alert(error.message);
    else {
      setNewLocId('');
      setNewLocName('');
      onRefresh();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure? This might affect attendance records linked to this location.')) return;
    const { error } = await supabase.from('locations').delete().eq('id', id);
    if (error) alert(error.message);
    else onRefresh();
  };

  return (
    <section className="bg-white p-8 rounded-lg shadow-sm border border-stone-100">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800 mb-8">Location Management</h2>
      
      <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 bg-stone-50 p-6 rounded-md border border-stone-100">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Location ID</label>
          <input 
            type="text" 
            value={newLocId} 
            onChange={e => setNewLocId(e.target.value)} 
            placeholder="e.g. 101"
            className="border border-stone-200 rounded p-2 text-xs focus:ring-1 focus:ring-stone-400 outline-none"
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase font-bold text-stone-500">Location Name</label>
          <input 
            type="text" 
            value={newLocName} 
            onChange={e => setNewLocName(e.target.value)} 
            placeholder="e.g. Site Office"
            className="border border-stone-200 rounded p-2 text-xs focus:ring-1 focus:ring-stone-400 outline-none"
            required
          />
        </div>
        <div className="flex items-end">
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-stone-800 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-stone-900 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 h-[34px]"
          >
            <Plus size={14} />
            {loading ? 'Adding...' : 'Add Location'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left text-stone-700">
          <thead className="text-[10px] text-stone-500 uppercase border-b border-stone-200">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {locations.map(loc => (
              <tr key={loc.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-3 font-mono font-bold text-stone-600">{loc.id}</td>
                <td className="px-4 py-3 font-medium text-stone-900 flex items-center gap-2">
                  <MapPin size={12} className="text-stone-400" />
                  {loc.name}
                </td>
                <td className="px-4 py-4 text-right">
                  <button 
                    onClick={() => handleDelete(loc.id)} 
                    className="text-red-400 hover:text-red-600 transition-colors p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {locations.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-stone-400 italic">No locations found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
