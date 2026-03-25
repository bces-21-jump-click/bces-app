export interface CategorieConfig {
  id: string
  label: string
  emoji: string
  couleur: string
}

export const CATEGORIES: CategorieConfig[] = [
  { id: 'en_service', label: 'En service', emoji: '🟢', couleur: '#2e7d32' },
  { id: 'astreinte', label: 'Astreinte', emoji: '⏰', couleur: '#e65100' },
  { id: 'pause', label: 'En Pause', emoji: '⏸️', couleur: '#f59f00' },
  { id: 'fin_service', label: 'Fin de service', emoji: '🔴', couleur: '#c62828' },
  { id: 'ipt', label: 'IPT', emoji: '🚶', couleur: '#455a64' },
  { id: 'conges', label: 'Congés', emoji: '🏖️', couleur: '#1565c0' },
]

export interface TypeInterventionConfig {
  id: string
  label: string
  emoji: string
}

export const TYPES_INTERVENTION: TypeInterventionConfig[] = [
  { id: 'intervention', label: 'Intervention', emoji: '🚑' },
  { id: 'primo_inter', label: 'Primo Inter', emoji: '🔥' },
  { id: 'patrouille', label: 'Patrouille', emoji: '🚔' },
  { id: 'event', label: 'Événement', emoji: '🎪' },
  { id: 'rdv', label: 'Rendez-vous', emoji: '📅' },
  { id: 'psy', label: 'Psychologue', emoji: '🧠' },
  { id: 'otage', label: 'Otage', emoji: '💰' },
  { id: 'bureau_admin', label: 'Bureau Admin', emoji: '🖥️' },
  { id: 'formation', label: 'Formation', emoji: '📚' },
  { id: 'operation', label: 'Opération', emoji: '⚙️' },
  { id: 'vm', label: 'Visite Médicale', emoji: '🩺' },
  { id: 'hopital', label: 'Hôpital', emoji: '🏥' },
]

export interface StatutRetourConfig {
  id: string
  label: string
  emoji: string
}

export const STATUTS_RETOUR: StatutRetourConfig[] = [
  { id: 'pat', label: 'PAT', emoji: '🦶' },
  { id: 'retour_0', label: 'Retour 0', emoji: '' },
  { id: 'retour_1', label: 'Retour 1', emoji: '' },
  { id: 'retour_2', label: 'Retour 2', emoji: '' },
  { id: 'retour_3', label: 'Retour 3', emoji: '' },
  { id: 'bennys', label: "Benny's", emoji: '🔧' },
  { id: 'zombie_car', label: 'Zombie Car', emoji: '🚗' },
  { id: 'airbaged', label: 'Airbagé', emoji: '🛢️' },
]

export interface RoleCentralConfig {
  id: string
  label: string
  emoji: string
}

export const ROLES_CENTRAL: RoleCentralConfig[] = [
  { id: 'radio_2', label: '2e Radio', emoji: '📻' },
  { id: 'formateur', label: 'Formateur Central', emoji: '🎓' },
  { id: 'avec_central', label: 'Avec Central', emoji: '👥' },
]

export interface StatutHopitalConfig {
  id: string
  label: string
  couleur: string
}

export const STATUTS_HOPITAL: StatutHopitalConfig[] = [
  { id: 'gestion_normale', label: 'Gestion Normale', couleur: '#4caf50' },
  { id: 'hopital_ferme', label: 'Hôpital Fermé', couleur: '#f44336' },
  { id: 'coups_de_feu', label: 'Coups de feu', couleur: '#ff9800' },
  { id: 'gestion_bagarre', label: 'Gestion Bagarre', couleur: '#ff5722' },
  { id: 'gestion_fusillade', label: 'Gestion Fusillade', couleur: '#d32f2f' },
  { id: 'mode_nuit', label: 'Mode Nuit', couleur: '#311b92' },
]

export const COMPLEMENTS: string[] = []

export const STATUTS_MEDICAUX_CRISE: string[] = [
  'Indemne',
  'Blessé léger',
  'Blessé moyen',
  'Blessé grave',
  'Urgence vitale',
  'Inconscient',
  'Soins intensifs',
  'En chirurgie',
  'Stabilisé',
  'Critique',
  'Décédé',
  'Évacué',
]

export const APPARTENANCES_CRISE: { id: string; label: string; color?: string }[] = [
  { id: 'fdo', label: 'FDO', color: '#0000ff' },
  { id: 'civil', label: 'Civil', color: '#ffffff' },
  { id: 'aztecas', label: 'Aztecas', color: '#bfe1f6' },
  { id: 'ballas', label: 'Ballas', color: '#5a3286' },
  { id: 'purgatory', label: 'Purgatory', color: '#b10202' },
  { id: 'lost_mc', label: 'Lost MC', color: '#e6e6e6' },
  { id: 'h141', label: 'H141', color: '#e6cff2' },
  { id: 'madz', label: 'Madz', color: '#ff98ea' },
  { id: 'vagos', label: 'Vagos', color: '#ffffbf' },
  { id: 'ghosts', label: 'Ghosts', color: '#3d3d3d' },
  { id: 'greyshadow', label: 'GreyShadow', color: '#215a6c' },
  { id: 'sillygoose_mc', label: 'SillyGoose MC', color: '#72788a' },
  { id: 'forsaken', label: 'Forsaken', color: '#e8eaed' },
  { id: 'zion_lion', label: 'Zion Lion', color: '#ffc8aa' },
  { id: 'corvus', label: 'Corvus', color: '#d4edbc' },
]

export const CHAMBRES_CRISE: string[] = [
  'Emergency G',
  'Emergency M',
  'Emergency D',
  'Josiah G',
  'Josiah M',
  'Josiah D',
  'Chiliad G',
  'Chiliad M',
  'Chiliad D',
  'Gordo Room',
  'Chianki Room',
  'OP-1',
  'OP-2',
  'OP-3',
  'Consult 1',
  'Consult 2',
  'Consult 3',
  'Consult 4',
]

export interface SalleAvecLitsConfig {
  id: 'emergency_room' | 'josiah_room' | 'chiliad_room'
  label: string
  lits: Array<{ id: 'lit_g' | 'lit_m' | 'lit_d'; label: string }>
}

export const SALLES_AVEC_LITS: SalleAvecLitsConfig[] = [
  {
    id: 'emergency_room',
    label: 'Emergency Room',
    lits: [
      { id: 'lit_g', label: 'Lit G' },
      { id: 'lit_m', label: 'Lit M' },
      { id: 'lit_d', label: 'Lit D' },
    ],
  },
  {
    id: 'josiah_room',
    label: 'Josiah Room',
    lits: [
      { id: 'lit_g', label: 'Lit G' },
      { id: 'lit_m', label: 'Lit M' },
      { id: 'lit_d', label: 'Lit D' },
    ],
  },
  {
    id: 'chiliad_room',
    label: 'Chiliad Room',
    lits: [
      { id: 'lit_g', label: 'Lit G' },
      { id: 'lit_m', label: 'Lit M' },
      { id: 'lit_d', label: 'Lit D' },
    ],
  },
]

export interface SalleSimpleConfig {
  id: 'gordo_room' | 'san_chianki_room'
  label: string
}

export const SALLES_SIMPLES: SalleSimpleConfig[] = [
  { id: 'gordo_room', label: 'Gordo Room' },
  { id: 'san_chianki_room', label: 'San Chianki Room' },
]

export interface SalleOperationConfig {
  id: 'op_1' | 'op_2' | 'op_3'
  label: string
}

export const SALLES_OPERATION: SalleOperationConfig[] = [
  { id: 'op_1', label: "Salle d'opé 01" },
  { id: 'op_2', label: "Salle d'opé 02" },
  { id: 'op_3', label: "Salle d'opé 03" },
]

export const STATUTS_CHAMBRE: string[] = [
  "En attente d'opé",
  'Opé sur place',
  'Réveil après opé',
  'Nuit en chambre',
  'Constantes stables',
  'Constantes faibles',
  'Coma artificiel',
  'Décès',
]

export const COULEURS_STATUTS_CHAMBRE: Record<string, string> = {
  "En attente d'opé": '#d32f2f',
  'Opé sur place': '#1976d2',
  'Réveil après opé': '#fbc02d',
  'Nuit en chambre': '#00acc1',
  'Constantes stables': '#2e7d32',
  'Constantes faibles': '#c9b79c',
  'Coma artificiel': '#bfa88a',
  Décès: '#7a7f86',
  "⚠️ En attente d'opé": '#d32f2f',
  '😷 Opé sur place': '#1976d2',
}

export const STATUTS_OPERATION: string[] = ['Libre', 'En préparation', 'En cours', 'Terminée']

export const MORGUE_CONFIG = {
  nombreCasiers: 12,
  nombreUrnes: 12,
  nombreEnterrements: 4,
  maxParLigne: 6,
}
