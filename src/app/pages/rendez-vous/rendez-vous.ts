import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface RendezVous {
  id: string;
  patientName: string;
  patientPhone: string;
  specialty: string;
  date: string;
  time: string;
  duration: number;
  reason: string;
  status: string;
  doctor: string;
  companion: string;
  notes: string;
  createdAt: number;
  availability: string;
}

@Component({
  selector: 'app-rendez-vous',
  templateUrl: './rendez-vous.html',
  styleUrl: './rendez-vous.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class RendezVousPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly rendezVous = signal<RendezVous[]>([]);
  readonly filtreStatut = signal('');
  readonly filtreSpecialite = signal('');
  readonly vue = signal<'liste' | 'calendrier'>('liste');

  readonly statuts = ['En attente', 'Programmé', 'Terminé', 'Annulé'];

  readonly specialites = computed(() => {
    const set = new Set(this.rendezVous().map((r) => r.specialty));
    return Array.from(set).sort();
  });

  readonly rendezVousFiltres = computed(() => {
    let result = this.rendezVous();
    const statut = this.filtreStatut();
    const specialite = this.filtreSpecialite();
    if (statut) result = result.filter((r) => r.status === statut);
    if (specialite) result = result.filter((r) => r.specialty === specialite);
    return result.sort((a, b) => a.date.localeCompare(b.date));
  });

  ngOnInit(): void {
    this.charger();
  }

  async charger(): Promise<void> {
    const data = await this.api.lister<RendezVous>('appointments').catch(() => []);
    this.rendezVous.set(data);
  }

  getStatutClass(status: string): string {
    switch (status) {
      case 'En attente':
        return 'attente';
      case 'Programmé':
        return 'programme';
      case 'Terminé':
        return 'termine';
      case 'Annulé':
        return 'annule';
      default:
        return '';
    }
  }
}
