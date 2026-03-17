import { Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DispatchService } from '../../services/dispatch.service';
import { MORGUE_CONFIG } from '../../config/dispatch.config';

@Component({
  selector: 'app-morgue',
  templateUrl: './morgue.html',
  styleUrl: './morgue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class MorguePage implements OnInit, OnDestroy {
  private readonly dispatchSvc = inject(DispatchService);

  readonly morgueConfig = MORGUE_CONFIG;
  readonly etat = this.dispatchSvc.etat;
  readonly connecte = this.dispatchSvc.connecte;

  ngOnInit(): void {
    this.dispatchSvc.connecter();
  }

  ngOnDestroy(): void {
    this.dispatchSvc.deconnecter();
  }

  majMorgue(section: string, numero: string, nom: string): void {
    const etat = { ...this.etat() };
    const morgue = { ...etat.morgue };
    const sectionData = { ...(morgue as Record<string, Record<string, string>>)[section] };
    sectionData[numero] = nom;
    (morgue as Record<string, Record<string, string>>)[section] = sectionData;
    etat.morgue = morgue;
    this.dispatchSvc.envoyerEtat(etat);
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
