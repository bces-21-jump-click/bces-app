export interface CategorieConfig {
  id: string
  label: string
  emoji: string
  couleur: string
}

export const CATEGORIES: CategorieConfig[] = [
  { id: 'en_service', label: 'En service', emoji: '🟢', couleur: '#2e7d32' },
  { id: 'astreinte', label: 'Astreinte', emoji: '⏰', couleur: '#e65100' },
  { id: 'pause', label: 'En pause', emoji: '☕', couleur: '#f59f00' },
  { id: 'fin_service', label: 'Fin de service', emoji: '🔴', couleur: '#c62828' },
  { id: 'ipt', label: 'IPT', emoji: '🚶', couleur: '#455a64' },
  { id: 'conges', label: 'Congés', emoji: '🏖️', couleur: '#1565c0' },
]

export interface TypeInterventionConfig {
  id: string
  label: string
  emoji: string
  couleur: string
}

export const TYPES_INTERVENTION: TypeInterventionConfig[] = [
  { id: 'intervention', label: 'Intervention', emoji: '🚑', couleur: '#2e7d32' },
  { id: 'primo_inter', label: 'Primo Inter', emoji: '🔥', couleur: '#d9480f' },
  { id: 'navette', label: 'Navette', emoji: '🚑', couleur: '#ff6000' },
  { id: 'patrouille', label: 'Patrouille', emoji: '🚑', couleur: '#1565c0' },
  { id: 'event', label: 'Événement', emoji: '🎉', couleur: '#8e24aa' },
  { id: 'rdv', label: 'Rendez-vous', emoji: '📅', couleur: '#00897b' },
  { id: 'psy', label: 'Psychologue', emoji: '🧠', couleur: '#6a1b9a' },
  { id: 'otage', label: 'Otage', emoji: '💰', couleur: '#c62828' },
  { id: 'bureau_admin', label: 'Bureau Admin', emoji: '🖥️', couleur: '#546e7a' },
  { id: 'formation', label: 'Formation', emoji: '📚', couleur: '#ef6c00' },
  { id: 'operation', label: 'Opération', emoji: '⚙️', couleur: '#5d4037' },
  { id: 'hopital', label: "Dans l'hôpital", emoji: '🏥', couleur: '#7b1fa2' },
  { id: 'envie_de_caner', label: 'Envie de caner', emoji: '💀', couleur: '#c62828' },
  { id: 'tour_de_bces,', label: 'Tour de BCES', emoji: '🏃🏻', couleur: '#1565c0' },
  { id: 'coin', label: 'Au coin', emoji: '🪑', couleur: '#455a64' },
  { id: 'autre', label: 'Autre', emoji: '❓', couleur: '#9e9e9e' },
]

export interface StatutRetourConfig {
  id: string
  label: string
  emoji: string
  couleur: string
}

export const STATUTS_RETOUR: StatutRetourConfig[] = [
  { id: 'pat', label: 'PAT', emoji: '👣', couleur: '#2e7d32' },
  { id: 'pat_avp', label: 'PAT AVP', emoji: '🤕', couleur: '#d9480f' },
  { id: 'retour_0', label: 'Retour 0', emoji: '0️⃣', couleur: '#1565c0' },
  { id: 'retour_1', label: 'Retour 1', emoji: '1️⃣', couleur: '#00897b' },
  { id: 'retour_2', label: 'Retour 2', emoji: '2️⃣', couleur: '#ef6c00' },
  { id: 'retour_3', label: 'Retour 3', emoji: '3️⃣', couleur: '#c62828' },
  { id: 'bennys', label: "Benny's", emoji: '🔧', couleur: '#6d4c41' },
  { id: 'zombie_car', label: 'Zombie Car', emoji: '🚗', couleur: '#455a64' },
  { id: 'airbaged', label: 'Airbaged', emoji: '🛢️', couleur: '#8d6e63' },
]

export interface StatutHopitalInterConfig {
  id: string
  label: string
  emoji: string
  couleur: string
}

export const STATUTS_HOPITAL_INTER: StatutHopitalInterConfig[] = [
  { id: 'dds', label: 'Don de Sang', emoji: '💉', couleur: '#c62828' },
  { id: 'vc', label: 'Visite de Contrôle', emoji: '🩺', couleur: '#2e7d32' },
  { id: 'vm', label: 'Visite Médicale', emoji: '📕', couleur: '#00838f' },
  { id: 'consult', label: 'Consultation', emoji: '🩻', couleur: '#1565c0' },
  { id: 'irm', label: 'IRM', emoji: '🎧', couleur: '#6a1b9a' },
  { id: 'radio', label: 'Radio', emoji: '☢️', couleur: '#ef6c00' },
  { id: 'permis_chasse', label: 'Permis Chasse', emoji: '🐾', couleur: '#ff5722' },
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

export const APPARTENANCES_CRISE: { id: string; label: string; couleur?: string }[] = [
  { id: 'fdo', label: 'FDO', couleur: '#0000ff' },
  { id: 'civil', label: 'Civil', couleur: '#ffffff' },
  { id: 'aztecas', label: 'Aztecas', couleur: '#bfe1f6' },
  { id: 'ballas', label: 'Ballas', couleur: '#5a3286' },
  { id: 'purgatory', label: 'Purgatory', couleur: '#b10202' },
  { id: 'lost_mc', label: 'Lost MC', couleur: '#e6e6e6' },
  { id: 'h141', label: 'H141', couleur: '#e6cff2' },
  { id: 'madz', label: 'Madz', couleur: '#ff98ea' },
  { id: 'vagos', label: 'Vagos', couleur: '#ffffbf' },
  { id: 'ghosts', label: 'Ghosts', couleur: '#3d3d3d' },
  { id: 'greyshadow', label: 'GreyShadow', couleur: '#215a6c' },
  { id: 'sillygoose_mc', label: 'SillyGoose MC', couleur: '#72788a' },
  { id: 'forsaken', label: 'Forsaken', couleur: '#e8eaed' },
  { id: 'zion_lion', label: 'Zion Lion', couleur: '#ffc8aa' },
  { id: 'corvus', label: 'Corvus', couleur: '#d4edbc' },
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
