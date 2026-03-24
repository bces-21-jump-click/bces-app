export interface ExpenseNote {
  id: string | null
  date: number | null
  user: string | null
  reason: string
  data: string
  price: number
  isPaid: boolean
  isRefused: boolean
  refusalComment: string
  closeDate: number | null
}
