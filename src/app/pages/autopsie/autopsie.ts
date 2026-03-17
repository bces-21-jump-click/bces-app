import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface Blessure {
  zone: string;
  type: string;
  description: string;
  gravite: string;
}

interface Autopsie {
  id: string | null;
  name: string;
  cid: string;
  genderIsMale: boolean;
  doctor: string;
  legist: string;
  injuries: Blessure[];
  bloodBilan: string;
  diagnostic: string;
  interventionReport: string;
  eventChronology: string;
  autopsySummary: string;
  autopsyDate: string | null;
}

const ZONES_CORPS = [
  'Tête',
  'Cou',
  'Épaule gauche',
  'Épaule droite',
  'Bras gauche',
  'Bras droit',
  'Main gauche',
  'Main droite',
  'Thorax',
  'Abdomen',
  'Bassin',
  'Cuisse gauche',
  'Cuisse droite',
  'Genou gauche',
  'Genou droit',
  'Tibia gauche',
  'Tibia droit',
  'Pied gauche',
  'Pied droit',
  'Dos',
];

const TYPES_BLESSURE = [
  'Blessure par balle',
  'Blessure par arme blanche',
  'Fracture',
  'Brûlure',
  'Contusion',
  'Lacération',
  'Hématome',
  'Perforation',
  'Écrasement',
  'Autre',
];

@Component({
  selector: 'app-autopsie',
  templateUrl: './autopsie.html',
  styleUrl: './autopsie.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class AutopsiePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly zonesCorps = ZONES_CORPS;
  readonly typesBlessure = TYPES_BLESSURE;

  readonly autopsie = signal<Autopsie>({
    id: null,
    name: '',
    cid: '',
    genderIsMale: true,
    doctor: '',
    legist: '',
    injuries: [],
    bloodBilan: '',
    diagnostic: '',
    interventionReport: '',
    eventChronology: '',
    autopsySummary: '',
    autopsyDate: null,
  });

  readonly chargement = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.charger(id);
    }
  }

  async charger(id: string): Promise<void> {
    this.chargement.set(true);
    const data = await this.api.obtenir<Autopsie>('autopsies', id).catch(() => null);
    if (data) {
      this.autopsie.set(data);
    }
    this.chargement.set(false);
  }

  ajouterBlessure(): void {
    this.autopsie.update((a) => ({
      ...a,
      injuries: [...a.injuries, { zone: '', type: '', description: '', gravite: 'modérée' }],
    }));
  }

  supprimerBlessure(index: number): void {
    this.autopsie.update((a) => ({
      ...a,
      injuries: a.injuries.filter((_, i) => i !== index),
    }));
  }

  majBlessure(index: number, champ: keyof Blessure, valeur: string): void {
    this.autopsie.update((a) => {
      const injuries = [...a.injuries];
      injuries[index] = { ...injuries[index], [champ]: valeur };
      return { ...a, injuries };
    });
  }

  retour(): void {
    this.router.navigate(['/rapports-autopsie']);
  }
}
