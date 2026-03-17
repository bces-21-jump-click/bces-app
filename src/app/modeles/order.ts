export interface OrderItem {
  id: string;
  amount: number;
}

export interface Order {
  id: string | null;
  date: number | null;
  company: string | null;
  items: OrderItem[];
  destroy: number;
  weight: number;
  status: string;
  price: number | null;
  updatedAt: number | null;
}

export interface OrderHistory {
  id: string | null;
  date: number | null;
  company: string | null;
  items: OrderItem[];
  destroy: number;
  weight: number;
  price: number;
  payDate: number | null;
}
