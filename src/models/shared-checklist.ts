export interface ChecklistTask {
  id: string
  text: string
  link: string | null
  done: boolean
  doneAt: number | null
}

export interface SharedChecklistData {
  tasks: ChecklistTask[]
  lastReset: number | null
}
