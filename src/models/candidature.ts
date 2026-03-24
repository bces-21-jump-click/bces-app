export interface Candidature {
  id: string | null
  name: string
  phone: string
  email: string
  availabilities: string
  status: string
  votes: Record<string, string>
  answers: Record<string, string>
}
