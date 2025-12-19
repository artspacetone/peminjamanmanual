export interface Item {
  barcode: string;
  item_name: string;
  brand: string;
  size: string;
  color: string;
  price: number;
  status: 'Available' | 'On Loan' | 'Laundry' | 'Repair' | 'Lost';
}

export interface CartItem extends Item {
  scan_time: number;
}