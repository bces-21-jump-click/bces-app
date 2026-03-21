export interface EffectifPatate {
  id: string;
  categorie: string;
}

export interface SlotCentrale {
  effectifs: string[];
  type: string;
  statut_retour: string;
  lieu: string;
  complement: string;
}

export interface SlotIntervention {
  effectifs: string[];
  type: string;
  statut_retour: string;
  lieu: string;
  complement: string;
}

export interface RadioDispatch {
  id: string;
  serie: string;
  effectif_id: string | null;
  dernier_effectif_nom?: string | null;
  actif: boolean;
  categorie: string;
}

export interface EntreeCrise {
  ajout_canal: boolean;
  chambre: string;
  nom_prenom_primo: string;
  groupe: string;
  coma: boolean;
  blessure_lourde: boolean;
  inconscient: boolean;
  commentaires: string;
  medecin_rapatrie: string;
  medecin_soignant: string;
  soins: boolean;
}

export interface DonneesMorgue {
  casiers: Record<string, string>;
  urnes: Record<string, string>;
  enterrements: Record<string, string>;
}

export interface FicheChambre {
  patient: string;
  admission_medecin: string;
  type_prise_en_charge: string;
  fdo: boolean;
  soins: boolean;
  statut: string;
}

export interface FicheOperation {
  patient: string;
  medecins: string;
  statut: string;
  description: string;
}

export interface DonneesChambres {
  emergency_room: Record<'lit_g' | 'lit_m' | 'lit_d', FicheChambre>;
  josiah_room: Record<'lit_g' | 'lit_m' | 'lit_d', FicheChambre>;
  chiliad_room: Record<'lit_g' | 'lit_m' | 'lit_d', FicheChambre>;
  gordo_room: FicheChambre;
  san_chianki_room: FicheChambre;
  operations: Record<'op_1' | 'op_2' | 'op_3', FicheOperation>;
}

export interface EtatDispatch {
  centrale: SlotCentrale;
  patates: EffectifPatate[];
  statut_hopital: string;
  interventions: SlotIntervention[];
  radio_lses: string;
  radio_commune: string;
  bloc_notes: string;
  radios: RadioDispatch[];
  id_radio_nuit: string | null;
  crises: EntreeCrise[];
  lits: Record<string, string>;
  effectifs_temporaires: string[];
  morgue: DonneesMorgue;
  chambres: DonneesChambres;
  zip_crise: string;
}

function creerFicheChambreInitiale(): FicheChambre {
  return {
    patient: '',
    admission_medecin: '',
    type_prise_en_charge: '',
    fdo: false,
    soins: false,
    statut: '',
  };
}

function creerFicheOperationInitiale(): FicheOperation {
  return {
    patient: '',
    medecins: '',
    statut: '',
    description: '',
  };
}

export function creerDonneesChambresInitiales(): DonneesChambres {
  return {
    emergency_room: {
      lit_g: creerFicheChambreInitiale(),
      lit_m: creerFicheChambreInitiale(),
      lit_d: creerFicheChambreInitiale(),
    },
    josiah_room: {
      lit_g: creerFicheChambreInitiale(),
      lit_m: creerFicheChambreInitiale(),
      lit_d: creerFicheChambreInitiale(),
    },
    chiliad_room: {
      lit_g: creerFicheChambreInitiale(),
      lit_m: creerFicheChambreInitiale(),
      lit_d: creerFicheChambreInitiale(),
    },
    gordo_room: creerFicheChambreInitiale(),
    san_chianki_room: creerFicheChambreInitiale(),
    operations: {
      op_1: creerFicheOperationInitiale(),
      op_2: creerFicheOperationInitiale(),
      op_3: creerFicheOperationInitiale(),
    },
  };
}

function fusionnerFicheChambre(partielle: Partial<FicheChambre> | undefined): FicheChambre {
  return { ...creerFicheChambreInitiale(), ...partielle };
}

function fusionnerFicheOperation(partielle: Partial<FicheOperation> | undefined): FicheOperation {
  return { ...creerFicheOperationInitiale(), ...partielle };
}

export function fusionnerDonneesChambres(
  partielles: Partial<DonneesChambres> | undefined,
): DonneesChambres {
  const base = creerDonneesChambresInitiales();
  return {
    emergency_room: {
      lit_g: fusionnerFicheChambre(partielles?.emergency_room?.lit_g),
      lit_m: fusionnerFicheChambre(partielles?.emergency_room?.lit_m),
      lit_d: fusionnerFicheChambre(partielles?.emergency_room?.lit_d),
    },
    josiah_room: {
      lit_g: fusionnerFicheChambre(partielles?.josiah_room?.lit_g),
      lit_m: fusionnerFicheChambre(partielles?.josiah_room?.lit_m),
      lit_d: fusionnerFicheChambre(partielles?.josiah_room?.lit_d),
    },
    chiliad_room: {
      lit_g: fusionnerFicheChambre(partielles?.chiliad_room?.lit_g),
      lit_m: fusionnerFicheChambre(partielles?.chiliad_room?.lit_m),
      lit_d: fusionnerFicheChambre(partielles?.chiliad_room?.lit_d),
    },
    gordo_room: fusionnerFicheChambre(partielles?.gordo_room),
    san_chianki_room: fusionnerFicheChambre(partielles?.san_chianki_room),
    operations: {
      op_1: fusionnerFicheOperation(partielles?.operations?.op_1),
      op_2: fusionnerFicheOperation(partielles?.operations?.op_2),
      op_3: fusionnerFicheOperation(partielles?.operations?.op_3),
    },
  };
}

export function creerEtatInitial(): EtatDispatch {
  return {
    centrale: { effectifs: [], type: '', statut_retour: '', lieu: '', complement: '' },
    patates: [],
    statut_hopital: 'gestion_normale',
    interventions: [],
    radio_lses: '',
    radio_commune: '',
    bloc_notes: '',
    radios: [],
    id_radio_nuit: null,
    crises: [],
    lits: {},
    effectifs_temporaires: [],
    morgue: { casiers: {}, urnes: {}, enterrements: {} },
    chambres: creerDonneesChambresInitiales(),
    zip_crise: '',
  };
}
