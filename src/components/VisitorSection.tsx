import React, { useState, useEffect } from 'react';
import { 
  UserCheck, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  Mail, 
  Send, 
  FileSpreadsheet, 
  FileDown, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  Edit2, 
  Trash2, 
  X, 
  Settings, 
  RefreshCw,
  Building,
  User,
  Phone,
  Briefcase,
  ExternalLink,
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
const DEFAULT_EMAIL = '017mattakin@gmail.com';

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

export default function VisitorSection({ employees = [], viewMode }: Props) {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Inside' | 'Checked Out'>('All');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEmailPreviewModal, setShowEmailPreviewModal] = useState(false);
  
  // Form State
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
  
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [sendInstantEmail, setSendInstantEmail] = useState(true);
  const [notificationEmail, setNotificationEmail] = useState(DEFAULT_EMAIL);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [emailPreviewContent, setEmailPreviewContent] = useState<{ subject: string; html: string; recipient: string } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Load Saved Email Recipient from LocalStorage or API
  useEffect(() => {
    const savedEmail = localStorage.getItem('visitor_target_email');
    if (savedEmail) {
      setNotificationEmail(savedEmail);
    }
    fetchEmailConfig();
    fetchVisitors();
  }, []);

  const fetchEmailConfig = async () => {
    try {
      const res = await fetch('/api/email-config');
      if (res.ok) {
        const data = await res.json();
        if (data.defaultRecipient && !localStorage.getItem('visitor_target_email')) {
          setNotificationEmail(data.defaultRecipient);
        }
      }
    } catch (e) {
      console.warn('Could not fetch email config:', e);
    }
  };

  // Fetch visitors from Supabase with localStorage synchronization
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
      console.warn('Supabase visitors table not ready, using local storage:', err);
    }

    if (!loadedFromDb) {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        try {
          const parsed = JSON.parse(local);
          setVisitors(parsed);
        } catch (e) {
          console.error('Error parsing local visitors:', e);
        }
      } else {
        // High fidelity sample demo data for Windy Group
        const sampleRecords: VisitorRecord[] = [
          {
            id: 'sample-1',
            sl: 1,
            date: getTodayString(),
            visitor_name: 'Anisur Rahman',
            company_name: 'Fabrics World Ltd.',
            who_meet: 'MD. GHULAM KEBRIA (AGM)',
            purpose: 'Yarn & Fabric Quality Inspection Meeting',
            in_time: '09:30 AM',
            out_time: '',
            phone_number: '01711-234567',
            id_card_no: 'V-101',
            status: 'Inside',
            remarks: 'Samples handed over'
          },
          {
            id: 'sample-2',
            sl: 2,
            date: getTodayString(),
            visitor_name: 'Kabir Hossain',
            company_name: 'Siemens Energy BD',
            who_meet: 'MD. FARHAD SIKDER',
            purpose: 'Substation Electrical Maintenance Review',
            in_time: '10:15 AM',
            out_time: '12:00 PM',
            phone_number: '01819-876543',
            id_card_no: 'V-102',
            status: 'Checked Out',
            remarks: 'Service complete'
          }
        ];
        setVisitors(sampleRecords);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sampleRecords));
      }
    }
    setLoading(false);
  };

  // Save all visitors helper (saves to Supabase & localStorage)
  const saveVisitorRecord = async (record: Partial<VisitorRecord>, isNew: boolean) => {
    let newRecord: VisitorRecord;

    if (isNew) {
      // Auto-assign SL for this date
      const dateRecords = visitors.filter(v => v.date === record.date);
      const nextSl = dateRecords.length > 0 ? Math.max(...dateRecords.map(r => r.sl)) + 1 : 1;
      
      newRecord = {
        id: record.id || `v_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        sl: record.sl || nextSl,
        date: record.date || getTodayString(),
        visitor_name: record.visitor_name || '',
        company_name: record.company_name || '',
        who_meet: record.who_meet || '',
        purpose: record.purpose || '',
        in_time: record.in_time || formatCurrentTime(),
        out_time: record.out_time || '',
        phone_number: record.phone_number || '',
        id_card_no: record.id_card_no || '',
        status: record.out_time ? 'Checked Out' : 'Inside',
        remarks: record.remarks || '',
        created_at: new Date().toISOString()
      };
    } else {
      newRecord = {
        ...(visitors.find(v => v.id === editingId) as VisitorRecord),
        ...record,
        status: record.out_time ? 'Checked Out' : 'Inside'
      };
    }

    // Try saving to Supabase
    try {
      const dbPayload = {
        sl: newRecord.sl,
        date: newRecord.date,
        visitor_name: newRecord.visitor_name,
        company_name: newRecord.company_name,
        who_meet: newRecord.who_meet,
        purpose: newRecord.purpose,
        in_time: newRecord.in_time,
        out_time: newRecord.out_time || null,
        phone_number: newRecord.phone_number,
        id_card_no: newRecord.id_card_no,
        status: newRecord.status,
        remarks: newRecord.remarks
      };

      if (isNew) {
        const { data, error } = await supabase.from('visitors').insert([dbPayload]).select();
        if (!error && data && data[0]) {
          newRecord.id = data[0].id;
        }
      } else if (newRecord.id && typeof newRecord.id === 'number') {
        await supabase.from('visitors').update(dbPayload).eq('id', newRecord.id);
      }
    } catch (e) {
      console.warn('Supabase write fallback to local storage:', e);
    }

    // Update Local State & LocalStorage
    let updatedList: VisitorRecord[];
    if (isNew) {
      updatedList = [newRecord, ...visitors];
    } else {
      updatedList = visitors.map(v => v.id === newRecord.id ? newRecord : v);
    }

    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    // Instant Email Dispatch if enabled
    if (sendInstantEmail) {
      dispatchNotificationEmail(newRecord, isNew ? 'checkin' : (newRecord.out_time ? 'checkout' : 'update'));
    }

    setActionMessage({
      type: 'success',
      text: isNew 
        ? `ভিজিটর এন্ট্রি সফল! ${sendInstantEmail ? 'তাৎক্ষণিক ইমেইল পাঠানো হয়েছে।' : ''}` 
        : 'ভিজিটর তথ্য আপডেট সম্পন্ন হয়েছে।'
    });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // Dispatch Email Notification to Server
  const dispatchNotificationEmail = async (visitor: VisitorRecord, actionType: 'checkin' | 'checkout' | 'update' = 'checkin') => {
    setSendingEmail(true);
    try {
      const res = await fetch('/api/visitors/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitor,
          customRecipient: notificationEmail,
          actionType
        })
      });

      const result = await res.json();
      if (result.success) {
        console.log('Notification email result:', result);
      }
    } catch (err) {
      console.error('Failed to dispatch notification email:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  // Quick 1-Click Out-Time (Check Out) Handler
  const handleQuickCheckout = async (record: VisitorRecord) => {
    const outTimeStr = formatCurrentTime();
    const updatedRecord: VisitorRecord = {
      ...record,
      out_time: outTimeStr,
      status: 'Checked Out'
    };

    // Update in Supabase
    try {
      if (typeof record.id === 'number') {
        await supabase.from('visitors').update({
          out_time: outTimeStr,
          status: 'Checked Out'
        }).eq('id', record.id);
      }
    } catch (e) {
      console.warn('Supabase checkout update error:', e);
    }

    // Update Local State
    const updatedList = visitors.map(v => v.id === record.id ? updatedRecord : v);
    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    // Send exit notification email
    dispatchNotificationEmail(updatedRecord, 'checkout');

    setActionMessage({
      type: 'info',
      text: `${record.company_name} (${record.visitor_name || 'ভিজিটর'}) এর বের হওয়ার সময় (${outTimeStr}) রেকর্ড করা হয়েছে ও ইমেইল পাঠানো হয়েছে।`
    });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // Delete Record Handler
  const handleDelete = async (id: string | number) => {
    if (!window.confirm('আপনি কি এই ভিজিটর এন্ট্রি ডিলিট করতে চান?')) return;

    try {
      if (typeof id === 'number') {
        await supabase.from('visitors').delete().eq('id', id);
      }
    } catch (e) {
      console.warn('Supabase delete error:', e);
    }

    const updated = visitors.filter(v => v.id !== id);
    setVisitors(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));

    setActionMessage({ type: 'info', text: 'ভিজিটর রেকর্ড ডিলিট করা হয়েছে।' });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Daily Consolidated Email Dispatch
  const handleSendDailyReportEmail = async () => {
    const targetDateVisitors = visitors.filter(v => v.date === selectedDate);
    setSendingEmail(true);

    try {
      const res = await fetch('/api/visitors/daily-report-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          visitors: targetDateVisitors,
          customRecipient: notificationEmail
        })
      });

      const result = await res.json();
      if (result.success) {
        setActionMessage({
          type: 'success',
          text: `দিন শেষের রির্পোট সফলভাবে ${notificationEmail} ঠিকানায় পাঠানো হয়েছে! (মোট: ${targetDateVisitors.length} জন ভিজিটর)`
        });
        setShowDailyReportModal(false);
      } else {
        setActionMessage({
          type: 'error',
          text: `ইমেইল পাঠাতে ত্রুটি: ${result.error || 'Server error'}`
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: `ইমেইল পাঠাতে ব্যর্থ: ${err.message}`
      });
    } finally {
      setSendingEmail(false);
      setTimeout(() => setActionMessage(null), 6000);
    }
  };

  // Filter visitors by Date, Search, and Status
  const filteredVisitors = visitors.filter(v => {
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
    const matchesStatus = statusFilter === 'All' || v.status === statusFilter;
    return matchesDate && matchesSearch && matchesStatus;
  });

  // Calculate Metrics for Selected Date
  const dateVisitors = visitors.filter(v => v.date === selectedDate);
  const totalCountToday = dateVisitors.length;
  const insideCountToday = dateVisitors.filter(v => !v.out_time || v.status === 'Inside').length;
  const checkedOutCountToday = totalCountToday - insideCountToday;

  // Export to Excel
  const exportToExcel = () => {
    const headers = [
      'SL', 'Date', 'Company Name', 'Visitor Name', 'Phone Number', 
      'Who Meet', 'Purpose', 'In Time', 'Out Time', 'Status', 'Pass/Card No', 'Remarks'
    ];

    const rows = filteredVisitors.map((v, i) => [
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
      v.id_card_no || '',
      v.remarks || ''
    ]);

    const sheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visitor Log');
    XLSX.writeFile(wb, `Windy_Group_Visitors_${selectedDate || 'All'}.xlsx`);
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // Report Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text("WINDY GROUP - VISITOR IN-OUT REGISTER", 10, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`DATE: ${selectedDate || 'ALL DATES'}  |  TOTAL VISITORS: ${filteredVisitors.length}  |  GENERATED: ${new Date().toLocaleDateString()}`, 10, 15);

    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.4);
    doc.line(10, 17.5, 287, 17.5);

    const headers = [['SL', 'Date', 'Company Name', 'Visitor Name', 'Phone No', 'Who Meet', 'Purpose', 'In Time', 'Out Time', 'Status']];
    const body = filteredVisitors.map((v, i) => [
      v.sl || i + 1,
      v.date,
      v.company_name,
      v.visitor_name || '-',
      v.phone_number || '-',
      v.who_meet,
      v.purpose,
      v.in_time,
      v.out_time || '-',
      v.status
    ]);

    autoTable(doc, {
      head: headers,
      body: body,
      startY: 20,
      theme: 'grid',
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 20 },
        2: { cellWidth: 42, fontStyle: 'bold' },
        3: { cellWidth: 32 },
        4: { halign: 'center', cellWidth: 24 },
        5: { cellWidth: 38, fontStyle: 'bold' },
        6: { cellWidth: 46 },
        7: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        8: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        9: { halign: 'center', cellWidth: 25 }
      }
    });

    doc.save(`Windy_Group_Visitors_${selectedDate || 'Report'}.pdf`);
  };

  const copySqlCode = () => {
    const sql = `create table if not exists public.visitors (
  id serial primary key,
  sl int null,
  date date not null default current_date,
  visitor_name text null,
  company_name text not null,
  who_meet text not null,
  purpose text not null,
  in_time text not null,
  out_time text null,
  phone_number text null,
  id_card_no text null,
  status text null default 'Inside',
  remarks text null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);`;
    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  return (
    <section className="bg-white p-4 md:p-8 rounded-sm shadow-sm border border-stone-200">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 pb-4 border-b border-stone-200">
        <div>
          <h2 className="text-lg md:text-xl font-extrabold tracking-wide text-stone-900 flex items-center gap-2">
            <UserCheck className="text-amber-600" size={22} />
            VISITOR IN - OUT / ভিজিটর ইন-আউট রেজিস্টার
          </h2>
          <p className="text-xs text-stone-500 font-medium mt-1">
            কোম্পানি, সাক্ষাৎকারী ও প্রবেশ-প্রস্থান সময়ের পূর্ণাঙ্গ রেজিস্টার। এন্ট্রি হওয়ার সাথে সাথে এবং দিন শেষে স্বয়ংক্রিয় ইমেইল প্রেরিত হয়।
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => {
              const dateRecords = visitors.filter(v => v.date === selectedDate);
              const nextSl = dateRecords.length > 0 ? Math.max(...dateRecords.map(r => r.sl)) + 1 : 1;
              setFormData({
                sl: nextSl,
                date: selectedDate || getTodayString(),
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
              setShowAddModal(true);
            }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-stone-900 px-3.5 py-2 text-xs font-bold uppercase rounded-sm shadow-sm transition-all cursor-pointer"
          >
            <Plus size={15} />
            নতুন ভিজিটর এন্ট্রি
          </button>

          <button
            onClick={() => setShowDailyReportModal(true)}
            className="flex items-center gap-1.5 bg-stone-800 hover:bg-stone-900 text-white px-3 py-2 text-xs font-bold uppercase rounded-sm shadow-sm transition-all cursor-pointer"
            title="নির্বাচিত তারিখের সকল ভিজিটর এক সাথে রিপোর্ট আকারে ইমেইল করুন"
          >
            <Send size={14} className="text-amber-400" />
            দিন শেষের রিপোর্ট মেইল
          </button>

          <button
            onClick={exportToExcel}
            className="flex items-center gap-1 bg-[#107c41] hover:bg-[#0a522a] text-white px-3 py-2 text-xs font-bold uppercase rounded-sm transition-all cursor-pointer"
            title="Excel Export"
          >
            <FileSpreadsheet size={14} />
            Excel
          </button>

          <button
            onClick={exportToPDF}
            className="flex items-center gap-1 bg-[#b32b2b] hover:bg-[#8f1f1f] text-white px-3 py-2 text-xs font-bold uppercase rounded-sm transition-all cursor-pointer"
            title="PDF Export"
          >
            <FileDown size={14} />
            PDF
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-sm border border-stone-300 transition-colors"
            title="ইমেইল সেটিংস ও ডাটাবেস স্কিমা"
          >
            <Settings size={15} />
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {actionMessage && (
        <div className={`p-3 rounded-sm mb-6 text-xs font-semibold flex items-center justify-between transition-all ${
          actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
          actionMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} />}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-stone-400 hover:text-stone-600">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-stone-50 border border-stone-200 p-4 rounded-sm">
          <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">মোট ভিজিটর (নির্বাচিত দিন)</div>
          <div className="text-2xl font-black text-stone-900 mt-1 font-mono">{totalCountToday} <span className="text-xs font-sans text-stone-500 font-normal">জন</span></div>
          <div className="text-[10px] text-stone-400 mt-1 font-medium">তারিখ: {selectedDate}</div>
        </div>

        <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-sm">
          <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            ভিতরে অবস্থান করছেন
          </div>
          <div className="text-2xl font-black text-amber-900 mt-1 font-mono">{insideCountToday} <span className="text-xs font-sans text-amber-700 font-normal">জন</span></div>
          <div className="text-[10px] text-amber-700/80 mt-1">এখনও আউট টাইম হয়নি</div>
        </div>

        <div className="bg-stone-50 border border-stone-200 p-4 rounded-sm">
          <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">প্রস্থান সম্পন্ন</div>
          <div className="text-2xl font-black text-stone-700 mt-1 font-mono">{checkedOutCountToday} <span className="text-xs font-sans text-stone-500 font-normal">জন</span></div>
          <div className="text-[10px] text-stone-400 mt-1">আউট টাইম এন্ট্রি হয়েছে</div>
        </div>

        <div className="bg-stone-900 text-stone-100 p-4 rounded-sm flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mail size={12} /> নোটিফিকেশন প্রাপক
            </div>
            <div className="text-xs font-mono font-bold text-white truncate mt-1.5" title={notificationEmail}>
              {notificationEmail}
            </div>
          </div>
          <div className="text-[9px] text-stone-400 flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> এন্ট্রি হলেই ইনস্ট্যান্ট মেইল যাবে
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-stone-50 p-3.5 border border-stone-200 rounded-sm mb-6 flex flex-col md:flex-row flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-stone-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="কোম্পানি, ভিজিটর, সাক্ষাৎকারী বা উদ্দেশ্য দিয়ে খুঁজুন..."
            className="w-full bg-white border border-stone-300 rounded-sm py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        {/* Date Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-stone-500 flex items-center gap-1">
              <Calendar size={12} /> তারিখ:
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-white border border-stone-300 rounded-sm p-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <button
              onClick={() => setSelectedDate(getTodayString())}
              className={`px-2 py-1 rounded font-semibold transition-colors ${selectedDate === getTodayString() ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'}`}
            >
              আজ
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 1);
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setSelectedDate(`${y}-${m}-${day}`);
              }}
              className="px-2 py-1 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded font-semibold transition-colors"
            >
              গতকাল
            </button>
            <button
              onClick={() => setSelectedDate('')}
              className={`px-2 py-1 rounded font-semibold transition-colors ${selectedDate === '' ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700 hover:bg-stone-300'}`}
            >
              সব তারিখ
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1 ml-1 text-[10px]">
            <span className="font-bold text-stone-500">স্ট্যাটাস:</span>
            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="bg-white border border-stone-300 rounded-sm py-1 px-2 text-xs font-medium focus:outline-none"
            >
              <option value="All">সব ({visitors.length})</option>
              <option value="Inside">ভিতরে আছেন</option>
              <option value="Checked Out">প্রস্থান করেছেন</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Visitor Register Table */}
      <div className="overflow-x-auto border border-stone-200 rounded-sm shadow-sm bg-white">
        <table className="text-[11px] text-stone-800 border-collapse table-auto w-full min-w-[900px]">
          <thead>
            <tr className="bg-[#1e293b] text-white border-b border-slate-700 select-none">
              <th className="px-2 py-3 border border-slate-700 font-bold text-center w-12">SL</th>
              <th className="px-3 py-3 border border-slate-700 font-bold text-center w-24">Date</th>
              <th className="px-3 py-3 border border-slate-700 font-bold text-left">Company Name</th>
              <th className="px-3 py-3 border border-slate-700 font-bold text-left">Visitor Name & Phone</th>
              <th className="px-3 py-3 border border-slate-700 font-bold text-left">Who Meet (সাক্ষাৎকারী)</th>
              <th className="px-3 py-3 border border-slate-700 font-bold text-left">Purpose (উদ্দেশ্য)</th>
              <th className="px-2 py-3 border border-slate-700 font-bold text-center w-24 bg-[#0f172a] text-emerald-300">
                In Time
              </th>
              <th className="px-2 py-3 border border-slate-700 font-bold text-center w-24 bg-[#0f172a] text-rose-300">
                Out Time
              </th>
              <th className="px-2 py-3 border border-slate-700 font-bold text-center w-24">Status</th>
              <th className="px-2 py-3 border border-slate-700 font-bold text-center w-32">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVisitors.map((v, idx) => {
              const isInside = !v.out_time || v.status === 'Inside';
              const rowBg = isInside ? 'bg-amber-50/20' : (idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/50');

              return (
                <tr key={v.id || idx} className={`${rowBg} hover:bg-amber-50/40 transition-colors border-b border-stone-200`}>
                  {/* SL */}
                  <td className="px-2 py-2.5 border text-center font-bold text-stone-700">
                    {v.sl || idx + 1}
                  </td>

                  {/* Date */}
                  <td className="px-2.5 py-2.5 border text-center font-mono text-stone-600">
                    {v.date}
                  </td>

                  {/* Company Name */}
                  <td className="px-3 py-2.5 border text-left font-bold text-sky-950">
                    <div className="flex items-center gap-1.5">
                      <Building size={13} className="text-sky-700 shrink-0" />
                      <span>{v.company_name}</span>
                    </div>
                    {v.id_card_no && (
                      <span className="text-[9px] font-mono text-stone-500 block ml-4">
                        Pass: {v.id_card_no}
                      </span>
                    )}
                  </td>

                  {/* Visitor Name & Phone */}
                  <td className="px-3 py-2.5 border text-left">
                    <div className="font-semibold text-stone-900 flex items-center gap-1">
                      <User size={12} className="text-stone-400 shrink-0" />
                      <span>{v.visitor_name || 'Visitor'}</span>
                    </div>
                    {v.phone_number && (
                      <div className="text-[10px] text-stone-500 font-mono flex items-center gap-1 mt-0.5">
                        <Phone size={10} className="text-stone-400" />
                        <span>{v.phone_number}</span>
                      </div>
                    )}
                  </td>

                  {/* Who Meet */}
                  <td className="px-3 py-2.5 border text-left font-bold text-amber-900">
                    <span className="bg-amber-100/60 px-1.5 py-0.5 rounded text-amber-950">
                      {v.who_meet}
                    </span>
                  </td>

                  {/* Purpose */}
                  <td className="px-3 py-2.5 border text-left text-stone-700 text-[10px]">
                    {v.purpose}
                    {v.remarks && (
                      <span className="text-stone-400 italic block text-[9px]">
                        Note: {v.remarks}
                      </span>
                    )}
                  </td>

                  {/* In Time */}
                  <td className="px-2 py-2.5 border text-center font-mono font-bold text-emerald-700">
                    {v.in_time}
                  </td>

                  {/* Out Time */}
                  <td className="px-2 py-2.5 border text-center font-mono font-bold text-rose-700">
                    {v.out_time ? (
                      v.out_time
                    ) : (
                      <button
                        onClick={() => handleQuickCheckout(v)}
                        className="bg-amber-500 hover:bg-amber-600 text-stone-950 px-2 py-0.5 text-[9px] font-bold rounded shadow-xs uppercase transition-all cursor-pointer flex items-center gap-1 mx-auto"
                        title="আউট টাইম রেকর্ড করুন"
                      >
                        <LogOut size={10} />
                        আউট দিন
                      </button>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-2 py-2.5 border text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${
                      isInside ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-stone-100 text-stone-600 border border-stone-200'
                    }`}>
                      {isInside ? 'Inside' : 'Checked Out'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-2 py-2.5 border text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* Resend Email Notification */}
                      <button
                        onClick={() => {
                          dispatchNotificationEmail(v, 'checkin');
                          setActionMessage({ type: 'info', text: `${v.company_name} এর জন্য ইমেইল পুনঃপ্রেরণ করা হয়েছে।` });
                          setTimeout(() => setActionMessage(null), 4000);
                        }}
                        className="p-1 text-sky-700 hover:bg-sky-50 rounded transition-colors"
                        title="ইমেইল নোটিফিকেশন আবার পাঠান"
                      >
                        <Mail size={13} />
                      </button>

                      {/* Edit */}
                      <button
                        onClick={() => {
                          setEditingId(v.id || null);
                          setFormData({ ...v });
                          setShowEditModal(true);
                        }}
                        className="p-1 text-stone-600 hover:bg-stone-100 rounded transition-colors"
                        title="ইডিট করুন"
                      >
                        <Edit2 size={13} />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => v.id && handleDelete(v.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="ডিলিট করুন"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filteredVisitors.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center text-stone-400 font-mono italic">
                  কোনো ভিজিটর রেকর্ড পাওয়া যায়নি। উপরের <strong>'+ নতুন ভিজিটর এন্ট্রি'</strong> বাটনে চাপ দিয়ে তথ্য যুক্ত করুন।
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Info & Multi-Page status */}
      <div className="mt-4 flex flex-col md:flex-row justify-between items-center text-[10px] text-stone-500 font-medium gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>ইমেইল সিস্টেম সক্রিয়: নতুন এন্ট্রি হলে সরাসরি নোটিফিকেশন মেইল যাবে।</span>
        </div>
        <div className="flex items-center gap-2">
          <span>মোট সংরক্ষিত রেকর্ড: {visitors.length} টি</span>
          <span>&bull;</span>
          <button 
            onClick={fetchVisitors} 
            className="text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw size={10} /> রিফ্রেশ করুন
          </button>
        </div>
      </div>

      {/* ================= MODAL: ADD NEW VISITOR ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-sm shadow-2xl border border-stone-300 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-stone-900 text-white px-5 py-3.5 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <UserCheck size={16} className="text-amber-400" />
                নতুন ভিজিটর এন্ট্রি (New Visitor Registration)
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-stone-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!formData.company_name || !formData.who_meet || !formData.purpose) {
                  alert('অনুগ্রহ করে কোম্পানি, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।');
                  return;
                }
                saveVisitorRecord(formData, true);
                setShowAddModal(false);
              }}
              className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs"
            >
              {/* Row 1: SL & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    SL (ক্রমিক নং) *
                  </label>
                  <input
                    type="number"
                    value={formData.sl || 1}
                    onChange={e => setFormData({ ...formData, sl: parseInt(e.target.value, 10) || 1 })}
                    required
                    className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    তারিখ (Date) *
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-xs font-semibold"
                  />
                </div>
              </div>

              {/* Row 2: Company Name & Visitor Name */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    কোম্পানির নাম (Company Name) *
                  </label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                    placeholder="e.g. ABC Textiles Ltd."
                    required
                    autoFocus
                    className="w-full border border-stone-300 p-2 rounded text-xs font-bold text-sky-950 focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    ভিজিটরের নাম (Visitor Name)
                  </label>
                  <input
                    type="text"
                    value={formData.visitor_name}
                    onChange={e => setFormData({ ...formData, visitor_name: e.target.value })}
                    placeholder="e.g. Md. Rafiqul Islam"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-medium focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Who Meet & Purpose */}
              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                  কার সাথে দেখা করবেন (Who Meet) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    list="staff-list"
                    value={formData.who_meet}
                    onChange={e => setFormData({ ...formData, who_meet: e.target.value })}
                    placeholder="কর্মকর্তার নাম বা পদবি লিখুন বা সিলেক্ট করুন..."
                    required
                    className="flex-1 border border-stone-300 p-2 rounded text-xs font-bold text-amber-950 focus:ring-1 focus:ring-amber-500 outline-none"
                  />
                  <datalist id="staff-list">
                    {employees.map(emp => (
                      <option key={emp.id} value={`${emp.name} (${emp.designation || emp.id})`} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                  উদ্দেশ্য (Purpose of Visit) *
                </label>
                <input
                  type="text"
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  placeholder="e.g. Official Meeting, Material Delivery, Interview, Maintenance"
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                />
              </div>

              {/* Row 4: In Time & Out Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-stone-700 uppercase">
                      In Time (প্রবেশের সময়) *
                    </label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, in_time: formatCurrentTime() })}
                      className="text-[9px] text-amber-700 font-bold underline cursor-pointer"
                    >
                      এখন সময় দিন
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.in_time}
                    onChange={e => setFormData({ ...formData, in_time: e.target.value })}
                    required
                    placeholder="10:30 AM"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    Out Time (বের হওয়ার সময়)
                  </label>
                  <input
                    type="text"
                    value={formData.out_time || ''}
                    onChange={e => setFormData({ ...formData, out_time: e.target.value })}
                    placeholder="বের হলে দেওয়া যাবে"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-rose-800"
                  />
                </div>
              </div>

              {/* Row 5: Contact & Pass No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    মোবাইল নম্বর (Phone No)
                  </label>
                  <input
                    type="text"
                    value={formData.phone_number || ''}
                    onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                    placeholder="017xxxxxxxx"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                    পাস / কার্ড নং (Pass No)
                  </label>
                  <input
                    type="text"
                    value={formData.id_card_no || ''}
                    onChange={e => setFormData({ ...formData, id_card_no: e.target.value })}
                    placeholder="e.g. V-01"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono"
                  />
                </div>
              </div>

              {/* Email Notification Option */}
              <div className="bg-amber-50 border border-amber-200 p-3 rounded space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendInstantEmail}
                    onChange={e => setSendInstantEmail(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                  />
                  <span className="font-bold text-stone-900 text-xs">
                    এন্ট্রি হওয়ার সাথে সাথে নির্ধারিত ইমেইলে নোটিফিকেশন পাঠান
                  </span>
                </label>

                {sendInstantEmail && (
                  <div>
                    <label className="block text-[9px] font-bold text-amber-900 uppercase mb-0.5">
                      প্রাপক ইমেইল (Notification Email Address):
                    </label>
                    <input
                      type="email"
                      value={notificationEmail}
                      onChange={e => setNotificationEmail(e.target.value)}
                      className="w-full bg-white border border-amber-300 p-1.5 rounded text-xs font-mono text-stone-800"
                      placeholder="017mattakin@gmail.com"
                    />
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-stone-900 font-bold uppercase rounded shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {sendingEmail ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  সংরক্ষণ ও নিশ্চিত করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT VISITOR ================= */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-sm shadow-2xl border border-stone-300 w-full max-w-lg overflow-hidden">
            <div className="bg-stone-900 text-white px-5 py-3.5 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Edit2 size={15} className="text-amber-400" />
                ভিজিটর তথ্য সংশোধন (Edit Visitor Record)
              </h3>
              <button onClick={() => setShowEditModal(false)} className="text-stone-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveVisitorRecord(formData, false);
                setShowEditModal(false);
              }}
              className="p-5 space-y-4 max-h-[82vh] overflow-y-auto text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">SL</label>
                  <input
                    type="number"
                    value={formData.sl || 1}
                    onChange={e => setFormData({ ...formData, sl: parseInt(e.target.value, 10) || 1 })}
                    className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-xs font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-stone-50 border border-stone-300 p-2 rounded text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">কোম্পানির নাম *</label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    className="w-full border border-stone-300 p-2 rounded text-xs font-bold text-sky-950"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">ভিজিটরের নাম</label>
                  <input
                    type="text"
                    value={formData.visitor_name}
                    onChange={e => setFormData({ ...formData, visitor_name: e.target.value })}
                    className="w-full border border-stone-300 p-2 rounded text-xs font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">কার সাথে দেখা করবেন *</label>
                <input
                  type="text"
                  value={formData.who_meet}
                  onChange={e => setFormData({ ...formData, who_meet: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-bold text-amber-950"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">উদ্দেশ্য *</label>
                <input
                  type="text"
                  value={formData.purpose}
                  onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">In Time</label>
                  <input
                    type="text"
                    value={formData.in_time}
                    onChange={e => setFormData({ ...formData, in_time: e.target.value })}
                    required
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] font-bold text-stone-700 uppercase">Out Time</label>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, out_time: formatCurrentTime() })}
                      className="text-[9px] text-amber-700 font-bold underline cursor-pointer"
                    >
                      এখন আউট দিন
                    </button>
                  </div>
                  <input
                    type="text"
                    value={formData.out_time || ''}
                    onChange={e => setFormData({ ...formData, out_time: e.target.value })}
                    placeholder="বের হওয়ার সময়"
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-rose-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">মোবাইল নম্বর</label>
                  <input
                    type="text"
                    value={formData.phone_number || ''}
                    onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">পাস / কার্ড নং</label>
                  <input
                    type="text"
                    value={formData.id_card_no || ''}
                    onChange={e => setFormData({ ...formData, id_card_no: e.target.value })}
                    className="w-full border border-stone-300 p-2 rounded text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold uppercase rounded shadow-xs"
                >
                  আপডেট সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: DAILY REPORT EMAIL PREVIEW & DISPATCH ================= */}
      {showDailyReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-sm shadow-2xl border border-stone-300 w-full max-w-2xl overflow-hidden">
            <div className="bg-stone-900 text-white px-5 py-3.5 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Send size={15} className="text-amber-400" />
                দিন শেষের একীভূত রিপোর্ট ইমেইল প্রেরণ (Daily Summary Email)
              </h3>
              <button onClick={() => setShowDailyReportModal(false)} className="text-stone-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-stone-600">
                নির্বাচিত তারিখ <strong>({selectedDate})</strong> এর সকল ভিজিটর এন্ট্রি একীভূত (Consolidated) রিপোর্ট আকারে প্রস্তুত করে সরাসরি ইমেইল করা হবে।
              </p>

              {/* Recipient Input */}
              <div>
                <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                  প্রাপক ইমেইল ঠিকানা (Recipient Email Address):
                </label>
                <input
                  type="email"
                  value={notificationEmail}
                  onChange={e => {
                    setNotificationEmail(e.target.value);
                    localStorage.setItem('visitor_target_email', e.target.value);
                  }}
                  className="w-full bg-stone-50 border border-stone-300 p-2.5 rounded font-mono font-bold text-stone-900"
                />
              </div>

              {/* Preview Box */}
              <div className="border border-stone-200 rounded p-3 bg-stone-50 max-h-56 overflow-y-auto">
                <div className="font-bold text-[11px] text-stone-800 mb-2 flex justify-between">
                  <span>রিপোর্টে মোট ভিজিটর: {dateVisitors.length} জন</span>
                  <span className="text-emerald-700">ভিতরে আছেন: {insideCountToday} জন</span>
                </div>
                {dateVisitors.length === 0 ? (
                  <div className="text-center py-6 text-stone-400 italic">এই তারিখে কোনো ভিজিটর এন্ট্রি নেই।</div>
                ) : (
                  <table className="w-full text-[10px] border-collapse bg-white border border-stone-200">
                    <thead>
                      <tr className="bg-stone-200 text-stone-800">
                        <th className="p-1 border text-center">SL</th>
                        <th className="p-1 border text-left">Company</th>
                        <th className="p-1 border text-left">Who Meet</th>
                        <th className="p-1 border text-center">In</th>
                        <th className="p-1 border text-center">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dateVisitors.map((v, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-1 border text-center font-bold">{v.sl || i + 1}</td>
                          <td className="p-1 border font-bold text-sky-950">{v.company_name}</td>
                          <td className="p-1 border text-amber-900">{v.who_meet}</td>
                          <td className="p-1 border text-center font-mono text-emerald-700">{v.in_time}</td>
                          <td className="p-1 border text-center font-mono text-rose-700">{v.out_time || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Direct Mailto Backup */}
              <div className="bg-blue-50 border border-blue-200 p-2.5 rounded text-[11px] text-blue-900 flex items-center justify-between">
                <span>সার্ভার থেকে সরাসরি ডেলিভারি হবে। এছাড়া চাইলে জিমেইল ক্লায়েন্টেও খুলতে পারেন:</span>
                <a
                  href={`mailto:${notificationEmail}?subject=${encodeURIComponent(`[Windy Group] দৈনিক ভিজিটর রিপোর্ট - ${selectedDate}`)}&body=${encodeURIComponent(
                    `Windy Group Daily Visitor Summary (${selectedDate}):\n\nTotal Visitors: ${totalCountToday}\nInside: ${insideCountToday}\nChecked Out: ${checkedOutCountToday}\n\n` +
                    dateVisitors.map(v => `${v.sl}. ${v.company_name} | Meet: ${v.who_meet} | In: ${v.in_time} | Out: ${v.out_time || 'Inside'}`).join('\n')
                  )}`}
                  className="font-bold underline text-blue-700 hover:text-blue-900 flex items-center gap-1 shrink-0 ml-2"
                >
                  <ExternalLink size={12} /> Open in Gmail
                </a>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowDailyReportModal(false)}
                  className="px-4 py-2 border border-stone-300 rounded text-stone-600 font-bold hover:bg-stone-100"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={sendingEmail || dateVisitors.length === 0}
                  onClick={handleSendDailyReportEmail}
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold uppercase rounded shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {sendingEmail ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} className="text-amber-400" />}
                  রিপোর্ট মেইল পাঠান (Send Email)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: SETTINGS & DATABASE HELPER ================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-sm shadow-2xl border border-stone-300 w-full max-w-xl overflow-hidden">
            <div className="bg-stone-900 text-white px-5 py-3.5 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Settings size={15} className="text-amber-400" />
                ভিজিটর সিস্টেম ও ইমেইল সেটিংস
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-stone-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5 text-xs max-h-[80vh] overflow-y-auto">
              {/* Default Recipient Email Config */}
              <div className="space-y-2">
                <h4 className="font-bold text-stone-900 text-xs uppercase tracking-wide">
                  ডিফল্ট নোটিফিকেশন ইমেইল ঠিকানা
                </h4>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={notificationEmail}
                    onChange={e => setNotificationEmail(e.target.value)}
                    className="flex-1 border border-stone-300 p-2 rounded text-xs font-mono font-bold"
                  />
                  <button
                    onClick={() => {
                      localStorage.setItem('visitor_target_email', notificationEmail);
                      fetch('/api/email-config', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ defaultRecipient: notificationEmail })
                      });
                      alert('ইমেইল ঠিকানা সফলভাবে সংরক্ষিত হয়েছে!');
                    }}
                    className="px-3 py-2 bg-stone-900 text-white font-bold rounded text-xs hover:bg-stone-800"
                  >
                    সেভ করুন
                  </button>
                </div>
              </div>

              {/* Test Email Button */}
              <div className="bg-stone-50 border border-stone-200 p-3 rounded flex items-center justify-between">
                <div>
                  <div className="font-bold text-stone-800">ইমেইল টেস্ট (Verification Test)</div>
                  <div className="text-[10px] text-stone-500">সিস্টেম থেকে একটি পরীক্ষামূলক ইমেইল পাঠিয়ে যাচাই করুন</div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/email/test', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipient: notificationEmail })
                      });
                      const data = await res.json();
                      if (data.success) {
                        alert(`টেস্ট ইমেইল সফলভাবে পাঠানো হয়েছে ${notificationEmail} ঠিকানায়!`);
                      } else {
                        alert(`টেস্ট ব্যর্থ: ${data.error}`);
                      }
                    } catch (e: any) {
                      alert(`এরর: ${e.message}`);
                    }
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold rounded text-[11px]"
                >
                  টেস্ট মেইল পাঠান
                </button>
              </div>

              {/* Supabase Schema Helper */}
              <div className="space-y-2 pt-2 border-t border-stone-200">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-stone-900 text-xs uppercase tracking-wide">
                    Supabase Visitors Table SQL Schema
                  </h4>
                  <button
                    onClick={copySqlCode}
                    className="text-amber-700 font-bold text-[10px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={11} /> {copiedSql ? 'কপি হয়েছে!' : 'SQL কোড কপি করুন'}
                  </button>
                </div>
                <p className="text-[10px] text-stone-500">
                  Supabase ড্যাশবোর্ডে গিয়ে SQL Editor এ নিচের স্ক্রিপ্টটি রান করলে <code>visitors</code> টেবিলটি ক্লাউডে পার্মানেন্টলি সক্রিয় হবে।
                </p>
                <pre className="bg-stone-900 text-amber-300 p-3 rounded font-mono text-[10px] overflow-x-auto select-all">
{`create table if not exists public.visitors (
  id serial primary key,
  sl int null,
  date date not null default current_date,
  visitor_name text null,
  company_name text not null,
  who_meet text not null,
  purpose text not null,
  in_time text not null,
  out_time text null,
  phone_number text null,
  id_card_no text null,
  status text null default 'Inside',
  remarks text null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);`}
                </pre>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-1.5 bg-stone-800 text-white font-bold rounded"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
