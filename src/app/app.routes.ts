import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    loadComponent: () => import('./pages/connexion/connexion').then((m) => m.ConnexionPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/accueil/accueil').then((m) => m.AccueilPage),
    data: { permissions: [] },
  },
  {
    path: 'dispatch',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dispatch/dispatch').then((m) => m.DispatchPage),
    data: { permissions: [] },
  },
  {
    path: 'chambres',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/chambres/chambres').then((m) => m.ChambresPage),
    data: { permissions: [] },
  },
  {
    path: 'morgue',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/morgue/morgue').then((m) => m.MorguePage),
    data: { permissions: [] },
  },
  {
    path: 'inventaire',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/inventaire/inventaire').then((m) => m.InventairePage),
    data: { permissions: ['bces'] },
  },
  {
    path: 'commandes',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/commandes/commandes').then((m) => m.CommandesPage),
    data: { permissions: ['bces'] },
  },
  {
    path: 'notes-frais',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/notes-frais/notes-frais').then((m) => m.NotesFraisPage),
    data: { permissions: ['bces'] },
  },
  {
    path: 'garage',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/garage/garage').then((m) => m.GaragePage),
    data: { permissions: ['bces'] },
  },
  {
    path: 'rapports-autopsie',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/rapports-autopsie/rapports-autopsie').then((m) => m.RapportsAutopsiePage),
    data: { permissions: ['legist'] },
  },
  {
    path: 'autopsie',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/autopsie/autopsie').then((m) => m.AutopsiePage),
    data: { permissions: ['legist'] },
  },
  {
    path: 'autopsie/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/autopsie/autopsie').then((m) => m.AutopsiePage),
    data: { permissions: ['legist'] },
  },
  {
    path: 'stocks',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/stocks/stocks').then((m) => m.StocksPage),
    data: { permissions: ['stock'] },
  },
  {
    path: 'rh',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rh/rh').then((m) => m.RhPage),
    data: { permissions: ['rh'] },
  },
  {
    path: 'formation',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/formation/formation').then((m) => m.FormationPage),
    data: { permissions: ['trainer', 'restricted_trainer'] },
  },
  {
    path: 'utilisateurs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/utilisateurs/utilisateurs').then((m) => m.UtilisateursPage),
    data: { permissions: ['user'] },
  },
  {
    path: 'logs',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/logs/logs').then((m) => m.LogsPage),
    data: { permissions: ['logs'] },
  },
  {
    path: 'rendez-vous',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rendez-vous/rendez-vous').then((m) => m.RendezVousPage),
    data: { permissions: ['bces'] },
  },
  {
    path: 'maintenance',
    loadComponent: () => import('./pages/maintenance/maintenance').then((m) => m.MaintenancePage),
  },
  { path: '**', redirectTo: '' },
];
