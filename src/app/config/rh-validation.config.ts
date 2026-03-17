export interface RhValidationItem {
  id: string;
  title: string;
}

export interface RhValidationGroup {
  id: string;
  title: string;
  items: RhValidationItem[];
}

export const RH_VALIDATION: RhValidationGroup[] = [
  {
    id: 'integration',
    title: 'Intégration',
    items: [
      { id: 'rh_interview', title: 'Entretien' },
      { id: 'rh_embauche', title: 'Embauche' },
    ],
  },
  {
    id: 'rank',
    title: 'Grade',
    items: [
      { id: 'rh_promotion', title: 'Promotion' },
      { id: 'rh_licenciement_pres', title: 'Licenciement présentiel' },
      { id: 'rh_licenciement_dist', title: 'Licenciement à distance' },
    ],
  },
  {
    id: 'misc',
    title: 'Autres',
    items: [
      { id: 'canvas', title: 'Canvas' },
      { id: 'tools', title: 'Outils RH' },
    ],
  },
];
