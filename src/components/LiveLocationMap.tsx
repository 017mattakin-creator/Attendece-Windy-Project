import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

interface Props {
  attendance: any[];
}

export default function LiveLocationMap({ attendance }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const todayRecords = attendance.filter(a => a.dateISO === today && a.live_location);

  const markers = todayRecords.map(a => {
    try {
      const loc = JSON.parse(a.live_location);
      return {
        id: `${a.no}_${a.dateISO}`,
        lat: Number(loc.lat),
        lng: Number(loc.lng),
        address: loc.address || "",
        name: String(a.name),
        time: String(a.manualInTime || a.sysInTime || '-')
      };
    } catch (e) {
      return null;
    }
  }).filter((m): m is any => m !== null);

  if (markers.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-sm p-8 text-center">
        <MapPin className="w-8 h-8 text-stone-300 mx-auto mb-2" />
        <p className="text-stone-400 text-xs font-bold uppercase tracking-wider">No Location Captured Today</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-sm overflow-hidden divide-y divide-stone-100">
      <div className="bg-stone-50 px-4 py-2 border-b border-stone-200 flex justify-between items-center">
        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Live Address Feed ({markers.length})</span>
        <span className="text-[9px] font-mono text-stone-400">{new Date().toLocaleDateString()}</span>
      </div>
      <div className="max-h-[300px] overflow-y-auto">
        {markers.map((m: any) => (
          <div key={m.id} className="p-3 flex items-center justify-between hover:bg-stone-50 transition-colors">
            <div className="flex items-center gap-3 flex-grow min-w-0">
              <div className="w-8 h-8 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <MapPin size={14} className="text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-900 truncate">{m.name}</p>
                <p className="text-[10px] text-stone-500 truncate mb-0.5">
                  {m.address || "Location Captured"}
                </p>
                <p className="text-[9px] text-stone-400 font-medium">Checked in at {m.time}</p>
              </div>
            </div>
            <a 
              href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[10px] font-bold uppercase rounded-sm transition-all shrink-0 ml-4"
            >
              Map <ExternalLink size={10} />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
