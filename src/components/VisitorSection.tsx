import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  LogOut, 
  Edit2, 
  Trash2, 
  X, 
  Settings, 
  RefreshCw,
  Building,
  User,
  Phone,
  MessageCircle,
  Check,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileDown,
  Copy
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';
import { normalizeToYYYYMMDD } from '../lib/dateUtils';

export interface VisitorRecord {
  id?: string | number;
  sl: number;
  date: string;
  visitor_name?: string;
  company_name: string;
  who_meet: string;
  purpose: string;
  in_time: string;
  out_time?: string;
  phone_number?: string;
  id_card_no?: string;
  status: 'Inside' | 'Checked Out';
  remarks?: string;
  created_at?: string;
}

interface Props {
  employees: any[];
  viewMode: 'admin' | 'user';
}

const LOCAL_STORAGE_KEY = 'hr_visitors_db_records';

const formatCurrentTime = (): string => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

const getTodayString = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Clean phone number for WhatsApp wa.me / api.whatsapp.com
const formatWhatsAppPhone = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '88' + clean; // Bangladesh prefix
  }
  return clean;
};

// Fast 1-tap purpose options for mobile
const QUICK_PURPOSES = [
  'অফিসিয়াল মিটিং',
  'ইন্টারভিউ',
  'মাল ডেলিভারি',
  'স্যাম্পল প্রদান',
  'বিল / চালান জমা',
  'সার্ভিস / মেরামত',
  'পরিদর্শন'
];

export default function VisitorSection({ employees = [], viewMode }: Props) {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  // Operator Identity
  const [operatorIdentity, setOperatorIdentity] = useState<string>(() => {
    return localStorage.getItem('saved_operator_user_email') || 'Gate Security';
  });

  // Admin WhatsApp Number (একমাত্র প্রয়োজনীয় কনফিগারেশন)
  const [adminWhatsAppNumber, setAdminWhatsAppNumber] = useState<string>(() => {
    return localStorage.getItem('admin_whatsapp_number') || '017mattakin@gmail.com';
  });

  // Clean form state for quick mobile entry
  const [formData, setFormData] = useState<Partial<VisitorRecord>>({
    sl: 1,
    date: getTodayString(),
    visitor_name: '',
    company_name: '',
    who_meet: '',
    purpose: '',
    in_time: formatCurrentTime(),
    out_time: '',
    phone_number: '',
    id_card_no: '',
    status: 'Inside',
    remarks: ''
  });
  
  const [editingRecord, setEditingRecord] = useState<VisitorRecord | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    fetchVisitors();
  }, []);

  // Save Settings
  const handleSaveSettings = (opId: string, waNum: string) => {
    setOperatorIdentity(opId);
    setAdminWhatsAppNumber(waNum);
    localStorage.setItem('saved_operator_user_email', opId);
    localStorage.setItem('admin_whatsapp_number', waNum);

    setActionMessage({ type: 'success', text: 'WhatsApp নম্বর সফলভাবে সেভ হয়েছে।' });
    setShowSettingsModal(false);
    setTimeout(() => setActionMessage(null), 3000);
  };

  // Fetch visitors
  const fetchVisitors = async () => {
    setLoading(true);
    let loadedFromDb = false;

    try {
      const { data, error } = await supabase
        .from('visitors')
        .select('*')
        .order('date', { ascending: false })
        .order('sl', { ascending: true });

      if (!error && data) {
        const mapped: VisitorRecord[] = data.map((v: any) => ({
          id: v.id,
          sl: Number(v.sl) || 1,
          date: normalizeToYYYYMMDD(v.date) || v.date,
          visitor_name: v.visitor_name || '',
          company_name: v.company_name || '',
          who_meet: v.who_meet || '',
          purpose: v.purpose || '',
          in_time: v.in_time || '',
          out_time: v.out_time || '',
          phone_number: v.phone_number || '',
          id_card_no: v.id_card_no || '',
          status: v.out_time ? 'Checked Out' : (v.status || 'Inside'),
          remarks: v.remarks || '',
          created_at: v.created_at
        }));
        setVisitors(mapped);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mapped));
        loadedFromDb = true;
      }
    } catch (err) {
      console.warn('Supabase fetch fallback:', err);
    }

    if (!loadedFromDb) {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        try {
          setVisitors(JSON.parse(local));
        } catch (e) {
          console.error(e);
        }
      }
    }
    setLoading(false);
  };

  // Save new visitor
  const handleSaveNewVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name?.trim() || !formData.who_meet?.trim() || !formData.purpose?.trim()) {
      alert('অনুগ্রহ করে কোম্পানির নাম, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।');
      return;
    }

    const targetDate = formData.date || getTodayString();
    const dateRecords = visitors.filter(v => v.date === targetDate);
    const nextSl = dateRecords.length > 0 ? Math.max(...dateRecords.map(r => r.sl)) + 1 : 1;

    const newRecord: VisitorRecord = {
      id: `v_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sl: nextSl,
      date: targetDate,
      visitor_name: formData.visitor_name?.trim() || '',
      company_name: formData.company_name.trim(),
      who_meet: formData.who_meet.trim(),
      purpose: formData.purpose.trim(),
      in_time: formData.in_time?.trim() || formatCurrentTime(),
      out_time: '',
      phone_number: formData.phone_number?.trim() || '',
      id_card_no: formData.id_card_no?.trim() || '',
      status: 'Inside',
      remarks: formData.remarks || '',
      created_at: new Date().toISOString()
    };

    // Save to Supabase
    try {
      const { data, error } = await supabase.from('visitors').insert([{
        sl: newRecord.sl,
        date: newRecord.date,
        visitor_name: newRecord.visitor_name,
        company_name: newRecord.company_name,
        who_meet: newRecord.who_meet,
        purpose: newRecord.purpose,
        in_time: newRecord.in_time,
        out_time: null,
        phone_number: newRecord.phone_number,
        id_card_no: newRecord.id_card_no,
        status: 'Inside',
        remarks: newRecord.remarks
      }]).select();

      if (!error && data && data[0]) {
        newRecord.id = data[0].id;
      }
    } catch (err) {
      console.warn('Supabase insert fallback to local storage:', err);
    }

    const updated = [newRecord, ...visitors];
    setVisitors(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    // Clear form inputs for next entry
    setFormData({
      sl: nextSl + 1,
      date: targetDate,
      visitor_name: '',
      company_name: '',
      who_meet: '',
      purpose: '',
      in_time: formatCurrentTime(),
      out_time: '',
      phone_number: '',
      id_card_no: '',
      status: 'Inside',
      remarks: ''
    });

    setActionMessage({ 
      type: 'success', 
      text: `✅ ${newRecord.company_name} - ভিজিটর এন্ট্রি সংরক্ষিত হয়েছে এবং উপরের "ভিতরে আছেন" লিস্টে যোগ হয়েছে।` 
    });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // 1-CLICK OUT: Immediately records exit time and removes the visitor from the top Inside list!
  const handleQuickCheckout = async (record: VisitorRecord) => {
    const exitTime = formatCurrentTime();
    const updatedRecord: VisitorRecord = {
      ...record,
      out_time: exitTime,
      status: 'Checked Out'
    };

    // Update in Supabase
    try {
      if (typeof record.id === 'number') {
        await supabase.from('visitors').update({
          out_time: exitTime,
          status: 'Checked Out'
        }).eq('id', record.id);
      }
    } catch (err) {
      console.warn('Supabase checkout error:', err);
    }

    // Update local state: removes from top 'Inside' list
    const updatedList = visitors.map(v => v.id === record.id ? updatedRecord : v);
    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    setActionMessage({ 
      type: 'info', 
      text: `🚪 ${record.company_name} এর প্রস্থান সম্পন্ন হয়েছে (আউট সময়: ${exitTime})। ড্যাশবোর্ড থেকে সরানো হয়েছে।` 
    });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // Update existing record
  const handleUpdateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;

    try {
      if (typeof editingRecord.id === 'number') {
        await supabase.from('visitors').update({
          sl: editingRecord.sl,
          date: editingRecord.date,
          visitor_name: editingRecord.visitor_name,
          company_name: editingRecord.company_name,
          who_meet: editingRecord.who_meet,
          purpose: editingRecord.purpose,
          in_time: editingRecord.in_time,
          out_time: editingRecord.out_time || null,
          phone_number: editingRecord.phone_number,
          id_card_no: editingRecord.id_card_no,
          status: editingRecord.out_time ? 'Checked Out' : 'Inside',
          remarks: editingRecord.remarks
        }).eq('id', editingRecord.id);
      }
    } catch (e) {
      console.warn('Supabase update fallback:', e);
    }

    const updated = visitors.map(v => v.id === editingRecord.id ? editingRecord : v);
    setVisitors(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    setShowEditModal(false);
    setEditingRecord(null);

    setActionMessage({ type: 'success', text: 'ভিজিটর তথ্য আপডেট হয়েছে।' });
    setTimeout(() => setActionMessage(null), 3000);
  };

  // Delete Record
  const handleDelete = async (id: string | number) => {
    if (!window.confirm('আপনি কি এই ভিজিটর এন্ট্রি ডিলিট করতে চান?')) return;

    try {
      if (typeof id === 'number') {
        await supabase.from('visitors').delete().eq('id', id);
      }
    } catch (err) {
      console.warn('Supabase delete error:', err);
    }

    const updated = visitors.filter(v => v.id !== id);
    setVisitors(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    setActionMessage({ type: 'info', text: 'রেকর্ড মুছে ফেলা হয়েছে।' });
    setTimeout(() => setActionMessage(null), 3000);
  };

  // =========================================================================
  // ⚡ 1-CLICK WHATSAPP TOTAL SUMMARY (ফুটারের একমাত্র বাটন - চাপলেই আজকের রিপোর্ট)
  // =========================================================================
  const handleSendTodayWhatsAppSummary = () => {
    const todayStr = getTodayString();
    const todayRecords = visitors.filter(v => v.date === todayStr);

    if (todayRecords.length === 0) {
      alert(`আজকের (${todayStr}) তারিখে এখনো কোনো ভিজিটর এন্ট্রি করা হয়নি।`);
      return;
    }

    const insideCount = todayRecords.filter(v => !v.out_time || v.status === 'Inside').length;
    const outCount = todayRecords.length - insideCount;

    // Sort by SL
    const sorted = [...todayRecords].sort((a, b) => a.sl - b.sl);

    const listLines = sorted.map(v => {
      const exitStr = v.out_time ? `আউট: ${v.out_time}` : `ভিতরে আছেন 🔴`;
      const nameStr = v.visitor_name ? ` (${v.visitor_name})` : '';
      return `${v.sl}. *${v.company_name}*${nameStr}\n   সাক্ষাৎ: ${v.who_meet}\n   ইন: ${v.in_time} | ${exitStr}\n   উদ্দেশ্য: ${v.purpose}`;
    });

    const summaryText = 
`*📋 WINDY GROUP - আজকের সম্পূর্ণ ভিজিটর রিপোর্ট*
📅 *তারিখ:* ${todayStr}
📊 *মোট ভিজিটর:* ${todayRecords.length} জন
🔴 *ভিতরে আছেন:* ${insideCount} জন
🟢 *প্রস্থান সম্পন্ন:* ${outCount} জন
━━━━━━━━━━━━━━━━━━
${listLines.join('\n\n')}
━━━━━━━━━━━━━━━━━━
👤 *প্রেরক:* ${operatorIdentity}`;

    const cleanPhone = formatWhatsAppPhone(adminWhatsAppNumber);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(summaryText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
    
    window.open(waUrl, '_blank');
  };

  // Filter visitors
  const todayDateStr = getTodayString();
  const todayAllVisitors = visitors.filter(v => v.date === (selectedDate || todayDateStr));

  // 1. ACTIVE VISITORS CURRENTLY INSIDE (যাঁরা এখনো বের হননি - উপরে থাকবেন)
  const currentlyInsideVisitors = visitors.filter(v => (!v.out_time || v.status === 'Inside'));

  // 2. Filtered history list
  const historyVisitors = visitors.filter(v => {
    const matchesDate = !selectedDate || v.date === selectedDate;
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term || (
      v.company_name.toLowerCase().includes(term) ||
      (v.visitor_name || '').toLowerCase().includes(term) ||
      v.who_meet.toLowerCase().includes(term) ||
      v.purpose.toLowerCase().includes(term) ||
      (v.phone_number || '').includes(term) ||
      String(v.sl).includes(term)
    );
    return matchesDate && matchesSearch;
  });

  // Export to Excel
  const exportToExcel = () => {
    const headers = ['SL', 'Date', 'Company Name', 'Visitor Name', 'Phone', 'Who Meet', 'Purpose', 'In Time', 'Out Time', 'Status', 'Pass No'];
    const rows = historyVisitors.map((v, i) => [
      v.sl || i + 1,
      v.date,
      v.company_name,
      v.visitor_name || '',
      v.phone_number || '',
      v.who_meet,
      v.purpose,
      v.in_time,
      v.out_time || '',
      v.status,
      v.id_card_no || ''
    ]);
    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visitors');
    XLSX.writeFile(wb, `Visitors_${selectedDate || 'All'}.xlsx`);
  };

  return (
    <section className="bg-stone-50 md:bg-white p-2.5 sm:p-5 md:p-8 rounded-sm border border-stone-200 pb-28 md:pb-32">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-stone-200">
        <div>
          <h2 className="text-base sm:text-xl font-black text-stone-900 flex items-center gap-2">
            <UserCheck className="text-amber-600" size={24} />
            VISITOR IN - OUT REGISTER
          </h2>
          <p className="text-[11px] sm:text-xs text-stone-500 font-medium">
            ভিতরে থাকা ভিজিটর উপরে থাকবে &bull; ১-ক্লিকেই আউট দিন &bull; নিচে শুধু ১টি WhatsApp বাটন
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300 text-xs font-bold cursor-pointer"
            title="WhatsApp নম্বর সেট করুন"
          >
            <Settings size={14} />
            <span>নম্বর সেটিংস</span>
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {actionMessage && (
        <div className={`p-3 rounded mb-4 text-xs font-bold flex items-center justify-between ${
          actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' :
          actionMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-300' :
          'bg-blue-50 text-blue-800 border border-blue-300'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)}>
            <X size={15} />
          </button>
        </div>
      )}

      {/* =========================================================================
          🔥 SECTION 1: বর্তমানে ভিতরে আছেন (CURRENTLY INSIDE - TOP OF DASHBOARD)
          এখান থেকে "আউট দিন" বাটনে চাপ দিলে ড্যাশবোর্ড থেকে সাথে সাথে চলে যাবে!
          ========================================================================= */}
      <div className="bg-white border-2 border-rose-400 rounded-md shadow-sm p-3 sm:p-4 mb-5">
        <div className="flex items-center justify-between border-b border-rose-100 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
            <h3 className="text-sm font-black text-rose-950 uppercase tracking-wide">
              বর্তমানে ভিতরে আছেন ({currentlyInsideVisitors.length} জন)
            </h3>
          </div>
          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded">
            প্রস্থান বাকি আছে
          </span>
        </div>

        {currentlyInsideVisitors.length === 0 ? (
          <div className="py-5 text-center text-emerald-700 font-bold text-xs flex items-center justify-center gap-2 bg-emerald-50/50 rounded border border-emerald-200">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>বর্তমানে কোনো ভিজিটর ভিতরে অবস্থান করছেন না (সবাই প্রস্থান করেছেন)।</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentlyInsideVisitors.map((v) => (
              <div 
                key={v.id} 
                className="bg-rose-50/40 border border-rose-200 rounded p-3 flex flex-col justify-between shadow-xs hover:border-rose-300 transition-colors"
              >
                <div>
                  <div className="flex justify-between items-start gap-1">
                    <div className="font-black text-sky-950 text-sm flex items-center gap-1.5">
                      <Building size={14} className="text-sky-700 shrink-0" />
                      <span>{v.company_name}</span>
                    </div>
                    <span className="text-[10px] font-mono bg-white border border-rose-200 text-rose-700 font-bold px-1.5 py-0.5 rounded shrink-0">
                      ইন: {v.in_time}
                    </span>
                  </div>

                  {v.visitor_name && (
                    <div className="text-xs text-stone-700 font-medium flex items-center gap-1 mt-1">
                      <User size={12} className="text-stone-400" />
                      <span>{v.visitor_name}</span>
                      {v.phone_number && (
                        <span className="text-[10px] text-stone-500 font-mono">({v.phone_number})</span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 text-[11px] bg-white/80 p-2 rounded border border-stone-200 space-y-0.5">
                    <div>
                      <span className="font-bold text-stone-500 text-[10px]">সাক্ষাৎ: </span>
                      <strong className="text-amber-950">{v.who_meet}</strong>
                    </div>
                    <div>
                      <span className="font-bold text-stone-500 text-[10px]">উদ্দেশ্য: </span>
                      <span className="text-stone-700">{v.purpose}</span>
                    </div>
                    {v.id_card_no && (
                      <div className="text-[10px] font-mono text-stone-500">
                        পাস নং: {v.id_card_no}
                      </div>
                    )}
                  </div>
                </div>

                {/* 1-CLICK OUT BUTTON: Click and they vanish from this top section immediately */}
                <div className="mt-3 pt-2 border-t border-rose-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-stone-500 font-mono">{v.date}</span>
                  <button
                    onClick={() => handleQuickCheckout(v)}
                    className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded shadow-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer transition-transform"
                    title="ক্লিক করলেই বর্তমান সময় বের হওয়ার সময় হিসেবে সেভ হবে এবং ড্যাশবোর্ড থেকে চলে যাবে"
                  >
                    <LogOut size={13} />
                    <span>🚪 আউট দিন</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =========================================================================
          📱 SECTION 2: নতুন ভিজিটর এন্ট্রি ফরম (QUICK MOBILE ENTRY)
          একদম সহজ ও পরিচ্ছন্ন - অতিরিক্ত কোনো বাটন নেই
          ========================================================================= */}
      <div className="bg-white border border-stone-300 rounded-md shadow-sm p-3.5 sm:p-5 mb-5">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-amber-600" />
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900">
              নতুন ভিজিটর এন্ট্রি করুন (New Entry)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, in_time: formatCurrentTime() })}
            className="text-[11px] bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 px-2 py-0.5 rounded font-bold cursor-pointer"
          >
            ⏰ এখন সময় দিন
          </button>
        </div>

        <form onSubmit={handleSaveNewVisitor} className="space-y-3">
          {/* Company & Visitor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                কোম্পানির নাম (Company Name) *
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="e.g. ABC Fabrics Ltd."
                required
                className="w-full border-2 border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-bold text-sky-950 outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                ভিজিটরের নাম ও মোবাইল
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.visitor_name}
                  onChange={e => setFormData({ ...formData, visitor_name: e.target.value })}
                  placeholder="নাম (ঐচ্ছিক)"
                  className="w-full border border-stone-300 p-2.5 rounded text-sm outline-none"
                />
                <input
                  type="text"
                  value={formData.phone_number || ''}
                  onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="মোবাইল (ঐচ্ছিক)"
                  className="w-full border border-stone-300 p-2.5 rounded text-sm font-mono outline-none"
                />
              </div>
            </div>
          </div>

          {/* Who Meet & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                কার সাথে সাক্ষাৎ (Who Meet) *
              </label>
              <input
                type="text"
                list="staff-list"
                value={formData.who_meet}
                onChange={e => setFormData({ ...formData, who_meet: e.target.value })}
                placeholder="কর্মকর্তার নাম লিখুন বা সিলেক্ট করুন..."
                required
                className="w-full border-2 border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-bold text-amber-950 outline-none"
              />
              <datalist id="staff-list">
                {employees.map(emp => (
                  <option key={emp.id} value={`${emp.name} (${emp.designation || emp.id})`} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-stone-700 uppercase mb-1">
                উদ্দেশ্য (Purpose) *
              </label>
              <input
                type="text"
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="ভিজিটের উদ্দেশ্য..."
                required
                className="w-full border-2 border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm outline-none"
              />
            </div>
          </div>

          {/* 1-Tap Purpose Chips */}
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase block mb-1">
              দ্রুত সিলেক্ট:
            </span>
            <div className="flex flex-wrap gap-1">
              {QUICK_PURPOSES.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setFormData({ ...formData, purpose: p })}
                  className={`text-[11px] px-2 py-0.5 rounded border cursor-pointer ${
                    formData.purpose === p 
                      ? 'bg-amber-500 text-stone-950 font-bold border-amber-600' 
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300'
                  }`}
                >
                  + {p}
                </button>
              ))}
            </div>
          </div>

          {/* In Time & Pass No */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                In Time *
              </label>
              <input
                type="text"
                value={formData.in_time}
                onChange={e => setFormData({ ...formData, in_time: e.target.value })}
                required
                className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                পাস নং / কার্ড নং
              </label>
              <input
                type="text"
                value={formData.id_card_no || ''}
                onChange={e => setFormData({ ...formData, id_card_no: e.target.value })}
                placeholder="V-01"
                className="w-full border border-stone-300 p-2 rounded text-xs font-mono"
              />
            </div>
          </div>

          {/* JUST ONE CLEAN SUBMIT BUTTON */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 bg-stone-900 hover:bg-black active:scale-98 text-white font-black text-sm rounded shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-transform"
            >
              <CheckCircle2 size={18} className="text-amber-400" />
              <span>ভিজিটর এন্ট্রি সেভ করুন</span>
            </button>
          </div>
        </form>
      </div>

      {/* =========================================================================
          📋 SECTION 3: সমস্ত ভিজিটর লগ ও ইতিহাস (ALL VISITORS LOG)
          ========================================================================= */}
      <div className="bg-white border border-stone-300 rounded-md shadow-xs p-3.5 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-2 border-b border-stone-200">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-black uppercase text-stone-900">
              ভিজিটর তালিকা ({historyVisitors.length} টি রেকর্ড)
            </h4>
          </div>

          {/* Date & Search */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-stone-50 border border-stone-300 rounded p-1 text-xs font-semibold"
            />
            <button
              onClick={() => setSelectedDate(getTodayString())}
              className={`px-2 py-1 rounded text-xs font-bold cursor-pointer ${selectedDate === getTodayString() ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700'}`}
            >
              আজ
            </button>
            <button
              onClick={() => setSelectedDate('')}
              className={`px-2 py-1 rounded text-xs font-bold cursor-pointer ${selectedDate === '' ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700'}`}
            >
              সব তারিখ
            </button>
            <button
              onClick={exportToExcel}
              className="px-2 py-1 bg-[#107c41] text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet size={12} /> Excel
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="নাম, কোম্পানি বা উদ্দেশ্য দিয়ে খুঁজুন..."
            className="w-full bg-stone-50 border border-stone-300 rounded p-2 text-xs outline-none"
          />
        </div>

        {/* Clean, Scannable Visitor Cards */}
        <div className="space-y-2.5">
          {historyVisitors.map((v, idx) => {
            const isInside = !v.out_time || v.status === 'Inside';
            return (
              <div 
                key={v.id || idx}
                className={`p-3 rounded border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  isInside ? 'bg-amber-50/40 border-amber-300' : 'bg-white border-stone-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-stone-500 text-xs">
                      #{v.sl || idx + 1}
                    </span>
                    <strong className="text-sky-950 text-sm">{v.company_name}</strong>
                    {v.visitor_name && (
                      <span className="text-xs text-stone-600 font-medium">({v.visitor_name})</span>
                    )}
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isInside ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-600'
                    }`}>
                      {isInside ? 'ভিতরে আছেন' : 'প্রস্থান'}
                    </span>
                  </div>

                  <div className="text-xs text-stone-600 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>সাক্ষাৎ: <strong className="text-amber-950">{v.who_meet}</strong></span>
                    <span>উদ্দেশ্য: {v.purpose}</span>
                    <span className="font-mono text-emerald-800 font-bold">ইন: {v.in_time}</span>
                    {v.out_time && (
                      <span className="font-mono text-rose-800 font-bold">আউট: {v.out_time}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-center">
                  {isInside && (
                    <button
                      onClick={() => handleQuickCheckout(v)}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black rounded cursor-pointer"
                    >
                      আউট দিন
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setEditingRecord({ ...v });
                      setShowEditModal(true);
                    }}
                    className="p-1.5 text-stone-500 hover:bg-stone-200 rounded cursor-pointer"
                    title="ইডিট"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => v.id && handleDelete(v.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                    title="ডিলিট"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {historyVisitors.length === 0 && (
            <div className="text-center py-6 text-stone-400 italic text-xs">
              কোনো রেকর্ড পাওয়া যায়নি।
            </div>
          )}
        </div>
      </div>

      {/* =========================================================================
          🔥 SECTION 4: FOOTER A JUST EKTA BUTTON (ফুটার এ শুধু একটা বাটন)
          চাপ দিলেই Today total visitor summary সবসময় আসবে এবং WhatsApp এ পাঠাবে!
          ========================================================================= */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-emerald-500 p-3 shadow-2xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="hidden sm:block text-xs">
            <div className="font-black text-stone-900">
              আজকের ভিজিটর সামারি ({todayDateStr}): মোট {todayAllVisitors.length} জন
            </div>
            <div className="text-[10px] text-stone-500">
              এডমিন WhatsApp: <strong>{adminWhatsAppNumber}</strong>
            </div>
          </div>

          {/* THE SINGLE BIG BUTTON REQUESTED BY USER */}
          <button
            onClick={handleSendTodayWhatsAppSummary}
            className="w-full sm:w-auto flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm md:text-base rounded-md shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform"
          >
            <MessageCircle size={22} className="shrink-0" />
            <span>আজকের সম্পূর্ণ ভিজিটর রিপোর্ট WhatsApp এ পাঠান</span>
          </button>
        </div>
      </div>

      {/* ================= MODAL: EDIT VISITOR ================= */}
      {showEditModal && editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-lg overflow-hidden">
            <div className="bg-stone-900 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Edit2 size={15} className="text-amber-400" />
                ভিজিটর তথ্য সংশোধন
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-stone-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateRecord} className="p-4 space-y-3 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">কোম্পানির নাম *</label>
                  <input
                    type="text"
                    value={editingRecord.company_name}
                    onChange={e => setEditingRecord({ ...editingRecord, company_name: e.target.value })}
                    required
                    className="w-full border border-stone-300 p-2 rounded text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">ভিজিটরের নাম</label>
                  <input
                    type="text"
                    value={editingRecord.visitor_name || ''}
                    onChange={e => setEditingRecord({ ...editingRecord, visitor_name: e.target.value })}
                    className="w-full border border-stone-300 p-2 rounded text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">কার সাথে দেখা *</label>
                <input
                  type="text"
                  value={editingRecord.who_meet}
                  onChange={e => setEditingRecord({ ...editingRecord, who_meet: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-bold text-amber-950"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">উদ্দেশ্য *</label>
                <input
                  type="text"
                  value={editingRecord.purpose}
                  onChange={e => setEditingRecord({ ...editingRecord, purpose: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">In Time</label>
                  <input
                    type="text"
                    value={editingRecord.in_time}
                    onChange={e => setEditingRecord({ ...editingRecord, in_time: e.target.value })}
                    required
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">Out Time</label>
                  <input
                    type="text"
                    value={editingRecord.out_time || ''}
                    onChange={e => setEditingRecord({ ...editingRecord, out_time: e.target.value })}
                    placeholder="বের হওয়ার সময়"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-rose-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-black text-white font-bold rounded cursor-pointer"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: SETTINGS (ONLY WHATSAPP) ================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-md overflow-hidden">
            <div className="bg-stone-900 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <MessageCircle size={15} className="text-emerald-400" />
                WhatsApp সেটিংস
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-stone-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveSettings(operatorIdentity, adminWhatsAppNumber);
              }}
              className="p-4 space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-[11px] font-bold text-stone-900 mb-1">
                  এডমিনের WhatsApp মোবাইল নম্বর:
                </label>
                <p className="text-[10px] text-stone-500 mb-1.5">
                  যে নম্বরে দিন শেষের একীভূত রিপোর্ট যাবে (যেমন: 01711000000)
                </p>
                <input
                  type="text"
                  value={adminWhatsAppNumber}
                  onChange={e => setAdminWhatsAppNumber(e.target.value)}
                  required
                  placeholder="01711000000"
                  className="w-full border-2 border-emerald-400 p-2.5 rounded text-sm font-mono font-bold text-emerald-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-900 mb-1">
                  প্রেরকের পরিচয় / অপারেটরের নাম (ঐচ্ছিক):
                </label>
                <input
                  type="text"
                  value={operatorIdentity}
                  onChange={e => setOperatorIdentity(e.target.value)}
                  placeholder="Gate 1 Security"
                  className="w-full border border-stone-300 p-2 rounded text-xs outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={14} />
                  সেভ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
