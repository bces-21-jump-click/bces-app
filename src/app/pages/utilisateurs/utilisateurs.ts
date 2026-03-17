import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { httpsCallable } from 'firebase/functions';
import Swal from 'sweetalert2';
import { Profile } from '../../modeles/utilisateur';
import { PERMISSIONS, Permission } from '../../config/permissions.config';
import { AuthService } from '../../services/auth.service';
import { LoggerService } from '../../services/logger.service';
import { functions } from '../../config/firebase.config';

@Component({
  selector: 'app-utilisateurs',
  templateUrl: './utilisateurs.html',
  styleUrl: './utilisateurs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class UtilisateursPage implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly logger = inject(LoggerService);
  private unsubDemandes: (() => void) | null = null;
  private unsubUtilisateurs: (() => void) | null = null;

  readonly utilisateurs = signal<Profile[]>([]);
  readonly demandes = signal<Profile[]>([]);
  readonly onglet = signal<'utilisateurs' | 'demandes'>('utilisateurs');

  readonly allPermissions: Permission[] = PERMISSIONS;
  readonly estAdmin = computed(
    () => this.auth.profile()?.permissions?.some((p) => ['dev', 'admin'].includes(p)) ?? false,
  );
  readonly profileConnecte = this.auth.profile;

  readonly mesPermissions = computed(() => {
    const perms = this.auth.profile()?.permissions ?? [];
    if (perms.includes('dev') || perms.includes('admin')) return this.allPermissions;
    return this.allPermissions.filter((p) => perms.includes(p.value));
  });

  readonly nbDemandes = computed(() => this.demandes().length);

  // Dialog d'édition
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

  // === Utilisateurs ===
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

    const permString =
      sorted.length > 0
        ? sorted.map((p) => this.allPermissions.find((pp) => pp.value === p)?.icon ?? '').join(' ')
        : 'Aucune';

    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'UTILISATEURS',
      `Modification des permissions de l'utilisateur ${profil.name} (${permString})`,
    );

    this.fermerEdition();
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: 'Utilisateur sauvegardé avec succès.',
      timer: 3000,
    });
  }

  async supprimerUtilisateur(profil: Profile): Promise<void> {
    const result = await Swal.fire({
      title: 'Confirmer la suppression',
      text: `Êtes-vous sûr de vouloir supprimer l'utilisateur "${profil.name}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
    });
    if (!result.isConfirmed) return;

    await this.auth.supprimerProfil(profil.id);
    this.fermerEdition();
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: 'Utilisateur supprimé avec succès.',
      timer: 3000,
    });
  }

  async resetPassword(profil: Profile): Promise<void> {
    const result = await Swal.fire({
      title: 'Confirmer la réinitialisation',
      text: `Êtes-vous sûr de vouloir réinitialiser le mot de passe de "${profil.name}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui',
      cancelButtonText: 'Annuler',
    });
    if (!result.isConfirmed) return;

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 24; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }

    try {
      await httpsCallable(
        functions,
        'changePassword',
      )({
        userId: profil.id,
        hash: btoa(password),
      });

      await Swal.fire({
        icon: 'success',
        title: 'Succès',
        text: `Mot de passe réinitialisé avec succès. Nouveau mot de passe temporaire : ${password} (En validant, il sera copié dans votre presse-papier.)`,
      });

      await this.logger.log(
        this.auth.profile()?.id ?? '',
        'PASSWORD',
        `Réinitialisation du mot de passe pour l'utilisateur ${profil.name}`,
      );
      await navigator.clipboard.writeText(password);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
      Swal.fire({ icon: 'error', title: 'Erreur', text: message, timer: 3000 });
    }
  }

  // === Demandes ===
  async approuver(profil: Profile): Promise<void> {
    const result = await Swal.fire({
      title: "Confirmer l'acceptation",
      text: `Êtes-vous sûr de vouloir accepter la demande de l'utilisateur "${profil.name}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, accepter',
      cancelButtonText: 'Annuler',
    });
    if (!result.isConfirmed) return;

    await this.auth.approuverDemande(profil.id);
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'UTILISATEURS',
      `Acceptation de la demande de l'utilisateur ${profil.name}`,
    );
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: 'Utilisateur accepté avec succès.',
      timer: 3000,
    });
  }

  async refuser(profil: Profile): Promise<void> {
    const result = await Swal.fire({
      title: 'Confirmer le rejet',
      text: `Êtes-vous sûr de vouloir rejeter la demande de l'utilisateur "${profil.name}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, rejeter',
      cancelButtonText: 'Annuler',
    });
    if (!result.isConfirmed) return;

    await this.auth.refuserDemande(profil.id);
    await this.logger.log(
      this.auth.profile()?.id ?? '',
      'UTILISATEURS',
      `Rejet de la demande de l'utilisateur ${profil.name}`,
    );
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: 'Utilisateur rejeté avec succès.',
      timer: 3000,
    });
  }

  permissionIcon(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.icon ?? '';
  }

  permissionName(value: string): string {
    return this.allPermissions.find((p) => p.value === value)?.name ?? value;
  }
}
