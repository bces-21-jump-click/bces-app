export interface SubCompetency {
  id: string
  title: string
}

export interface Competency {
  id: string
  title: string
  emoji?: string
  subCompetencies: SubCompetency[]
}

export interface CompetencyCategory {
  id: string
  title: string
  competencies: Competency[]
}

export const TRAINING_COMPETENCIES: CompetencyCategory[] = [
  {
    id: 'basics',
    title: 'Les bases',
    competencies: [
      {
        id: 'dds',
        title: 'DDS',
        emoji: '🩸',
        subCompetencies: [
          { id: 'dds_date', title: 'Sait mettre à jour la date de DDS' },
          { id: 'dds_questions', title: 'Sait poser les 3 questions de vérification' },
          { id: 'dds_speech', title: 'Sait faire le speech post-DDS' },
          { id: 'dds_check', title: 'Sait vérifier si le DDS est possible' },
        ],
      },
      {
        id: 'vm',
        title: 'VM',
        emoji: '⚕️',
        subCompetencies: [
          { id: 'vm_check_folder', title: 'Sait vérifier le dossier médical' },
          { id: 'vm_location', title: 'Sait choisir le bon lieu pour la VM' },
          { id: 'vm_effort_test', title: "Sait faire passer le test d'effort" },
          { id: 'vm_write', title: 'Sait rédiger son dossier' },
          { id: 'vm_date', title: 'Sait mettre à jour la date de VM / DDS' },
          { id: 'vm_psy', title: 'Sait faire le point psy' },
        ],
      },
      {
        id: 'vc',
        title: 'VC',
        emoji: '🩺',
        subCompetencies: [
          { id: 'vc_write', title: 'Sait rédiger son dossier' },
          { id: 'vc_remove_presc', title: 'Sait retirer les ordonnances' },
          { id: 'vc_remove_items', title: 'Sait retirer les objets de maintien' },
          { id: 'vc_care', title: 'Sait prendre en charge le patient' },
        ],
      },
      {
        id: 'folder_writing',
        title: 'Rédaction dossier',
        emoji: '✏️',
        subCompetencies: [
          { id: 'fw_entry_type', title: "Sait utiliser le bon type de d'entrée" },
          { id: 'fw_fill', title: 'Sait remplir correctement la blessures et les examens' },
          { id: 'fw_separators', title: "Sait utiliser les séparateurs ('+' et '//')" },
          {
            id: 'fw_structure',
            title: 'Sait structurer ses entrées (soins, objets de maintien et médicaments)',
          },
          { id: 'fw_presc_coma', title: 'Sait cocher les bonnes ordonnances et le coma' },
          { id: 'fw_sim_valid', title: 'Validation de la simulation' },
        ],
      },
      {
        id: 'driving',
        title: 'Conduite',
        subCompetencies: [
          { id: 'driving_no_gps', title: 'Sait se repérer sans GPS' },
          { id: 'driving_optimize', title: 'Sait optimiser ses itinéraires' },
          { id: 'driving_safety', title: 'Sait se positionner en sécurité' },
          { id: 'driving_obstacle', title: "Sait se déplacer sans toucher d'obstacle" },
        ],
      },
    ],
  },
  {
    id: 'basic_inters',
    title: 'Inters basiques',
    competencies: [
      {
        id: 'avp_airbag',
        title: 'AVP / Airbag',
        emoji: '🚔',
        subCompetencies: [
          { id: 'avp_care', title: 'Sait soigner le patient' },
          { id: 'avp_folder', title: 'Sait regarder le dossier médical' },
          { id: 'avp_safety', title: 'Sait se positionner en sécurité' },
          { id: 'avp_stretcher', title: 'Sait quand sortir le brancard' },
          { id: 'avp_support', title: 'Sait utiliser des objets de support (minerve, ...)' },
          { id: 'avp_sim_valid', title: 'Validation de la simulation' },
        ],
      },
      {
        id: 'dehydration_hypo',
        title: 'Déshydratation/Hypoglycémie',
        subCompetencies: [
          { id: 'dh_folder', title: 'Sait remplir le dossier médical' },
          { id: 'dh_presc', title: 'Sait mettre les ordonnances' },
          { id: 'dh_care', title: 'Sait soigner le patient' },
          { id: 'dh_time', title: "Sait mettre le bon temps d'ordonnance" },
        ],
      },
      {
        id: 'fractures',
        title: 'Fractures',
        subCompetencies: [
          { id: 'frac_diff', title: 'Sait différencier les types de fractures' },
          { id: 'frac_diag', title: 'Sait diagnostiquer une fracture' },
          { id: 'frac_care', title: 'Sait soigner une fracture' },
        ],
      },
      {
        id: 'head_shock',
        title: 'Chocs tête',
        subCompetencies: [
          { id: 'head_diag', title: 'Sait diagnostiquer le type de choc' },
          { id: 'head_care', title: 'Sait soigner un choc à la tête' },
          { id: 'head_exam', title: 'Sait quel examen choisir' },
        ],
      },
      {
        id: 'drowning',
        title: 'Noyade',
        subCompetencies: [
          { id: 'drown_water', title: 'Sait intervenir en milieu aquatique (tenue de plongée)' },
          { id: 'drown_care', title: 'Sait prendre en charge (O2, expectorants)' },
          { id: 'drown_exam', title: 'Sait quel examen choisir' },
          { id: 'drown_meds', title: 'Sait donner les bons médicaments' },
        ],
      },
    ],
  },
  {
    id: 'advanced_inters',
    title: 'Inters avancées',
    competencies: [
      {
        id: 'burns',
        title: 'Brulures',
        subCompetencies: [
          { id: 'burn_care', title: 'Sait prendre en charge (O2, ...)' },
          { id: 'burn_exam', title: 'Sait quel examen choisir' },
          { id: 'burn_diff', title: 'Sait différencier les brulures' },
          { id: 'burn_treat', title: 'Sait soigner des brulures' },
        ],
      },
      {
        id: 'bullets',
        title: 'Balles',
        subCompetencies: [
          { id: 'bullet_diag_bpb', title: 'Sait diagnostiquer une BPB' },
          { id: 'bullet_care_bpb', title: 'Sait soigner une BPB sans dégat' },
          { id: 'bullet_organ', title: 'Sait soigner un organe touché' },
          { id: 'bullet_bone', title: 'Sait soigner un os touché' },
        ],
      },
      {
        id: 'fall_15m',
        title: 'Chute +15m',
        subCompetencies: [
          { id: 'fall_diag', title: 'Sait diagnostiquer une chute +15m' },
          { id: 'fall_time', title: "Sait mettre le bon temps d'ordonnance" },
          { id: 'fall_care', title: 'Sait soigner une chute +15m' },
        ],
      },
      {
        id: 'plates_screws',
        title: 'Plaques et vis',
        subCompetencies: [
          { id: 'ps_surgery', title: 'Sait faire la chirurgie' },
          { id: 'ps_identify', title: 'Sait identifier une fracture déplacée/ouverte' },
          { id: 'ps_support', title: "Sait qu'il faut mettre un objet de maintien" },
        ],
      },
      {
        id: 'trepanation',
        title: 'Trépanation',
        subCompetencies: [
          { id: 'trep_exam', title: "Sait faire le bon choix d'examen" },
          { id: 'trep_identify', title: 'Sait identifier un hématome sous dural' },
          { id: 'trep_surgery', title: 'Sait faire la chirurgie' },
        ],
      },
      {
        id: 'central',
        title: 'Centrale',
        emoji: '📻',
        subCompetencies: [
          { id: 'cen_reactive', title: 'Sait être réactif aux calls' },
          { id: 'cen_dispatch', title: 'Sait mettre à jour son dispatch à temps' },
          { id: 'cen_busy', title: 'Sait gérer centrale en étant occupé' },
          { id: 'cen_calm', title: 'Sait gérer en flux calme' },
          { id: 'cen_intensive', title: 'Sait gérer en flux intensif' },
        ],
      },
    ],
  },
  {
    id: 'optional',
    title: 'Optionnel',
    competencies: [
      {
        id: 'tattoo_removal',
        title: 'Détatouage',
        subCompetencies: [
          { id: 'tr_bill', title: 'Sait faire la facture' },
          { id: 'tr_remove', title: 'Sait enlever un tatouage' },
          { id: 'tr_folder', title: 'Sait faire le dossier' },
          { id: 'tr_vc', title: 'Sait faire la VC du détatouage' },
        ],
      },
      {
        id: 'unit_x',
        title: 'Unité X',
        subCompetencies: [
          { id: 'ux_care', title: 'Sait prendre en charge le patient' },
          { id: 'ux_consult', title: 'Sait noter le dossier comme consultation' },
          { id: 'ux_note', title: "Sait noter qu'il s'agit d'une unité X" },
        ],
      },
      {
        id: 'patrol',
        title: 'Patrouille',
        subCompetencies: [
          { id: 'pat_radio', title: 'Sait faire les calls radio' },
          { id: 'pat_dispatch', title: 'Sait mettre à jour le disptach' },
          { id: 'pat_passenger', title: 'Sait être passager (message entreprise)' },
          { id: 'pat_driver', title: 'Sait être conducteur (itinéraire)' },
        ],
      },
      {
        id: 'folder_opening',
        title: 'Ouverture de dossier',
        subCompetencies: [
          { id: 'fo_info', title: 'Sait ajouter "info (pas) ok"' },
          { id: 'fo_dds', title: 'Sait ajouter les remarques de DDS' },
          { id: 'fo_blood', title: 'Sait trouver le groupe sanguin' },
          { id: 'fo_empty', title: 'Sait remplir une case vide (//)' },
          { id: 'fo_fill', title: 'Sait remplir le dossier' },
        ],
      },
    ],
  },
]
