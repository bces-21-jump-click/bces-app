/** Profil utilisateur — collection Firestore `profiles` (id = Firebase UID) */
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  activated: boolean;
  rejected: boolean;
}
