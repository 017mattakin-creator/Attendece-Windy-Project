import React from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
}

export default function UploadSection({ onUpload, inputRef, uploading }: Props) {
  return (
    <section className="bg-white p-6 rounded-sm shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-widest text-stone-700 mb-6">Upload Data</h2>
      <div className="border-2 border-dashed border-stone-300 p-10 flex flex-col items-center justify-center gap-4">
        <Upload size={32} className="text-stone-400" />
        <input type="file" ref={inputRef} onChange={onUpload} className="hidden" accept=".csv" />
        <button 
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="bg-stone-800 text-white px-4 py-2 text-xs font-bold uppercase hover:bg-stone-900"
        >
          {uploading ? 'Uploading...' : 'Select CSV File'}
        </button>
        <p className="text-xs text-stone-500">Only CSV files supported</p>
      </div>
    </section>
  );
}
