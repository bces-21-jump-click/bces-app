export const SCENARIOS: Record<string, string[]> = {
  AVP: [
    'AVP moto sans casque',
    'AVP moto avec casque',
    'AVP pare brise',
    'AVP piéton sur la freeway',
    'Chute à vélo',
  ],
  Animaux: ['Morsure puma', 'Morsure requin', 'Morsure chien'],
  Explosions: [
    'Explosion de station service',
    'Explosion de véhicule',
    "Crash d'avion",
    'Tir de lance-missiles',
    "Explosion d'hélico",
  ],
  Brulures: [
    "Brulure dans une flaque d'essence",
    'Brulure dans un feu de camp',
    'Brulure avec présence de particules',
    'Présence de particules sans brulures',
  ],
  BPB: ['BPB foie', 'BPB poumon', 'BPB sans dégat', 'BPB avec artère touchée'],
  Noyades: ['Accident de jetski', 'Noyade', 'Accident de sous-marin', 'Accident de pêche'],
  'Chutes +15m': [
    "Tombé d'un gratte ciel",
    'Accident de parachute',
    "Tombé d'une montagne",
    "Tombé d'une échelle",
  ],
  'Chutes -15m': ["Tombé d'un toit", 'Tombé dans les escaliers'],
}

export interface EventConfig {
  id: number
  name: string
  context: string[]
}

export const EVENTS: EventConfig[] = [
  { id: 1, name: 'Fractures', context: ['AVP', 'Explosions', 'Chutes -15m'] },
  { id: 2, name: 'Chocs tête', context: ['AVP', 'Chutes -15m'] },
  { id: 3, name: 'Noyade', context: ['Noyades'] },
  { id: 4, name: 'Brulures', context: ['Explosions', 'Brulures'] },
  { id: 5, name: 'Chutes +15m', context: ['Chutes +15m'] },
  { id: 6, name: 'Plaques et vis', context: ['Chutes +15m', 'Chutes -15m'] },
  { id: 7, name: 'Trépanation', context: ['Chutes +15m', 'AVP', 'Chutes -15m'] },
  { id: 8, name: 'Balles', context: ['BPB'] },
]
