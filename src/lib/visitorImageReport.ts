/**
 * Utility to generate Excel-styled image reports for Visitor Register
 * Matching the exact visual style of Excel spreadsheets with yellow headers,
 * clean grid borders, text wrapping, and high-DPI canvas rendering.
 */

export interface ImageReportOptions {
  title?: string;
  date?: string;
  statusStyle?: 'need_permission' | 'standard'; // 'need your permition' vs 'ENTER PERMISSION'
}

export interface VisitorImageRow {
  sl: number | string;
  date: string;
  company_name: string;
  visitor_name: string;
  phone_number?: string;
  who_meet: string;
  purpose: string;
  in_time: string;
  out_time?: string;
  total_persons?: number;
  status: string;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (!text || !text.trim()) return [''];
  const paragraphs = String(text).split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  return lines.length > 0 ? lines : [''];
}

export function renderVisitorReportCanvas(
  visitors: VisitorImageRow[],
  options: ImageReportOptions = {}
): HTMLCanvasElement {
  const title = options.title || 'Tommorow Site Visitor Plan';
  const statusStyle = options.statusStyle || 'need_permission';

  // Columns definition matching user's Excel screenshot
  const columns = [
    { key: 'sl', label: 'SL', width: 45, align: 'center' },
    { key: 'date', label: 'Date', width: 105, align: 'center' },
    { key: 'company_name', label: 'Company Name', width: 180, align: 'center' },
    { key: 'visitor_name', label: 'Visitor Name', width: 155, align: 'center' },
    { key: 'phone_number', label: 'Phone', width: 110, align: 'center' },
    { key: 'who_meet', label: 'Who Meet', width: 200, align: 'center' },
    { key: 'purpose', label: 'Purpose', width: 185, align: 'center' },
    { key: 'in_time', label: 'In Time', width: 95, align: 'center' },
    { key: 'out_time', label: 'Out Time', width: 95, align: 'center' },
    { key: 'total_persons', label: 'Persons', width: 70, align: 'center' },
    { key: 'status', label: 'Status', width: 130, align: 'center' },
  ];

  const totalTableWidth = columns.reduce((sum, c) => sum + c.width, 0); // 1370px
  const marginX = 24;
  const marginY = 24;
  const titleHeight = 44;
  const headerHeight = 36;
  const baseLineHeight = 18;
  const cellPaddingX = 8;
  const cellPaddingY = 10;

  // We use an offscreen canvas to measure text heights first
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.font = '13px "Segoe UI", Arial, Calibri, sans-serif';

  // Compute wrapped lines and height for each row
  interface PreparedRow {
    cells: { lines: string[]; align: string; width: number }[];
    rowHeight: number;
  }

  const preparedRows: PreparedRow[] = visitors.map((v, idx) => {
    let statusText = v.status || '';
    if (statusStyle === 'need_permission') {
      if (statusText === 'Inside' || statusText.toLowerCase().includes('inside') || statusText.toLowerCase().includes('permission')) {
        statusText = 'need your permition';
      } else if (statusText === 'Not Permitted') {
        statusText = 'not permitted';
      } else if (statusText === 'Checked Out') {
        statusText = 'visit complete';
      }
    } else {
      if (statusText === 'Inside') statusText = 'ENTER PERMISSION';
      else if (statusText === 'Checked Out') statusText = 'VISIT COMPLETE';
    }

    const rowData: Record<string, string> = {
      sl: String(v.sl || idx + 1),
      date: v.date || '',
      company_name: v.company_name || '',
      visitor_name: v.visitor_name || '',
      phone_number: v.phone_number || '',
      who_meet: v.who_meet || '',
      purpose: v.purpose || '',
      in_time: v.in_time || '',
      out_time: v.out_time || '',
      total_persons: String(v.total_persons || 1),
      status: statusText,
    };

    let maxLines = 1;
    const cells = columns.map(col => {
      const text = rowData[col.key] || '';
      const availableWidth = col.width - cellPaddingX * 2;
      const lines = wrapText(mCtx, text, availableWidth);
      if (lines.length > maxLines) maxLines = lines.length;
      return { lines, align: col.align, width: col.width };
    });

    const rowHeight = Math.max(46, maxLines * baseLineHeight + cellPaddingY * 2);
    return { cells, rowHeight };
  });

  const totalTableHeight = headerHeight + preparedRows.reduce((sum, r) => sum + r.rowHeight, 0);
  const canvasWidth = totalTableWidth + marginX * 2;
  const canvasHeight = titleHeight + totalTableHeight + marginY * 2 + 16;

  // Real canvas with Retina / 2x resolution for super crisp rendering
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth * scale;
  canvas.height = canvasHeight * scale;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // 1. Draw Excel-like light background grid
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Background subtle excel grid lines
  ctx.strokeStyle = '#F0F0F0';
  ctx.lineWidth = 1;
  const gridStep = 24;
  for (let x = 0; x <= canvasWidth; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, canvasHeight);
    ctx.stroke();
  }
  for (let y = 0; y <= canvasHeight; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(canvasWidth, y + 0.5);
    ctx.stroke();
  }

  // 2. Draw Title Banner (Bright Yellow `#FFFF00`)
  const tableX = marginX;
  const titleY = marginY;

  ctx.fillStyle = '#FFFF00';
  ctx.fillRect(tableX, titleY, totalTableWidth, titleHeight);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tableX, titleY, totalTableWidth, titleHeight);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 19px "Segoe UI", Arial, Calibri, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, tableX + totalTableWidth / 2, titleY + titleHeight / 2);

  // 3. Draw Header Row (Bright Yellow `#FFFF00`)
  const headerY = titleY + titleHeight;
  let currentHeaderX = tableX;

  ctx.font = 'bold 13px "Segoe UI", Arial, Calibri, sans-serif';

  columns.forEach(col => {
    ctx.fillStyle = '#FFFF00';
    ctx.fillRect(currentHeaderX, headerY, col.width, headerHeight);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(currentHeaderX, headerY, col.width, headerHeight);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(col.label, currentHeaderX + col.width / 2, headerY + headerHeight / 2);

    currentHeaderX += col.width;
  });

  // 4. Draw Data Rows
  let currentY = headerY + headerHeight;

  ctx.font = '13px "Segoe UI", Arial, Calibri, sans-serif';

  preparedRows.forEach((row) => {
    let currentX = tableX;

    row.cells.forEach(cell => {
      // White cell background
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(currentX, currentY, cell.width, row.rowHeight);

      // Cell border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(currentX, currentY, cell.width, row.rowHeight);

      // Text lines
      ctx.fillStyle = '#000000';
      const totalTextH = cell.lines.length * baseLineHeight;
      const startLineY = currentY + (row.rowHeight - totalTextH) / 2 + baseLineHeight / 2;

      cell.lines.forEach((line, lineIdx) => {
        let drawX = currentX + cell.width / 2;
        ctx.textAlign = 'center';

        if (cell.align === 'left') {
          ctx.textAlign = 'left';
          drawX = currentX + cellPaddingX;
        }

        ctx.textBaseline = 'middle';
        ctx.fillText(line, drawX, startLineY + lineIdx * baseLineHeight);
      });

      currentX += cell.width;
    });

    currentY += row.rowHeight;
  });

  // Outer border around the whole table
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tableX, titleY, totalTableWidth, titleHeight + totalTableHeight);

  return canvas;
}

/**
 * Downloads canvas as PNG file
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copies canvas image blob directly to clipboard
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) return false;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (err) {
    console.warn('Failed to copy image to clipboard:', err);
    return false;
  }
}

/**
 * Native file share (supported on mobile Android/iOS)
 */
export async function shareCanvasImage(canvas: HTMLCanvasElement, filename: string, title: string): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: title,
        files: [file],
      });
      return true;
    }
    return false;
  } catch (err) {
    console.warn('Share error or cancelled:', err);
    return false;
  }
}
