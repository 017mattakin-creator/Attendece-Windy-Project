import React from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  progress: number;
}

export default function UploadSection({ onUpload, inputRef, uploading, progress }: Props) {
  return (
    <section className="bg-white p-6 rounded-sm shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6">Upload Data</h2>
      <div className="border-2 border-dashed border-stone-300 p-10 flex flex-col items-center justify-center gap-4 text-center">
        <Upload size={32} className="text-stone-400" />
        <input type="file" ref={inputRef} onChange={onUpload} className="hidden" accept=".csv" />
        <button 
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="bg-stone-800 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-stone-900 disabled:opacity-50"
        >
          {uploading ? 'Processing...' : 'Select CSV File'}
        </button>
        {uploading && (
          <div className="w-full max-w-xs mt-2">
            <div className="bg-stone-100 h-2 w-full rounded-full overflow-hidden">
               <div 
                 className="bg-stone-800 h-full transition-all duration-300" 
                 style={{ width: `${progress}%` }}
               />
            </div>
            <p className="text-[10px] text-stone-500 mt-1 uppercase font-bold tracking-tighter">
              Uploading: {progress}%
            </p>
          </div>
        )}
        {!uploading && <p className="text-xs text-stone-500">Only CSV files supported</p>}
      </div>
    </section>
  );
}
