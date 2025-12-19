export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      inventory: {
        Row: {
          id: string
          barcode: string
          item_name: string
          status: string
          color: string
          brand: string
          price: number
          type: string
          is_scanned: boolean
          scan_timestamp: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          barcode: string
          item_name: string
          status?: string
          color?: string
          brand?: string
          price?: number
          type?: string
          is_scanned?: boolean
          scan_timestamp?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          barcode?: string
          item_name?: string
          status?: string
          color?: string
          brand?: string
          price?: number
          type?: string
          is_scanned?: boolean
          scan_timestamp?: string | null
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}