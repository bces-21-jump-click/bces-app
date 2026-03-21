import { jsPDF } from 'jspdf';
import type { Autopsie, Injury } from '../modeles/autopsie';

const COLOR_MAP: Record<string, [number, number, number]> = {
  orange: [255, 152, 0],
  pink: [233, 30, 99],
  indigo: [63, 81, 181],
  green: [76, 175, 80],
  red: [244, 67, 54],
  cyan: [0, 188, 212],
};

const INJURY_COLORS = ['orange', 'pink', 'indigo', 'green', 'red', 'cyan'];

function getColorRGB(name: string): [number, number, number] {
  return COLOR_MAP[name] ?? [0, 0, 0];
}

export function drawBodyCanvas(
  canvas: HTMLCanvasElement,
  genderIsMale: boolean,
  injuries: Injury[],
): Promise<void> {
  return new Promise((resolve) => {
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.src = `assets/images/${genderIsMale ? 'Homme' : 'Femme'}.svg`;
    img.onload = () => {
      canvas.width = 600;
      canvas.height = 600;
      ctx.drawImage(img, 0, 0);

      injuries.forEach((injury, index) => {
        const hex = COLOR_MAP[INJURY_COLORS[index]]
          ? `rgb(${COLOR_MAP[INJURY_COLORS[index]].join(',')})`
          : INJURY_COLORS[index];

        ctx.fillStyle = hex;
        injury.points.forEach((point) => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 6.5, 0, 2 * Math.PI);
          ctx.fill();
        });

        if (injury.points.length > 0) {
          const avgY = injury.points.reduce((sum, p) => sum + p.y, 0) / injury.points.length;
          const centerX = canvas.width / 2;

          let labelY = avgY;
          const labelRadius = 14;
          const minSpacing = labelRadius * 2 + 5;

          const usedPositions: number[] = [];
          for (let i = 0; i < index; i++) {
            if (injuries[i].points.length > 0) {
              const otherAvgY =
                injuries[i].points.reduce((sum, p) => sum + p.y, 0) / injuries[i].points.length;
              let adjustedY = otherAvgY;
              for (const usedY of usedPositions) {
                if (Math.abs(adjustedY - usedY) < minSpacing) adjustedY = usedY + minSpacing;
              }
              usedPositions.push(adjustedY);
            }
          }

          for (const usedY of usedPositions) {
            if (Math.abs(labelY - usedY) < minSpacing) labelY = usedY + minSpacing;
          }

          if (labelY < labelRadius + 5) labelY = labelRadius + 5;
          if (labelY > canvas.height - labelRadius - 5) labelY = canvas.height - labelRadius - 5;

          ctx.strokeStyle = hex;
          ctx.fillStyle = hex;
          ctx.lineWidth = 1.5;

          injury.points.forEach((point) => {
            const dx = point.x - centerX;
            const dy = point.y - labelY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const ndx = dx / distance;
            const ndy = dy / distance;

            const startX = centerX + ndx * (labelRadius + 5);
            const startY = labelY + ndy * (labelRadius + 5);
            const arrowHeadLength = 10;
            const arrowHeadWidth = Math.PI / 8;
            const endX = point.x - ndx * (6.5 + 5 + arrowHeadLength);
            const endY = point.y - ndy * (6.5 + 5 + arrowHeadLength);

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();

            const angle = Math.atan2(dy, dx);
            const arrowTipX = point.x - ndx * (6.5 + 5);
            const arrowTipY = point.y - ndy * (6.5 + 5);

            ctx.beginPath();
            ctx.moveTo(arrowTipX, arrowTipY);
            ctx.lineTo(
              arrowTipX - Math.cos(angle - arrowHeadWidth) * arrowHeadLength,
              arrowTipY - Math.sin(angle - arrowHeadWidth) * arrowHeadLength,
            );
            ctx.lineTo(
              arrowTipX - Math.cos(angle + arrowHeadWidth) * arrowHeadLength,
              arrowTipY - Math.sin(angle + arrowHeadWidth) * arrowHeadLength,
            );
            ctx.closePath();
            ctx.fill();
          });

          ctx.fillStyle = hex;
          ctx.beginPath();
          ctx.arc(centerX, labelY, labelRadius, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 17px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(index + 1), centerX, labelY);
        }
      });
      resolve();
    };
    img.onerror = () => resolve();
  });
}

export async function generateReport(
  data: Autopsie,
  canvasElement: HTMLCanvasElement,
): Promise<void> {
  const {
    name,
    cid,
    genderIsMale,
    doctor,
    legist,
    injuries,
    bloodBilan,
    diagnostic,
    interventionReport,
    eventChronology,
    autopsySummary,
    autopsyDate,
  } = data;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const headerHeight = 20;
  const footerHeight = 10;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 4.8;
  let yPosition = headerHeight + 10;

  const fetchAssetAsDataUrl = async (path: string): Promise<string | null> => {
    try {
      const response = await fetch(path);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  const logoDataUrl = await fetchAssetAsDataUrl('assets/images/logo.png');

  const resetPageLayout = (createNewPage = false): void => {
    if (createNewPage) pdf.addPage();

    pdf.setFillColor(16, 53, 84);
    pdf.rect(0, 0, pageWidth, headerHeight, 'F');

    if (logoDataUrl) {
      try {
        pdf.addImage(logoDataUrl, 'PNG', margin, 3.2, 13, 13);
      } catch {
        // ignore logo rendering errors
      }
    }

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text("BCES - Rapport d'autopsie", margin + 16, 8);

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Blaine County Emergency Services', margin + 16, 14);

    yPosition = headerHeight + 10;
  };

  const ensureSpace = (height: number): void => {
    if (yPosition + height > pageHeight - margin - footerHeight) {
      resetPageLayout(true);
    }
  };

  const drawInfoBlock = (): void => {
    const rows = [
      ['Victime', `${name || '-'} (${cid || '-'})`],
      ['Medecin legiste', legist || '-'],
      ['Medecin intervenant', doctor || '-'],
      ['Date du constat', new Date(autopsyDate || Date.now()).toLocaleString('fr-FR')],
    ];

    const rowHeight = 7.2;
    const blockHeight = 10 + Math.ceil(rows.length / 2) * rowHeight + 4;
    const columnWidth = (contentWidth - 8) / 2;

    ensureSpace(blockHeight + 4);

    pdf.setDrawColor(210, 222, 235);
    pdf.setFillColor(246, 250, 255);
    pdf.roundedRect(margin, yPosition, contentWidth, blockHeight, 2, 2, 'FD');

    rows.forEach(([label, value], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = margin + 4 + col * (columnWidth + 4);
      const y = yPosition + 7 + row * rowHeight;

      pdf.setTextColor(32, 67, 97);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${label}:`, x, y);

      pdf.setTextColor(20, 40, 58);
      pdf.setFont('helvetica', 'normal');
      pdf.text(String(value), x, y + 4.1);
    });

    yPosition += blockHeight + 5;
  };

  const drawTextSection = (title: string, text?: string): void => {
    const safeText = text?.trim() ? text.trim() : 'Aucune information renseignee.';
    const lines = pdf.splitTextToSize(safeText, contentWidth - 8);
    const blockHeight = 12 + lines.length * lineHeight + 4;

    ensureSpace(blockHeight + 4);

    pdf.setDrawColor(210, 222, 235);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, yPosition, contentWidth, blockHeight, 2, 2, 'FD');

    pdf.setTextColor(24, 60, 92);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin + 4, yPosition + 7);

    pdf.setTextColor(30, 45, 58);
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'normal');
    let lineY = yPosition + 12;
    for (const line of lines) {
      pdf.text(line, margin + 4, lineY);
      lineY += lineHeight;
    }

    yPosition += blockHeight + 4;
  };

  const drawSchemaSection = (): void => {
    const maxImageWidth = contentWidth - 10;
    const maxImageHeight = 95;
    const imageRatio = canvasElement.width / canvasElement.height || 1;
    let imageWidth = maxImageWidth;
    let imageHeight = imageWidth / imageRatio;
    if (imageHeight > maxImageHeight) {
      imageHeight = maxImageHeight;
      imageWidth = imageHeight * imageRatio;
    }

    const blockHeight = 12 + imageHeight + 8;
    ensureSpace(blockHeight + 4);

    pdf.setDrawColor(210, 222, 235);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, yPosition, contentWidth, blockHeight, 2, 2, 'FD');

    pdf.setTextColor(24, 60, 92);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Schema corporel', margin + 4, yPosition + 7);

    const imgData = canvasElement.toDataURL('image/png');
    const imageX = margin + (contentWidth - imageWidth) / 2;
    const imageY = yPosition + 10;
    pdf.addImage(imgData, 'PNG', imageX, imageY, imageWidth, imageHeight);

    yPosition += blockHeight + 4;
  };

  resetPageLayout();
  drawInfoBlock();

  const injuriesSummary = injuries.length
    ? injuries
        .map((injury: Injury, index: number) => {
          const colorName = INJURY_COLORS[index] ?? 'inconnue';
          const ext = injury.externalAnalysis?.trim() || 'Aucune analyse externe';
          const int = injury.internalAnalysis?.trim() || 'Aucune analyse interne';
          return `Blessure ${index + 1} (${colorName})\n- Externe: ${ext}\n- Interne: ${int}`;
        })
        .join('\n\n')
    : 'Aucune blessure renseignee.';

  drawTextSection('Synthese des blessures', injuriesSummary);
  drawSchemaSection();
  drawTextSection('Bilan sanguin', bloodBilan);
  drawTextSection('Diagnostic medical', diagnostic);
  drawTextSection("Rapport d'intervention", interventionReport);
  drawTextSection('Chronologie probable des evenements', eventChronology);
  drawTextSection("Bilan de l'autopsie", autopsySummary);

  ensureSpace(34);
  pdf.setDrawColor(175, 190, 205);
  pdf.line(margin, yPosition + 8, margin + 70, yPosition + 8);

  pdf.setTextColor(50, 65, 80);
  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Signature du medecin legiste', margin, yPosition + 13);

  yPosition += 26;

  // Try to load Caveat font for signature
  try {
    const caveatRes = await fetch('assets/fonts/Caveat-Regular.ttf');
    const buffer = await caveatRes.arrayBuffer();
    const binary = Array.from(new Uint8Array(buffer))
      .map((byte) => String.fromCharCode(byte))
      .join('');
    const base64 = btoa(binary);
    pdf.addFileToVFS('Caveat-Regular.ttf', base64);
    pdf.addFont('Caveat-Regular.ttf', 'Caveat', 'normal');
    pdf.setFontSize(32);
    pdf.setFont('Caveat', 'normal');
  } catch {
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'italic');
  }

  const signature = legist || 'Medecin legiste';
  pdf.setTextColor(36, 60, 84);
  pdf.text(signature, margin + 10, yPosition, { angle: 5, align: 'left' });

  // Stamp
  try {
    const stampImg = new Image();
    stampImg.src = 'assets/images/stamp_white.png';
    pdf.saveGraphicsState();
    pdf.setGState(new (pdf as any).GState({ opacity: 0.8 }));
    pdf.addImage(stampImg, 'PNG', margin + 80, yPosition - 34, 44, 44, undefined, undefined, -20);
    pdf.restoreGraphicsState();
  } catch {
    /* stamp not available */
  }

  // Footer on all pages
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    pdf.setDrawColor(216, 224, 233);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    pdf.setFontSize(9);
    pdf.setTextColor(106, 124, 139);
    const dateStr = new Date(autopsyDate).toLocaleDateString('fr-FR');
    const timeStr = new Date(autopsyDate).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const patientFooterRaw = `Victime: ${name || '-'}${cid ? ` (${cid})` : ''}`;
    const patientFooter =
      patientFooterRaw.length > 52
        ? `${patientFooterRaw.slice(0, 51).trimEnd()}…`
        : patientFooterRaw;
    pdf.text(`Fait le ${dateStr} a ${timeStr}`, margin, pageHeight - 7);
    pdf.text(patientFooter, pageWidth / 2, pageHeight - 7, { align: 'center' });
    pdf.text(`Page ${i} / ${totalPages}`, pageWidth - margin, pageHeight - 7, {
      align: 'right',
    });
  }

  const civility = genderIsMale ? 'Mr' : 'Mme';
  const dateFile = new Date(autopsyDate).toLocaleDateString('fr-FR').replace(/\//g, '-');
  const fileName = `BCES - Rapport d'autopsie ${civility} ${name} (${cid}) - ${dateFile}.pdf`;
  pdf.save(fileName);
}
