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
  Copy,
  MessageCircle,
  Share2,
  Check,
  Smartphone,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table as TableIcon,
  Zap,
  ArrowRight
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
const DEFAULT_USER_EMAIL = '017mattakin@gmail.com';

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

// Clean and format phone number for WhatsApp wa.me / api.whatsapp.com links
const formatWhatsAppPhone = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '88' + clean; // Bangladesh country code prefix
  }
  return clean;
};

// Common quick purpose chips for rapid 1-tap entry on mobile
const QUICK_PURPOSE_OPTIONS = [
  'অফিসিয়াল মিটিং',
  'ইন্টারভিউ',
  'মাল ডেলিভারি',
  'স্যাম্পল প্রদান',
  'বিল / চালান জমা',
  'সার্ভিস / মেরামত',
  'ফ্যাক্টরি পরিদর্শন'
];

export default function VisitorSection({ employees = [], viewMode }: Props) {
  const [visitors, setVisitors] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Inside' | 'Checked Out'>('All');
  
  // View Toggle: Mobile Cards vs Desktop Table
  const [viewLayout, setViewLayout] = useState<'cards' | 'table'>('cards');
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDailyReportModal, setShowDailyReportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showSendSuccessModal, setShowSendSuccessModal] = useState<VisitorRecord | null>(null);
  
  // Quick Mobile Inline Entry Collapsible Form
  const [showInlineMobileEntry, setShowInlineMobileEntry] = useState(false);

  // 1. Current User / Operator Email (স্বয়ংক্রিয়ভাবে সেভ থাকবে)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(() => {
    return localStorage.getItem('saved_operator_user_email') || DEFAULT_USER_EMAIL;
  });

  // 2. Admin Recipient Email(s) (কমা দিয়ে একাধিক)
  const [adminRecipientEmails, setAdminRecipientEmails] = useState<string>(() => {
    return localStorage.getItem('admin_recipient_emails') || '017mattakin@gmail.com';
  });

  // 3. Admin WhatsApp Number
  const [adminWhatsAppNumber, setAdminWhatsAppNumber] = useState<string>(() => {
    return localStorage.getItem('admin_whatsapp_number') || '01711000000';
  });

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
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    fetchVisitors();
  }, []);

  // Save Settings to LocalStorage
  const handleSaveSettings = (uEmail: string, aEmails: string, waNum: string) => {
    setCurrentUserEmail(uEmail);
    setAdminRecipientEmails(aEmails);
    setAdminWhatsAppNumber(waNum);

    localStorage.setItem('saved_operator_user_email', uEmail);
    localStorage.setItem('admin_recipient_emails', aEmails);
    localStorage.setItem('admin_whatsapp_number', waNum);

    setActionMessage({ type: 'success', text: 'সেটিংস সেভ হয়েছে! কোনো API এর প্রয়োজন নেই।' });
    setShowSettingsModal(false);
    setTimeout(() => setActionMessage(null), 4000);
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

  // Save visitor record helper
  const saveVisitorRecord = async (
    record: Partial<VisitorRecord>, 
    isNew: boolean, 
    instantAction?: 'whatsapp' | 'email'
  ): Promise<VisitorRecord> => {
    let newRecord: VisitorRecord;

    if (currentUserEmail) {
      localStorage.setItem('saved_operator_user_email', currentUserEmail);
    }

    if (isNew) {
      const dateRecords = visitors.filter(v => v.date === (record.date || getTodayString()));
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

    // Handle instant Action if user selected "Save & Send"
    if (instantAction === 'whatsapp') {
      handleOpenWhatsAppForVisitor(newRecord);
      setActionMessage({ type: 'success', text: 'ভিজিটর সেভ হয়েছে এবং WhatsApp মেসেজ ওপেন হয়েছে।' });
      setTimeout(() => setActionMessage(null), 4000);
    } else if (instantAction === 'email') {
      handleOpenEmailForVisitor(newRecord);
      setActionMessage({ type: 'success', text: 'ভিজিটর সেভ হয়েছে এবং মেইল ওপেন হয়েছে।' });
      setTimeout(() => setActionMessage(null), 4000);
    } else if (isNew) {
      // Show instant Share Modal
      setShowSendSuccessModal(newRecord);
    } else {
      setActionMessage({ type: 'success', text: 'ভিজিটর তথ্য সফলভাবে আপডেট হয়েছে।' });
      setTimeout(() => setActionMessage(null), 4000);
    }

    // Reset Form for next quick entry
    const nextDateRecords = updatedList.filter(v => v.date === (record.date || getTodayString()));
    const nextSlVal = nextDateRecords.length > 0 ? Math.max(...nextDateRecords.map(r => r.sl)) + 1 : 1;
    setFormData({
      sl: nextSlVal,
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

    return newRecord;
  };

  // Generate Email Content for a Single Visitor
  const getVisitorEmailContent = (v: VisitorRecord) => {
    const isExit = Boolean(v.out_time);
    const subject = isExit 
      ? `[Windy Group] ভিজিটর প্রস্থান: ${v.company_name} - ${v.visitor_name || 'Visitor'}` 
      : `[Windy Group] নতুন ভিজিটর আগমন: ${v.company_name} - ${v.visitor_name || 'Visitor'}`;

    const body = 
`WINDY GROUP - ভিজিটর এন্ট্রি বিজ্ঞপ্তি
--------------------------------------------------
ক্রমিক নং (SL)          : ${v.sl}
তারিখ (Date)            : ${v.date}
কোম্পানির নাম (Company)    : ${v.company_name}
ভিজিটরের নাম (Visitor)    : ${v.visitor_name || '-'}
মোবাইল নম্বর (Phone)      : ${v.phone_number || '-'}
কার সাথে সাক্ষাৎ (Who Meet): ${v.who_meet}
উদ্দেশ্য (Purpose)        : ${v.purpose}
প্রবেশের সময় (In Time)    : ${v.in_time}
বের হওয়ার সময় (Out Time)  : ${v.out_time || 'ভিতরে আছেন (Inside)'}
পাস নং (Pass/Card)        : ${v.id_card_no || '-'}
--------------------------------------------------
এন্ট্রি করেছেন (Operator)  : ${currentUserEmail}
প্রাপক এডমিন             : ${adminRecipientEmails}`;

    return { subject, body };
  };

  // Open Standard Mailto
  const handleOpenEmailForVisitor = (v: VisitorRecord) => {
    const { subject, body } = getVisitorEmailContent(v);
    const recipients = adminRecipientEmails.trim();
    const mailtoUrl = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  // Direct Gmail Web Compose
  const handleOpenGmailWebForVisitor = (v: VisitorRecord) => {
    const { subject, body } = getVisitorEmailContent(v);
    const recipients = adminRecipientEmails.trim();
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');
  };

  // Generate WhatsApp text for a Single Visitor
  const getVisitorWhatsAppText = (v: VisitorRecord): string => {
    const isExit = Boolean(v.out_time);
    return (
`*${isExit ? '🚪 WINDY GROUP - ভিজিটর প্রস্থান বিজ্ঞপ্তি' : '🚨 WINDY GROUP - নতুন ভিজিটর আগমন বিজ্ঞপ্তি'}*
━━━━━━━━━━━━━━━━━━
📌 *SL:* ${v.sl}
📅 *তারিখ:* ${v.date}
🏢 *কোম্পানি:* ${v.company_name}
👤 *ভিজিটর:* ${v.visitor_name || 'Visitor'} ${v.phone_number ? `(${v.phone_number})` : ''}
🎯 *কার সাথে সাক্ষাৎ:* ${v.who_meet}
📝 *উদ্দেশ্য:* ${v.purpose}
⏰ *প্রবেশের সময়:* ${v.in_time}
🚪 *বের হওয়ার সময়:* ${v.out_time || 'ভিতরে আছেন (Inside)'}
${v.id_card_no ? `🎫 *পাস নং:* ${v.id_card_no}\n` : ''}━━━━━━━━━━━━━━━━━━
👤 *এন্ট্রি করেছেন:* ${currentUserEmail}`
    );
  };

  // Open WhatsApp to send to Admin
  const handleOpenWhatsAppForVisitor = (v: VisitorRecord) => {
    const text = getVisitorWhatsAppText(v);
    const cleanPhone = formatWhatsAppPhone(adminWhatsAppNumber);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  // Quick 1-Click Out-Time (Check Out) Handler
  const handleQuickCheckout = async (record: VisitorRecord) => {
    const outTimeStr = formatCurrentTime();
    const updatedRecord: VisitorRecord = {
      ...record,
      out_time: outTimeStr,
      status: 'Checked Out'
    };

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

    const updatedList = visitors.map(v => v.id === record.id ? updatedRecord : v);
    setVisitors(updatedList);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

    // Show popup offering to share out time
    setShowSendSuccessModal(updatedRecord);
  };

  // Delete Record Handler
  const handleDelete = async (id: string | number) => {
    if (!window.confirm('আপনি কি নিশ্চিত যে এই এন্ট্রিটি ডিলিট করতে চান?')) return;

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
    setTimeout(() => setActionMessage(null), 3000);
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

  // EOD Daily Report text for Mail & WhatsApp
  const getDailyReportText = () => {
    const targetDate = selectedDate || getTodayString();
    const targetVisitors = visitors.filter(v => v.date === targetDate);
    const targetInside = targetVisitors.filter(v => !v.out_time || v.status === 'Inside').length;
    const targetOut = targetVisitors.length - targetInside;

    const lines = targetVisitors.map(v => 
      `${v.sl}. ${v.company_name} | সাক্ষাৎ: ${v.who_meet} | ইন: ${v.in_time} | আউট: ${v.out_time || 'ভিতরে'} | উদ্দেশ্য: ${v.purpose}`
    );

    const emailSubject = `[Windy Group] দিন শেষের সম্পূর্ণ ভিজিটর রিপোর্ট - ${targetDate} (মোট: ${targetVisitors.length} জন)`;
    const emailBody = 
`WINDY GROUP - দিন শেষের সম্পূর্ণ ভিজিটর রিপোর্ট
তারিখ (Date): ${targetDate}
মোট ভিজিটর : ${targetVisitors.length} জন | ভিতরে অবস্থান: ${targetInside} জন | প্রস্থান: ${targetOut} জন
--------------------------------------------------------------------------------
${lines.length > 0 ? lines.join('\n') : 'কোনো ভিজিটর এন্ট্রি নেই।'}
--------------------------------------------------------------------------------
প্রেরক (Operator): ${currentUserEmail}
এডমিন প্রাপক     : ${adminRecipientEmails}`;

    const waText = 
`*📋 WINDY GROUP - দিন শেষের সম্পূর্ণ ভিজিটর রিপোর্ট*
📅 *তারিখ:* ${targetDate}
📊 *মোট ভিজিটর:* ${targetVisitors.length} জন | ভিতরে: ${targetInside} | প্রস্থান: ${targetOut}
━━━━━━━━━━━━━━━━━━
${lines.length > 0 ? lines.join('\n') : 'কোনো ভিজিটর এন্ট্রি নেই।'}
━━━━━━━━━━━━━━━━━━
👤 *প্রেরক:* ${currentUserEmail}`;

    return { emailSubject, emailBody, waText, targetVisitors };
  };

  // 1-CLICK INSTANT WHATSAPP SEND (এক ক্লিকেই সারাদিনের রিপোর্ট WhatsApp এ পাঠানো)
  const handleInstant1ClickWhatsAppReport = () => {
    const { waText, targetVisitors } = getDailyReportText();
    if (targetVisitors.length === 0) {
      alert(`আজকের (${selectedDate || getTodayString()}) তারিখে কোনো ভিজিটর এন্ট্রি পাওয়া যায়নি।`);
      return;
    }
    const cleanPhone = formatWhatsAppPhone(adminWhatsAppNumber);
    const waUrl = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(waText)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
    window.open(waUrl, '_blank');
  };

  // 1-CLICK INSTANT GMAIL/MAIL SEND (এক ক্লিকেই সারাদিনের রিপোর্ট মেইলে পাঠানো)
  const handleInstant1ClickEmailReport = () => {
    const { emailSubject, emailBody, targetVisitors } = getDailyReportText();
    if (targetVisitors.length === 0) {
      alert(`আজকের (${selectedDate || getTodayString()}) তারিখে কোনো ভিজিটর এন্ট্রি পাওয়া যায়নি।`);
      return;
    }
    const recipients = adminRecipientEmails.trim();
    // Use Gmail web if available, otherwise mailto
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipients)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank');
  };

  // Copy Full Daily Report Text to Clipboard
  const handleCopyDailyReport = () => {
    const { waText } = getDailyReportText();
    navigator.clipboard.writeText(waText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

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

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("WINDY GROUP - VISITOR IN-OUT REGISTER", 10, 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`DATE: ${selectedDate || 'ALL DATES'}  |  OPERATOR: ${currentUserEmail}  |  TOTAL: ${filteredVisitors.length}`, 10, 15);

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
    <section className="bg-stone-50 md:bg-white p-2.5 sm:p-4 md:p-8 rounded-sm shadow-xs border border-stone-200 pb-24 md:pb-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4 pb-3 border-b border-stone-200">
        <div>
          <h2 className="text-base sm:text-lg md:text-xl font-black tracking-wide text-stone-900 flex items-center gap-2">
            <UserCheck className="text-amber-600 shrink-0" size={24} />
            VISITOR IN - OUT / ভিজিটর ইন-আউট
          </h2>
          <p className="text-[11px] sm:text-xs text-stone-600 font-medium mt-0.5">
            মোবাইলে দ্রুত এন্ট্রি দিন এবং <strong>১-ক্লিকেই সারা দিনের রিপোর্ট</strong> WhatsApp বা মেইলে পাঠান।
          </p>
        </div>

        {/* View Switcher & Settings */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          {/* Card View / Table View Toggle */}
          <div className="bg-stone-200 p-1 rounded-sm flex items-center gap-1 text-xs font-bold">
            <button
              onClick={() => setViewLayout('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                viewLayout === 'cards' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              <LayoutGrid size={13} />
              <span>কার্ড ভিউ</span>
            </button>
            <button
              onClick={() => setViewLayout('table')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                viewLayout === 'table' ? 'bg-amber-500 text-stone-950 shadow-xs' : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              <TableIcon size={13} />
              <span>টেবিল ভিউ</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={exportToExcel}
              className="hidden sm:flex items-center gap-1 bg-[#107c41] hover:bg-[#0a522a] text-white px-2.5 py-1.5 text-xs font-bold uppercase rounded cursor-pointer"
              title="Excel Export"
            >
              <FileSpreadsheet size={13} /> Excel
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded border border-stone-300 text-xs font-bold cursor-pointer"
              title="ইমেইল ও WhatsApp নম্বর সেটিংস"
            >
              <Settings size={14} />
              <span className="hidden sm:inline">সেটিংস</span>
            </button>
          </div>
        </div>
      </div>

      {/* =========================================================================
          🔥 SUPER HIGHLIGHT: 1-CLICK END-OF-DAY REPORT BAR (১-ক্লিকেই সারাদিনের রিপোর্ট)
          ========================================================================= */}
      <div className="bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white p-3.5 sm:p-4 rounded-md shadow-md mb-4 border border-stone-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-stone-950 text-[10px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1">
                <Zap size={11} className="fill-stone-950" /> ১-ক্লিক রিপোর্ট
              </span>
              <span className="text-xs sm:text-sm font-bold text-stone-200">
                তারিখ: <strong className="text-white font-mono">{selectedDate}</strong> (আজকের মোট: {totalCountToday} জন)
              </span>
            </div>
            <p className="text-[11px] text-stone-300 mt-1">
              এক ক্লিকেই আজকের সমস্ত ভিজিটরের বিস্তারিত তালিকা এডমিনের কাছে পাঠানো হবে।
            </p>
          </div>

          {/* The 2 Direct 1-Click Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* 1. Direct WhatsApp Button */}
            <button
              onClick={handleInstant1ClickWhatsAppReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2.5 text-xs font-black rounded shadow-md transition-transform active:scale-95 cursor-pointer"
              title="১-ক্লিকেই WhatsApp এ আজকের সম্পূর্ণ রিপোর্ট পাঠান"
            >
              <MessageCircle size={16} className="shrink-0" />
              <span>WhatsApp এ পাঠান</span>
            </button>

            {/* 2. Direct Gmail Button */}
            <button
              onClick={handleInstant1ClickEmailReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white px-3.5 py-2.5 text-xs font-black rounded shadow-md transition-transform active:scale-95 cursor-pointer"
              title="১-ক্লিকেই Gmail এ আজকের রিপোর্ট পাঠান"
            >
              <Mail size={16} className="shrink-0" />
              <span>মেইলে পাঠান</span>
            </button>

            {/* 3. Quick Copy text */}
            <button
              onClick={handleCopyDailyReport}
              className="p-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded border border-stone-700 cursor-pointer"
              title="রিপোর্ট টেক্সট কপি করুন"
            >
              <Copy size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Operator & Admin Settings Summary Banner */}
      <div className="bg-amber-50/70 border border-amber-300/80 p-2.5 sm:p-3 rounded-md mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="font-bold text-amber-950 flex items-center gap-1">
            <Smartphone size={13} className="text-amber-700" /> প্রেরক:
          </span>
          <span className="font-mono font-bold text-stone-800">{currentUserEmail}</span>
          <span className="text-stone-300">&bull;</span>
          <span className="text-stone-600">
            এডমিন WA: <strong className="text-emerald-700 font-mono font-bold">{adminWhatsAppNumber}</strong>
          </span>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="text-amber-800 underline font-bold hover:text-amber-950 text-[11px] cursor-pointer"
        >
          নম্বর বা মেইল এডিট
        </button>
      </div>

      {/* Alert Banner */}
      {actionMessage && (
        <div className={`p-3 rounded mb-4 text-xs font-semibold flex items-center justify-between transition-all ${
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

      {/* =========================================================================
          📱 MOBILE-FIRST QUICK ENTRY PANEL (মোবাইলে সহজে এন্ট্রি দেওয়ার বিশেষ কার্ড)
          ========================================================================= */}
      <div className="bg-white border-2 border-amber-400 rounded-md shadow-sm p-3 sm:p-5 mb-5">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wide text-stone-900">
              নতুন ভিজিটর এন্ট্রি ফরম (Quick Mobile Entry)
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setFormData({ ...formData, in_time: formatCurrentTime() })}
            className="text-[11px] bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 px-2.5 py-1 rounded font-bold flex items-center gap-1 cursor-pointer"
          >
            <Clock size={12} className="text-amber-600" />
            এখন সময় দিন
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!formData.company_name || !formData.who_meet || !formData.purpose) {
              alert('অনুগ্রহ করে কোম্পানির নাম, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।');
              return;
            }
            saveVisitorRecord(formData, true);
          }}
          className="space-y-3"
        >
          {/* Row 1: Company Name & Visitor Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-black text-stone-800 uppercase mb-1">
                ১. কোম্পানির নাম (Company Name) *
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
              <label className="block text-[11px] font-black text-stone-800 uppercase mb-1">
                ২. ভিজিটরের নাম ও মোবাইল নম্বর
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={formData.visitor_name}
                  onChange={e => setFormData({ ...formData, visitor_name: e.target.value })}
                  placeholder="নাম (Visitor Name)"
                  className="w-full border border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-medium outline-none"
                />
                <input
                  type="text"
                  value={formData.phone_number || ''}
                  onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="ফোন (017...)"
                  className="w-full border border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-mono outline-none"
                />
              </div>
            </div>
          </div>

          {/* Row 2: Who Meet & Purpose */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-black text-stone-800 uppercase mb-1">
                ৩. কার সাথে সাক্ষাৎ করবেন (Who Meet) *
              </label>
              <input
                type="text"
                list="mobile-staff-list"
                value={formData.who_meet}
                onChange={e => setFormData({ ...formData, who_meet: e.target.value })}
                placeholder="নাম লিখুন বা সিলেক্ট করুন..."
                required
                className="w-full border-2 border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-bold text-amber-950 outline-none"
              />
              <datalist id="mobile-staff-list">
                {employees.map(emp => (
                  <option key={emp.id} value={`${emp.name} (${emp.designation || emp.id})`} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-black text-stone-800 uppercase mb-1">
                ৪. উদ্দেশ্য (Purpose) *
              </label>
              <input
                type="text"
                value={formData.purpose}
                onChange={e => setFormData({ ...formData, purpose: e.target.value })}
                placeholder="ভিজিটের উদ্দেশ্য লিখুন..."
                required
                className="w-full border-2 border-stone-300 focus:border-amber-500 p-2.5 rounded text-sm font-medium outline-none"
              />
            </div>
          </div>

          {/* Quick Purpose Chips (1-tap selection on mobile) */}
          <div className="pt-0.5">
            <span className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
              দ্রুত উদ্দেশ্য নির্বাচন (ট্যাপ করলেই বসে যাবে):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PURPOSE_OPTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFormData({ ...formData, purpose: item })}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    formData.purpose === item 
                      ? 'bg-amber-500 text-stone-950 font-black border-amber-600' 
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-300 font-medium'
                  }`}
                >
                  + {item}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: In Time, Out Time & Pass No */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                In Time *
              </label>
              <input
                type="text"
                value={formData.in_time}
                onChange={e => setFormData({ ...formData, in_time: e.target.value })}
                required
                className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                Out Time
              </label>
              <input
                type="text"
                value={formData.out_time || ''}
                onChange={e => setFormData({ ...formData, out_time: e.target.value })}
                placeholder="বের হলে..."
                className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-rose-800 outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-stone-700 uppercase mb-1">
                পাস নং (Pass/Card)
              </label>
              <input
                type="text"
                value={formData.id_card_no || ''}
                onChange={e => setFormData({ ...formData, id_card_no: e.target.value })}
                placeholder="V-01"
                className="w-full border border-stone-300 p-2 rounded text-xs font-mono outline-none"
              />
            </div>
          </div>

          {/* Large Touch-Friendly Submit Buttons (Perfect for Phone Thumbs) */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* 1. Save & Send via WhatsApp */}
            <button
              type="button"
              onClick={() => {
                if (!formData.company_name || !formData.who_meet || !formData.purpose) {
                  alert('অনুগ্রহ করে কোম্পানির নাম, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।');
                  return;
                }
                saveVisitorRecord(formData, true, 'whatsapp');
              }}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-black text-xs sm:text-sm rounded-md shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-transform"
            >
              <MessageCircle size={18} />
              <span>সেভ ও WhatsApp এ পাঠান</span>
            </button>

            {/* 2. Save & Send via Email */}
            <button
              type="button"
              onClick={() => {
                if (!formData.company_name || !formData.who_meet || !formData.purpose) {
                  alert('অনুগ্রহ করে কোম্পানির নাম, কার সাথে দেখা করবেন ও উদ্দেশ্য পূরণ করুন।');
                  return;
                }
                saveVisitorRecord(formData, true, 'email');
              }}
              className="w-full py-3 px-4 bg-sky-600 hover:bg-sky-500 active:scale-98 text-white font-black text-xs sm:text-sm rounded-md shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-transform"
            >
              <Mail size={18} />
              <span>সেভ ও মেইলে পাঠান</span>
            </button>

            {/* 3. Normal Save */}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-stone-900 hover:bg-black active:scale-98 text-white font-black text-xs sm:text-sm rounded-md shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-transform"
            >
              <CheckCircle2 size={18} />
              <span>শুধু সেভ করুন</span>
            </button>
          </div>
        </form>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
        <div className="bg-white border border-stone-200 p-3 rounded text-center sm:text-left">
          <div className="text-[10px] font-bold text-stone-500 uppercase">মোট ভিজিটর</div>
          <div className="text-xl sm:text-2xl font-black text-stone-900 font-mono mt-0.5">{totalCountToday}</div>
        </div>

        <div className="bg-amber-50/80 border border-amber-300 p-3 rounded text-center sm:text-left">
          <div className="text-[10px] font-bold text-amber-800 uppercase flex items-center justify-center sm:justify-start gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            ভিতরে আছেন
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-900 font-mono mt-0.5">{insideCountToday}</div>
        </div>

        <div className="bg-white border border-stone-200 p-3 rounded text-center sm:text-left">
          <div className="text-[10px] font-bold text-stone-600 uppercase">প্রস্থান সম্পন্ন</div>
          <div className="text-xl sm:text-2xl font-black text-stone-700 font-mono mt-0.5">{checkedOutCountToday}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 border border-stone-200 rounded mb-4 flex flex-col md:flex-row flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px] w-full">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-stone-400">
            <Search size={14} />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="কোম্পানি, ভিজিটর বা উদ্দেশ্য দিয়ে খুঁজুন..."
            className="w-full bg-stone-50 border border-stone-300 rounded py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-amber-500 outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-stone-50 border border-stone-300 rounded p-1.5 text-xs font-semibold focus:outline-none"
          />
          <button
            onClick={() => setSelectedDate(getTodayString())}
            className={`px-2 py-1.5 rounded text-[11px] font-bold cursor-pointer ${selectedDate === getTodayString() ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700'}`}
          >
            আজ
          </button>
          <button
            onClick={() => setSelectedDate('')}
            className={`px-2 py-1.5 rounded text-[11px] font-bold cursor-pointer ${selectedDate === '' ? 'bg-amber-500 text-stone-900' : 'bg-stone-200 text-stone-700'}`}
          >
            সব
          </button>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-stone-50 border border-stone-300 rounded py-1 px-2 text-xs font-medium focus:outline-none"
          >
            <option value="All">সব ({visitors.length})</option>
            <option value="Inside">ভিতরে আছেন</option>
            <option value="Checked Out">প্রস্থান</option>
          </select>
        </div>
      </div>

      {/* =========================================================================
          VIEW A: MOBILE CARD VIEW (মোবাইল ফোনের জন্য টাচ-ফ্রেন্ডলি কার্ড লিস্ট)
          ========================================================================= */}
      {viewLayout === 'cards' && (
        <div className="space-y-3">
          {filteredVisitors.map((v, idx) => {
            const isInside = !v.out_time || v.status === 'Inside';
            return (
              <div
                key={v.id || idx}
                className={`p-3.5 sm:p-4 rounded-md border transition-all ${
                  isInside 
                    ? 'bg-amber-50/40 border-amber-300 shadow-xs' 
                    : 'bg-white border-stone-200 shadow-xs'
                }`}
              >
                {/* Header: SL, Company, Status */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-stone-900 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      {v.sl || idx + 1}
                    </span>
                    <div>
                      <h4 className="text-sm font-black text-sky-950 flex items-center gap-1.5">
                        <Building size={14} className="text-sky-700 shrink-0" />
                        {v.company_name}
                      </h4>
                      {v.visitor_name && (
                        <div className="text-xs text-stone-700 font-semibold flex items-center gap-1 mt-0.5">
                          <User size={12} className="text-stone-400" />
                          <span>{v.visitor_name}</span>
                          {v.phone_number && (
                            <a 
                              href={`tel:${v.phone_number}`} 
                              className="text-stone-500 font-mono text-[11px] underline ml-1 hover:text-stone-800"
                            >
                              ({v.phone_number})
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-tight shrink-0 ${
                    isInside ? 'bg-amber-200 text-amber-950 border border-amber-400' : 'bg-stone-200 text-stone-700'
                  }`}>
                    {isInside ? 'ভিতরে আছেন' : 'প্রস্থান'}
                  </span>
                </div>

                {/* Body: Who Meet & Purpose */}
                <div className="bg-stone-100/70 p-2.5 rounded text-xs space-y-1 mb-3">
                  <div className="flex items-baseline gap-1 text-stone-900">
                    <span className="font-bold text-stone-500 text-[10px] uppercase">কার সাথে দেখা:</span>
                    <span className="font-black text-amber-950 bg-amber-100/70 px-1.5 py-0.5 rounded">
                      {v.who_meet}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 text-stone-700 text-[11px]">
                    <span className="font-bold text-stone-500 text-[10px] uppercase">উদ্দেশ্য:</span>
                    <span>{v.purpose}</span>
                  </div>
                  {v.id_card_no && (
                    <div className="text-[10px] text-stone-500 font-mono">
                      পাস নং: {v.id_card_no}
                    </div>
                  )}
                </div>

                {/* Time & Action Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-200">
                  {/* In & Out Time */}
                  <div className="flex items-center gap-2 text-xs font-mono font-bold">
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      ইন: {v.in_time}
                    </span>
                    {v.out_time ? (
                      <span className="text-rose-700 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                        আউট: {v.out_time}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleQuickCheckout(v)}
                        className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded text-xs font-black uppercase flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                        title="এক ক্লিকে বের হওয়ার সময় রেকর্ড করুন"
                      >
                        <LogOut size={12} />
                        আউট দিন
                      </button>
                    )}
                  </div>

                  {/* Share & Edit Actions */}
                  <div className="flex items-center gap-1.5">
                    {/* Send WhatsApp */}
                    <button
                      onClick={() => handleOpenWhatsAppForVisitor(v)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold active:scale-95 cursor-pointer"
                      title="এডমিন WhatsApp এ এই ভিজিটরের তথ্য পাঠান"
                    >
                      <MessageCircle size={14} />
                      <span>WA</span>
                    </button>

                    {/* Send Mail */}
                    <button
                      onClick={() => handleOpenEmailForVisitor(v)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded text-xs font-bold active:scale-95 cursor-pointer"
                      title="এডমিন মেইলে পাঠান"
                    >
                      <Mail size={14} />
                      <span>মেইল</span>
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => {
                        setEditingId(v.id || null);
                        setFormData({ ...v });
                        setShowEditModal(true);
                      }}
                      className="p-1.5 text-stone-600 hover:bg-stone-200 rounded cursor-pointer"
                      title="ইডিট"
                    >
                      <Edit2 size={14} />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => v.id && handleDelete(v.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded cursor-pointer"
                      title="ডিলিট"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredVisitors.length === 0 && (
            <div className="p-8 text-center text-stone-400 bg-white border border-stone-200 rounded italic text-xs">
              কোনো ভিজিটর রেকর্ড নেই। উপরের ফরম ব্যবহার করে নতুন এন্ট্রি দিন।
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW B: DESKTOP TABLE VIEW (কম্পিউটার বা এক্সেল স্টাইল টেবিল)
          ========================================================================= */}
      {viewLayout === 'table' && (
        <div className="overflow-x-auto border border-stone-200 rounded shadow-xs bg-white">
          <table className="text-[11px] text-stone-800 border-collapse table-auto w-full min-w-[980px]">
            <thead>
              <tr className="bg-[#1e293b] text-white border-b border-slate-700 select-none">
                <th className="px-2 py-3 border border-slate-700 font-bold text-center w-12">SL</th>
                <th className="px-2.5 py-3 border border-slate-700 font-bold text-center w-24">Date</th>
                <th className="px-3 py-3 border border-slate-700 font-bold text-left">Company Name</th>
                <th className="px-3 py-3 border border-slate-700 font-bold text-left">Visitor Name & Phone</th>
                <th className="px-3 py-3 border border-slate-700 font-bold text-left">Who Meet</th>
                <th className="px-3 py-3 border border-slate-700 font-bold text-left">Purpose</th>
                <th className="px-2 py-3 border border-slate-700 font-bold text-center w-24 bg-[#0f172a] text-emerald-300">
                  In Time
                </th>
                <th className="px-2 py-3 border border-slate-700 font-bold text-center w-28 bg-[#0f172a] text-rose-300">
                  Out Time
                </th>
                <th className="px-2 py-3 border border-slate-700 font-bold text-center w-24">Status</th>
                <th className="px-3 py-3 border border-slate-700 font-bold text-center w-52 bg-[#0f172a] text-amber-300">
                  পাঠান ও অ্যাকশন
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredVisitors.map((v, idx) => {
                const isInside = !v.out_time || v.status === 'Inside';
                const rowBg = isInside ? 'bg-amber-50/20' : (idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/50');

                return (
                  <tr key={v.id || idx} className={`${rowBg} hover:bg-amber-50/40 transition-colors border-b border-stone-200`}>
                    <td className="px-2 py-2.5 border text-center font-bold text-stone-700">{v.sl || idx + 1}</td>
                    <td className="px-2.5 py-2.5 border text-center font-mono text-stone-600">{v.date}</td>
                    <td className="px-3 py-2.5 border text-left font-bold text-sky-950">
                      <div className="flex items-center gap-1.5">
                        <Building size={13} className="text-sky-700 shrink-0" />
                        <span>{v.company_name}</span>
                      </div>
                      {v.id_card_no && (
                        <span className="text-[9px] font-mono text-stone-500 block ml-4">
                          পাস: {v.id_card_no}
                        </span>
                      )}
                    </td>
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
                    <td className="px-3 py-2.5 border text-left font-bold text-amber-900">
                      <span className="bg-amber-100/60 px-1.5 py-0.5 rounded text-amber-950">
                        {v.who_meet}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 border text-left text-stone-700 text-[10px]">
                      {v.purpose}
                    </td>
                    <td className="px-2 py-2.5 border text-center font-mono font-bold text-emerald-700">
                      {v.in_time}
                    </td>
                    <td className="px-2 py-2.5 border text-center font-mono font-bold text-rose-700">
                      {v.out_time ? (
                        v.out_time
                      ) : (
                        <button
                          onClick={() => handleQuickCheckout(v)}
                          className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 text-[10px] font-bold rounded shadow-xs uppercase cursor-pointer"
                        >
                          আউট দিন
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2.5 border text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${
                        isInside ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-stone-100 text-stone-600 border border-stone-200'
                      }`}>
                        {isInside ? 'ভিতরে আছেন' : 'প্রস্থান'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 border text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenWhatsAppForVisitor(v)}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                          title="WhatsApp এ পাঠান"
                        >
                          <MessageCircle size={12} />
                          <span>WA</span>
                        </button>
                        <button
                          onClick={() => handleOpenEmailForVisitor(v)}
                          className="flex items-center gap-1 px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[10px] font-bold cursor-pointer"
                          title="মেইলে পাঠান"
                        >
                          <Mail size={12} />
                          <span>মেইল</span>
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(v.id || null);
                            setFormData({ ...v });
                            setShowEditModal(true);
                          }}
                          className="p-1 text-stone-600 hover:bg-stone-200 rounded cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => v.id && handleDelete(v.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded cursor-pointer"
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
                    কোনো ভিজিটর রেকর্ড নেই।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================================
          📌 STICKY BOTTOM MOBILE ACTION BAR (মোবাইলে স্ক্রিনে ভেসে থাকবে)
          ========================================================================= */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-300 p-2 md:hidden shadow-lg flex items-center justify-between gap-2">
        <button
          onClick={handleInstant1ClickWhatsAppReport}
          className="flex-1 py-2.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded flex items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer"
        >
          <MessageCircle size={15} />
          <span>১-ক্লিকে WA রিপোর্ট</span>
        </button>

        <button
          onClick={handleInstant1ClickEmailReport}
          className="flex-1 py-2.5 px-2 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-black rounded flex items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer"
        >
          <Mail size={15} />
          <span>মেইল রিপোর্ট</span>
        </button>

        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="p-2.5 bg-amber-500 hover:bg-amber-600 text-stone-950 font-black rounded shadow-xs cursor-pointer"
          title="উপরে যান"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* ================= MODAL: INSTANT SHARE OPTIONS (POPUP AFTER ENTRY OR CHECKOUT) ================= */}
      {showSendSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-emerald-700 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} />
                ভিজিটর তথ্য সেভ হয়েছে!
              </h3>
              <button onClick={() => setShowSendSuccessModal(null)} className="text-emerald-200 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="bg-stone-50 border border-stone-200 p-2.5 rounded text-[11px] space-y-1">
                <div>🏢 <strong>কোম্পানি:</strong> {showSendSuccessModal.company_name}</div>
                <div>👤 <strong>সাক্ষাৎকারী:</strong> {showSendSuccessModal.who_meet}</div>
                <div>⏰ <strong>প্রবেশের সময়:</strong> {showSendSuccessModal.in_time}</div>
                {showSendSuccessModal.out_time && (
                  <div>🚪 <strong>বের হওয়ার সময়:</strong> {showSendSuccessModal.out_time}</div>
                )}
              </div>

              <div className="text-center font-bold text-stone-800 text-xs sm:text-sm">
                এডমিনকে কিভাবে আপডেট পাঠাবেন?
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenWhatsAppForVisitor(showSendSuccessModal);
                    setShowSendSuccessModal(null);
                  }}
                  className="w-full p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <MessageCircle size={18} />
                  <div className="text-left">
                    <div className="text-xs font-black">WhatsApp এ এডমিনকে পাঠান</div>
                    <div className="text-[10px] text-emerald-100 font-normal">নম্বর: {adminWhatsAppNumber}</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleOpenGmailWebForVisitor(showSendSuccessModal);
                    setShowSendSuccessModal(null);
                  }}
                  className="w-full p-3 bg-red-600 hover:bg-red-700 text-white rounded font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <ExternalLink size={18} />
                  <div className="text-left">
                    <div className="text-xs font-black">Gmail এ সরাসরি পাঠান</div>
                    <div className="text-[10px] text-red-100 font-normal">প্রাপক: {adminRecipientEmails}</div>
                  </div>
                </button>
              </div>

              <div className="flex justify-end pt-2 border-t border-stone-200">
                <button
                  type="button"
                  onClick={() => setShowSendSuccessModal(null)}
                  className="px-4 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded cursor-pointer"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT VISITOR ================= */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
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

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveVisitorRecord(formData, false);
                setShowEditModal(false);
              }}
              className="p-4 space-y-3 max-h-[82vh] overflow-y-auto text-xs"
            >
              <div className="grid grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-2 gap-2.5">
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

              <div className="grid grid-cols-2 gap-2.5">
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
                      এখন দিন
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
                  className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white font-bold uppercase rounded cursor-pointer"
                >
                  আপডেট সেভ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: SETTINGS (EMAILS & WHATSAPP) ================= */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded shadow-2xl border border-stone-300 w-full max-w-lg overflow-hidden">
            <div className="bg-stone-900 text-white px-4 py-3 flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Settings size={15} className="text-amber-400" />
                ইমেইল ও WhatsApp সেটিংস
              </h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-stone-400 hover:text-white cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveSettings(currentUserEmail, adminRecipientEmails, adminWhatsAppNumber);
              }}
              className="p-4 space-y-3.5 text-xs max-h-[82vh] overflow-y-auto"
            >
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded text-stone-700 text-[11px] leading-relaxed">
                💡 <strong>জিরো API ঝামেলা:</strong> কোনো পাসওয়ার্ড বা API কি ছাড়াই সরাসরি ব্রাউজার থেকে WhatsApp ও মেইল কাজ করে।
              </div>

              {/* Setting 1: Operator / User Email */}
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-stone-900">
                  ১. ইউজারের ইমেইল (Operator Email - সেভ থাকবে):
                </label>
                <input
                  type="email"
                  value={currentUserEmail}
                  onChange={e => setCurrentUserEmail(e.target.value)}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-stone-900"
                  placeholder="user@windygroup.com"
                />
              </div>

              {/* Setting 2: Admin Recipient Email(s) */}
              <div className="space-y-1 pt-1.5 border-t border-stone-200">
                <label className="block text-[11px] font-bold text-stone-900">
                  ২. এডমিন প্রাপক ইমেইল (কমা দিয়ে একাধিক লেখা যাবে):
                </label>
                <textarea
                  rows={2}
                  value={adminRecipientEmails}
                  onChange={e => setAdminRecipientEmails(e.target.value)}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-mono text-stone-900"
                  placeholder="017mattakin@gmail.com, admin@windygroup.com"
                />
              </div>

              {/* Setting 3: Admin WhatsApp Number */}
              <div className="space-y-1 pt-1.5 border-t border-stone-200">
                <label className="block text-[11px] font-bold text-stone-900">
                  ৩. এডমিনের WhatsApp মোবাইল নম্বর:
                </label>
                <input
                  type="text"
                  value={adminWhatsAppNumber}
                  onChange={e => setAdminWhatsAppNumber(e.target.value)}
                  required
                  className="w-full border border-stone-300 p-2 rounded text-xs font-mono font-bold text-emerald-800"
                  placeholder="01711000000"
                />
              </div>

              {/* Supabase Schema Helper */}
              <div className="space-y-1 pt-1.5 border-t border-stone-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[10px] text-stone-500 uppercase">
                    Supabase Visitors Table SQL
                  </span>
                  <button
                    type="button"
                    onClick={copySqlCode}
                    className="text-amber-700 font-bold text-[10px] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Copy size={11} /> {copiedSql ? 'কপি হয়েছে!' : 'SQL কপি'}
                  </button>
                </div>
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
                  className="px-5 py-2 bg-stone-900 hover:bg-black text-white font-bold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Check size={14} className="text-amber-400" />
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
