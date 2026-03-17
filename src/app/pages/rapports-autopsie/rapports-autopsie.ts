import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../services/api.service';

interface RapportAutopsie {
  id: string;
  name: string;
  legist: string;
  autopsyDate: string | null;
  doctor: string;
  diagnostic: string;
}

@Component({
  selector: 'app-rapports-autopsie',
  templateUrl: './rapports-autopsie.html',
  styleUrl: './rapports-autopsie.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RapportsAutopsiePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly rapports = signal<RapportAutopsie[]>([]);
  readonly chargement = signal(true);

  ngOnInit(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    this.chargement.set(true);
    const data = await this.api.lister<RapportAutopsie>('autopsies').catch(() => []);
    this.rapports.set(data);
    this.chargement.set(false);
  }

  voirRapport(id: string): void {
    this.router.navigate(['/autopsie', id]);
  }

  nouveauRapport(): void {
    this.router.navigate(['/autopsie']);
  }
}
