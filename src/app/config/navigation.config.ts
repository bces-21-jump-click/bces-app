export interface NavItem {
  titre: string;
  emoji: string;
  lien: string;
  permissions?: string[];
}

export type NavGroupe = NavItem[];

export const NAV_ITEMS: NavGroupe[] = [
  [{ titre: 'Accueil', emoji: '🏠', lien: '/' }],
  [
    { titre: 'Dispatch', emoji: '📡', lien: '/dispatch' },
    { titre: 'Chambres', emoji: '🛏️', lien: '/chambres' },
    { titre: 'Morgue', emoji: '⚰️', lien: '/morgue' },
  ],
  [
    { titre: 'Inventaire', emoji: '📦', lien: '/inventaire', permissions: ['lses'] },
    { titre: 'Commandes', emoji: '📋', lien: '/commandes', permissions: ['lses'] },
    { titre: 'Notes de frais', emoji: '🧾', lien: '/notes-frais', permissions: ['lses'] },
    { titre: 'Garage', emoji: '🚑', lien: '/garage', permissions: ['lses'] },
    { titre: 'Stocks', emoji: '🏪', lien: '/stocks', permissions: ['stock'] },
  ],
  [
    { titre: 'Autopsie', emoji: '⚰️', lien: '/rapports-autopsie', permissions: ['legist'] },
    { titre: 'Rendez-vous', emoji: '📅', lien: '/rendez-vous', permissions: ['lses'] },
    { titre: 'Ressources Humaines', emoji: '👔', lien: '/rh', permissions: ['rh'] },
  ],
  [
    { titre: 'Utilisateurs', emoji: '👥', lien: '/utilisateurs', permissions: ['user'] },
    { titre: 'Logs', emoji: '💾', lien: '/logs', permissions: ['logs'] },
    {
      titre: 'Formation',
      emoji: '🎓',
      lien: '/formation',
      permissions: ['trainer', 'restricted_trainer'],
    },
  ],
];
