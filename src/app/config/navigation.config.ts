export interface NavItem {
  titre: string;
  icon: string;
  lien: string;
  permissions?: string[];
}

export type NavGroupe = NavItem[];

export const NAV_ITEMS: NavGroupe[] = [
  [{ titre: 'Accueil', icon: 'fa-house', lien: '/' }],
  [
    { titre: 'Dispatch', icon: 'fa-tower-broadcast', lien: '/dispatch' },
    { titre: 'Chambres', icon: 'fa-bed', lien: '/chambres' },
    { titre: 'Morgue', icon: 'fa-skull', lien: '/morgue' },
  ],
  [
    { titre: 'Inventaire', icon: 'fa-box-open', lien: '/inventaire', permissions: ['lses'] },
    { titre: 'Commandes', icon: 'fa-clipboard-list', lien: '/commandes', permissions: ['lses'] },
    { titre: 'Notes de frais', icon: 'fa-receipt', lien: '/notes-frais', permissions: ['lses'] },
    { titre: 'Garage', icon: 'fa-truck-medical', lien: '/garage', permissions: ['lses'] },
    { titre: 'Stocks', icon: 'fa-boxes-stacked', lien: '/stocks', permissions: ['stock'] },
  ],
  [
    {
      titre: 'Autopsie',
      icon: 'fa-file-waveform',
      lien: '/rapports-autopsie',
      permissions: ['legist'],
    },
    {
      titre: 'Rendez-vous',
      icon: 'fa-calendar-check',
      lien: '/rendez-vous',
      permissions: ['lses'],
    },
    { titre: 'Ressources Humaines', icon: 'fa-user-tie', lien: '/rh', permissions: ['rh'] },
  ],
  [
    { titre: 'Utilisateurs', icon: 'fa-users', lien: '/utilisateurs', permissions: ['user'] },
    { titre: 'Logs', icon: 'fa-hard-drive', lien: '/logs', permissions: ['logs'] },
    {
      titre: 'Formation',
      icon: 'fa-graduation-cap',
      lien: '/formation',
      permissions: ['trainer', 'restricted_trainer'],
    },
  ],
];
