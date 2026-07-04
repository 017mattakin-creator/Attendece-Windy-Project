import React, { useState } from 'react';
import { Upload, CheckCircle2 } from 'lucide-react';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  progress: number;
}

export default function UploadSection({ onUpload, inputRef, uploading, progress }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (inputRef.current) {
        inputRef.current.files = dataTransfer.files;
        const event = {
          target: inputRef.current
        } as React.ChangeEvent<HTMLInputElement>;
        onUpload(event);
      }
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm transition-all hover:shadow-md">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6 flex items-center gap-2">
        <Upload size={14} />
        Upload Attendance Data
      </h2>
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed p-10 flex flex-col items-center justify-center gap-6 text-center transition-all duration-200
          ${isDragging ? 'border-stone-800 bg-stone-50 scale-[1.01]' : 'border-stone-200 hover:border-stone-300'}
          ${uploading ? 'pointer-events-none opacity-80' : 'cursor-pointer'}
        `}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <div className={`p-4 rounded-full ${isDragging ? 'bg-stone-200' : 'bg-stone-100'} transition-colors`}>
          <Upload size={32} className={isDragging ? 'text-stone-800' : 'text-stone-400'} />
        </div>
        
        <div className="space-y-1">
          <p className="text-sm font-medium text-stone-800">
            {isDragging ? 'Drop file now' : 'Click or Drag & Drop File'}
          </p>
          <p className="text-[10px] text-stone-400 uppercase font-bold tracking-tight">CSV, XLSX, XLS</p>
        </div>

        <input 
          type="file" 
          ref={inputRef} 
          onChange={onUpload} 
          className="hidden" 
          accept=".csv,.xlsx,.xls" 
        />
        
        <button 
          disabled={uploading}
          className="bg-stone-800 text-white px-8 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-stone-900 disabled:opacity-50 shadow-lg shadow-stone-100 transition-all active:scale-95"
        >
          {uploading ? 'Processing Data...' : 'Browse Machine Logs'}
        </button>

        {uploading && (
          <div className="w-full max-w-xs mt-2">
            <div className="bg-stone-100 h-1.5 w-full rounded-full overflow-hidden">
               <div 
                 className="bg-stone-800 h-full transition-all duration-300" 
                 style={{ width: `${progress}%` }}
               />
            </div>
            <p className="text-[9px] text-stone-500 mt-2 uppercase font-extrabold tracking-widest animate-pulse text-center">
              Processing Records: {progress}%
            </p>
          </div>
        )}

        {!uploading && (
          <div className="flex flex-col gap-2 pt-4 border-t border-stone-50 w-full">
            <div className="flex items-center justify-center gap-3">
               <span className="flex items-center gap-1 text-[8px] text-stone-400 font-bold uppercase">
                 <CheckCircle2 size={8} className="text-green-500" />
                 Auto-Match
               </span>
               <span className="flex items-center gap-1 text-[8px] text-stone-400 font-bold uppercase">
                 <CheckCircle2 size={8} className="text-green-500" />
                 Registration
               </span>
               <span className="flex items-center gap-1 text-[8px] text-stone-400 font-bold uppercase">
                 <CheckCircle2 size={8} className="text-green-500" />
                 Excel
               </span>
            </div>
            <p className="text-[9px] text-stone-300 italic">
              Ensure file has ID column (No., ID, or Employee ID)
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
