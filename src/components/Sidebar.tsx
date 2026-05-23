import React from 'react';
import { Home, Users, Table, Upload, BarChart3, Settings, Clock, MapPin, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  activeSection: string;
  setActiveSection: (section: string) => void;
  viewMode: 'admin' | 'user';
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ activeSection, setActiveSection, viewMode, isOpen, onClose }: Props) {
  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    ...(viewMode === 'admin' ? [
        { id: 'employees', name: 'Employees', icon: Users },
        { id: 'locations', name: 'Locations', icon: MapPin },
        { id: 'attendance', name: 'Attendance', icon: Table },
        { id: 'upload', name: 'Upload Data', icon: Upload },
        { id: 'comparison', name: 'Comparison', icon: BarChart3 },
    ] : []),
    { id: 'monthly', name: 'Monthly Report', icon: Table },
    { id: 'timecard', name: 'Time Card', icon: Clock },
  ];

  const SidebarContent = (
    <div className="w-56 bg-stone-900 text-stone-300 h-screen p-6 flex flex-col relative z-50">
      <div className="flex justify-between items-center mb-10">
        <div className="text-xl font-serif italic text-white">HR Engine</div>
        <button onClick={onClose} className="md:hidden p-1 text-stone-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      <nav className="flex flex-col gap-2">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => {
                setActiveSection(item.id);
                onClose();
            }}
            className={`flex items-center gap-3 px-4 py-3 rounded-sm text-xs font-bold uppercase transition-colors ${activeSection === item.id ? 'bg-amber-500 text-white' : 'hover:bg-stone-800'}`}
          >
            <item.icon size={16} />
            {item.name}
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        {SidebarContent}
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 z-50 md:hidden"
            >
              {SidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
