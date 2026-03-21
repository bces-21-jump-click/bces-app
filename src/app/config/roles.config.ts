export const ORDRE_ROLES: string[] = [
  'Directeur',
  'Directeur Adjoint',
  'Assistant RH',
  'Responsable de Service',
  'Spécialiste',
  'Medecin',
  'Résidant',
  'Interne',
  'Temporaire',
];

export const ROLES_CONFIG: Record<string, { color: string; name: string }> = {
  Directeur: { color: '#e53935', name: 'red' },
  'Directeur Adjoint': { color: '#e53935', name: 'red' },
  'Responsable de Service': { color: '#8e24aa', name: 'purple' },
  'Assistant RH': { color: '#fb8c00', name: 'orange' },
  Spécialiste: { color: '#1e88e5', name: 'blue' },
  Medecin: { color: '#1e88e5', name: 'blue' },
  Médecin: { color: '#1e88e5', name: 'blue' },
  Titulaire: { color: '#1e88e5', name: 'blue' },
  Résidant: { color: '#1ebde5', name: 'cyan' },
  Résident: { color: '#1ebde5', name: 'cyan' },
  Interne: { color: '#43a047', name: 'green' },
  Temporaire: { color: '#ffd700', name: 'amber' },
};

export function obtenirCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.color ?? '#43a047';
}

export function obtenirNomCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.name ?? 'green';
}
