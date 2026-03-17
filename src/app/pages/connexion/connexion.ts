import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Profile } from '../../modeles/utilisateur';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-connexion',
  templateUrl: './connexion.html',
  styleUrl: './connexion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
})
export class ConnexionPage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private unsubAuth: (() => void) | null = null;

  readonly mode = signal<'connexion' | 'inscription'>('connexion');
  readonly profileList = signal<Profile[]>([]);
  readonly nameList = signal<string[]>([]);
  readonly name = signal('');
  readonly prenom = signal('');
  readonly nom = signal('');
  readonly motDePasse = signal('');
  readonly confirmationMotDePasse = signal('');
  readonly erreur = signal('');
  readonly succes = signal('');
  readonly chargement = signal(false);

  async ngOnInit(): Promise<void> {
    // Déconnecter l'utilisateur au chargement (comme BCES-21JC Login.vue)
    await this.auth.deconnexion();
    await this.chargerProfils();
  }

  ngOnDestroy(): void {
    this.unsubAuth?.();
  }

  async soumettre(): Promise<void> {
    if (this.mode() === 'connexion') {
      await this.connexion();
    } else {
      await this.inscription();
    }
  }

  private async chargerProfils(): Promise<void> {
    try {
      const profils = await this.auth.listerProfilsActifs();
      this.profileList.set(profils);
      this.nameList.set(profils.map((p) => p.name));
    } catch (err) {
      this.erreur.set(this.extraireErreur(err));
    }
  }

  private extraireErreur(err: unknown): string {
    if (err instanceof Error) return err.message;
    return 'Une erreur inattendue est survenue';
  }

  private async connexion(): Promise<void> {
    const selectedProfile = this.profileList().find((p) => p.name === this.name());
    if (!selectedProfile) {
      this.erreur.set("Le profil sélectionné n'existe pas.");
      return;
    }
    if (!this.motDePasse().trim()) {
      this.erreur.set('Le mot de passe est requis.');
      return;
    }

    this.chargement.set(true);
    this.erreur.set('');
    this.succes.set('');
    try {
      await this.auth.connexion(this.name(), this.motDePasse());
      await this.router.navigate(['/']);
    } catch {
      this.erreur.set('Echec de la connexion. Vérifiez votre mot de passe.');
    } finally {
      this.chargement.set(false);
    }
  }

  private async inscription(): Promise<void> {
    if (!this.prenom().trim()) {
      this.erreur.set('Le prénom est requis.');
      return;
    }
    if (!this.nom().trim()) {
      this.erreur.set('Le nom est requis.');
      return;
    }
    if (!this.motDePasse().trim() || !this.confirmationMotDePasse().trim()) {
      this.erreur.set('Le mot de passe est requis.');
      return;
    }
    if (this.motDePasse().length < 6) {
      this.erreur.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (this.motDePasse() !== this.confirmationMotDePasse()) {
      this.erreur.set('Les mots de passe ne correspondent pas.');
      return;
    }

    this.chargement.set(true);
    this.erreur.set('');
    this.succes.set('');
    try {
      const detail = await this.auth.inscription(this.prenom(), this.nom(), this.motDePasse());
      this.succes.set(detail);
      this.mode.set('connexion');
      this.motDePasse.set('');
      this.confirmationMotDePasse.set('');
      this.prenom.set('');
      this.nom.set('');
      await this.chargerProfils();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('email-already-in-use')) {
        this.erreur.set('Ce profil existe déjà.');
      } else {
        this.erreur.set(this.extraireErreur(err));
      }
    } finally {
      this.chargement.set(false);
    }
  }
}
