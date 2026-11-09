import React from 'react';
import { Home, Users, Table, Upload, BarChart3, Settings, Clock, MapPin, X, Timer, UserCheck, ExternalLink } from 'lucide-react';
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
        { id: 'visitors', name: 'Visitors (ইন-আউট)', icon: UserCheck, hasExternal: true },
    ] : []),
    { id: 'monthly', name: 'Monthly Report', icon: Table },
    { id: 'timecard', name: 'Time Card', icon: Clock },
    { id: 'late', name: 'Late Report', icon: Clock },
    { id: 'overtime', name: 'Overtime Report', icon: Timer },
  ];

  const SidebarContent = (
    <div className="w-56 bg-stone-900 text-stone-300 h-screen p-6 flex flex-col relative z-50">
      <div className="flex justify-between items-center mb-8">
        <div className="text-xl font-serif italic text-white">HR Engine</div>
        <button onClick={onClose} className="md:hidden p-1 text-stone-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      <nav className="flex flex-col gap-2 flex-grow overflow-y-auto">
        {menuItems.map(item => (
          <div key={item.id} className="relative flex items-center">
            <button
              onClick={() => {
                  setActiveSection(item.id);
                  onClose();
              }}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-sm text-xs font-bold uppercase transition-colors text-left ${activeSection === item.id ? 'bg-amber-500 text-white' : 'hover:bg-stone-800'}`}
            >
              <item.icon size={16} />
              <span>{item.name}</span>
            </button>
            {item.hasExternal && (
              <a
                href="/#visitors"
                target="_blank"
                rel="noopener noreferrer"
                title="আলাদা পেজে লিংক খুলুন"
                className="absolute right-2 text-stone-400 hover:text-white p-1 rounded hover:bg-stone-700/50"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </nav>

      {/* Standalone Gate Link Helper Box - ONLY IN ADMIN MODE */}
      {viewMode === 'admin' && (
        <div className="pt-4 mt-auto border-t border-stone-800 text-[11px]">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 mb-1">
            <UserCheck size={12} /> আলাদা গেট লিংক:
          </div>
          <a
            href="/#visitors"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between bg-stone-800/80 hover:bg-stone-800 text-stone-200 hover:text-amber-300 p-2 rounded font-mono text-[10px] border border-stone-700 transition-colors"
            title="সিকিউরিটিকে দেওয়ার জন্য আলাদা লিংক"
          >
            <span>/#visitors</span>
            <ExternalLink size={11} className="text-amber-400" />
          </a>
        </div>
      )}
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
