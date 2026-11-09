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
  Copy,
  Users,
  ShieldCheck,
  Ban,
  ChevronDown
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
  total_persons?: number;
  status: 'Inside' | 'Not Permitted' | 'Checked Out';
  remarks?: string;
  created_at?: string;
}

interface BatchVisitorRow {
  visitor_name: string;
  company_name: string;
  who_meet: string;
  purpose: string;
  phone_number: string;
  total_persons: number;
  id_card_no: string;
  in_time: string;
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

const formatWhatsAppPhone = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '88' + clean;
  }
  return clean;
};

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
  const [checkoutModalRecord, setCheckoutModalRecord] = useState<VisitorRecord | null>(null);
  const [checkoutTimeInput, setCheckoutTimeInput] = useState<string>('');

  // Operator Identity & WhatsApp
  const [operatorIdentity, setOperatorIdentity] = useState<string>(() => {
    return localStorage.getItem('saved_operator_user_email') || 'Gate Security';
  });
  const [adminWhatsAppNumber, setAdminWhatsAppNumber] = useState<string>(() => {
    return localStorage.getItem('admin_whatsapp_number') || '017mattakin@gmail.com';
  });

  // Batch Multi-Entry Form State (একসাথে একাধিক এন্ট্রি)
  const [batchRows, setBatchRows] = useState<BatchVisitorRow[]>([
    {
      visitor_name: '',
      company_name: '',
      who_meet: '',
      purpose: 'অফিসিয়াল মিটিং',
      phone_number: '',
      total_persons: 1,
      id_card_no: '',
      in_time: formatCurrentTime()
    }
  ]);
  const [entryDate, setEntryDate] = useState<string>(getTodayString());
  const [entryInTime, setEntryInTime] = useState<string>(formatCurrentTime());
  const [liveClock, setLiveClock] = useState<string>(formatCurrentTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(formatCurrentTime());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Employee search modal / dropdown state for phone-friendly popup
  const [activeRowIndexForStaff, setActiveRowIndexForStaff] = useState<number | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');

  const [editingRecord, setEditingRecord] = useState<VisitorRecord | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    fetchVisitors();
  }, []);

  const handleSaveSettings = (opId: string, waNum: string) => {
    setOperatorIdentity(opId);
    setAdminWhatsAppNumber(waNum);
    localStorage.setItem('saved_operator_user_email', opId);
    localStorage.setItem('admin_whatsapp_number', waNum);
    setActionMessage({ type: 'success', text: 'WhatsApp নম্বর সফলভাবে সেভ হয়েছে।' });
    setShowSettingsModal(false);
    setTimeout(() => setActionMessage(null), 3000);
  };

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
          total_persons: Number(v.total_persons) || 1,
          status: v.status || (v.out_time ? 'Checked Out' : 'Inside'),
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

  // Add row to batch entry
  const handleAddBatchRow = () => {
    const lastRow = batchRows[batchRows.length - 1];
    setBatchRows([
      ...batchRows,
      {
        visitor_name: '',
        company_name: lastRow?.company_name || '', // Carry over company for convenience
        who_meet: lastRow?.who_meet || '',         // Carry over who to meet
        purpose: lastRow?.purpose || 'অফিসিয়াল মিটিং',
        phone_number: '',
        total_persons: 1,
        id_card_no: '',
        in_time: formatCurrentTime()
      }
    ]);
  };

  const handleRemoveBatchRow = (index: number) => {
    if (batchRows.length === 1) {
      alert('কমপক্ষে একটি এন্ট্রি রো থাকতে হবে।');
      return;
    }
    setBatchRows(batchRows.filter((_, i) => i !== index));
  };

  // Save All Batch Entries at Once (একসাথে সেভ)
  const handleSaveAllBatchEntries = async (e: React.FormEvent) => {
    e.preventDefault();
    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      if (!row.company_name?.trim() || !row.who_meet?.trim() || !row.purpose?.trim()) {
        alert(`এন্ট্রি #${i + 1}-এ কোম্পানির নাম, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।`);
        return;
      }
    }

    const targetDate = entryDate || getTodayString();
    const dateRecords = visitors.filter(v => v.date === targetDate);
    let nextSl = dateRecords.length > 0 ? Math.max(...dateRecords.map(r => r.sl)) + 1 : 1;

    const newRecordsToInsert: VisitorRecord[] = [];
    const dbPayloads: any[] = [];

    batchRows.forEach((row) => {
      const rec: VisitorRecord = {
        id: `v_${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${nextSl}`,
        sl: nextSl++,
        date: targetDate,
        visitor_name: row.visitor_name.trim(),
        company_name: row.company_name.trim(),
        who_meet: row.who_meet.trim(),
        purpose: row.purpose.trim(),
        in_time: row.in_time || formatCurrentTime(),
        out_time: '',
        phone_number: row.phone_number.trim(),
        id_card_no: row.id_card_no.trim(),
        total_persons: Number(row.total_persons) || 1,
        status: 'Inside',
        created_at: new Date().toISOString()
      };
      newRecordsToInsert.push(rec);
      dbPayloads.push({
        sl: rec.sl,
        date: rec.date,
        visitor_name: rec.visitor_name,
        company_name: rec.company_name,
        who_meet: rec.who_meet,
        purpose: rec.purpose,
        in_time: rec.in_time,
        out_time: null,
        phone_number: rec.phone_number,
        id_card_no: rec.id_card_no,
        total_persons: rec.total_persons,
        status: 'Inside'
      });
    });

    try {
      const { data, error } = await supabase.from('visitors').insert(dbPayloads).select();
      if (!error && data) {
        data.forEach((d: any, idx: number) => {
          if (newRecordsToInsert[idx]) {
            newRecordsToInsert[idx].id = d.id;
          }
        });
      }
    } catch (err) {
      console.warn('Supabase batch insert fallback:', err);
    }

    const updated = [...newRecordsToInsert, ...visitors];
    setVisitors(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    // Reset batch form to 1 clean row
    setBatchRows([{
      visitor_name: '',
      company_name: '',
      who_meet: '',
      purpose: 'অফিসিয়াল মিটিং',
      phone_number: '',
      total_persons: 1,
      id_card_no: '',
      in_time: formatCurrentTime()
    }]);
    setEntryInTime(formatCurrentTime());

    setActionMessage({ 
      type: 'success', 
      text: `✅ সফলভাবে ${newRecordsToInsert.length}টি ভিজিটর এন্ট্রি একসাথে সংরক্ষিত হয়েছে!` 
    });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Duplicate an existing record into the batch form
  const handleDuplicateRecord = (record: VisitorRecord) => {
    setBatchRows([
      {
        company_name: record.company_name || '',
        visitor_name: '',
        who_meet: record.who_meet || '',
        purpose: record.purpose || '',
        phone_number: record.phone_number || '',
        total_persons: record.total_persons || 1,
        id_card_no: record.id_card_no || '',
        in_time: formatCurrentTime()
      }
    ]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setActionMessage({ type: 'info', text: `📋 ${record.company_name} এর তথ্য কপি করা হয়েছে। নতুন ভিজিটরের নাম বসিয়ে সেভ করুন।` });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Open Checkout Modal
  const handleOpenCheckoutModal = (record: VisitorRecord) => {
    setCheckoutModalRecord(record);
    setCheckoutTimeInput(formatCurrentTime());
  };

  // Confirm Checkout with Popup Time
  const handleConfirmCheckout = async () => {
    if (!checkoutModalRecord) return;
    const exitTime = checkoutTimeInput || formatCurrentTime();
    const updatedRecord: VisitorRecord = {
      ...checkoutModalRecord,
      status: 'Checked Out',
      out_time: exitTime
    };

    try {
      if (typeof checkoutModalRecord.id === 'number') {
        await supabase.from('visitors').update({
          status: 'Checked Out',
          out_time: exitTime
        }).eq('id', checkoutModalRecord.id);
      }
    } catch (err) {
      console.warn('Supabase checkout error:', err);
    }

    const updatedList = visitors.map(v => v.id === checkoutModalRecord.id ? updatedRecord : v);
    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    setCheckoutModalRecord(null);
    setActionMessage({ type: 'success', text: `🚪 ${checkoutModalRecord.company_name} এর প্রস্থান সময় (${exitTime}) সফলভাবে রেকর্ড হয়েছে।` });
    setTimeout(() => setActionMessage(null), 3500);
  };

  // Change status (Inside / Not Permitted / Visit Complete)
  const handleUpdateStatus = async (record: VisitorRecord, newStatus: 'Inside' | 'Not Permitted' | 'Checked Out') => {
    if (newStatus === 'Checked Out') {
      handleOpenCheckoutModal(record);
      return;
    }

    const updatedRecord: VisitorRecord = {
      ...record,
      status: newStatus
    };

    try {
      if (typeof record.id === 'number') {
        await supabase.from('visitors').update({
          status: newStatus
        }).eq('id', record.id);
      }
    } catch (err) {
      console.warn('Supabase status update error:', err);
    }

    const updatedList = visitors.map(v => v.id === record.id ? updatedRecord : v);
    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    setActionMessage({ type: 'success', text: `স্ট্যাটাস আপডেট হয়েছে!` });
    setTimeout(() => setActionMessage(null), 3000);
  };

  // Update existing record from edit modal
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
          total_persons: editingRecord.total_persons || 1,
          status: editingRecord.status,
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
  // ⚡ EXACT WHATSAPP REPORT FORMAT
  // =========================================================================
  const handleSendTodayWhatsAppSummary = () => {
    const todayStr = getTodayString();
    const todayRecords = visitors.filter(v => v.date === todayStr);

    if (todayRecords.length === 0) {
      alert(`আজকের (${todayStr}) তারিখে এখনো কোনো ভিজিটর এন্ট্রি করা হয়নি।`);
      return;
    }

    const insideCount = todayRecords.filter(v => v.status === 'Inside' || (!v.out_time && v.status !== 'Not Permitted')).length;
    const outCount = todayRecords.filter(v => v.status === 'Checked Out' || v.status === 'Not Permitted').length;

    const sorted = [...todayRecords].sort((a, b) => a.sl - b.sl);

    const listLines = sorted.map((v, i) => {
      const companionText = (v.total_persons && v.total_persons > 1) ? ` (সাথে আরও ${v.total_persons - 1} জন)` : '';
      const nameStr = v.visitor_name ? `NAME : ${v.visitor_name}${companionText}` : `NAME : Visitor${companionText}`;
      
      const statusText = 
        v.status === 'Inside' ? 'ভিতরে প্রবেশের অনুমতি চাচ্ছে 🔴' :
        v.status === 'Not Permitted' ? 'NOT PERMITTED (অনুমতি নেই) ❌' : 'VISIT COMPLETE (ভিজিট সম্পন্ন) 🟢';

      const statusEnum = 
        v.status === 'Inside' ? 'ENTER PERMISSION' :
        v.status === 'Not Permitted' ? 'NOT PERMITTED' : 'VISIT COMPLETE';

      return (
`${i + 1}. COMPANY NAME : ${v.company_name}
${nameStr}
সাক্ষাৎ: ${v.who_meet}
 ইন: ${v.in_time} | ${statusText}
 উদ্দেশ্য: ${v.purpose}
STATUS : ${statusEnum}`
      );
    });

    const summaryText = 
`📋 WINDY GROUP - আজকের সম্পূর্ণ ভিজিটর রিপোর্ট
📅 তারিখ: ${todayStr}
📊 মোট ভিজিটর: ${todayRecords.length} জন
🔴 ভিতরে আছেন: ${insideCount} জন
🟢 প্রস্থান সম্পন্ন / অন্যান্য: ${outCount} জন
━━━━━━━━━━━━━━━━━━
${listLines.join('\n\n')}
━━━━━━━━━━━━━━━━━━
👤 প্রেরক: ${operatorIdentity}`;

    const cleanPhone = formatWhatsAppPhone(adminWhatsAppNumber);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(summaryText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
    
    window.open(waUrl, '_blank');
  };

  const todayDateStr = getTodayString();
  const todayAllVisitors = visitors.filter(v => v.date === (selectedDate || todayDateStr));
  const currentlyInsideVisitors = visitors.filter(v => v.status === 'Inside' || (!v.out_time && v.status !== 'Not Permitted' && v.status !== 'Checked Out'));

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

  const exportToExcel = () => {
    const headers = ['SL', 'Date', 'Company Name', 'Visitor Name', 'Phone', 'Who Meet', 'Purpose', 'In Time', 'Out Time', 'Persons', 'Status'];
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
      v.total_persons || 1,
      v.status
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
            একসাথে একাধিক এন্ট্রি (+ বাটন) &bull; এমপ্লয়ী পপআপ সিলেক্টর &bull; আউট টাইম পপআপ
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300 text-xs font-bold cursor-pointer"
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

      {/* Live Digital Clock Banner */}
      <div className="bg-stone-900 text-stone-100 p-3.5 rounded-lg mb-6 flex items-center justify-between shadow-md border border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Clock className="animate-pulse" size={24} />
          </div>
          <div>
            <div className="text-[10px] text-stone-400 uppercase tracking-widest font-mono font-bold">লাইভ গেট ঘড়ি (Live Clock)</div>
            <div className="text-xl sm:text-2xl font-mono font-black text-amber-400 tracking-tight">{liveClock}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">তারিখ</div>
          <div className="text-xs sm:text-sm font-bold text-white font-mono">{entryDate || getTodayString()}</div>
        </div>
      </div>

      {/* =========================================================================
          🔥 SECTION 1: বর্তমানে ভিতরে আছেন (CURRENTLY INSIDE)
          ========================================================================= */}
      <div className="bg-white border-2 border-rose-400 rounded-md shadow-sm p-3 sm:p-4 mb-5">
        <div className="flex items-center justify-between border-b border-rose-100 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping"></span>
            <h3 className="text-sm font-black text-rose-950 uppercase tracking-wide">
              বর্তমানে ভিতরে আছেন / অনুমতিপ্রার্থী ({currentlyInsideVisitors.length} জন)
            </h3>
          </div>
          <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded">
            ENTER PERMISSION
          </span>
        </div>

        {currentlyInsideVisitors.length === 0 ? (
          <div className="py-5 text-center text-emerald-700 font-bold text-xs flex items-center justify-center gap-2 bg-emerald-50/50 rounded border border-emerald-200">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>বর্তমানে কোনো ভিজিটর ভিতরে নেই।</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentlyInsideVisitors.map((v) => (
              <div 
                key={v.id} 
                className="bg-rose-50/40 border border-rose-200 rounded p-3 flex flex-col justify-between shadow-xs"
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
                      {v.total_persons && v.total_persons > 1 && (
                        <span className="text-[10px] bg-amber-200 text-amber-950 px-1 rounded font-bold">
                          (+{v.total_persons - 1} জন)
                        </span>
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
                  </div>
                </div>

                {/* Status Update & Duplicate Buttons */}
                <div className="mt-3 pt-2 border-t border-rose-100 flex items-center justify-between gap-1.5">
                  <button
                    onClick={() => handleUpdateStatus(v, 'Not Permitted')}
                    className="px-2 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Ban size={12} className="text-red-600" />
                    <span>NOT PERMITTED</span>
                  </button>

                  <button
                    onClick={() => handleDuplicateRecord(v)}
                    className="px-2 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={12} />
                    <span>ডুপ্লিকেট</span>
                  </button>

                  <button
                    onClick={() => handleOpenCheckoutModal(v)}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black rounded flex items-center gap-1 cursor-pointer shadow-xs"
                    title="আউট টাইম দিয়ে প্রস্থান নিশ্চিত করুন"
                  >
                    <LogOut size={12} />
                    <span>আউট দিন</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border-2 border-amber-400 rounded-lg shadow-md p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-stone-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-amber-100 text-amber-800 flex items-center justify-center font-black">
              <Plus size={20} />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wide text-stone-900">
                নতুন ভিজিটর এন্ট্রি টেবিল ফরম (Table View - পৃথক ইন টাইম)
              </h3>
              <p className="text-[11px] text-stone-500">
                প্রতিটি ভিজিটরের জন্য আলাদা ইন টাইম দিন এবং প্রয়োজনে (+) বাটন দিয়ে নতুন রো যোগ করুন।
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-bold text-stone-700">তারিখ:</label>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              className="bg-stone-50 border border-stone-300 rounded p-1.5 text-xs font-bold"
            />
          </div>
        </div>

        <form onSubmit={handleSaveAllBatchEntries} className="space-y-4">
          {/* Mobile View: Vertical Card Stack for Mobile Friendly Entry */}
          <div className="block md:hidden space-y-4">
            {batchRows.map((row, index) => (
              <div key={index} className="bg-stone-50 border-2 border-stone-200 rounded-lg p-3.5 space-y-3 shadow-xs relative">
                <div className="flex justify-between items-center pb-2 border-b border-stone-200">
                  <span className="text-xs font-black text-amber-950 bg-amber-200 px-2.5 py-0.5 rounded-full">
                    এন্ট্রি #{index + 1}
                  </span>
                  {batchRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBatchRow(index)}
                      className="text-red-600 bg-red-50 hover:bg-red-100 text-xs font-bold px-2 py-1 rounded border border-red-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} /> বাদ দিন
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">কোম্পানির নাম *</label>
                  <input
                    type="text"
                    value={row.company_name || ''}
                    onChange={e => {
                      const updated = [...batchRows];
                      updated[index].company_name = e.target.value;
                      setBatchRows(updated);
                    }}
                    placeholder="কোম্পানি বা প্রতিষ্ঠানের নাম..."
                    required
                    className="w-full bg-white border border-stone-300 p-2.5 rounded text-xs font-bold text-sky-950 outline-none"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">ভিজিটরের নাম</label>
                    <input
                      type="text"
                      value={row.visitor_name || ''}
                      onChange={e => {
                        const updated = [...batchRows];
                        updated[index].visitor_name = e.target.value;
                        setBatchRows(updated);
                      }}
                      placeholder="নাম..."
                      className="w-full bg-white border border-stone-300 p-2.5 rounded text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">লোক সংখ্যা</label>
                    <input
                      type="number"
                      min="1"
                      value={row.total_persons || 1}
                      onChange={e => {
                        const updated = [...batchRows];
                        updated[index].total_persons = parseInt(e.target.value, 10) || 1;
                        setBatchRows(updated);
                      }}
                      className="w-full bg-white border border-stone-300 p-2.5 rounded text-xs font-mono font-bold text-center outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">কার সাথে দেখা *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={row.who_meet || ''}
                      onChange={e => {
                        const updated = [...batchRows];
                        updated[index].who_meet = e.target.value;
                        setBatchRows(updated);
                      }}
                      placeholder="অফিসারের নাম..."
                      required
                      className="flex-1 bg-white border border-stone-300 p-2.5 rounded text-xs font-bold text-amber-950 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setActiveRowIndexForStaff(index)}
                      className="bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 rounded text-xs font-bold cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <span>🔍 লিস্ট</span>
                    </button>
                  </div>
                </div>

                {/* 4. Purpose (উদ্দেশ্য) - বড় ঘর */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[11px] font-bold text-stone-800 uppercase">
                      উদ্দেশ্য * <span className="text-[10px] text-amber-700 font-bold">(বড় ঘর)</span>
                    </label>
                    <span className="text-[10px] text-stone-400">বিস্তারিত লিখুন</span>
                  </div>
                  <input
                    type="text"
                    value={row.purpose || ''}
                    onChange={e => {
                      const updated = [...batchRows];
                      updated[index].purpose = e.target.value;
                      setBatchRows(updated);
                    }}
                    placeholder="সাক্ষাতের বিস্তারিত উদ্দেশ্য লিখুন..."
                    required
                    className="w-full bg-white border-2 border-stone-300 focus:border-amber-500 p-3 rounded-md text-xs sm:text-sm font-medium outline-none shadow-xs"
                  />
                  {/* Quick Purpose Shortcut Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_PURPOSES.map(qp => (
                      <button
                        key={qp}
                        type="button"
                        onClick={() => {
                          const updated = [...batchRows];
                          updated[index].purpose = qp;
                          setBatchRows(updated);
                        }}
                        className="text-[10px] bg-white border border-stone-300 hover:bg-amber-100 hover:border-amber-400 text-stone-700 px-2 py-1 rounded cursor-pointer font-medium transition-colors"
                      >
                        {qp}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 5. In Time */}
                <div>
                  <label className="block text-[11px] font-bold text-stone-800 uppercase mb-1">ইন টাইম *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={row.in_time || ''}
                      onChange={e => {
                        const updated = [...batchRows];
                        updated[index].in_time = e.target.value;
                        setBatchRows(updated);
                      }}
                      placeholder="11:14 AM"
                      required
                      className="flex-1 bg-white border border-stone-300 p-2.5 rounded text-xs font-mono font-bold text-emerald-800 text-center outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const updated = [...batchRows];
                        updated[index].in_time = formatCurrentTime();
                        setBatchRows(updated);
                      }}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white px-3 py-2 rounded text-xs font-bold cursor-pointer shrink-0"
                      title="বর্তমান সময় বসান"
                    >
                      ⏰ এখন
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View: Table Layout */}
          <div className="hidden md:block overflow-x-auto border border-stone-300 rounded-md shadow-xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-900 text-white font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-2.5 text-center w-12">#</th>
                  <th className="p-2.5">কোম্পানির নাম *</th>
                  <th className="p-2.5">ভিজিটর নাম ও লোক</th>
                  <th className="p-2.5">কার সাথে দেখা *</th>
                  <th className="p-2.5 min-w-[260px]">উদ্দেশ্য * (বড় ঘর)</th>
                  <th className="p-2.5 w-36">ইন টাইম (আলাদা) *</th>
                  <th className="p-2.5 text-center w-16">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 bg-white">
                {batchRows.map((row, index) => (
                  <tr key={index} className="hover:bg-amber-50/40 transition-colors">
                    <td className="p-2.5 text-center font-bold text-stone-500 font-mono">
                      {index + 1}
                    </td>
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={row.company_name || ''}
                        onChange={e => {
                          const updated = [...batchRows];
                          updated[index].company_name = e.target.value;
                          setBatchRows(updated);
                        }}
                        placeholder="কোম্পানি নাম..."
                        required
                        className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-xs font-bold text-sky-950 outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={row.visitor_name || ''}
                          onChange={e => {
                            const updated = [...batchRows];
                            updated[index].visitor_name = e.target.value;
                            setBatchRows(updated);
                          }}
                          placeholder="নাম"
                          className="flex-1 bg-stone-50 border border-stone-300 p-2 rounded text-xs outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <input
                          type="number"
                          min="1"
                          value={row.total_persons || 1}
                          onChange={e => {
                            const updated = [...batchRows];
                            updated[index].total_persons = parseInt(e.target.value, 10) || 1;
                            setBatchRows(updated);
                          }}
                          title="লোক সংখ্যা"
                          className="w-14 bg-stone-50 border border-stone-300 p-2 rounded text-xs font-mono font-bold text-center outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={row.who_meet || ''}
                          onChange={e => {
                            const updated = [...batchRows];
                            updated[index].who_meet = e.target.value;
                            setBatchRows(updated);
                          }}
                          placeholder="কার সাথে দেখা..."
                          required
                          className="flex-1 bg-stone-50 border border-stone-300 p-2 rounded text-xs font-bold text-amber-950 outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => setActiveRowIndexForStaff(index)}
                          className="bg-stone-800 hover:bg-stone-900 text-white px-2.5 py-1.5 rounded text-[10px] font-bold cursor-pointer shrink-0"
                          title="এমপ্লয়ী লিস্ট"
                        >
                          🔍 লিস্ট
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 min-w-[260px]">
                      <input
                        type="text"
                        value={row.purpose || ''}
                        onChange={e => {
                          const updated = [...batchRows];
                          updated[index].purpose = e.target.value;
                          setBatchRows(updated);
                        }}
                        placeholder="সাক্ষাতের বিস্তারিত উদ্দেশ্য লিখুন..."
                        required
                        className="w-full bg-stone-50 border border-stone-300 p-2.5 rounded text-xs outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                      />
                    </td>
                    <td className="p-2.5">
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={row.in_time || ''}
                          onChange={e => {
                            const updated = [...batchRows];
                            updated[index].in_time = e.target.value;
                            setBatchRows(updated);
                          }}
                          placeholder="11:14 AM"
                          required
                          className="flex-1 bg-stone-50 border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800 text-center outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...batchRows];
                            updated[index].in_time = formatCurrentTime();
                            setBatchRows(updated);
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white px-2 py-1.5 rounded text-[10px] font-bold cursor-pointer shrink-0"
                          title="বর্তমান সময় বসান"
                        >
                          ⏰
                        </button>
                      </div>
                    </td>
                    <td className="p-2.5 text-center">
                      {batchRows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveBatchRow(index)}
                          className="p-1.5 text-red-600 hover:bg-red-100 rounded cursor-pointer"
                          title="রো ডিলিট করুন"
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : (
                        <span className="text-stone-300">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add More & Save Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleAddBatchRow}
              className="w-full sm:w-auto py-3 px-5 bg-stone-200 hover:bg-stone-300 text-stone-900 font-bold text-xs rounded-md shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Plus size={18} className="text-amber-700" />
              <span>+ আরেকটি রো যোগ করুন (Add Row)</span>
            </button>

            <button
              type="submit"
              className="w-full sm:w-auto py-3.5 px-10 bg-amber-500 hover:bg-amber-600 active:scale-98 text-stone-950 font-black text-sm rounded-md shadow-md flex items-center justify-center gap-2 cursor-pointer transition-transform"
            >
              <CheckCircle2 size={20} />
              <span>সবগুলো এন্ট্রি একসাথে সেভ করুন ({batchRows.length} টি)</span>
            </button>
          </div>
        </form>
      </div>

      {/* =========================================================================
          📋 SECTION 3: ALL VISITORS LOG & HISTORY
          ========================================================================= */}
      <div className="bg-white border border-stone-300 rounded-md shadow-xs p-3.5 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-2 border-b border-stone-200">
          <h4 className="text-xs font-black uppercase text-stone-900">
            সকল ভিজিটর রেকর্ড ({historyVisitors.length} টি)
          </h4>

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
              সব
            </button>
            <button
              onClick={exportToExcel}
              className="px-2 py-1 bg-[#107c41] text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <FileSpreadsheet size={12} /> Excel
            </button>
          </div>
        </div>

        <div className="mb-3">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="কোম্পানি, নাম বা উদ্দেশ্য দিয়ে খুঁজুন..."
            className="w-full bg-stone-50 border border-stone-300 rounded p-2 text-xs outline-none"
          />
        </div>

        <div className="space-y-2.5">
          {historyVisitors.map((v, idx) => {
            const statusLabel = 
              v.status === 'Inside' ? 'ENTER PERMISSION 🔴' :
              v.status === 'Not Permitted' ? 'NOT PERMITTED ❌' : 'VISIT COMPLETE 🟢';

            return (
              <div 
                key={v.id || idx}
                className="p-3 rounded border border-stone-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-stone-500 text-xs">
                      #{v.sl || idx + 1}
                    </span>
                    <strong className="text-sky-950 text-sm">{v.company_name}</strong>
                    {v.visitor_name && (
                      <span className="text-xs text-stone-700 font-bold">
                        ({v.visitor_name} {v.total_persons && v.total_persons > 1 ? `+${v.total_persons - 1} জন` : ''})
                      </span>
                    )}
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                      v.status === 'Inside' ? 'bg-rose-100 text-rose-900' :
                      v.status === 'Not Permitted' ? 'bg-stone-200 text-stone-800' : 'bg-emerald-100 text-emerald-900'
                    }`}>
                      {statusLabel}
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
                  <button
                    onClick={() => handleDuplicateRecord(v)}
                    className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] font-bold rounded flex items-center gap-1 cursor-pointer"
                    title="ডুপ্লিকেট"
                  >
                    <Copy size={12} />
                    <span>ডুপ্লিকেট</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingRecord({ ...v });
                      setShowEditModal(true);
                    }}
                    className="p-1.5 text-stone-500 hover:bg-stone-200 rounded cursor-pointer"
                  >
                    <Edit2 size={14} />
                  </button>

                  <button
                    onClick={() => v.id && handleDelete(v.id)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer"
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
          🔥 SECTION 4: FOOTER WHATSAPP SUMMARY BUTTON
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

          <button
            onClick={handleSendTodayWhatsAppSummary}
            className="w-full sm:w-auto flex-1 py-3.5 px-6 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-sm md:text-base rounded-md shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform"
          >
            <MessageCircle size={22} className="shrink-0" />
            <span>আজকের সম্পূর্ণ ভিজিটর রিপোর্ট WhatsApp এ পাঠান</span>
          </button>
        </div>
      </div>

      {/* ================= MODAL: EMPLOYEE SELECTOR POPUP FOR 'WHO MEET' ================= */}
      {activeRowIndexForStaff !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-amber-400" />
                কর্মকর্তা নির্বাচন করুন (Who Meet)
              </h3>
              <button onClick={() => setActiveRowIndexForStaff(null)} className="text-stone-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <input
                type="text"
                value={staffSearchQuery}
                onChange={e => setStaffSearchQuery(e.target.value)}
                placeholder="নাম বা পদবি দিয়ে খুঁজুন..."
                className="w-full bg-stone-50 border border-stone-300 p-2 rounded outline-none"
                autoFocus
              />

              <div className="max-h-64 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded">
                {employees
                  .filter(emp => {
                    const q = staffSearchQuery.toLowerCase();
                    return !q || emp.name.toLowerCase().includes(q) || (emp.designation || '').toLowerCase().includes(q) || String(emp.id).includes(q);
                  })
                  .map(emp => {
                    const empLabel = `${emp.name} (${emp.designation || emp.id})`;
                    return (
                      <div
                        key={emp.id}
                        onClick={() => {
                          const updated = [...batchRows];
                          updated[activeRowIndexForStaff].who_meet = empLabel;
                          setBatchRows(updated);
                          setActiveRowIndexForStaff(null);
                          setStaffSearchQuery('');
                        }}
                        className="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center"
                      >
                        <div>
                          <div className="font-bold text-stone-900">{emp.name}</div>
                          <div className="text-[10px] text-stone-500">ID: {emp.id} • {emp.designation || 'Staff'}</div>
                        </div>
                        <span className="text-[10px] bg-stone-200 text-stone-700 px-2 py-0.5 rounded font-bold">সিলেক্ট</span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex justify-end pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setActiveRowIndexForStaff(null)}
                  className="px-4 py-2 bg-stone-200 hover:bg-stone-300 font-bold rounded"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CHECKOUT TIME POPUP (আউট টাইম পপআপ) ================= */}
      {checkoutModalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-rose-700 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <LogOut size={16} />
                প্রস্থান নিশ্চিত করুন (Checkout)
              </h3>
              <button onClick={() => setCheckoutModalRecord(null)} className="text-rose-200 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="bg-stone-50 p-2.5 rounded border border-stone-200 space-y-1">
                <div>🏢 <strong>কোম্পানি:</strong> {checkoutModalRecord.company_name}</div>
                <div>👤 <strong>ভিজিটর:</strong> {checkoutModalRecord.visitor_name || 'Visitor'}</div>
                <div>⏰ <strong>প্রবেশের সময় (In):</strong> {checkoutModalRecord.in_time}</div>
              </div>

              <div>
                <label className="block font-bold text-stone-800 uppercase mb-1">
                  বের হওয়ার সময় (Out Time):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={checkoutTimeInput}
                    onChange={e => setCheckoutTimeInput(e.target.value)}
                    required
                    className="flex-1 border-2 border-rose-400 p-2 rounded text-sm font-mono font-bold text-rose-800 outline-none"
                    placeholder="12:30 PM"
                  />
                  <button
                    type="button"
                    onClick={() => setCheckoutTimeInput(formatCurrentTime())}
                    className="px-3 bg-stone-200 hover:bg-stone-300 font-bold text-stone-800 rounded text-xs cursor-pointer"
                  >
                    এখন আউট দিন
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setCheckoutModalRecord(null)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCheckout}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded cursor-pointer shadow-sm"
                >
                  প্রস্থান কনফার্ম করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    value={editingRecord.company_name || ''}
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

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">সাথে মোট লোক সংখ্যা</label>
                  <input
                    type="number"
                    min="1"
                    value={editingRecord.total_persons || 1}
                    onChange={e => setEditingRecord({ ...editingRecord, total_persons: parseInt(e.target.value, 10) || 1 })}
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">স্ট্যাটাস</label>
                  <select
                    value={editingRecord.status || 'Inside'}
                    onChange={(e: any) => setEditingRecord({ ...editingRecord, status: e.target.value })}
                    className="w-full border border-stone-300 p-2 rounded text-xs font-bold"
                  >
                    <option value="Inside">ENTER PERMISSION</option>
                    <option value="Not Permitted">NOT PERMITTED</option>
                    <option value="Checked Out">VISIT COMPLETE</option>
                  </select>
                </div>
              </div>

              {/* In Time & Out Time Editing */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">ইন টাইম (In Time)</label>
                  <input
                    type="text"
                    value={editingRecord.in_time || ''}
                    onChange={e => setEditingRecord({ ...editingRecord, in_time: e.target.value })}
                    placeholder="11:14 AM"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">আউট টাইম (Out Time)</label>
                  <input
                    type="text"
                    value={editingRecord.out_time || ''}
                    onChange={e => setEditingRecord({ ...editingRecord, out_time: e.target.value })}
                    placeholder="02:30 PM"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-rose-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">কার সাথে দেখা *</label>
                <input
                  type="text"
                  value={editingRecord.who_meet || ''}
                  onChange={e => setEditingRecord({ ...editingRecord, who_meet: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-bold text-amber-950"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">উদ্দেশ্য *</label>
                <input
                  type="text"
                  value={editingRecord.purpose || ''}
                  onChange={e => setEditingRecord({ ...editingRecord, purpose: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs"
                />
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

      {/* ================= MODAL: SETTINGS (WHATSAPP) ================= */}
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
                  placeholder="Gate Security"
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
