import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Search, Calendar, MapPin, FileDown } from 'lucide-react';
import { getTodayShiftDate, getEmployeeShift } from '../lib/dateUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const getCellStatusInfo = (status: string) => {
    switch (status) {
        case 'OffDay':
            return { text: 'OFF DAY', color: 'text-stone-500 font-bold', bg: 'bg-stone-100' };
        case 'Festival':
            return { text: 'FESTIVAL', color: 'text-purple-600 font-bold', bg: 'bg-purple-100/55' };
        case 'Absent':
            return { text: 'ABSENT', color: 'text-red-500 font-bold', bg: 'bg-red-50' };
        case 'CL':
            return { text: 'CL (CASUAL)', color: 'text-amber-600 font-bold', bg: 'bg-amber-100/45' };
        case 'SL':
            return { text: 'SL (SICK)', color: 'text-orange-600 font-bold', bg: 'bg-orange-100/45' };
        case 'Holiday':
            return { text: 'HOLIDAY', color: 'text-blue-500 font-bold', bg: 'bg-blue-50' };
        default:
            return null;
    }
};

const parseTimeToMinutes = (timeStr: string): number | null => {
    if (!timeStr) return null;
    const clean = timeStr.trim().toUpperCase();
    
    // Check for HH:MM:SS or HH:MM with AM/PM
    const ampmMatch = clean.match(/^(\d+):(\d+)(?::\d+)?\s*(AM|PM)$/);
    if (ampmMatch) {
         let hours = parseInt(ampmMatch[1], 10);
         const minutes = parseInt(ampmMatch[2], 10);
         const ampm = ampmMatch[3];
         if (ampm === 'PM' && hours < 12) hours += 12;
         if (ampm === 'AM' && hours === 12) hours = 0;
         return hours * 60 + minutes;
    }
    
    // Check for HH:MM format
    const standardMatch = clean.match(/^(\d+):(\d+)(?::\d+)?$/);
    if (standardMatch) {
         const hours = parseInt(standardMatch[1], 10);
         const minutes = parseInt(standardMatch[2], 10);
         return hours * 60 + minutes;
    }
    
    return null;
};

const getEmployeeRemarksForDate = (empId: string, dates: string | string[], attendanceList: any[], locationList: any[]) => {
    const datesArr = Array.isArray(dates) ? dates : [dates];
    const validDates = datesArr.filter(Boolean);
    if (validDates.length === 0) return { text: '', color: '', bg: '' };
    
    const customRemarks: string[] = [];
    let isAnyLate = false;
    
    const specialLateIds = ['16153', '15439', '16325', '16117', '15641'];
    const cleanId = String(empId).trim();
    const isSpecial = specialLateIds.includes(cleanId);
    
    // 09:10 AM is 9 * 60 + 10 = 550 minutes. Others all 08:10 AM is 8 * 60 + 10 = 490 minutes.
    const limitMinutes = isSpecial ? (9 * 60 + 10) : (8 * 60 + 10);
    const empShift = getEmployeeShift(empId);
    
    // 1. Collect custom remarks from all selected dates so we don't lose manually entered remarks
    for (const d of validDates) {
        const rec = attendanceList.find((a: any) => String(a.no).trim() === String(empId).trim() && a.dateISO === d);
        if (rec) {
            const customRemark = rec.late_remark?.trim();
            if (customRemark) {
                customRemarks.push(customRemark);
            }
        }
    }

    // 2. ONLY calculate automatic "Late" status based on the LATEST/LAST selected date of the range
    const lastDate = validDates[validDates.length - 1];
    if (lastDate) {
        const rec = attendanceList.find((a: any) => String(a.no).trim() === String(empId).trim() && a.dateISO === lastDate);
        if (rec) {
            const statusValue = rec.status || '';
            const customRemark = rec.late_remark?.trim();
            // Only auto-mark if the employee was Present/Manual and has no manual remark on the last date
            if (!customRemark && (statusValue === 'Present' || statusValue === 'Manual')) {
                const originalIn = rec.manualInTime || rec.sysInTime || '';
                const inMinutes = parseTimeToMinutes(originalIn);
                if (inMinutes !== null) {
                    if (empShift !== 'Night') {
                        // Only Day Shift gets checked for late, and only for morning clock-ins (before 12:00 PM)
                        if (inMinutes < 12 * 60) {
                            if (inMinutes > limitMinutes) {
                                isAnyLate = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if (customRemarks.length > 0) {
        const uniqueRemarks = Array.from(new Set(customRemarks));
        return {
            text: uniqueRemarks.join(', '),
            color: 'text-red-600 font-bold',
            bg: 'bg-red-50'
        };
    }

    if (isAnyLate) {
        return {
            text: 'Late',
            color: 'text-red-600 font-bold',
            bg: ''
        };
    }
    
    return { text: '', color: '', bg: '' };
};

interface Props {
    employees: any[];
    attendance: any[];
    locations?: any[];
    onEmployeeClick?: (empId: string) => void;
}

export default function ComparisonSection({ employees, attendance, locations = [], onEmployeeClick }: Props) {
    const [searchTerm, setSearchTerm] = useState('');
    
    // Find custom dynamic default range based on latest available data to prevent blank starts
    const getDefaultDates = () => {
        const availableDates = attendance
            .map(a => a.dateISO)
            .filter(Boolean)
            .sort();
        
        if (availableDates.length > 0) {
            const lastDate = availableDates[availableDates.length - 1];
            // Get previous date ISO
            const parts = lastDate.split('-');
            if (parts.length === 3) {
                const [ystr, mstr, dstr] = parts;
                const dObj = new Date(parseInt(ystr, 10), parseInt(mstr, 10) - 1, parseInt(dstr, 10) - 1);
                const py = dObj.getFullYear();
                const pm = String(dObj.getMonth() + 1).padStart(2, '0');
                const pd = String(dObj.getDate()).padStart(2, '0');
                return {
                    start: `${py}-${pm}-${pd}`,
                    end: lastDate
                };
            }
        }
        
        // Default fallback to 2026-05-20 and 2026-05-21 as seen in the user's image
        return {
            start: '2026-05-20',
            end: '2026-05-21'
        };
    };

    const initialDates = getDefaultDates();
    const [startDate, setStartDate] = useState(initialDates.start);
    const [endDate, setEndDate] = useState(initialDates.end);

    // Dynamic list of dates in selected range
    const getDatesInRange = (startStr: string, endStr: string): string[] => {
        const dates: string[] = [];
        if (!startStr || !endStr) return dates;
        const startObj = new Date(startStr);
        const endObj = new Date(endStr);
        if (isNaN(startObj.getTime()) || isNaN(endObj.getTime())) return dates;
        
        const current = new Date(startObj);
        while (current <= endObj) {
            const y = current.getFullYear();
            const m = String(current.getMonth() + 1).padStart(2, '0');
            const d = String(current.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
            current.setDate(current.getDate() + 1);
            if (dates.length > 31) break; // Safeguard limit
        }
        return dates;
    };

    const datesInRange = getDatesInRange(startDate, endDate);
    const minTableWidth = 830 + (datesInRange.length * 270);

    // Exact designation-seniority ranking mapping to reproduce the visual sequence from the screenshot
    const rankDesignation = (desig: string): number => {
        const d = (desig || '').toLowerCase().trim();
        if (d.includes('dgm') || d.includes('general manager') || d.includes('division')) return 1;
        if (d.includes('deputy manager') || d.includes('deputy')) return 2;
        if (d.includes('sr. project engineer') || d.includes('senior project')) return 3;
        if (d.includes('sr. site engineer') || d.includes('senior site')) return 4;
        if (d.includes('site engineer')) return 5;
        if (d.includes('mep') || d.includes('engineer-mep')) return 6;
        if (d.includes('asst. engineer') || d.includes('assistant engineer')) return 7;
        if (d.includes('accounts & store') || d.includes('officer accounts')) return 8;
        if (d.includes('accountant') || d.includes('project accountant')) return 9;
        if (d.includes('fire & safety') || d.includes('safety officer')) return 10;
        if (d.includes('executive - admin') || d.includes('admin executive') || d.includes('executive')) return 11;
        if (d.includes('supervisor-civil') || d.includes('civil supervisor') || d.includes('supervisor')) return 12;
        if (d.includes('electrical officer') || d.includes('electrical')) return 13;
        if (d.includes('welder') || d.includes('weldder')) return 14;
        if (d.includes('plant operator') || (d.includes('operator') && d.includes('plant'))) return 15;
        if (d.includes('pump operator') || d.includes('pump')) return 16;
        if (d.includes('asst. site supervisor') || d.includes('assistant site supervisor')) return 17;
        if (d.includes('backhoe') || d.includes('driver')) return 18;
        if (d.includes('office asst') || d.includes('office assistant') || d.includes('asst')) return 19;
        return 100; // Low-level staff
    };

    // The explicit 24-person sequence with designated Category mapping (SR.STAFF and JR.STAFF) requested by the user
    const TARGET_PEOPLE: { id: string, name: string, category: 'SR.STAFF' | 'JR.STAFF' }[] = [
        { id: '16153', name: 'MD. GHULAM KEBRIA', category: 'SR.STAFF' },
        { id: '15439', name: 'MD.ASHRAF ALI', category: 'SR.STAFF' },
        { id: '16325', name: 'MD. ASADUZZAMAN', category: 'SR.STAFF' },
        { id: '15524', name: 'UJJAL CHANDRA DEY', category: 'SR.STAFF' },
        { id: '16135', name: 'REZA-E-MOSTOFA', category: 'SR.STAFF' },
        { id: '16117', name: 'MD. FARHAD SIKDER', category: 'SR.STAFF' },
        { id: '15525', name: 'MD. KAMRUZZAMAN', category: 'SR.STAFF' },
        { id: '15641', name: 'JUBAIR BIN AHMED', category: 'SR.STAFF' },
        { id: '16254', name: 'MD. IMTIAZ FARUK RAFID', category: 'SR.STAFF' },
        { id: '15608', name: 'ASHRAFUL ALAM', category: 'SR.STAFF' },
        { id: '16279', name: 'YASIN ARAFAT JOY', category: 'SR.STAFF' },
        
        { id: '15590', name: 'ANUDHUTI DAM', category: 'JR.STAFF' },
        { id: '15832', name: 'HARUN-OR RASHID', category: 'JR.STAFF' },
        { id: '16187', name: 'MD. AL AMIN', category: 'JR.STAFF' },
        { id: '15548', name: 'MD. MOTTAKIN ISLAM', category: 'JR.STAFF' },
        { id: '16110', name: 'SHUVA SHARMA', category: 'JR.STAFF' },
        { id: '16004', name: 'MD. AZIZUR RAHMAN', category: 'JR.STAFF' },
        { id: '16114', name: 'MD. ALAMGIR RAHMAN', category: 'JR.STAFF' },
        { id: '16270', name: 'MOHAMMAD AL-AMIN', category: 'JR.STAFF' },
        { id: '16099', name: 'ALIN AHMMED', category: 'JR.STAFF' },
        { id: '16193', name: 'MD. NAJIM', category: 'JR.STAFF' },
        { id: '16009', name: 'MD. RIPON ISLAM', category: 'JR.STAFF' },
        { id: '15973', name: 'ZIA UDDIN', category: 'JR.STAFF' },
        { id: '16156', name: 'MD. SAMSUL ALAM', category: 'JR.STAFF' }
    ];

    // Build the executive list corresponding exactly to the 24 requested staff sequence
    const mappedEmployees = TARGET_PEOPLE.map(target => {
        const dbEmp = employees.find(e => String(e.id).trim() === target.id);
        if (dbEmp) {
            return {
                ...dbEmp,
                category: target.category // Override category with either SR.STAFF or JR.STAFF
            };
        } else {
            // High-fidelity fallback stubs if some employees have not been fully initialized in the source DB yet
            return {
                id: target.id,
                name: target.name,
                designation: target.id === '16153' ? 'Assistant General Manager' :
                             target.id === '15439' ? 'Sr. Project Engineer' :
                             target.id === '16325' ? 'Deputy Manager (Store)' :
                             target.id === '15524' ? 'Sr. Site Engineer' :
                             target.id === '16135' ? 'Site Engineer' :
                             target.id === '16117' ? 'Officer Accounts' :
                             target.id === '15525' ? 'Site Engineer' :
                             target.id === '15641' ? 'Accounts & Store' :
                             target.id === '16254' ? 'Site Engineer' :
                             target.id === '15608' ? 'Engineer-MEP' :
                             target.id === '16279' ? 'Asst. Engineer' :
                             target.id === '15590' ? 'Sr. Executive - Admin' :
                             target.id === '15832' ? 'Project Accountant' :
                             target.id === '16187' ? 'Fire & Safety Officer' :
                             target.id === '15548' ? 'Sr. Executive - Admin' :
                             target.id === '16110' ? 'Supervisor-Civil' :
                             target.id === '16004' ? 'Electrical Officer' :
                             target.id === '16114' ? 'Electrical Officer' :
                             target.id === '16270' ? 'Welder' :
                             target.id === '16099' ? 'Plant Operator' :
                             target.id === '16193' ? 'Pump Operator' :
                             target.id === '16009' ? 'Asst. Site Supervisor' :
                             target.id === '15973' ? 'Backhoe - Driver' :
                             target.id === '16156' ? 'Office Asst.' : '-',
                education: 'Graduate|Day',
                category: target.category,
                salary: '-',
                joinDate: '',
                phoneNumber: ''
            };
        }
    });

    const sortedEmployees = mappedEmployees.filter(emp => {
        const term = searchTerm.toLowerCase();
        return (
            emp.id.toLowerCase().includes(term) ||
            emp.name.toLowerCase().includes(term) ||
            (emp.designation || '').toLowerCase().includes(term) ||
            (emp.category || '').toLowerCase().includes(term)
        );
    });

    // Sub-helpers for exact design display:
    const formatJoinDate = (dateStr: string) => {
        if (!dateStr) return '-';
        if (/[a-zA-Z]/.test(dateStr)) return dateStr;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        let ystr = parts[0];
        let mstr = parts[1];
        let dstr = parts[2];
        if (ystr.length < 4) {
            dstr = parts[0];
            mstr = parts[1];
            ystr = parts[2];
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const idx = parseInt(mstr, 10) - 1;
        const monthName = months[idx] || mstr;
        const yearShort = ystr.length === 4 ? ystr.substring(2) : ystr;
        const dayClean = parseInt(dstr, 10);
        return `${dayClean}-${monthName}-${yearShort}`;
    };

    const formatHeaderDate = (dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const [ystr, mstr, dstr] = parts;
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const idx = parseInt(mstr, 10) - 1;
        const monthName = months[idx] || mstr;
        const yearShort = ystr.substring(2);
        const dayClean = parseInt(dstr, 10);
        return `${dayClean}-${monthName}-${yearShort}`;
    };

    // Excel Export matching exact visual blueprint rules
    const exportToExcel = () => {
        const headerRow = [
            'SL', 'Emp ID', 'Name', 'Designation', 'Education', 'Employee Category', 'Salary', 'Join Date', 'Phone Number'
        ];
        
        datesInRange.forEach(dStr => {
            const dayOfDate = dStr.split('-')[2] || '';
            const formattedDate = formatHeaderDate(dStr);
            headerRow.push(`Project Location${dayOfDate}`);
            headerRow.push(`${formattedDate} (IN TIME)`);
            headerRow.push(`${formattedDate} (OUT TIME)`);
        });

        headerRow.push('Remarks');

        const sheetData = [headerRow];

        sortedEmployees.forEach((emp, i) => {
            const rowData: any[] = [
                i + 1,
                emp.id,
                emp.name,
                emp.designation,
                emp.education || '',
                emp.category || '',
                emp.salary || '',
                formatJoinDate(emp.joinDate),
                emp.phoneNumber || ''
            ];

            datesInRange.forEach(dStr => {
                const rec = attendance.find((a: any) => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dStr);
                const isFuture = dStr > getTodayShiftDate(getEmployeeShift(emp.id));
                const statusValue = rec ? rec.status : (isFuture ? '-' : 'Absent');
                
                const isPresent = statusValue === 'Present' || statusValue === 'Manual';
                let locName = '-';
                let inTime = '';
                let outTime = '';
                
                if (isPresent) {
                    locName = rec ? (locations.find(l => l.id === rec.locationId)?.name || rec.locationId || '-') : '-';
                    inTime = rec ? (rec.manualInTime || rec.sysInTime || '') : '';
                    outTime = rec ? (rec.manualOutTime || rec.sysOutTime || '') : '';
                } else if (statusValue !== '-') {
                    const statusLabels: Record<string, string> = {
                        'OffDay': 'OFF DAY',
                        'Festival': 'FESTIVAL',
                        'Absent': 'ABSENT',
                        'CL': 'CL (CASUAL)',
                        'SL': 'SL (SICK)',
                        'Holiday': 'HOLIDAY'
                    };
                    const lbl = statusLabels[statusValue] || statusValue.toUpperCase();
                    locName = '-';
                    inTime = lbl;
                    outTime = lbl;
                }
                
                rowData.push(locName);
                rowData.push(inTime);
                rowData.push(outTime);
            });

            const remarksObj = getEmployeeRemarksForDate(emp.id, datesInRange, attendance, locations);
            rowData.push(remarksObj.text);

            sheetData.push(rowData);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Comparison Report');
        XLSX.writeFile(wb, `Comparison_Report_${startDate}_to_${endDate}.xlsx`);
    };

    const exportToPDF = () => {
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Add Beautiful Report Title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(30, 41, 59); // Slate 800
        doc.text("WINDY GROUP", 8, 8);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105); // Slate 600
        doc.text("PROJECT ATTENDANCE SUMMARY & TIMELINE ", 46, 8);
        
        doc.setFontSize(7.5);
        doc.setTextColor(115, 115, 115); // Neutral 400
        doc.text(`CONFIDENTIAL — REPORT GENERATED IN REAL-TIME`, 8, 12);
        
        // Right side metadata
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`DATE RANGE: ${formatHeaderDate(startDate)} TO ${formatHeaderDate(endDate)}`, 289, 8, { align: 'right' });
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 289, 12, { align: 'right' });

        // Accent Line
        doc.setDrawColor(30, 41, 59); // Slate-800
        doc.setLineWidth(0.4);
        doc.line(8, 14.5, 289, 14.5);

        // Header definitions
        const headers = [
            'SL', 'Emp ID', 'Name', 'Designation', 'Education', 'Category', 'Salary', 'Join Date', 'Phone No'
        ];
        
        datesInRange.forEach(dStr => {
            const dayOfDate = dStr.split('-')[2] || '';
            const formattedDate = formatHeaderDate(dStr);
            headers.push(`Proj. Loc ${dayOfDate}`);
            headers.push(`${formattedDate} (IN TIME)`);
            headers.push(`${formattedDate} (OUT TIME)`);
        });

        headers.push('Remarks');

        // Rows data
        const rows: any[] = [];
        sortedEmployees.forEach((emp, i) => {
            if (i === 11) {
                rows.push([{
                    content: 'JR.STAFF (Junior Office Staff & Support) / জুনিয়র স্টাফ',
                    colSpan: 10 + datesInRange.length * 3,
                    styles: {
                        halign: 'left',
                        fontStyle: 'bold',
                        fillColor: [245, 245, 244],
                        textColor: [0, 0, 0], // Absolute black
                        fontSize: 6.2,
                        cellPadding: 1.5
                    }
                }]);
            }

            const rowData: any[] = [
                i + 1,
                emp.id,
                emp.name,
                emp.designation,
                emp.education || '-',
                emp.category || '-',
                emp.salary || '-',
                formatJoinDate(emp.joinDate),
                emp.phoneNumber || '-'
            ];

            datesInRange.forEach(dStr => {
                const rec = attendance.find((a: any) => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dStr);
                const isFuture = dStr > getTodayShiftDate(getEmployeeShift(emp.id));
                const statusValue = rec ? rec.status : (isFuture ? '-' : 'Absent');
                
                const isPresent = statusValue === 'Present' || statusValue === 'Manual';
                let locName = '-';
                let inTime = '';
                let outTime = '';
                
                if (isPresent) {
                    locName = rec ? (locations.find(l => l.id === rec.locationId)?.name || rec.locationId || '-') : '-';
                    inTime = rec ? (rec.manualInTime || rec.sysInTime || '') : '';
                    outTime = rec ? (rec.manualOutTime || rec.sysOutTime || '') : '';
                } else if (statusValue !== '-') {
                    const statusLabels: Record<string, string> = {
                        'OffDay': 'OFF DAY',
                        'Festival': 'FESTIVAL',
                        'Absent': 'ABSENT',
                        'CL': 'CL (CASUAL)',
                        'SL': 'SL (SICK)',
                        'Holiday': 'HOLIDAY'
                    };
                    const lbl = statusLabels[statusValue] || statusValue.toUpperCase();
                    locName = '-';
                    inTime = lbl;
                    outTime = lbl;
                }
                
                rowData.push(locName);
                rowData.push(inTime);
                rowData.push(outTime);
            });

            const remarksObj = getEmployeeRemarksForDate(emp.id, datesInRange, attendance, locations);
            rowData.push(remarksObj.text);

            rows.push(rowData);
        });

        autoTable(doc, {
            head: [headers],
            body: rows,
            startY: 18.5,
            theme: 'grid',
            styles: {
                fontSize: 6.0,            // Compact yet fully readable font size
                cellPadding: 0.9,          // Balanced cell padding to guarantee fitting on one single page
                font: 'helvetica',
                valign: 'middle',
                overflow: 'linebreak'      // Let text wrap nicely in smaller columns
            },
            headStyles: {
                fillColor: [30, 41, 59], // Slate-800 executive color
                textColor: [255, 255, 255], // Absolute white
                fontStyle: 'bold',
                halign: 'center',
                lineWidth: 0.1,
                lineColor: [71, 85, 105], // Slate-600
                fontSize: 6.2              // Tighter heading font for optimal visual grouping
            },
            bodyStyles: {
                lineWidth: 0.1,
                lineColor: [180, 180, 180],
                textColor: [0, 0, 0] // Absolute black by default for all cells
            },
            columnStyles: (() => {
                const docWidth = doc.internal.pageSize.width; // 297mm
                const leftMargin = 8;
                const rightMargin = 8;
                const availableWidth = docWidth - leftMargin - rightMargin; // 281mm
                
                // Assign high-fidelity relative weights to each column
                const weights: Record<number, number> = {
                    0: 6,   // SL
                    1: 10,  // Emp ID
                    2: 24,  // Name
                    3: 22,  // Designation
                    4: 14,  // Education
                    5: 14,  // Category
                    6: 11,  // Salary
                    7: 15,  // Join Date
                    8: 16,  // Phone No
                };
                
                datesInRange.forEach((_, dIdx) => {
                    const start = 9 + dIdx * 3;
                    weights[start] = 14;     // Proj Loc
                    weights[start + 1] = 12; // IN TIME
                    weights[start + 2] = 12; // OUT TIME
                });
                
                const remIdx = 9 + datesInRange.length * 3;
                weights[remIdx] = 15;        // Remarks
                
                // Sum up total weights
                let totalWeight = 0;
                Object.values(weights).forEach(w => {
                    totalWeight += w;
                });
                
                const styles: Record<number, any> = {};
                
                // Formulate styles object with exact calculated proportional widths to stretch full page
                styles[0] = { halign: 'center', fontStyle: 'bold', cellWidth: (weights[0] / totalWeight) * availableWidth };
                styles[1] = { halign: 'center', fontStyle: 'bold', cellWidth: (weights[1] / totalWeight) * availableWidth };
                styles[2] = { halign: 'left', cellWidth: (weights[2] / totalWeight) * availableWidth };
                styles[3] = { halign: 'left', cellWidth: (weights[3] / totalWeight) * availableWidth };
                styles[4] = { halign: 'center', cellWidth: (weights[4] / totalWeight) * availableWidth };
                styles[5] = { halign: 'center', cellWidth: (weights[5] / totalWeight) * availableWidth };
                styles[6] = { halign: 'center', cellWidth: (weights[6] / totalWeight) * availableWidth };
                styles[7] = { halign: 'center', cellWidth: (weights[7] / totalWeight) * availableWidth };
                styles[8] = { halign: 'center', cellWidth: (weights[8] / totalWeight) * availableWidth };
                
                datesInRange.forEach((_, dIdx) => {
                    const start = 9 + dIdx * 3;
                    styles[start] = { halign: 'center', cellWidth: (weights[start] / totalWeight) * availableWidth };
                    styles[start + 1] = { halign: 'center', cellWidth: (weights[start + 1] / totalWeight) * availableWidth };
                    styles[start + 2] = { halign: 'center', cellWidth: (weights[start + 2] / totalWeight) * availableWidth };
                });
                
                styles[remIdx] = { halign: 'center', cellWidth: (weights[remIdx] / totalWeight) * availableWidth };
                return styles;
            })(),
            didParseCell: (data) => {
                if (data.row.section === 'head') {
                    // Always preserve and enforce executive white font color for headers
                    data.cell.styles.textColor = [255, 255, 255];
                    return;
                }

                const rowIndex = data.row.index;
                const hasGap = sortedEmployees.length > 11;

                if (hasGap && rowIndex === 11) {
                    // Styles are already assigned inline, but ensure alignment and weights
                    data.cell.styles.fillColor = [245, 245, 244];
                    data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.lineColor = [180, 180, 180];
                    return;
                }

                const empIndex = (hasGap && rowIndex > 11) ? rowIndex - 1 : rowIndex;

                if (rowIndex !== undefined && empIndex < sortedEmployees.length) {
                    // Keep base textColor black
                    data.cell.styles.textColor = [0, 0, 0];

                    // Grid border colors: SL 1-11 has coral/red, SL 12-24 has green
                    if (empIndex < 11) {
                        data.cell.styles.lineColor = [255, 148, 148]; // Coral/Red #ff9494
                        data.cell.styles.lineWidth = 0.15;
                    } else {
                        data.cell.styles.lineColor = [148, 226, 148]; // Green #94e294
                        data.cell.styles.lineWidth = 0.15;
                    }

                    const remarksColIndex = 9 + datesInRange.length * 3;

                    if (data.column.index === remarksColIndex) {
                        const cellVal = String(data.cell.raw || '').trim();
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.halign = 'center';
                        if (cellVal !== '') {
                            data.cell.styles.fillColor = [254, 242, 242];
                            data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                        }
                    }

                    if (data.column.index >= 9 && data.column.index < remarksColIndex) {
                        const cellVal = String(data.cell.raw || '');
                        if (['OFF DAY', 'FESTIVAL', 'ABSENT', 'CL (CASUAL)', 'SL (SICK)', 'HOLIDAY'].includes(cellVal)) {
                            data.cell.styles.fontStyle = 'bold';
                            if (cellVal === 'ABSENT') {
                                data.cell.styles.fillColor = [254, 242, 242];
                                data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                            } else if (cellVal === 'OFF DAY') {
                                data.cell.styles.fillColor = [245, 245, 244];
                                data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                            } else if (cellVal === 'FESTIVAL') {
                                data.cell.styles.fillColor = [243, 232, 255];
                                data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                            } else if (cellVal === 'HOLIDAY') {
                                data.cell.styles.fillColor = [239, 246, 255];
                                data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                            } else {
                                data.cell.styles.fillColor = [254, 243, 199];
                                data.cell.styles.textColor = [0, 0, 0]; // Absolute black
                            }
                        }
                    }
                }
            },
            margin: { top: 14, bottom: 8, left: 8, right: 8 },
            didDrawPage: (data) => {
                const totalPages = doc.getNumberOfPages();
                const str = `Page ${data.pageNumber} / ${totalPages}`;
                doc.setFontSize(6);
                doc.setTextColor(0, 0, 0); // Absolute black
                
                doc.text(str, doc.internal.pageSize.width - 32, doc.internal.pageSize.height - 4);
            }
        });

        doc.save(`Comparison_Report_${startDate}_to_${endDate}.pdf`);
    };

    return (
        <section className="bg-white p-4 md:p-8 rounded-sm shadow-sm border border-stone-200">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-base font-extrabold tracking-wider text-[#1e272e] mb-1 flex items-center gap-2">
                        WINDY GROUP PROJECT ATTENDANCE REPORT
                    </h2>
                    <p className="text-xs text-stone-500 font-medium pb-1">
                        Comparison & Timeline Spreadsheet — তারিখ অনুযায়ী পাশাপাশি অবস্থান ও সময় মিলিয়ে দেখতে এবং এক্সেল/পিডিএফ ডাউনলোড করুন।
                    </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <button 
                        onClick={exportToExcel}
                        className="flex items-center gap-2 bg-[#107c41] hover:bg-[#0a522a] text-white px-4 py-2 text-xs font-bold uppercase rounded-sm shadow-sm transition-all cursor-pointer focus:outline-none"
                        id="excel-export-btn"
                    >
                        <FileSpreadsheet size={14} />
                        Export to Excel
                    </button>
                    <button 
                        onClick={exportToPDF}
                        className="flex items-center gap-2 bg-[#b32b2b] hover:bg-[#8f1f1f] text-white px-4 py-2 text-xs font-bold uppercase rounded-sm shadow-sm transition-all cursor-pointer focus:outline-none"
                        id="pdf-export-btn"
                    >
                        <FileDown size={14} />
                        Export to PDF
                    </button>
                </div>
            </div>

            {/* Custom Interactive Panel Bar */}
            <div className="bg-stone-50 p-4 border border-stone-200 rounded-sm mb-6 flex flex-col md:flex-row flex-wrap gap-4 items-center justify-between">
                {/* Search controls */}
                <div className="relative flex-1 min-w-[240px] max-w-sm w-full">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-stone-400">
                        <Search size={14} />
                    </span>
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Search by ID, Name or Designation..." 
                        className="w-full bg-white border border-stone-300 rounded-sm py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-[#2a3a4a] focus:border-[#2a3a4a] outline-none"
                        id="emp-compare-search"
                    />
                </div>

                {/* Date Controls with intuitive Range logic */}
                <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-stone-500 flex items-center gap-1">
                            <Calendar size={12} /> From:
                        </span>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                            className="bg-white border border-stone-300 rounded-sm p-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#2a3a4a]"
                            id="comp-start-date"
                        />
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-stone-500 flex items-center gap-1">
                            <Calendar size={12} /> To:
                        </span>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)} 
                            className="bg-white border border-stone-300 rounded-sm p-1.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#2a3a4a]"
                            id="comp-end-date"
                        />
                    </div>
                </div>
            </div>

            {/* High-Fidelity Custom Grid Spreadsheet */}
            <div className="overflow-x-auto border border-stone-200 rounded-sm shadow-sm bg-white">
                <table 
                    className="text-[11px] text-stone-800 border-collapse table-fixed w-full"
                    style={{ minWidth: `${minTableWidth}px` }}
                >
                    <colgroup><col style={{ width: '45px' }} /><col style={{ width: '70px' }} /><col style={{ width: '160px' }} /><col style={{ width: '150px' }} /><col style={{ width: '90px' }} /><col style={{ width: '110px' }} /><col style={{ width: '80px' }} /><col style={{ width: '95px' }} /><col style={{ width: '105px' }} />{datesInRange.map(dStr => [<col key={`loc-${dStr}`} style={{ width: '85px' }} />,<col key={`in-${dStr}`} style={{ width: '95px' }} />,<col key={`out-${dStr}`} style={{ width: '95px' }} />]).flat()}<col style={{ width: '110px' }} /></colgroup>
                    <thead>
                        {/* Row 1: Main standard headers and dynamic Date Groups with beautiful Slate theme and white text */}
                        <tr className="bg-[#1e293b] text-white border-b border-slate-700 select-none">
                            <th rowSpan={2} className="px-1.5 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">SL</th>
                            <th rowSpan={2} className="px-1.5 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Emp ID</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-left bg-[#1e293b]">Name</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-left bg-[#1e293b]">Designation</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Education</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Employee Category</th>
                            <th rowSpan={2} className="px-1.5 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Salary</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Join Date</th>
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Phone Number</th>
                            
                            {/* Dynamic paired dates header blocks with colspan=3, styled with custom indigo/slate tone and white font */}
                            {datesInRange.map(dStr => {
                                const dFormatted = formatHeaderDate(dStr);
                                return (
                                    <th key={dStr} colSpan={3} className="px-2 py-2 border border-slate-700 font-bold bg-[#0f172a] text-stone-100 text-center uppercase tracking-wider text-[10px]/tight">
                                        {dFormatted}
                                    </th>
                                );
                            })}
                            <th rowSpan={2} className="px-2 py-3 border border-slate-700 font-bold text-center bg-[#1e293b]">Remarks</th>
                        </tr>
                        {/* Row 2: Sub-column definitions with light secondary slate and bold white font */}
                        <tr className="bg-[#334155] text-stone-100 border-b border-slate-700 select-none">
                            {datesInRange.map(dStr => {
                                const dayOfDate = dStr.split('-')[2] || '';
                                return (
                                    <React.Fragment key={`sub-${dStr}`}>
                                        <th className="px-1 py-2 border border-slate-600 font-bold bg-[#475569] text-[#f8fafc] text-center text-[10px] leading-tight">
                                            Proj. Loc {dayOfDate}
                                        </th>
                                        <th className="px-2 py-2 border border-slate-600 font-bold text-center text-[10px] leading-tight text-white bg-[#334155]">
                                            IN TIME
                                        </th>
                                        <th className="px-2 py-2 border border-slate-600 font-bold text-center text-[10px] leading-tight text-white bg-[#334155]">
                                            OUT TIME
                                        </th>
                                    </React.Fragment>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedEmployees.map((emp, idx) => {
                            const isSeniorCol = idx < 11;
                            // Match grid line color theme strictly by serial number: SL 1-11 gets coral/red, SL 12-24 gets green
                            const gridColorClass = isSeniorCol ? 'border-[#ff9494] text-red-950 font-medium' : 'border-[#94e294] text-emerald-950 font-medium';
                            const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/50';

                            return (
                                <React.Fragment key={emp.id}>
                                    {idx === 11 && (
                                        <tr key="comparison-section-gap" className="select-none">
                                            <td 
                                                colSpan={10 + datesInRange.length * 3} 
                                                className="bg-stone-100 hover:bg-stone-100/90 text-left px-4 py-2 border-y border-stone-300 font-bold text-[11px] text-stone-600 tracking-wider uppercase h-10"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full bg-stone-400"></span>
                                                    JR.STAFF (Junior Office Staff & Support) / জুনিয়র স্টাফ
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    <tr 
                                        className={`${rowBg} hover:bg-amber-50/20 transition-colors`}
                                    >
                                    {/* SL (Center aligned) */}
                                    <td className={`px-1.5 py-2.5 border text-center font-bold ${gridColorClass}`}>
                                        {idx + 1}
                                    </td>
                                    
                                    {/* Emp ID (Center aligned) */}
                                    <td 
                                        onClick={() => onEmployeeClick?.(emp.id)}
                                        className={`px-1.5 py-2.5 border text-center font-mono font-semibold cursor-pointer hover:underline hover:text-amber-600 transition-all ${gridColorClass}`}
                                        title="Click to open Manual Entry / হাজিরা ফরম খুলতে ক্লিক করুন"
                                    >
                                        {emp.id}
                                    </td>
                                    
                                    {/* Name (Left aligned) */}
                                    <td 
                                        onClick={() => onEmployeeClick?.(emp.id)}
                                        className={`px-2 py-2.5 border text-left text-stone-900 uppercase tracking-tight cursor-pointer hover:underline hover:text-amber-600 transition-all ${gridColorClass}`}
                                        title="Click to open Manual Entry / হাজিরা ফরম খুলতে ক্লিক করুন"
                                    >
                                        {emp.name}
                                    </td>
                                    
                                    {/* Designation (Left aligned) */}
                                    <td className={`px-2 py-2.5 border text-left text-stone-600 uppercase text-[10px] ${gridColorClass}`}>
                                        {emp.designation}
                                    </td>
                                    
                                    {/* Education (Center aligned) */}
                                    <td className={`px-2 py-2.5 border text-center text-stone-700 capitalize ${gridColorClass}`}>
                                        {emp.education || '-'}
                                    </td>
                                    
                                    {/* Employee Category (Center aligned) */}
                                    <td className={`px-2 py-2.5 border text-center text-[10px] font-bold ${gridColorClass}`}>
                                        {emp.category || '-'}
                                    </td>
                                    
                                    {/* Salary (Center aligned) */}
                                    <td className={`px-1.5 py-2.5 border text-center font-mono ${gridColorClass}`}>
                                        {emp.salary || '-'}
                                    </td>
                                    
                                    {/* Join Date (Center aligned) */}
                                    <td className={`px-2 py-2.5 border text-center ${gridColorClass}`}>
                                        {formatJoinDate(emp.joinDate)}
                                    </td>
                                    
                                    {/* Phone Number (Center aligned) */}
                                    <td className={`px-2 py-2.5 border text-center font-mono ${gridColorClass}`}>
                                        {emp.phoneNumber || '-'}
                                    </td>

                                    {/* Dynamic attendance cells render */}
                                    {datesInRange.map(dStr => {
                                        const rec = attendance.find((a: any) => String(a.no).trim() === String(emp.id).trim() && a.dateISO === dStr);
                                        const isFuture = dStr > getTodayShiftDate(getEmployeeShift(emp.id));
                                        const statusValue = rec ? rec.status : (isFuture ? '-' : 'Absent');
                                        
                                        const isPresent = statusValue === 'Present' || statusValue === 'Manual';
                                        const locName = isPresent && rec ? (locations.find(l => l.id === rec.locationId)?.name || rec.locationId || '-') : '-';
                                        const originalIn = isPresent && rec ? (rec.manualInTime || rec.sysInTime || '') : '';
                                        const originalOut = isPresent && rec ? (rec.manualOutTime || rec.sysOutTime || '') : '';
                                        
                                        const statusStyle = getCellStatusInfo(statusValue);

                                        return (
                                            <React.Fragment key={dStr}>
                                                {/* Project Location Column */}
                                                <td className={`px-1 py-1.5 border text-center font-medium text-[9px] uppercase tracking-tight max-w-[72px] truncate ${gridColorClass} ${statusStyle ? statusStyle.bg + ' ' + statusStyle.color : ''}`} title={statusStyle ? '-' : locName}>
                                                    {statusStyle ? '-' : locName}
                                                </td>
                                                {/* IN TIME Column (Leaving blank if no record matches screenshot) */}
                                                <td className={`px-2 py-2.5 border text-center font-mono ${gridColorClass} ${statusStyle ? statusStyle.bg + ' ' + statusStyle.color + ' font-sans text-[9px] tracking-tight uppercase' : ''}`}>
                                                    {statusStyle ? statusStyle.text : (originalIn || '')}
                                                </td>
                                                {/* OUT TIME Column (Leaving blank if no record matches screenshot) */}
                                                <td className={`px-2 py-2.5 border text-center font-mono ${gridColorClass} ${statusStyle ? statusStyle.bg + ' ' + statusStyle.color + ' font-sans text-[9px] tracking-tight uppercase' : ''}`}>
                                                    {statusStyle ? statusStyle.text : (originalOut || '')}
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* Remarks Cell (Calculated from all dates in selected range) at the absolute end */}
                                    {(() => {
                                        const remarks = getEmployeeRemarksForDate(emp.id, datesInRange, attendance, locations);
                                        return (
                                            <td className={`px-2 py-2.5 border text-center font-semibold text-[11px] ${gridColorClass} ${remarks.color}`}>
                                                {remarks.text}
                                            </td>
                                        );
                                    })()}
                                </tr>
                            </React.Fragment>
                            );
                        })}

                        {sortedEmployees.length === 0 && (
                            <tr>
                                <td colSpan={10 + datesInRange.length * 3} className="px-4 py-16 text-center text-stone-400 font-mono italic">
                                    No employee matches found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Print Friendly Multi-Page Indicator exactly as seen watermarked in the user's PDF */}
            <div className="mt-4 flex justify-between items-center text-[10px] text-stone-400 font-semibold uppercase tracking-wider">
                <span>* RED grid indicates Senior staff and green indicates Junior staff *</span>
                <span>Page 1 / পৃষ্ঠা ১</span>
            </div>
        </section>
    );
}
