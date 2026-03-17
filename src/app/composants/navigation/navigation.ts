import { Component, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { NAV_ITEMS, type NavItem, type NavGroupe } from '../../config/navigation.config';
import { AuthService } from '../../services/auth.service';
import { DispatchService } from '../../services/dispatch.service';
import { NotifManagerService } from '../../services/notif-manager.service';
import { auth as firebaseAuth } from '../../config/firebase.config';

@Component({
  selector: 'app-navigation',
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  host: { '(document:keydown.escape)': 'fermerMenu()' },
})
export class NavigationComponent {
  private static readonly THEME_STORAGE_KEY = 'bces.theme';

  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly dispatchSvc = inject(DispatchService);
  readonly notif = inject(NotifManagerService);
  private readonly title = inject(Title);

  readonly themeNuit = signal(this.chargerThemeDepuisStorage());
  readonly menuOuvert = signal(false);
  readonly nomPageActive = signal('Accueil');
  readonly connecteDispatch = this.dispatchSvc.connecte;
  readonly utilisateur = this.auth.profile;

  readonly navGroupesFiltres = computed<NavGroupe[]>(() => {
    const permsUtilisateur = this.auth.profile()?.permissions ?? [];
    const estPrive = permsUtilisateur.includes('dev') || permsUtilisateur.includes('admin');
    return NAV_ITEMS.map((groupe) =>
      groupe.filter((item) => {
        if (!item.permissions || item.permissions.length === 0) return true;
        if (estPrive) return true;
        return item.permissions.some((p) => permsUtilisateur.includes(p));
      }),
    ).filter((groupe) => groupe.length > 0);
  });

  getBadge(item: NavItem): number {
    if (item.lien === '/utilisateurs') return this.notif.waitingUsers().length;
    if (item.lien === '/notes-frais') return this.notif.waitingExpenseNotes().length;
    if (item.lien === '/inventaire') return this.notif.storagesOutdated();
    if (item.lien === '/garage') return this.notif.garageNotif();
    if (item.lien === '/rh') {
      return this.notif.rhNotif() + this.notif.waitingCandidatures().length;
    }
    return 0;
  }

  constructor() {
    this.notif.init();
    this.dispatchSvc.connecter();
    this.appliquerTheme();
    this.mettreAJourNomPage(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        this.mettreAJourNomPage(event.urlAfterRedirects);
        this.dispatchSvc.connecter();
      });
  }

  toggleTheme(): void {
    this.themeNuit.update((v) => !v);
    this.appliquerTheme();
    localStorage.setItem(
      NavigationComponent.THEME_STORAGE_KEY,
      this.themeNuit() ? 'dark' : 'light',
    );
  }

  toggleMenu(): void {
    this.menuOuvert.update((v) => !v);
  }

  fermerMenu(): void {
    this.menuOuvert.set(false);
  }

  async deconnexion(): Promise<void> {
    await this.auth.deconnexion();
    this.fermerMenu();
    await this.router.navigate(['/connexion']);
  }

  async changerMotDePasse(): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user) return;

    const ancien = prompt('Mot de passe actuel');
    if (!ancien) return;
    const nouveau = prompt('Nouveau mot de passe (6 caractères minimum)');
    if (!nouveau) return;
    const confirmation = prompt('Confirmer le nouveau mot de passe');
    if (nouveau !== confirmation) {
      alert('Les nouveaux mots de passe ne correspondent pas.');
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(user.email!, ancien);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, nouveau);
      alert('Le mot de passe a été mis à jour avec succès.');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
        alert("L'ancien mot de passe est incorrect.");
      } else {
        alert('Erreur lors de la mise à jour du mot de passe.');
      }
    }
  }

  private mettreAJourNomPage(url: string): void {
    const propre = this.nettoyerUrl(url);
    if (propre === '/') {
      this.nomPageActive.set('Accueil');
      this.mettreAJourTitreOnglet();
      return;
    }

    const item = NAV_ITEMS.flat().find((nav) => nav.lien === propre);
    if (item) {
      this.nomPageActive.set(item.titre);
      this.mettreAJourTitreOnglet();
      return;
    }

    const premierSegment = propre.split('/').filter(Boolean)[0] ?? '';
    this.nomPageActive.set(this.formatterSegment(premierSegment));
    this.mettreAJourTitreOnglet();
  }

  private mettreAJourTitreOnglet(): void {
    this.title.setTitle(`BCES ${this.nomPageActive()}`);
  }

  private nettoyerUrl(url: string): string {
    const sansQuery = url.split('?')[0]?.split('#')[0] ?? '/';
    if (!sansQuery || sansQuery === '/') return '/';
    return sansQuery.endsWith('/') ? sansQuery.slice(0, -1) : sansQuery;
  }

  private formatterSegment(segment: string): string {
    if (!segment) return 'Accueil';
    return segment.charAt(0).toUpperCase() + segment.slice(1).replaceAll('-', ' ');
  }

  private appliquerTheme(): void {
    document.documentElement.setAttribute('data-theme', this.themeNuit() ? 'dark' : 'light');
  }

  private chargerThemeDepuisStorage(): boolean {
    const themeSauvegarde = localStorage.getItem(NavigationComponent.THEME_STORAGE_KEY);
    if (themeSauvegarde === 'dark') {
      return true;
    }
    if (themeSauvegarde === 'light') {
      return false;
    }
    return true;
  }
}
