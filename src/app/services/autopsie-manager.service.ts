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
  const colors = INJURY_COLORS;

  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const lineHeight = 7;
  let yPosition = margin;

  const addDarkBackground = () => {
    pdf.setFillColor(3, 15, 20);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  const logoImg = new Image();
  logoImg.src = 'assets/images/logo.png';

  const addHeader = () => {
    pdf.setFillColor(0, 188, 212);
    pdf.rect(0, 0, pageWidth, 28, 'F');
    try {
      pdf.addImage(logoImg, 'PNG', margin, 3, 22, 22);
    } catch {
      /* logo not loaded */
    }
    pdf.setTextColor(3, 15, 20);
    pdf.setFontSize(17);
    pdf.setFont('helvetica', 'bold');
    pdf.text('BCES — Bureau Central des Emergency Services', pageWidth - margin, 12, {
      align: 'right',
    });
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'normal');
    pdf.text("RAPPORT D'AUTOPSIE", pageWidth - margin, 20, { align: 'right' });
  };

  const addText = (text: string, fontSize = 10, isBold = false) => {
    pdf.setFontSize(fontSize);
    pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
    const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin);
    for (const line of lines) {
      if (yPosition > pageHeight - margin) {
        pdf.addPage();
        addDarkBackground();
        addHeader();
        yPosition = 38;
      }
      pdf.text(line, margin, yPosition);
      yPosition += lineHeight;
    }
  };

  addDarkBackground();
  addHeader();
  pdf.setTextColor(255, 255, 255);
  yPosition = 38;

  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Victime :', margin, yPosition);
  pdf.setFont('helvetica', 'normal');
  pdf.text(` ${name} (${cid})`, margin + 4 + pdf.getTextWidth('Victime :'), yPosition);
  yPosition += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Médecin légiste :', margin, yPosition);
  pdf.setFont('helvetica', 'normal');
  pdf.text(` Dr ${legist}`, margin + 4 + pdf.getTextWidth('Médecin légiste :'), yPosition);
  yPosition += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.text('Médecin intervenant :', margin, yPosition);
  pdf.setFont('helvetica', 'normal');
  pdf.text(` ${doctor}`, margin + 4 + pdf.getTextWidth('Médecin intervenant :'), yPosition);
  yPosition += 15;

  const startY = yPosition;
  const leftColWidth = (pageWidth - 2 * margin) / 3;
  const rightColX = margin + leftColWidth + 10;
  const rightColWidth = ((pageWidth - 2 * margin) * 2) / 3 - 10;

  let leftYPosition = startY;
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Blessures :', margin, leftYPosition);
  leftYPosition += 10;

  injuries.forEach((injury: Injury, index: number) => {
    if (leftYPosition > pageHeight - margin - 30) {
      pdf.addPage();
      addDarkBackground();
      addHeader();
      leftYPosition = 38;
    }

    const rgb = getColorRGB(colors[index]);
    pdf.setTextColor(rgb[0], rgb[1], rgb[2]);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Blessure #${index + 1}`, margin, leftYPosition);
    leftYPosition += 6;

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    if (injury.externalAnalysis) {
      const extLines = pdf.splitTextToSize(`Externe: ${injury.externalAnalysis}`, leftColWidth);
      for (const line of extLines) {
        if (leftYPosition > pageHeight - margin) {
          pdf.addPage();
          addDarkBackground();
          addHeader();
          leftYPosition = 54;
        }
        pdf.text(line, margin, leftYPosition);
        leftYPosition += 5;
      }
    }

    if (injury.internalAnalysis) {
      const intLines = pdf.splitTextToSize(`Interne: ${injury.internalAnalysis}`, leftColWidth);
      for (const line of intLines) {
        if (leftYPosition > pageHeight - margin) {
          pdf.addPage();
          addDarkBackground();
          addHeader();
          leftYPosition = 54;
        }
        pdf.text(line, margin, leftYPosition);
        leftYPosition += 5;
      }
    }

    leftYPosition += 5;
  });

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(12);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Schéma corporel :', rightColX, startY);

  const imgData = canvasElement.toDataURL('image/png');
  pdf.addImage(imgData, 'PNG', rightColX, startY + 10, rightColWidth, rightColWidth);

  yPosition = Math.max(leftYPosition, startY + 10 + rightColWidth + 10);

  if (yPosition > pageHeight - margin - 30) {
    pdf.addPage();
    addDarkBackground();
    addHeader();
    yPosition = 38;
  }
  pdf.setTextColor(255, 255, 255);
  yPosition += 3;
  addText('Bilan sanguin :', 12, true);
  yPosition += 3;
  if (bloodBilan) addText(bloodBilan, 10);
  yPosition += 5;

  if (yPosition > pageHeight - margin - 30) {
    pdf.addPage();
    addDarkBackground();
    addHeader();
    yPosition = 38;
  }
  pdf.setTextColor(255, 255, 255);
  addText('Diagnostic médical :', 12, true);
  yPosition += 3;
  if (diagnostic) addText(diagnostic, 10);
  yPosition += 5;

  if (yPosition > pageHeight - margin - 30) {
    pdf.addPage();
    addDarkBackground();
    addHeader();
    yPosition = 38;
  }
  pdf.setTextColor(255, 255, 255);
  addText("Rapport d'intervention :", 12, true);
  yPosition += 3;
  if (interventionReport) addText(interventionReport, 10);
  yPosition += 5;

  if (yPosition > pageHeight - margin - 30) {
    pdf.addPage();
    addDarkBackground();
    addHeader();
    yPosition = 38;
  }
  pdf.setTextColor(255, 255, 255);
  addText('Chronologie probable des événements :', 12, true);
  yPosition += 3;
  if (eventChronology) addText(eventChronology, 10);
  yPosition += 5;

  const bilanLines = autopsySummary
    ? pdf.splitTextToSize(autopsySummary, pageWidth - 2 * margin)
    : [];
  const bilanHeight = 12 + 3 + bilanLines.length * lineHeight + 15 + 60;

  if (yPosition + bilanHeight > pageHeight - margin) {
    pdf.addPage();
    addDarkBackground();
    addHeader();
    yPosition = 38;
  }

  pdf.setTextColor(255, 255, 255);
  addText("Bilan de l'autopsie :", 12, true);
  yPosition += 3;
  if (autopsySummary) addText(autopsySummary, 10);

  yPosition += 15;
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Signature :', margin, yPosition);
  yPosition += 20;

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

  const signature = legist || 'Médecin légiste';
  pdf.setTextColor(255, 255, 255);
  pdf.text(signature, margin + 10, yPosition, { angle: 5, align: 'left' });

  // Stamp
  try {
    const stampImg = new Image();
    stampImg.src = 'assets/images/stamp_white.png';
    pdf.saveGraphicsState();
    pdf.setGState(new (pdf as any).GState({ opacity: 0.8 }));
    pdf.addImage(stampImg, 'PNG', margin + 80, yPosition - 40, 50, 50, undefined, undefined, -20);
    pdf.restoreGraphicsState();
  } catch {
    /* stamp not available */
  }

  // Footer on all pages
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    if (i > 1) addHeader();
    pdf.setFontSize(9);
    pdf.setTextColor(180, 180, 180);
    const dateStr = new Date(autopsyDate).toLocaleDateString('fr-FR');
    const timeStr = new Date(autopsyDate).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    pdf.text(`Fait le ${dateStr} à ${timeStr}`, margin, pageHeight - 10);
    pdf.text(`${name} (${cid})`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text(`Page ${i} / ${totalPages}`, pageWidth - margin, pageHeight - 10, {
      align: 'right',
    });
  }

  const civility = genderIsMale ? 'Mr' : 'Mme';
  const dateFile = new Date(autopsyDate).toLocaleDateString('fr-FR').replace(/\//g, '-');
  const fileName = `BCES - Rapport d'autopsie ${civility} ${name} (${cid}) - ${dateFile}.pdf`;
  pdf.save(fileName);
}
