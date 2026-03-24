export interface InstanceEntry {
  name?: string
  date?: string
  amount: number
  locked?: boolean
}

export interface Instance {
  id: string | null
  content: InstanceEntry[]
}
