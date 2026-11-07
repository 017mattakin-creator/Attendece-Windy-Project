import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, RefreshCw, ArrowRight, X, FileText, Users, Calendar } from 'lucide-react';
import { UploadStats } from '../lib/uploadParser';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  progress: number;
  uploadStage?: string;
  uploadResult?: UploadStats | null;
  onClearResult?: () => void;
  onNavigateToAttendance?: () => void;
}

export default function UploadSection({ 
  onUpload, 
  inputRef, 
  uploading, 
  progress, 
  uploadStage = 'Processing records...',
  uploadResult = null,
  onClearResult,
  onNavigateToAttendance
}: Props) {
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

  const handleResetAndBrowse = () => {
    if (onClearResult) onClearResult();
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  return (
    <section className="bg-white p-6 rounded-sm shadow-sm transition-all hover:shadow-md space-y-6">
      <div className="flex items-center justify-between border-b border-stone-150 pb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800 flex items-center gap-2">
            <Upload size={16} className="text-stone-700" />
            Upload Attendance Data / বায়োমেট্রিক হাজিরা আপলোড
          </h2>
          <p className="text-[11px] text-stone-500 mt-0.5">
            Compatible with ZKTeco, BioStar, Anviz, Realtime, eSSL Excel (.xlsx, .xls) and CSV logs.
          </p>
        </div>
        {uploadResult && onClearResult && (
          <button 
            onClick={onClearResult}
            className="text-stone-400 hover:text-stone-700 p-1 rounded transition-colors"
            title="Dismiss report"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Result Card when upload finishes */}
      {uploadResult && (
        <div className={`p-5 rounded border ${
          uploadResult.success 
            ? 'bg-green-50/70 border-green-200 text-green-950' 
            : 'bg-red-50/70 border-red-200 text-red-950'
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              {uploadResult.success ? (
                <div className="p-2 bg-green-600 text-white rounded-full">
                  <CheckCircle2 size={20} />
                </div>
              ) : (
                <div className="p-2 bg-red-600 text-white rounded-full">
                  <AlertCircle size={20} />
                </div>
              )}
              <div>
                <h3 className="font-bold text-sm">
                  {uploadResult.success 
                    ? 'Upload Processed Successfully!' 
                    : 'Upload Notice / Error'}
                </h3>
                <p className="text-xs opacity-85 mt-0.5">
                  {uploadResult.errorMessage || (
                    uploadResult.recordsUpserted > 0
                      ? `${uploadResult.recordsUpserted} attendance record(s) synced to database.`
                      : 'No valid attendance records were updated.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onNavigateToAttendance && uploadResult.recordsUpserted > 0 && (
                <button
                  onClick={onNavigateToAttendance}
                  className="bg-green-800 hover:bg-green-900 text-white px-3.5 py-1.5 text-xs font-bold rounded flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  View Attendance <ArrowRight size={13} />
                </button>
              )}
              <button
                onClick={handleResetAndBrowse}
                className="bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw size={12} /> Upload Another
              </button>
            </div>
          </div>

          {/* Stats breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-black/10">
            <div className="bg-white/80 p-2.5 rounded border border-black/5">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 flex items-center gap-1">
                <FileText size={11} /> Rows Read
              </span>
              <span className="text-lg font-bold block mt-0.5 font-mono">
                {uploadResult.totalRowsRead}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-black/5">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 flex items-center gap-1">
                <CheckCircle2 size={11} /> Records Synced
              </span>
              <span className="text-lg font-bold block mt-0.5 font-mono text-green-700">
                {uploadResult.recordsUpserted}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-black/5">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 flex items-center gap-1">
                <Users size={11} /> New Registered
              </span>
              <span className="text-lg font-bold block mt-0.5 font-mono">
                {uploadResult.newEmployeesCreated}
              </span>
            </div>
            <div className="bg-white/80 p-2.5 rounded border border-black/5">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 flex items-center gap-1">
                <Calendar size={11} /> Dates Covered
              </span>
              <span className="text-xs font-bold block mt-1.5 font-mono truncate" title={uploadResult.sampleDates.join(', ')}>
                {uploadResult.sampleDates.length > 0 ? `${uploadResult.sampleDates.length} date(s)` : 'None'}
              </span>
            </div>
          </div>

          {/* Skipped / Inactive Notice */}
          {uploadResult.skippedInactiveCount > 0 && (
            <p className="text-[11px] mt-2.5 text-stone-600 italic">
              ℹ️ {uploadResult.skippedInactiveCount} punch log(s) for resigned/inactive employees (e.g. ID 15641/15895) were filtered out as requested.
            </p>
          )}

          {/* Detailed failure errors if any */}
          {uploadResult.failedDetails && uploadResult.failedDetails.length > 0 && (
            <div className="mt-3 p-3 bg-red-100/80 rounded border border-red-300 text-red-900 text-xs">
              <span className="font-bold block mb-1">Issue Details:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {uploadResult.failedDetails.slice(0, 5).map((detail, idx) => (
                  <li key={idx} className="font-mono text-[11px]">{detail}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Upload Drop Zone */}
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed p-10 flex flex-col items-center justify-center gap-6 text-center transition-all duration-200 rounded-sm
          ${isDragging ? 'border-stone-800 bg-stone-50 scale-[1.01]' : 'border-stone-200 hover:border-stone-400 bg-stone-50/40'}
          ${uploading ? 'pointer-events-none opacity-80' : 'cursor-pointer'}
        `}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <div className={`p-4 rounded-full ${isDragging ? 'bg-stone-200' : 'bg-stone-100'} transition-colors`}>
          <Upload size={32} className={isDragging ? 'text-stone-800' : 'text-stone-500'} />
        </div>
        
        <div className="space-y-1">
          <p className="text-sm font-semibold text-stone-800">
            {isDragging ? 'Drop attendance file here now' : 'Click or Drag & Drop Biometric Machine Logs'}
          </p>
          <p className="text-[10px] text-stone-400 uppercase font-bold tracking-tight">
            Accepts Excel (.xlsx, .xls) and CSV (.csv)
          </p>
        </div>

        <input 
          type="file" 
          ref={inputRef} 
          onChange={onUpload} 
          className="hidden" 
          accept=".csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" 
        />
        
        <button 
          type="button"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation();
            if (inputRef.current) {
              inputRef.current.value = '';
              inputRef.current.click();
            }
          }}
          className="bg-stone-800 text-white px-8 py-3 text-[11px] font-bold uppercase tracking-widest hover:bg-stone-900 disabled:opacity-50 shadow-md shadow-stone-200 transition-all active:scale-95 rounded-sm"
        >
          {uploading ? 'Uploading & Processing...' : 'Browse Computer Files'}
        </button>

        {uploading && (
          <div className="w-full max-w-sm mt-2">
            <div className="bg-stone-200 h-2 w-full rounded-full overflow-hidden">
               <div 
                 className="bg-amber-600 h-full transition-all duration-300" 
                 style={{ width: `${Math.max(5, progress)}%` }}
               />
            </div>
            <p className="text-[10px] text-stone-700 mt-2 font-bold tracking-wide animate-pulse text-center">
              {uploadStage} ({progress}%)
            </p>
          </div>
        )}

        {!uploading && (
          <div className="flex flex-col gap-3 pt-4 border-t border-stone-200 w-full max-w-lg">
            <div className="flex items-center justify-center gap-4 flex-wrap text-stone-500">
               <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                 <CheckCircle2 size={12} className="text-green-600" />
                 Auto Header Detection
               </span>
               <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                 <CheckCircle2 size={12} className="text-green-600" />
                 ZKTeco / Anviz / BioStar
               </span>
               <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                 <CheckCircle2 size={12} className="text-green-600" />
                 Paired In/Out & Raw Logs
               </span>
               <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                 <CheckCircle2 size={12} className="text-green-600" />
                 Excel Serial & Dates
               </span>
            </div>
            <p className="text-[10px] text-stone-400">
              Columns recognized: <strong>No., ID, AC-No, Employee ID, Enroll ID, Name, Date, Time, In Time, Out Time</strong>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

