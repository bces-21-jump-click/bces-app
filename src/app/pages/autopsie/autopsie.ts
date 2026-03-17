import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
  viewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { drawBodyCanvas, generateReport } from '../../services/autopsie-manager.service';
import type { Autopsie, Injury, InjuryPoint } from '../../modeles/autopsie';
import Swal from 'sweetalert2';

const COLORS = ['orange', 'pink', 'indigo', 'green', 'red', 'cyan'];
const COLOR_HEX: Record<string, string> = {
  orange: '#FF9800',
  pink: '#E91E63',
  indigo: '#3F51B5',
  green: '#4CAF50',
  red: '#F44336',
  cyan: '#00BCD4',
};

@Component({
  selector: 'app-autopsie',
  templateUrl: './autopsie.html',
  styleUrl: './autopsie.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class AutopsiePage implements OnInit, AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvasElement');

  readonly colors = COLORS;
  readonly tool = signal<'add' | 'move' | 'delete'>('add');

  readonly name = signal('');
  readonly cid = signal('');
  readonly doctor = signal('');
  readonly genderIsMale = signal(false);
  readonly legist = signal('');
  readonly injuries = signal<Injury[]>([
    { externalAnalysis: '', internalAnalysis: '', points: [] },
  ]);
  readonly selectedInjury = signal(0);
  readonly bloodBilan = signal('');
  readonly diagnostic = signal('');
  readonly interventionReport = signal('');
  readonly eventChronology = signal('');
  readonly autopsySummary = signal('');
  readonly autopsyDate = signal(0);
  readonly chargement = signal(false);

  readonly reportId = signal<string | null>(null);
  private draggingPoint: InjuryPoint | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.reportId.set(id);
      this.charger(id);
    } else {
      this.legist.set(this.auth.profile()?.name ?? '');
      this.autopsyDate.set(Date.now());
    }
  }

  ngAfterViewInit(): void {
    if (!this.reportId()) {
      setTimeout(() => this.drawCanvas(), 100);
    }
  }

  async charger(id: string): Promise<void> {
    this.chargement.set(true);
    try {
      const data = await this.api.obtenir<Autopsie>('autopsies', id);
      this.name.set(data.name);
      this.cid.set(data.cid);
      this.genderIsMale.set(data.genderIsMale);
      this.doctor.set(data.doctor);
      this.legist.set(data.legist);
      this.injuries.set(data.injuries);
      this.bloodBilan.set(data.bloodBilan);
      this.diagnostic.set(data.diagnostic);
      this.interventionReport.set(data.interventionReport);
      this.eventChronology.set(data.eventChronology);
      this.autopsySummary.set(data.autopsySummary);
      this.autopsyDate.set(data.autopsyDate);
      setTimeout(() => this.drawCanvas(), 100);
    } catch {
      Swal.fire('Erreur', 'Rapport introuvable.', 'error');
    } finally {
      this.chargement.set(false);
    }
  }

  colorHex(index: number): string {
    return COLOR_HEX[COLORS[index]] ?? COLORS[index];
  }

  drawCanvas(): void {
    const canvasEl = this.canvasRef();
    if (!canvasEl) return;
    drawBodyCanvas(canvasEl.nativeElement, this.genderIsMale(), this.injuries());
  }

  onGenderChange(val: boolean): void {
    this.genderIsMale.set(val);
    this.drawCanvas();
  }

  useTool(evt: MouseEvent): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    const posX = evt.offsetX;
    const posY = evt.offsetY;

    switch (this.tool()) {
      case 'add':
        if (evt.type === 'mousedown') {
          this.injuries.update((list) => {
            const copy = list.map((inj) => ({ ...inj, points: [...inj.points] }));
            copy[this.selectedInjury()].points.push({ x: posX, y: posY });
            return copy;
          });
          this.drawCanvas();
        }
        break;
      case 'move':
        if (evt.type === 'mousedown') {
          let closestPoint: InjuryPoint | null = null;
          let minDist = 10;
          for (const inj of this.injuries()) {
            for (const point of inj.points) {
              const d = Math.sqrt((point.x - posX) ** 2 + (point.y - posY) ** 2);
              if (d < minDist) {
                minDist = d;
                closestPoint = point;
              }
            }
          }
          this.draggingPoint = closestPoint;
        } else if (evt.type === 'mousemove' && this.draggingPoint) {
          this.draggingPoint.x = posX;
          this.draggingPoint.y = posY;
          this.drawCanvas();
        } else if (evt.type === 'mouseup' && this.draggingPoint) {
          this.draggingPoint.x = posX;
          this.draggingPoint.y = posY;
          this.draggingPoint = null;
          this.drawCanvas();
        }
        break;
      case 'delete':
        if (evt.type === 'mousedown') {
          let closestIdx = -1;
          let closestInj = -1;
          let minD = 10;
          this.injuries().forEach((inj, injIdx) => {
            inj.points.forEach((point, idx) => {
              const d = Math.sqrt((point.x - posX) ** 2 + (point.y - posY) ** 2);
              if (d < minD) {
                minD = d;
                closestIdx = idx;
                closestInj = injIdx;
              }
            });
          });
          if (closestIdx !== -1 && closestInj !== -1) {
            this.injuries.update((list) => {
              const copy = list.map((inj) => ({ ...inj, points: [...inj.points] }));
              copy[closestInj].points.splice(closestIdx, 1);
              return copy;
            });
            this.drawCanvas();
          }
        }
        break;
    }
  }

  addInjury(): void {
    if (this.injuries().length >= COLORS.length) {
      Swal.fire('Erreur', 'Nombre maximum de blessures atteint.', 'error');
      return;
    }
    this.injuries.update((list) => [
      ...list,
      { externalAnalysis: '', internalAnalysis: '', points: [] },
    ]);
  }

  deleteInjury(index: number): void {
    if (this.injuries().length <= 1) {
      Swal.fire('Erreur', 'Il doit y avoir au moins une blessure.', 'error');
      return;
    }
    this.injuries.update((list) => list.filter((_, i) => i !== index));
    if (this.selectedInjury() >= this.injuries().length) {
      this.selectedInjury.set(this.injuries().length - 1);
    }
    this.drawCanvas();
  }

  updateInjuryField(
    index: number,
    field: 'externalAnalysis' | 'internalAnalysis',
    value: string,
  ): void {
    this.injuries.update((list) => {
      const copy = [...list];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  async saveReport(): Promise<void> {
    const data: Record<string, unknown> = {
      name: this.name(),
      cid: this.cid(),
      genderIsMale: this.genderIsMale(),
      doctor: this.doctor(),
      legist: this.legist(),
      injuries: this.injuries(),
      bloodBilan: this.bloodBilan(),
      diagnostic: this.diagnostic(),
      interventionReport: this.interventionReport(),
      eventChronology: this.eventChronology(),
      autopsySummary: this.autopsySummary(),
      autopsyDate: Date.now(),
    };

    try {
      if (this.reportId()) {
        await this.api.modifier('autopsies', this.reportId()!, data);
      } else {
        await this.api.creer('autopsies', data);
      }
      this.router.navigate(['/rapports-autopsie']);
    } catch (err) {
      console.error(err);
      Swal.fire('Erreur', 'Impossible de sauvegarder le rapport.', 'error');
    }
  }

  async genererPdf(): Promise<void> {
    const canvasEl = this.canvasRef()?.nativeElement;
    if (!canvasEl) return;
    const autopsie: Autopsie = {
      id: this.reportId(),
      name: this.name(),
      cid: this.cid(),
      genderIsMale: this.genderIsMale(),
      doctor: this.doctor(),
      legist: this.legist(),
      injuries: this.injuries(),
      bloodBilan: this.bloodBilan(),
      diagnostic: this.diagnostic(),
      interventionReport: this.interventionReport(),
      eventChronology: this.eventChronology(),
      autopsySummary: this.autopsySummary(),
      autopsyDate: this.autopsyDate() || Date.now(),
    };
    await generateReport(autopsie, canvasEl);
  }

  retour(): void {
    this.router.navigate(['/rapports-autopsie']);
  }
}
