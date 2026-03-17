import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ElementRef,
  viewChild,
  AfterViewInit,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { generateReport } from '../../services/autopsie-manager.service';
import type { Autopsie } from '../../modeles/autopsie';
import type { Profile } from '../../modeles/utilisateur';
import Swal from 'sweetalert2';

const WHEEL_COLORS = [
  '#E91E63',
  '#9C27B0',
  '#3F51B5',
  '#2196F3',
  '#00BCD4',
  '#4CAF50',
  '#CDDC39',
  '#FF9800',
  '#FF5722',
  '#795548',
  '#607D8B',
  '#F44336',
];

@Component({
  selector: 'app-rapports-autopsie',
  templateUrl: './rapports-autopsie.html',
  styleUrl: './rapports-autopsie.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class RapportsAutopsiePage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private unsubReports?: () => void;

  readonly reports = signal<Autopsie[]>([]);
  readonly search = signal('');

  readonly filteredReports = computed(() => {
    const s = this.search().toLowerCase();
    const list = this.reports();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.cid.toLowerCase().includes(s) ||
        r.doctor.toLowerCase().includes(s) ||
        r.legist.toLowerCase().includes(s),
    );
  });

  // Randomizer
  readonly randomizerOpen = signal(false);
  readonly randomizerStep = signal<1 | 2>(1);
  readonly legistes = signal<Profile[]>([]);
  readonly selectedLegistes = signal<string[]>([]);
  readonly legistesLoading = signal(false);
  readonly isSpinning = signal(false);
  readonly wheelResult = signal<string | null>(null);

  private currentRotation = 0;
  private animFrame: number | null = null;

  readonly wheelCanvasRef = viewChild<ElementRef<HTMLCanvasElement>>('wheelCanvas');

  ngOnInit(): void {
    this.unsubReports = this.api.ecouter<Autopsie>('autopsies', (list) => {
      this.reports.set(list.sort((a, b) => b.autopsyDate - a.autopsyDate));
    });
  }

  ngOnDestroy(): void {
    this.unsubReports?.();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  formatDate(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    return (
      d.toLocaleDateString('fr-FR') +
      ' ' +
      d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    );
  }

  voirRapport(report: Autopsie): void {
    this.router.navigate(['/autopsie', report.id]);
  }

  nouveauRapport(): void {
    this.router.navigate(['/autopsie']);
  }

  async downloadPdf(report: Autopsie): Promise<void> {
    // Build a temporary canvas to generate the PDF
    const canvas = document.createElement('canvas');
    const { drawBodyCanvas } = await import('../../services/autopsie-manager.service');
    await drawBodyCanvas(canvas, report.genderIsMale, report.injuries);
    await generateReport(report, canvas);
  }

  async deleteReport(report: Autopsie): Promise<void> {
    const result = await Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: 'Vous ne pourrez pas revenir en arrière !',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler',
    });
    if (result.isConfirmed) {
      try {
        await this.api.supprimer('autopsies', report.id!);
        Swal.fire('Supprimé !', 'Le rapport a été supprimé.', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Erreur', 'Une erreur est survenue lors de la suppression.', 'error');
      }
    }
  }

  // ---- Randomizer ----
  async openRandomizer(): Promise<void> {
    this.randomizerOpen.set(true);
    this.randomizerStep.set(1);
    this.wheelResult.set(null);
    this.legistesLoading.set(true);
    try {
      const profiles = await this.auth.listerProfils();
      const legists = profiles.filter(
        (p) => p.activated && Array.isArray(p.permissions) && p.permissions.includes('legist'),
      );
      this.legistes.set(legists);
      this.selectedLegistes.set(legists.map((l) => l.id));
    } catch (err) {
      console.error(err);
    } finally {
      this.legistesLoading.set(false);
    }
  }

  toggleLegiste(id: string): void {
    this.selectedLegistes.update((list) =>
      list.includes(id) ? list.filter((l) => l !== id) : [...list, id],
    );
  }

  get selectedLegistesNames(): string[] {
    return this.legistes()
      .filter((l) => this.selectedLegistes().includes(l.id))
      .map((l) => l.name);
  }

  async goToWheel(): Promise<void> {
    this.randomizerStep.set(2);
    this.currentRotation = 0;
    this.wheelResult.set(null);
    setTimeout(() => this.drawWheel(), 50);
  }

  drawWheel(): void {
    const canvasEl = this.wheelCanvasRef();
    if (!canvasEl) return;
    const canvas = canvasEl.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(cx, cy) - 8;

    const names = this.selectedLegistesNames;
    const n = names.length;
    if (n === 0) return;

    const seg = (2 * Math.PI) / n;
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < n; i++) {
      const start = i * seg + this.currentRotation;
      const end = start + seg;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + seg / 2);
      ctx.textAlign = 'right';
      ctx.fillStyle = 'white';
      const fontSize = Math.max(10, Math.min(14, Math.floor(120 / n) + 6));
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      const edgePad = 12;
      const centerPad = 24;
      const maxW = radius - edgePad - centerPad;

      const words = names[i].split(' ');
      const lines: string[] = [];
      let currentLine = words[0];
      for (let w = 1; w < words.length; w++) {
        const testLine = currentLine + ' ' + words[w];
        if (ctx.measureText(testLine).width <= maxW) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = words[w];
        }
      }
      lines.push(currentLine);

      const lh = fontSize * 1.2;
      const totalHeight = (lines.length - 1) * lh;
      const startY = -totalHeight / 2 + fontSize * 0.35;
      lines.forEach((line, li) => {
        ctx.fillText(line, radius - edgePad, startY + li * lh);
      });
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#212121';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  spinWheel(): void {
    if (this.isSpinning()) return;
    this.isSpinning.set(true);
    this.wheelResult.set(null);

    const names = this.selectedLegistesNames;
    const n = names.length;
    const seg = (2 * Math.PI) / n;
    const targetIndex = Math.floor(Math.random() * n);

    const targetFinal = -Math.PI / 2 - (targetIndex * seg + seg / 2);
    let delta =
      (((targetFinal - this.currentRotation) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    if (delta < 0.1) delta += 2 * Math.PI;
    const extraSpins = (6 + Math.floor(Math.random() * 5)) * 2 * Math.PI;
    const totalDelta = delta + extraSpins;

    const startRotation = this.currentRotation;
    const duration = 5000;
    const startTime = performance.now();

    const animate = (ts: number) => {
      const t = Math.min((ts - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      this.currentRotation = startRotation + totalDelta * eased;
      this.drawWheel();
      if (t < 1) {
        this.animFrame = requestAnimationFrame(animate);
      } else {
        this.currentRotation = startRotation + totalDelta;
        this.isSpinning.set(false);
        this.wheelResult.set(names[targetIndex]);
        this.drawWheel();
      }
    };
    this.animFrame = requestAnimationFrame(animate);
  }

  closeRandomizer(): void {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    this.randomizerOpen.set(false);
    this.randomizerStep.set(1);
    this.isSpinning.set(false);
    this.currentRotation = 0;
    this.wheelResult.set(null);
  }
}
