export interface Appointment {
  id: string | null
  patientName: string
  patientPhone: string
  specialty: string
  date: string
  time: string
  duration: number
  reason: string
  status: string
  doctor: string
  companion: string
  notes: string
  createdAt: number
  availability: string
}
