export interface InjuryPoint {
  x: number
  y: number
}

export interface Injury {
  externalAnalysis: string
  internalAnalysis: string
  points: InjuryPoint[]
}

export interface Autopsie {
  id: string | null
  name: string
  cid: string
  genderIsMale: boolean
  doctor: string
  legist: string
  injuries: Injury[]
  bloodBilan: string
  diagnostic: string
  interventionReport: string
  eventChronology: string
  autopsySummary: string
  autopsyDate: number
}
