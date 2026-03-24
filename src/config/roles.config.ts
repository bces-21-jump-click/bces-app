export const ORDRE_ROLES: string[] = [
  'Directeur',
  'Directeur Adjoint',
  'Assistant RH',
  'Médecin',
  'Résident',
  'Interne',
  'Temporaire',
]

export const ROLES_CONFIG: Record<string, { color: string; name: string }> = {
  Directeur: { color: '#e53935', name: 'red' },
  'Directeur Adjoint': { color: '#e53935', name: 'red' },
  'Assistant RH': { color: '#f4511e', name: 'orange' },
  Médecin: { color: '#1e88e5', name: 'blue' },
  Résident: { color: '#1ebde5', name: 'cyan' },
  Interne: { color: '#43a047', name: 'green' },
  Temporaire: { color: '#ffd700', name: 'amber' },
}

export function obtenirCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.color ?? '#43a047'
}

export function obtenirNomCouleurRole(nomRole: string): string {
  return ROLES_CONFIG[nomRole]?.name ?? 'green'
}
