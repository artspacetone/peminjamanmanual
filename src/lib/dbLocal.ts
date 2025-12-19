// src/lib/dbLocal.ts
import Dexie, { Table } from 'dexie';
import { InventoryItem } from '../types';

class LocalDatabase extends Dexie {
  inventory!: Table<InventoryItem>;

  constructor() {
    super('StockOpnameLocalDB');
    
    // Definisi Schema
    // ++id artinya auto-increment
    // &barcode artinya unik (primary key logical)
    this.version(1).stores({
      inventory: '++id, &barcode, item_name, is_scanned, created_at'
    });
  }
}

export const dbLocal = new LocalDatabase();