/** Faute simple — 30 jours d'expiration */
export interface SimpleFault {
  reason: string;
  date: string;
  expireDate: string;
}

/** Mise à pied */
export interface SuspensionData {
  startDate: string;
  duration: number;
  endDate: string;
}

/** Demande de promotion (peut être une simple string ou un objet) */
export interface PromotionRequest {
  value: string;
  motivation?: string;
}

/** Employé — structure alignée sur BCES-21JC (collection Firestore `employees`) */
export interface Effectif {
  id: string;
  name: string;
  email: string;
  role: string;
  sex: string;
  phone: string;
  specialties: string[];
  chiefSpecialties: string[];
  birthDate: string | null;
  arrivalDate: string | null;
  cdiDate: string | null;
  lastPromotionDate: string | null;
  medicalDegreeDate: string | null;
  helicopterTrainingDate: string | null;
  helicopterTrainingReimbursed: boolean;
  trainingRequests: string[];
  promotionRequest: PromotionRequest | string | null;
  rankPromotionRequest: string | null;
  competencyProgress: Record<string, string | number>;
  lastFollowUpDate: string | null;
  simpleFault: SimpleFault | null;
  suspension: SuspensionData | null;
  isTrainerTrainee: boolean;
  simulations: string[];
  isRHTrainee: boolean;
  validatedTrainings: string[];
  emoji: string;
}

/** Véhicule — collection Firestore `vehicles` */
export interface Vehicule {
  id: string;
  icon: string;
  name: string;
  imat: string;
  where: string;
  underGuard: boolean;
  recupDate: number | null;
  lastRepairDate: number | null;
  hideAlert: boolean;
  needRepair: boolean;
  insurance: boolean;
}

/** Item de stock — collection Firestore `items` */
export interface Stock {
  id: string;
  icon: string;
  name: string;
  storage: string;
  weight: number;
  seller: string;
  amount: number;
  wanted: number;
  maxOrder: number;
  isInstantiated: boolean;
  instanceByDate: boolean;
  isSecure: boolean;
  history: { date: number; amount: number }[];
}

/** Entreprise — collection Firestore `companies` */
export interface Entreprise {
  id: string;
  icon: string;
  name: string;
  canDestroy: boolean;
  canExpenseNote: boolean;
  isGarage: boolean;
}
