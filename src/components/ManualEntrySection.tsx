import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import EmployeeSelectorModal from './EmployeeSelectorModal';
import { UserPlus, Calendar, Clock, MapPin, Save, CheckCircle2, AlertCircle, ExternalLink, HelpCircle, Compass, ShieldAlert, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  locations: {id: string, name: string}[];
  onRefresh: () => void;
  viewMode: 'admin' | 'user';
}

export default function ManualEntrySection({ employees, locations, onRefresh, viewMode }: Props) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(() => {
    try {
      const saved = sessionStorage.getItem('attendance_selected_emp');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });
  const [showModal, setShowModal] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inTime, setInTime] = useState('');
  const [outTime, setOutTime] = useState('');
  const [location, setLocation] = useState('');
  const [liveLocIn, setLiveLocIn] = useState<any | null>(null);
  const [liveLocOut, setLiveLocOut] = useState<any | null>(null);
  const [lateRemark, setLateRemark] = useState('');
  const [locing, setLocing] = useState(false);
  const [locingType, setLocingType] = useState<'in' | 'out' | null>(null);
  const [locAttempts, setLocAttempts] = useState<Record<'in' | 'out', number>>(() => {
    try {
      const saved = sessionStorage.getItem('attendance_loc_attempts');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return { in: 0, out: 0 };
  });
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [showHelp, setShowHelp] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'checking' | 'granted' | 'denied' | 'prompt' | 'unsupported'>('idle');

  const testGeolocation = () => {
    if (!navigator.geolocation) {
      setTestStatus('unsupported');
      return;
    }
    setTestStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTestStatus('granted');
      },
      (err) => {
        console.warn("Test location fail:", err);
        setTestStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 4000 }
    );
  };

  const prevEmpIdRef = React.useRef<string | null>(null);

  // Update clock every second
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Effect to reset form when employee changes (only if it's a different employee)
  React.useEffect(() => {
    if (selectedEmp) {
      const empId = String(selectedEmp.id).trim();
      if (prevEmpIdRef.current !== null && prevEmpIdRef.current !== empId) {
        setLiveLocIn(null);
        setLiveLocOut(null);
        setInTime('');
        setOutTime('');
        setLocation('');
        setLateRemark('');
      }
      prevEmpIdRef.current = empId;
    } else {
      prevEmpIdRef.current = null;
    }
  }, [selectedEmp]);

  // Automatically capture IN location for users when ready
  React.useEffect(() => {
    if (selectedEmp && viewMode === 'user' && !fetching && !liveLocIn && !locing && !inTime) {
      handleGetLiveLocation('in');
    }
  }, [selectedEmp, viewMode, fetching, liveLocIn, locing, inTime]);

  React.useEffect(() => {
    const fetchExisting = async () => {
      if (!selectedEmp || !date) return;
      setFetching(true);
      try {
        const { data, error } = await supabase
          .from('attendance')
          .select('*')
          .eq('employee_id', String(selectedEmp.id).trim())
          .eq('date_iso', date)
          .maybeSingle();
        
        if (!error && data) {
          const formatTime = (t: string) => {
            if (!t) return '';
            const match = t.match(/(\d{1,2})\s*[:.]\s*(\d{1,2})/);
            if (match) return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
            return t;
          };
          setInTime(formatTime(data.manual_in_time || data.sys_in_time || ''));
          setOutTime(formatTime(data.manual_out_time || data.sys_out_time || ''));
          setLocation(data.location_id || '');
          setLateRemark(data.late_remark || '');
          
          if (data.live_location_in) {
            try { setLiveLocIn(JSON.parse(data.live_location_in)); } catch (e) { setLiveLocIn(null); }
          } else if (data.live_location && !data.live_location_in) {
             // Fallback for old data
             try { setLiveLocIn(JSON.parse(data.live_location)); } catch (e) { setLiveLocIn(null); }
          } else { setLiveLocIn(null); }

          if (data.live_location_out) {
            try { setLiveLocOut(JSON.parse(data.live_location_out)); } catch (e) { setLiveLocOut(null); }
          } else { setLiveLocOut(null); }
        } else if (error) {
           console.error('Fetch existing error:', error);
        } else {
          setInTime('');
          setOutTime('');
          setLocation('');
        }
      } catch (err) {
        console.error('Fetch existing catch:', err);
      } finally {
        setFetching(false);
      }
    };
    fetchExisting();
  }, [selectedEmp, date]);

  const handleSetTime = (type: 'in' | 'out') => {
    if (locing) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (type === 'in') {
      setInTime(timeStr);
      handleGetLiveLocation('in');
    } else {
      setOutTime(timeStr);
      handleGetLiveLocation('out');
    }
  };

  const handleGetLiveLocation = (type: 'in' | 'out') => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocing(true);
    setLocingType(type);
    
    const handleSuccess = (position: GeolocationPosition) => {
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (type === 'in') setLiveLocIn(coords);
      else setLiveLocOut(coords);
      
      // Fetch address (Reverse Geocoding)
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`)
        .then(res => res.json())
        .then(data => {
          if (data && data.address) {
            const addr = data.address;
            const village = addr.village || addr.suburb || addr.neighbourhood || addr.residential || addr.industrial || addr.road || '';
            const town = addr.city || addr.town || addr.municipality || addr.subdistrict || '';
            const district = addr.state_district || addr.district || addr.county || '';
            
            const formattedParts = [village, town, district].filter(p => p && p.length > 1);
            const address = formattedParts.join(', ');
            const finalLoc = { ...coords, address: address || data.display_name };
            
            if (type === 'in') setLiveLocIn(finalLoc);
            else setLiveLocOut(finalLoc);
          }
        })
        .catch(err => console.error("Geocoding error:", err))
        .finally(() => {
          setLocing(false);
          setLocingType(null);
          setLocAttempts(prev => {
            const nextAttempts = { ...prev, [type]: 0 };
            sessionStorage.setItem('attendance_loc_attempts', JSON.stringify(nextAttempts));
            return nextAttempts;
          });
        });
    };

    const handleFailure = (error: GeolocationPositionError) => {
      console.error("Loc error:", error);
      setLocing(false);
      setLocingType(null);
      
      let reason = "জিপিএস পারমিশন অফ / লোড হচ্ছে না";
      if (error.code === 1) {
         reason = "লোকেশন পারমিশন ব্লকড";
      } else if (error.code === 3) {
         reason = "লোকেশন টাইমআউট (লেট)";
      } else if (error.code === 2) {
         reason = "ডিভাইস জিপিএস বন্ধ";
      }
      
      setLocAttempts(prev => {
        const nextCount = prev[type] + 1;
        const nextAttempts = { ...prev, [type]: nextCount };
        sessionStorage.setItem('attendance_loc_attempts', JSON.stringify(nextAttempts));
        
        if (nextCount >= 4) {
          alert(`লোকেশন পাওয়া যায়নি (${reason})।\n\nপর পর ৪ বার চেষ্টা করা হয়েছে কিন্তু লোকেশন পাওয়া যায়নি।\n\nহাজিরা সচল রাখতে সাময়িকভাবে লোকেশন ছাড়াই সরাসরি সাবমিট করার অনুমতি দেওয়া হলো। 'Submit Attendance' বাটনে চাপ দিয়ে হাজিরা দিন।`);
          
          const fallbackLoc = {
            lat: 0,
            lng: 0,
            address: `${reason} (হাজিরা দেওয়া যাবে)`
          };
          if (type === 'in') setLiveLocIn(fallbackLoc);
          else setLiveLocOut(fallbackLoc);
        } else {
          alert(`লোকেশন পাওয়া যায়নি (${reason})।\n\nঅনুগ্রহ করে ফোনের জিপিএস (GPS/Location) অন করুন এবং ব্রাউজারে লোকেশন পারমিশন Allow করে পুনরায় চেষ্টা করুন (প্রচেষ্টা ${nextCount}/৪)।\n\nব্রাউজারটি এখন রিলোড হবে যেন সব তথ্য প্রথম থেকে শুরু করতে পারেন।`);
          window.location.reload();
        }
        return nextAttempts;
      });
    };

    // Attempt high-accuracy GPS tracking
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos),
      (err) => {
        console.warn("High-accuracy GPS tracking failed, falling back to standard speed-opt tracking...", err);
        // Fallback to low-accuracy (uses tower/Wi-Fi/IP - much faster and works inside buildings)
        navigator.geolocation.getCurrentPosition(
          (pos) => handleSuccess(pos),
          (err2) => handleFailure(err2),
          { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
        );
      },
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 0 }
    );
  };


  const handleSubmit = async () => {
    if (!selectedEmp || !date) return alert('Select employee and date');
    
    let finalLocIn = liveLocIn;
    if (!finalLocIn && inTime && viewMode === 'user') {
      const attempts = locAttempts['in'];
      if (attempts < 4) {
        return alert("আপনার ইন-টাইম জিপিএস (GPS) লোকেশন নেওয়া হয়নি!\n\nঅনুগ্রহ করে অন্তত ৩ বা ৪ বার 'SET TIME & GPS' বাটনে ক্লিক করে লোকেশন নেওয়ার চেষ্টা করুন (আপনার বর্তমান প্রচেষ্টা: " + attempts + "/৪)। ৪ বার ব্যর্থ হলে এমনিতেই সাবমিট করতে পারবেন।");
      }
      finalLocIn = {
        lat: 0,
        lng: 0,
        address: "লোকেশন স্কিপ করা হয়েছে (জিপিএস অফ)"
      };
      setLiveLocIn(finalLocIn);
    }
    
    // STRICT REMARK VALIDATION
    const [h, m] = inTime.split(':').map(Number);
    if ((h > 9 || (h === 9 && m > 15)) && !lateRemark.trim()) {
      return alert("দুঃখিত! আপনি সকাল ০৯:১৫ এর পরে এসেছেন। \n\nদেরি হওয়ার কারণ (Late Remark) অবশ্যই লিখতে হবে, তা না হলে এন্ট্রি সেভ হবে না।");
    }

    let finalLocOut = liveLocOut;
    if (!finalLocOut && outTime && viewMode === 'user') {
      const attempts = locAttempts['out'];
      if (attempts < 4) {
        return alert("আপনার আউট-টাইম জিপিএস (GPS) লোকেশন নেওয়া হয়নি!\n\nঅনুগ্রহ করে অন্তত ৩ বা ৪ বার 'SET TIME & GPS' বাটনে ক্লিক করে লোকেশন নেওয়ার চেষ্টা করুন (আপনার বর্তমান প্রচেষ্টা: " + attempts + "/৪)। ৪ বার ব্যর্থ হলে এমনিতেই সাবমিট করতে পারবেন।");
      }
      finalLocOut = {
        lat: 0,
        lng: 0,
        address: "লোকেশন স্কিপ করা হয়েছে (জিপিএস অফ)"
      };
      setLiveLocOut(finalLocOut);
    }
    
    // Final check for user mode: ensure we use current date if not admin
    const captureDate = viewMode === 'admin' ? date : new Date().toISOString().split('T')[0];
    
    setSaving(true);
    setSaveStatus('idle');
    try {
      // Structure the data beautifully
      const locInStr = finalLocIn ? JSON.stringify(finalLocIn) : null;
      const locOutStr = finalLocOut ? JSON.stringify(finalLocOut) : null;

      const payload: any = {
        employee_id: String(selectedEmp.id).trim(),
        id_number: String(selectedEmp.id).trim(), 
        date_iso: captureDate,
        manual_in_time: inTime || null,
        manual_out_time: outTime || null,
        location_id: location || null,
        status: 'Manual',
        late_remark: lateRemark || null,
        live_location_in: locInStr,
        live_location_out: locOutStr,
        live_location: locInStr // Keep for backward compatibility
      };

      let { error } = await supabase.from('attendance').upsert([payload], { onConflict: 'employee_id,date_iso' });

      // Fallback: If saving fails because of missing columns, try saving with only live_location
      if (error && (error.message?.includes('column') || error.code === '42703')) {
        console.warn('New columns missing in DB, falling back to combined storage in live_location');
        const legacyPayload = {
          employee_id: payload.employee_id,
          id_number: payload.id_number,
          date_iso: payload.date_iso,
          manual_in_time: payload.manual_in_time,
          manual_out_time: payload.manual_out_time,
          location_id: payload.location_id,
          status: payload.status,
          late_remark: payload.late_remark,
          live_location: JSON.stringify({
            in: finalLocIn,
            out: finalLocOut
          })
        };
        const fallbackResult = await supabase.from('attendance').upsert([legacyPayload], { onConflict: 'employee_id,date_iso' });
        error = fallbackResult.error;
      }

      if (error) {
        console.error('Manual Save error details:', error);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('success');
        setLocAttempts({ in: 0, out: 0 });
        try {
          sessionStorage.removeItem('attendance_loc_attempts');
          sessionStorage.removeItem('attendance_selected_emp');
        } catch (e) {
          console.error(e);
        }
        setSelectedEmp(null);
        onRefresh();
        setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      }
    } catch (err: any) {
      console.error('Network Error:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm border border-stone-100 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 mb-6 pb-4 border-b border-stone-50">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-stone-400" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-700">Attendance Entry</h2>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-[10px] font-mono text-amber-600 font-bold flex items-center gap-1">
            <Clock size={10} className="animate-pulse" /> SYSTEM SYNC
          </div>
          <div className="text-sm font-mono font-bold text-stone-800">{currentTime}</div>
        </div>
      </div>
      
        <div className="flex flex-col gap-5 relative flex-grow">
          {fetching && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest animate-pulse">Checking records...</span>
            </div>
          )}

          {viewMode === 'user' && (
            <div className="bg-amber-50 p-3 border border-amber-100 rounded-sm mb-2">
              <p className="text-[10px] text-amber-700 leading-relaxed font-medium">
                <strong>Anti-Fraud Protocol Enabled:</strong> Manual time editing is restricted. Please use the "SET SYSTEM TIME" buttons below to clock in/out exactly at the moment of attendance.
              </p>
            </div>
          )}

          {/* 📍 GEOLOCATION & GPS ALLOW HELPER PANEL */}
          <div className="border border-amber-200 rounded-sm bg-gradient-to-r from-amber-50 to-orange-50/20 overflow-hidden shadow-sm">
            <div className="bg-amber-100/70 p-3 flex items-center justify-between border-b border-amber-200">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-600 animate-spin" style={{ animationDuration: '6s' }} />
                <h3 className="text-xs font-bold text-amber-950">লোকেশন পারমিশন ও জিপিএস গাইড (অবশ্যই পড়ুন)</h3>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setShowHelp(!showHelp);
                  if (!showHelp && testStatus === 'idle') {
                    testGeolocation();
                  }
                }}
                className="text-[10px] font-bold text-amber-800 hover:text-amber-950 bg-white border border-amber-200 px-2 py-0.5 rounded-sm hover:shadow-xs transition-colors"
              >
                {showHelp ? '▲ বন্ধ করুন' : '▼ সমাধান দেখুন'}
              </button>
            </div>

            <div className="p-3">
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-amber-900 leading-relaxed font-semibold">
                  ফোনে বা ক্রোম ব্রাউজারে লোকেশন পারমিশন পপআপ স্ক্রিনে না আসলে নিচের ৩টি ধাপের যেকোনো একটি অনুসরণ করুন:
                </p>

                {/* STEP 1: OPEN IN NEW TAB */}
                <div className="bg-white p-2.5 border border-amber-200/60 rounded-sm">
                  <div className="flex items-start gap-1.5">
                    <span className="bg-amber-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm shrink-0">ধাপ ১</span>
                    <div className="flex-grow">
                      <p className="text-[11px] font-bold text-stone-900 leading-tight mb-1">
                        নতুন ট্যাবে অ্যাপটি ওপেন করুন (১০০% কার্যকারী সমাধান)
                      </p>
                      <p className="text-[9px] text-stone-600 leading-normal mb-2">
                        আপনি বর্তমানে প্রিভিউ ফ্রেমের (iFrame) ভেতর আছেন, তাই ব্রাউজার সুরক্ষার কারণে জিপিএস পারমিশন বক্স নাও দেখাতে পারে। নিচে চাপ দিলে সরাসরি অরিজিনাল ফুল স্ক্রিন ট্যাবে ওপেন হবে এবং জিপিএস অন করার পপআপ সাথে সাথে আসবে।
                      </p>
                      <button
                        type="button"
                        onClick={() => window.open(window.location.href, '_blank')}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-1.5 px-3 rounded-sm text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                      >
                        <ExternalLink size={11} /> নতুন ট্যাবে ফুল-স্ক্রিন অ্যাপ ওপেন করুন
                      </button>
                    </div>
                  </div>
                </div>

                {showHelp && (
                  <div className="flex flex-col gap-2 mt-1">
                    {/* STEP 2: CHROME MOBILE SETTINGS */}
                    <div className="bg-white p-2.5 border border-stone-200 rounded-sm">
                      <div className="flex items-start gap-1.5">
                        <span className="bg-stone-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm shrink-0">ধাপ ২</span>
                        <div>
                          <p className="text-[11px] font-bold text-stone-900 leading-tight mb-1">
                            ক্রোম ফোনের নিজস্ব লোকেশন অন করুন
                          </p>
                          <ul className="text-[9px] text-stone-600 space-y-1 list-decimal list-inside pl-0.5 leading-relaxed">
                            <li>আপনার ফোনের উপর হতে নোটিফিকেশন বার নামিয়ে <strong>GPS বা Location</strong> আইকনটি অন (সবুজ/নীল) করুন।</li>
                            <li>ফোনের ক্রোম ব্রাউজারের ডানপাশের <strong>৩টি ডট (⋮)</strong> এ চাপ দিন ➔ <strong>Settings (সেটিংস)</strong> এ যান।</li>
                            <li>একটু নিচে নেমে <strong>Site Settings (সাইট সেটিংস)</strong> ➔ <strong>Location (লোকেশন)</strong> এ চাপ দিন।</li>
                            <li>সেখানে Blocked তালিকায় এই অ্যাপটি থাকলে সেটিতে ক্লিক করে <strong>Allow (অনুমতি দিন)</strong> করে দিন।</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* STEP 3: DESKTOP CHROME SETTINGS */}
                    <div className="bg-white p-2.5 border border-stone-200 rounded-sm">
                      <div className="flex items-start gap-1.5">
                        <span className="bg-stone-600 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm shrink-0">ধাপ ৩</span>
                        <div>
                          <p className="text-[11px] font-bold text-stone-900 leading-tight mb-1">
                            কম্পিউটার/ডেস্কটপে ক্রোম সেটিংস
                          </p>
                          <p className="text-[9px] text-stone-600 leading-relaxed">
                            web browser-এর একদম উপরে অ্যাড্রেস বার বা লিংকের বাম পাশে অবস্থিত <strong>তালা আইকন (🔒)</strong> ক্লিক করুন এবং <strong>Location</strong> অপশনটি <strong>Allow</strong> করে দিয়ে পেজটি রি-ফ্রেশ দিন।
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* DYNAMIC GPS TESTER */}
                    <div className="bg-white p-2.5 border border-amber-200 rounded-sm">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-1.5 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <RefreshCw size={11} className={`text-amber-600 ${testStatus === 'checking' ? 'animate-spin' : ''}`} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 font-sans">রিয়েল-টাইম জিপিএস টেস্টার</span>
                        </div>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          testStatus === 'granted' ? 'bg-green-100 text-green-800' :
                          testStatus === 'denied' ? 'bg-red-100 text-red-800' :
                          testStatus === 'checking' ? 'bg-amber-100 text-amber-800' :
                          'bg-stone-100 text-stone-600'
                        }`}>
                          {testStatus === 'idle' ? 'Ready' :
                           testStatus === 'checking' ? 'Checking...' :
                           testStatus === 'granted' ? 'অ্যাক্টিভ ✓' :
                           testStatus === 'denied' ? 'ব্লকড ✗' : 'Ready'}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <p className="text-[9px] text-stone-600 leading-snug">
                          আপনার লোকেশন ঠিকমতো কাজ করছে কি না তা নিশ্চিত করতে নিচের বাটনে চাপ দিন এবং ব্রাউজার পারমিশন চাইলে "Allow" করুন।
                        </p>
                        
                        <button
                          type="button"
                          onClick={testGeolocation}
                          disabled={testStatus === 'checking'}
                          className="w-full bg-stone-800 hover:bg-black text-white text-[9px] font-bold py-1 px-2 rounded-xs uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
                        >
                          {testStatus === 'checking' ? 'যাচাই করা হচ্ছে...' : 'লোকেশন সংযোগ পরীক্ষা করুন'}
                        </button>

                        {testStatus === 'granted' && (
                          <p className="text-[9px] text-green-700 font-bold bg-green-50 p-1.5 border border-green-100 rounded-xs">
                            অভিনন্দন! আপনার ব্রাউজার লোকেশন সঠিকভাবে অ্যাক্সেস করতে পারছে। আপনি এখন সাধারণ উপায়ে বা নতুন ট্যাবে থেকে হাজিরা সম্পন্ন করতে পারবেন।
                          </p>
                        )}
                        {testStatus === 'denied' && (
                          <p className="text-[9px] text-red-700 font-bold bg-red-50 p-1.5 border border-red-100 rounded-xs">
                            ব্যর্থ! জিপিএস বা ব্রাউজার পারমিশন ব্লক করা আছে। অনুগ্রহ করে ধাপ ১ অনুযায়ী "নতুন ট্যাবে ওপেন" বা ধাপ ২ অনুযায়ী ব্রাউজার সেটিংস থেকে পারমিশন সচল করুন।
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <UserPlus className="w-3 h-3" /> Employee
            </label>
            <button 
               onClick={() => setShowModal(true)}
               className="w-full border border-stone-200 p-2.5 text-xs text-left bg-white hover:border-stone-400 transition-colors rounded-sm"
            >
               {selectedEmp ? (
                 <span className="text-stone-900 font-medium">{selectedEmp.id} - {selectedEmp.name}</span>
               ) : (
                 <span className="text-stone-400 italic">Select Employee...</span>
               )}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Date
            </label>
            <input 
              type="date" 
              disabled={viewMode === 'user'}
              className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none disabled:bg-stone-50 disabled:text-stone-500" 
              value={date} 
              onChange={e => setDate(e.target.value)} 
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-green-600" /> In Time & Location
              </label>
              <div className="flex gap-1 mb-1">
                <input 
                  type="time" 
                  readOnly={viewMode === 'user'}
                  className="flex-grow border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none read-only:bg-stone-50" 
                  value={inTime} 
                  onChange={e => setInTime(e.target.value)} 
                />
                {viewMode === 'user' && (
                  <button 
                    onClick={() => handleSetTime('in')}
                    disabled={locing}
                    className={`px-4 flex items-center gap-1.5 border rounded-sm text-[10px] font-bold uppercase transition-all ${inTime && liveLocIn ? 'bg-stone-50 border-stone-200 text-stone-400' : 'bg-stone-800 text-white hover:bg-black active:scale-95 shadow-md shadow-stone-100'}`}
                  >
                    {locing && locingType === 'in' ? <span className="animate-spin text-xs">...</span> : <Clock size={12} />}
                    {inTime && liveLocIn ? 'RE-SYNC' : 'SET TIME & GPS'}
                  </button>
                )}
              </div>
              <div className="flex gap-1 items-center relative">
                 <div className="flex-grow flex items-center gap-1 bg-stone-50 border border-stone-200 p-2 text-[9px] rounded-sm overflow-hidden min-h-[34px]">
                    <MapPin size={12} className={liveLocIn ? 'text-green-600' : 'text-stone-300'} />
                    <span className={`font-bold truncate ${liveLocIn ? 'text-green-700' : 'text-stone-400 italic'}`}>
                      {liveLocIn ? (liveLocIn.address || `${liveLocIn.lat.toFixed(4)}, ${liveLocIn.lng.toFixed(4)}`) : 'Location not captured'}
                    </span>
                    {locing && locingType === 'in' && <span className="text-[8px] text-amber-600 animate-pulse font-bold ml-auto uppercase shrink-0">Working...</span>}
                 </div>
                 {viewMode === 'admin' && (
                   <button 
                     type="button"
                     onClick={() => handleGetLiveLocation('in')}
                     className="p-2 border border-stone-200 rounded-sm hover:bg-stone-50"
                   >
                     <MapPin size={12} className="text-stone-400" />
                   </button>
                 )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-red-600" /> Out Time & Location
              </label>
              <div className="flex gap-1 mb-1">
                <input 
                  type="time" 
                  readOnly={viewMode === 'user'}
                  className="flex-grow border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none read-only:bg-stone-50" 
                  value={outTime} 
                  onChange={e => setOutTime(e.target.value)} 
                />
                {viewMode === 'user' && (
                  <button 
                    onClick={() => handleSetTime('out')}
                    disabled={locing}
                    className={`px-4 flex items-center gap-1.5 border rounded-sm text-[10px] font-bold uppercase transition-all ${outTime && liveLocOut ? 'bg-stone-50 border-stone-200 text-stone-400' : 'bg-red-600 text-white hover:bg-red-700 active:scale-95 shadow-md shadow-red-50'}`}
                  >
                    {locing && locingType === 'out' ? <span className="animate-spin text-xs">...</span> : <Clock size={12} />}
                    {outTime && liveLocOut ? 'RE-SYNC' : 'SET TIME & GPS'}
                  </button>
                )}
              </div>
              <div className="flex gap-1 items-center relative">
                 <div className="flex-grow flex items-center gap-1 bg-stone-50 border border-stone-200 p-2 text-[9px] rounded-sm overflow-hidden min-h-[34px]">
                    <MapPin size={12} className={liveLocOut ? 'text-red-600' : 'text-stone-300'} />
                    <span className={`font-bold truncate ${liveLocOut ? 'text-red-700' : 'text-stone-400 italic'}`}>
                      {liveLocOut ? (liveLocOut.address || `${liveLocOut.lat.toFixed(4)}, ${liveLocOut.lng.toFixed(4)}`) : 'Location not captured'}
                    </span>
                    {locing && locingType === 'out' && <span className="text-[8px] text-amber-600 animate-pulse font-bold ml-auto uppercase shrink-0">Working...</span>}
                 </div>
                 {viewMode === 'admin' && (
                   <button 
                     type="button"
                     onClick={() => handleGetLiveLocation('out')}
                     className="p-2 border border-stone-200 rounded-sm hover:bg-stone-50"
                   >
                     <MapPin size={12} className="text-stone-400" />
                   </button>
                 )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold text-stone-400 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Factory Location
            </label>
            <select className="w-full border border-stone-200 p-2.5 text-xs rounded-sm focus:border-stone-400 outline-none bg-white" value={location || ''} onChange={e => setLocation(e.target.value)}>
              <option value="">Select Location</option>
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>

          {/* Late Remark Field - Shows if clocking in after 09:15 AM */}
          {(() => {
            if (!inTime) return false;
            const [hours, minutes] = inTime.split(':').map(Number);
            const isLate = hours > 9 || (hours === 9 && minutes > 15);
            return isLate;
          })() && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-1 bg-amber-50 p-3 border border-amber-100 rounded-sm"
            >
              <label className="text-[10px] uppercase font-bold text-amber-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-500" /> অফিসে পৌঁছাতে দেরি হওয়ার সুনির্দিষ্ট কারণ এখানে লিখুন
              </label>
              <textarea 
                placeholder="অফিসে পৌঁছাতে দেরি হওয়ার সুনির্দিষ্ট কারণ এখানে লিখুন..."
                className="w-full border border-amber-200 p-2 text-xs rounded-sm focus:border-amber-400 outline-none bg-white min-h-[70px]"
                value={lateRemark}
                onChange={e => setLateRemark(e.target.value)}
              />
            </motion.div>
          )}

          <div className="pt-4 mt-auto">
            {/* Warning for Missing Location */}
            {viewMode === 'user' && !liveLocIn && selectedEmp && (
              <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-sm mb-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-amber-800 font-bold leading-tight">
                    GPS লোকেশন নেওয়ার জন্য নিচের 'SET TIME & GPS' বাটনে চাপ দিন।
                  </p>
                  <p className="text-[9px] text-amber-600 leading-tight">
                    ডিভাইসে জিপিএস বন্ধ থাকলে বা লোড না হলে সরাসরি সাবমিট করতে পারবেন।
                  </p>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {saveStatus === 'success' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full bg-green-500 text-white p-3 text-xs font-bold uppercase rounded-sm flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Saved Successfully
                </motion.div>
              ) : saveStatus === 'error' ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full bg-red-500 text-white p-3 text-xs font-bold uppercase rounded-sm flex items-center justify-center gap-2"
                >
                  <AlertCircle size={16} /> Save Error! Try Again
                </motion.div>
              ) : (
                <motion.button 
                  initial={{ opacity: 1 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSubmit} 
                  disabled={fetching || saving}
                  className="w-full bg-stone-800 text-white p-3 text-xs font-bold uppercase hover:bg-stone-900 shadow-lg shadow-stone-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all rounded-sm group"
                >
                  <Save className={`w-4 h-4 transition-transform ${(saving || (locing && viewMode === 'user')) ? 'animate-spin' : 'group-hover:rotate-12'}`} />
                  {saving ? 'Processing...' : fetching ? 'Please wait...' : (locing && viewMode === 'user') ? 'Syncing Location...' : 'Submit Attendance'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

      {showModal && (
        <EmployeeSelectorModal 
          employees={employees} 
          onSelect={(emp) => {
            setSelectedEmp(emp);
            try {
              if (emp) {
                sessionStorage.setItem('attendance_selected_emp', JSON.stringify(emp));
              } else {
                sessionStorage.removeItem('attendance_selected_emp');
              }
            } catch (e) {
              console.error(e);
            }
          }} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </section>
  );
}
