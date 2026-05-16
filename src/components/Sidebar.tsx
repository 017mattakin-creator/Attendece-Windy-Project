import React from 'react';
import { Home, Users, Table, Upload, BarChart3, Settings } from 'lucide-react';

interface Props {
  activeSection: string;
  setActiveSection: (section: string) => void;
  viewMode: 'admin' | 'user';
}

export default function Sidebar({ activeSection, setActiveSection, viewMode }: Props) {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    ...(viewMode === 'admin' ? [
        { id: 'employees', name: 'Employees', icon: Users },
        { id: 'attendance', name: 'Attendance', icon: Table },
        { id: 'upload', name: 'Upload Data', icon: Upload },
    ] : []),
    { id: 'comparison', name: 'Comparison', icon: BarChart3 },
  ];

  return (
    <div className="w-56 bg-stone-900 text-stone-300 h-screen p-6 flex flex-col">
      <div className="text-xl font-serif italic text-white mb-10">HR Engine</div>
      <nav className="flex flex-col gap-2">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-sm text-xs font-bold uppercase ${activeSection === item.id ? 'bg-amber-500 text-white' : 'hover:bg-stone-800'}`}
          >
            <item.icon size={16} />
            {item.name}
          </button>
        ))}
      </nav>
    </div>
  );
}
