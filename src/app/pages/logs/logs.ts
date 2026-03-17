import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import type { Log } from '../../modeles/log';
import type { Profile } from '../../modeles/utilisateur';

const TYPES_LOG = [
  'INVENTAIRE',
  'COMMANDES',
  'VEHICULES',
  'NOTES DE FRAIS',
  'PASSWORD',
  'ENTREPRISES',
  'ITEMS',
  'UTILISATEURS',
  'FORMATION',
  'RADIOS',
  'Ajout employés',
  'Changement de grade',
  'Suppression employé',
  'Ajout faute',
  'Mise a pied',
  'Retrait de mise a pied',
];

@Component({
  selector: 'app-logs',
  templateUrl: './logs.html',
  styleUrl: './logs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class LogsPage {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly logs = signal<Log[]>([]);
  readonly profiles = signal<Record<string, Profile>>({});
  readonly chargement = signal(false);
  readonly filtreType = signal('');
  readonly filtreUtilisateur = signal<string | null>(null);
  readonly typesLog = TYPES_LOG;

  readonly isDev = computed(() => this.auth.profile()?.permissions?.includes('dev') ?? false);

  readonly userList = computed(() => Object.values(this.profiles()));

  readonly logsFiltres = computed(() => {
    let result = this.logs();
    const type = this.filtreType();
    const user = this.filtreUtilisateur();
    if (type) result = result.filter((l) => l.type === type);
    if (user) result = result.filter((l) => l.user === user);
    return result.sort((a, b) => {
      const ai = parseInt(a.id ?? '0', 10);
      const bi = parseInt(b.id ?? '0', 10);
      return bi - ai;
    });
  });

  constructor() {
    this.fetchProfiles();
    this.fetchLogs();
  }

  private async fetchProfiles(): Promise<void> {
    const list = await this.api.lister<Profile>('profiles').catch(() => []);
    const map: Record<string, Profile> = {};
    for (const p of list) map[p.id] = p;
    this.profiles.set(map);
  }

  async fetchLogs(): Promise<void> {
    this.chargement.set(true);
    const list = await this.api.lister<Log>('logs').catch(() => []);
    this.logs.set(list);
    this.chargement.set(false);
  }

  getUserName(userId: string): string {
    return this.profiles()[userId]?.name ?? 'Inconnu';
  }

  formatDate(id: string): string {
    const ts = parseInt(id, 10);
    if (isNaN(ts)) return id;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(ts);
  }

  async deleteLog(log: Log): Promise<void> {
    if (!log.id) return;
    await this.api.supprimer('logs', log.id);
    this.fetchLogs();
  }
}
