export const ORDRE_ROLES: string[] = [
  'Directeur',
  'Directeur Adjoint',
  'Assistant RH',
  'Médecin spécialiste',
  'Médecin',
  'Résident',
  'Interne',
  'LSES',
]

export const ROLES_CONFIG: Record<string, { color: string; name: string }> = {
  Directeur: { color: '#e53935', name: 'red' },
  'Directeur Adjoint': { color: '#ff6000', name: 'deep-orange' },
  'Assistant RH': { color: '#ff9300', name: 'yellow' },
  'Médecin spécialiste': { color: '#ad2cd0', name: 'purple' },
  Médecin: { color: '#4a86e8', name: 'blue' },
  Résident: { color: '#357b8a', name: 'teal' },
  Interne: { color: '#43a047', name: 'green' },
  LSES: { color: '#ff4081', name: 'pink' },
}

export function obtenirCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.color ?? '#43a047'
}

export function obtenirNomCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.name ?? 'green'
}
