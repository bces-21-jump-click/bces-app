import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Profile } from '../../modeles/utilisateur';
import { PERMISSIONS, Permission } from '../../config/permissions.config';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-utilisateurs',
  templateUrl: './utilisateurs.html',
  styleUrl: './utilisateurs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class UtilisateursPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private unsubDemandes: (() => void) | null = null;
  private unsubUtilisateurs: (() => void) | null = null;

  readonly utilisateurs = signal<Profile[]>([]);
  readonly demandes = signal<Profile[]>([]);
  readonly recherche = signal('');
  readonly onglet = signal<'utilisateurs' | 'demandes'>('utilisateurs');
  readonly erreur = signal('');

  readonly allPermissions: Permission[] = PERMISSIONS;
  readonly estAdmin = this.auth.estAdmin;
  readonly profileConnecte = this.auth.profile;

  /** Permissions que l'utilisateur connecte peut attribuer */
  readonly mesPermissions = computed(() => {
    const perms = this.auth.profile()?.permissions ?? [];
    if (perms.includes('dev') || perms.includes('admin')) return this.allPermissions;
    return this.allPermissions.filter((p) => perms.includes(p.value));
  });

  readonly utilisateursFiltres = computed(() => {
    const terme = this.recherche().toLowerCase();
    return this.utilisateurs().filter((u) => {
      const identite = u.name.toLowerCase();
      return !terme || identite.includes(terme) || u.role.toLowerCase().includes(terme);
    });
  });

  readonly nbDemandes = computed(() => this.demandes().length);

  /** Dialog d'edition */
  readonly dialogOuvert = signal(false);
  readonly utilisateurEdite = signal<Profile | null>(null);
  readonly permissionsEditees = signal<string[]>([]);

  constructor() {
    this.unsubUtilisateurs = this.auth.ecouterProfilsActifs((profiles) => {
      this.utilisateurs.set(profiles);
    });
    this.unsubDemandes = this.auth.ecouterDemandes((profils) => {
      this.demandes.set(profils);
    });
  }

  ngOnDestroy(): void {
    this.unsubDemandes?.();
    this.unsubUtilisateurs?.();
  }

  async approuver(profil: Profile): Promise<void> {
    if (!this.estAdmin()) return;
    await this.auth.approuverDemande(profil.id);
  }

  async refuser(profil: Profile): Promise<void> {
    if (!this.estAdmin()) return;
    await this.auth.refuserDemande(profil.id);
  }

  ouvrirEdition(profil: Profile): void {
    this.utilisateurEdite.set(profil);
    this.permissionsEditees.set([...(profil.permissions || [])]);
    this.dialogOuvert.set(true);
  }

  fermerEdition(): void {
    this.dialogOuvert.set(false);
    this.utilisateurEdite.set(null);
  }

  togglePermission(value: string): void {
    this.permissionsEditees.update((perms) =>
      perms.includes(value) ? perms.filter((p) => p !== value) : [...perms, value],
    );
  }

  async enregistrerPermissions(): Promise<void> {
    const profil = this.utilisateurEdite();
    if (!profil) return;

    const sorted = this.permissionsEditees().sort((a, b) => {
      const ia = this.allPermissions.findIndex((p) => p.value === a);
      const ib = this.allPermissions.findIndex((p) => p.value === b);
      return ia - ib;
    });

    await this.auth.mettreAJourPermissions(profil.id, sorted);
    this.fermerEdition();
  }

  async supprimerUtilisateur(profil: Profile): Promise<void> {
    if (!this.estAdmin()) return;
    if (!confirm('Supprimer l utilisateur "' + profil.name + '" ?')) return;
    await this.auth.supprimerProfil(profil.id);
  }

  permissionIcon(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.icon ?? '';
  }

  permissionName(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.name ?? value;
  }
}
