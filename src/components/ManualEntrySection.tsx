import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import EmployeeSelectorModal from './EmployeeSelectorModal';
import { UserPlus, Calendar, Clock, MapPin, Save, CheckCircle2, AlertCircle, Compass, HelpCircle } from 'lucide-react';
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
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
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
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | 'checking'>('checking');

  // Query and monitor GPS permission
  React.useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as any })
        .then(status => {
          setPermissionStatus(status.state);
          status.onchange = () => {
            setPermissionStatus(status.state);
          };
        })
        .catch(err => {
          console.warn("Permissions API query failed:", err);
          setPermissionStatus('prompt');
        });
    } else {
      setPermissionStatus('prompt');
    }
  }, []);

  // Update clock every second
  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Effect to reset form when employee changes
  React.useEffect(() => {
    if (selectedEmp) {
      setLiveLocIn(null);
      setLiveLocOut(null);
      setInTime('');
      setOutTime('');
      setLocation('');
      setLateRemark('');
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
        });
    };

    const handleFailure = (error: GeolocationPositionError) => {
      console.error("Loc error:", error);
      setLocing(false);
      setLocingType(null);
      
      let msg = "Location capture failed.";
      let bnMsg = "লোকেশন পাওয়া যায়নি। ";
      
      if (error.code === 1) {
         msg = "Permission denied. Please allow location permission.";
         bnMsg += "\n\n১. ব্রাউজারের ওপরে URL বারের তালা (🔒 Lock) আইকন ক্লিক করে Location পারমিশন Allow করে দিন।\n২. ফোনের সেটিংস (Settings) থেকে ক্রোম/সাফারি ব্রাউজারের লোকেশন অনুমতি চালু করুন।";
      } else if (error.code === 3) {
         msg = "Location request timed out.";
         bnMsg += "\nসময় শেষ হয়ে গেছে (Timeout)! ব্রাউজার রিফ্রেশ করে ইন্টারনেট ও ফোনের জিপিএস অন রেখে খোলা জায়গায় কিছুক্ষণ দাঁড়িয়ে পুনরায় 'SET TIME & GPS' দিন।";
      } else if (error.code === 2) {
         msg = "Position unavailable.";
         bnMsg += "\nডিভাইস থেকে জিপিএস লোকেশন পাওয়া সম্ভব হচ্ছে না। ফোনের নোটিফিকেশন বার নামিয়ে 'Location' বা 'GPS' বাটনটি অন আছে কিনা নিশ্চিত হোন।";
      }
      
      alert(`ERROR: ${msg}\n\n${bnMsg}\n\nদুঃখিত! লোকেশন ছাড়া হাজিরা সাবমিট করার কোনো সুযোগ নেই। অনুগ্রহ করে লোকেশন অন ও পারমিশন নিশ্চিত করে পুনরায় চেষ্টা করুন।`);
      
      if (type === 'in') setLiveLocIn(null);
      else setLiveLocOut(null);
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
    
    // STRICT GPS VALIDATION FOR USER VIEW MODE (CANNOT SUBMIT WITHOUT GPS)
    if (viewMode === 'user') {
      if (inTime && (!liveLocIn || liveLocIn.lat === 0 || liveLocIn.address?.includes('ব্যর্থ') || liveLocIn.address?.includes('স্কিপ'))) {
        return alert("দুঃখিত! আপনার ইন-টাইম জিপিএস (GPS) লোকেশন পাওয়া যায়নি। \n\nলোকেশন ছাড়া এন্ট্রি সাবমিট হবে না। অনুগ্রহ করে নিচের নির্দেশিকা দেখে জিপিএস চালু করুন এবং 'SET TIME & GPS' বাটনে চাপ দিয়ে সঠিক লোকেশন ট্র্যাক করুন।");
      }
      if (outTime && (!liveLocOut || liveLocOut.lat === 0 || liveLocOut.address?.includes('ব্যর্থ') || liveLocOut.address?.includes('স্কিপ'))) {
        return alert("দুঃখিত! আপনার আউট-টাইম জিপিএস (GPS) লোকেশন পাওয়া যায়নি। \n\nলোকেশন ছাড়া এন্ট্রি সাবমিট হবে না। অনুগ্রহ করে নিচের নির্দেশিকা দেখে জিপিএস চালু করুন এবং 'SET TIME & GPS' বাটনে চাপ দিয়ে সঠিক লোকেশন ট্র্যাক করুন।");
      }
    }

    const finalLocIn = liveLocIn;
    const finalLocOut = liveLocOut;
    
    // REMARK VALIDATION (NO LONGER MANDATORY)
    const [h, m] = inTime.split(':').map(Number);
    // Late remark is optional now, so we don't alert or block anymore if it's empty.
    
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
        onRefresh();
        setTimeout(() => {
          setSaveStatus('idle');
          if (viewMode === 'admin') {
            // Only reset if admin, usually users just want to see it saved
            // setSelectedEmp(null); 
          }
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

          {/* GPS Info and Test Box - Highly visible & interactive */}
          {viewMode === 'user' && selectedEmp && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-stone-50 rounded-sm border border-stone-200 p-3.5 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      permissionStatus === 'granted' ? 'bg-emerald-400' : permissionStatus === 'denied' ? 'bg-red-400' : 'bg-amber-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      permissionStatus === 'granted' ? 'bg-emerald-500' : permissionStatus === 'denied' ? 'bg-red-500' : 'bg-amber-500'
                    }`}></span>
                  </span>
                  <span className="text-[9.5px] uppercase font-bold text-stone-600 tracking-wider">
                    GPS Diagnostic Status:
                  </span>
                </div>
                
                <span className={`text-[9.5px] font-black uppercase px-2 py-0.5 rounded-full ${
                  permissionStatus === 'granted' 
                    ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/20' 
                    : permissionStatus === 'denied' 
                    ? 'bg-red-500/10 text-red-650 border border-red-500/20' 
                    : 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                }`}>
                  {permissionStatus === 'granted' ? '🟢 সচল (Allowed)' : permissionStatus === 'denied' ? '🔴 বন্ধ (Blocked)' : '🟡 অনুমতি প্রয়োজন (Ask)'}
                </span>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLocing(true);
                    setLocingType('in');
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        setLiveLocIn(coords);
                        setPermissionStatus('granted');
                        
                        // Use accurate Reverse Geocoding
                        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1`)
                          .then(res => res.json())
                          .then(data => {
                            if (data && data.address) {
                              const addr = data.address;
                              const village = addr.village || addr.suburb || addr.neighbourhood || addr.residential || addr.industrial || addr.road || '';
                              const town = addr.city || addr.town || addr.municipality || addr.subdistrict || '';
                              const district = addr.state_district || addr.district || addr.county || '';
                              const address = [village, town, district].filter(p => p && p.length > 1).join(', ') || data.display_name;
                              setLiveLocIn({ ...coords, address });
                            }
                          })
                          .catch(() => {})
                          .finally(() => { setLocing(false); setLocingType(null); });
                        alert("🟢 চমৎকার! জিপিএস অনুমতি সফলভাবে সচল হয়েছে এবং আপনার সঠিক অবস্থান নির্ণয় করা হয়েছে।");
                      },
                      (err) => {
                        setLocing(false);
                        setLocingType(null);
                        let errMsg = "পারমিশন ব্যর্থ হয়েছে।";
                        if (err.code === 1) {
                          errMsg = "বাটনে চাপ দেওয়ার পরও অনুমতি দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজারের বাম পাশের Lock (🔒) আইকনে ক্লিক করে সচল করুন।";
                          setPermissionStatus('denied');
                        } else if (err.code === 3) {
                          errMsg = "লোকেশন পেতে অতিরিক্ত সময় লাগছে (Timeout)। ইন্টারনেট বন্ধ থাকলে বা জিপিএস বন্ধ থাকলে এটি হয়।";
                        }
                        alert(`❌ দুঃখিত! ${errMsg}`);
                      },
                      { enableHighAccuracy: true, timeout: 5000 }
                    );
                  }}
                  className={`w-full py-2 px-3 border rounded-sm flex items-center justify-center gap-1.5 font-bold transition-all text-[11px] ${
                    permissionStatus === 'granted' 
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100' 
                      : 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-100'
                  }`}
                >
                  <Compass size={13} className={locing ? 'animate-spin' : ''} />
                  {permissionStatus === 'granted' ? '✓ জিপিএস টেস্ট করুন (Test GPS)' : '🧭 অনুমতি দিন এবং পরীক্ষা করুন'}
                </button>

                {/* Info Toggle Scroll Button */}
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('gps-manual-guide');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                      el.classList.add('ring-2', 'ring-red-400', 'ring-offset-2');
                      setTimeout(() => el.classList.remove('ring-2', 'ring-red-400', 'ring-offset-2'), 1500);
                    }
                  }}
                  className="w-full py-2 px-3 border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 hover:text-stone-950 font-medium transition-all text-[11px] rounded-sm flex items-center justify-center gap-1.5"
                >
                  <HelpCircle size={13} className="text-stone-400" />
                  কীভাবে অন করবেন? (মোবাইল গাইড)
                </button>
              </div>
            </motion.div>
          )}

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
                <AlertCircle className="w-3 h-3 text-amber-500" /> অফিসে পৌঁছাতে দেরি হওয়ার কারণ (ঐচ্ছিক)
              </label>
              <textarea 
                placeholder="দেরি হওয়ার কারণ লিখুন (বাধ্যতামূলক নয়)..."
                className="w-full border border-amber-200 p-2 text-xs rounded-sm focus:border-amber-400 outline-none bg-white min-h-[70px]"
                value={lateRemark}
                onChange={e => setLateRemark(e.target.value)}
              />
            </motion.div>
          )}

          <div className="pt-4 mt-auto">
            {/* Warning and Step-by-Step GPS Enable Guide */}
            {viewMode === 'user' && selectedEmp && (!liveLocIn || (inTime && (!liveLocIn || liveLocIn.lat === 0)) || (outTime && (!liveLocOut || liveLocOut.lat === 0))) && (
              <div id="gps-manual-guide" className="bg-red-50 border border-red-200 p-3 rounded-sm mb-3 space-y-2 text-stone-900 shadow-sm transition-all duration-300">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5 animate-pulse" />
                  <div className="flex flex-col">
                    <p className="text-[11px] text-red-800 font-black leading-tight">
                      লোকেশন জিপিএস (GPS) বাধ্যতামূলক!
                    </p>
                    <p className="text-[9.5px] text-red-600 mt-0.5 leading-snug">
                      লোকেশন তথ্য ছাড়া হাজিরা সাবমিট করা যাবে না। অনুগ্রহ করে নিচের নিয়মে আপনার ব্রাউজার ও ফোনের লোকেশন অন করুন:
                    </p>
                  </div>
                </div>

                <div className="border-t border-red-100 pt-2 space-y-2 text-[10px]">
                  <div className="bg-white/90 p-2 rounded-sm border border-red-100 space-y-1 text-slate-700">
                    <p className="font-bold text-red-800 text-[10px]">১. ব্রাউজার পারমিশন (Chrome / Safari):</p>
                    <p className="text-[9px] leading-relaxed">
                      ব্রাউজারের ওপরে যেখানে ওয়েবসাইটের লিংক (URL) লেখা থাকে, তার বাম পাশের <strong className="text-stone-900 font-bold">তালা বা সেটিংস আইকনটিতে (🔒 Lock)</strong> ক্লিক করুন। <strong className="text-emerald-700">Location</strong> অপশনটি খুজে বের করে <strong className="text-emerald-700">"Allow" / "অনুমতি দিন"</strong> সিলেক্ট করুন।
                    </p>

                    <p className="font-bold text-red-800 text-[10px] mt-1.5">২. মোবাইল ফোনের জিপিএস অন:</p>
                    <p className="text-[9px] leading-relaxed">
                      মোবাইলে স্ক্রিনের উপর থেকে টান দিয়ে <strong className="text-stone-900 font-bold">Location / GPS</strong> বাটনটি সচল করুন। অথবা ফোনের Settings &gt; Location-এ গিয়ে চালু করুন।
                    </p>

                    <p className="font-bold text-red-800 text-[10px] mt-1.5">৩. ক্রোম/সাফারি অ্যাপ পারমিশন:</p>
                    <p className="text-[9px] leading-relaxed">
                      ফোনের Settings &gt; Apps &gt; Chrome (বা Safari) &gt; Permissions &gt; Location এ গিয়ে <strong className="text-emerald-700">"Allow only while using the app"</strong> এবং <strong className="text-emerald-700">"Use precise location" (নির্ভুল বা নির্ভুল অবস্থান)</strong> দুটোই সিলেক্ট করে দিন।
                    </p>
                  </div>

                  <p className="text-[9.5px] bg-amber-100 p-2 text-amber-950 font-bold rounded-sm border border-amber-200 leading-tight">
                    💡 তথ্য অন করার পর, সময়ের পাশে থাকা "SET TIME & GPS" বাটনে চাপ দিয়ে পুনরায় লোকেশন রেকর্ড সচল করুন।
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

      {showModal && <EmployeeSelectorModal employees={employees} onSelect={setSelectedEmp} onClose={() => setShowModal(false)} />}
    </section>
  );
}
