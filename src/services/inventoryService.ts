import { supabase } from '../lib/supabaseClient';
import { dbLocal } from '../lib/dbLocal';
import { InventoryItem, ImportResult } from '../types';

// Cek mode dari .env
const USE_LOCAL = import.meta.env.VITE_USE_LOCAL_DB === 'true';

// ==========================================
// 1. Get Inventory Stats
// ==========================================
export const getInventoryStats = async (): Promise<{ total: number; scanned: number }> => {
  if (USE_LOCAL) {
    const total = await dbLocal.inventory.count();
    const scanned = await dbLocal.inventory.where('is_scanned').equals(1).count(); // 1 = true in IndexedDB sometimes
    // Dexie boolean query fix:
    const scannedReal = await dbLocal.inventory.filter(i => i.is_scanned === true).count();
    return { total, scanned: scannedReal };
  } else {
    // SUPABASE MODE
    const { count: total } = await supabase.from('inventory').select('*', { count: 'exact', head: true });
    const { count: scanned } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('is_scanned', true);
    return { total: total || 0, scanned: scanned || 0 };
  }
};

// ==========================================
// 2. Get Item by Barcode
// ==========================================
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const cleanBarcode = barcode.trim();
  
  if (USE_LOCAL) {
    const item = await dbLocal.inventory.where('barcode').equals(cleanBarcode).first();
    return item || null;
  } else {
    // SUPABASE MODE
    const { data, error } = await supabase.from('inventory').select('*').eq('barcode', cleanBarcode).maybeSingle();
    if (error) console.error(error);
    return data as InventoryItem;
  }
};

// ==========================================
// 3. Mark Item as Scanned
// ==========================================
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  const cleanBarcode = barcode.trim();

  if (USE_LOCAL) {
    const item = await dbLocal.inventory.where('barcode').equals(cleanBarcode).first();
    if (!item) throw new Error("Item not found locally");
    if (item.is_scanned) throw new Error("Already scanned");

    const updates = {
      is_scanned: true,
      scan_timestamp: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await dbLocal.inventory.update(item.id, updates);
    return { ...item, ...updates };
  } else {
    // SUPABASE MODE
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('inventory')
      .update({ is_scanned: true, scan_timestamp: now, updated_at: now })
      .eq('barcode', cleanBarcode)
      .select()
      .single();

    if (error) throw error;
    return data as InventoryItem;
  }
};

// ==========================================
// 4. Fetch Recent Inventory
// ==========================================
export const fetchRecentInventory = async (limit: number = 50): Promise<InventoryItem[]> => {
  if (USE_LOCAL) {
    // Dexie sort desc by ID/Created Time
    const items = await dbLocal.inventory.reverse().limit(limit).toArray();
    return items;
  } else {
    // SUPABASE MODE
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data as InventoryItem[];
  }
};

// ==========================================
// 5. Upload Bulk Inventory (Import Excel)
// ==========================================
export const uploadBulkInventory = async (
  items: any[],
  progressCallback?: (progress: number) => void
): Promise<ImportResult> => {
  
  const result: ImportResult = { success: 0, failed: 0, duplicates: 0, total: items.length, errors: [] };

  // Prepare data
  const formattedItems = items.map(item => ({
    // Generate Random ID for Local DB if missing (Supabase generates it auto, but Dexie needs help sometimes if not auto-inc)
    // We use string IDs to match Supabase UUID format loosely
    id: item.id || crypto.randomUUID(), 
    barcode: String(item.barcode || '').trim(),
    item_name: String(item.item_name || '').trim(),
    status: String(item.status || 'available').trim(),
    color: String(item.color || '').trim(),
    brand: String(item.brand || '').trim(),
    price: parseFloat(item.price) || 0,
    type: String(item.type || '').trim(),
    is_scanned: false,
    scan_timestamp: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })).filter(i => i.barcode && i.item_name);

  if (USE_LOCAL) {
    // LOCAL UPLOAD
    const total = formattedItems.length;
    let processed = 0;

    // Dexie bulkAdd is transaction safe
    await dbLocal.transaction('rw', dbLocal.inventory, async () => {
      for (const item of formattedItems) {
        try {
          // Check duplicate manually for Dexie
          const existing = await dbLocal.inventory.where('barcode').equals(item.barcode).count();
          if (existing > 0) {
            result.duplicates++;
          } else {
            await dbLocal.inventory.add(item);
            result.success++;
          }
        } catch (e: any) {
          result.failed++;
          result.errors?.push(e.message);
        }
        
        processed++;
        if (progressCallback && processed % 10 === 0) {
           progressCallback(Math.round((processed / total) * 100));
        }
      }
    });

    if (progressCallback) progressCallback(100);
    return result;

  } else {
    // SUPABASE MODE (Existing Logic)
    const batchSize = 50;
    const totalBatches = Math.ceil(formattedItems.length / batchSize);

    for (let i = 0; i < totalBatches; i++) {
      const batch = formattedItems.slice(i * batchSize, (i + 1) * batchSize);
      
      // Remove ID for Supabase insert (let Supabase generate UUID)
      const batchForSupabase = batch.map(({ id, ...rest }) => rest);

      const barcodes = batchForSupabase.map(x => x.barcode);
      const { data: existing } = await supabase.from('inventory').select('barcode').in('barcode', barcodes);
      const existingSet = new Set(existing?.map(x => x.barcode));

      const newItems = batchForSupabase.filter(x => !existingSet.has(x.barcode));
      result.duplicates += (batch.length - newItems.length);

      if (newItems.length > 0) {
        const { error } = await supabase.from('inventory').insert(newItems);
        if (error) {
          result.failed += newItems.length;
          result.errors?.push(error.message);
        } else {
          result.success += newItems.length;
        }
      }

      if (progressCallback) {
        progressCallback(Math.round(((i + 1) / totalBatches) * 100));
      }
    }
    return result;
  }
};

// ==========================================
// 6. Clear All Data
// ==========================================
export const clearAllData = async (): Promise<void> => {
  if (USE_LOCAL) {
    await dbLocal.inventory.clear();
  } else {
    const { error } = await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
  }
};

// ==========================================
// 7. Fetch All For Export
// ==========================================
export const fetchAllForExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING'): Promise<InventoryItem[]> => {
  if (USE_LOCAL) {
    let collection = dbLocal.inventory.toCollection();
    
    if (filterType === 'SCANNED') {
      collection = dbLocal.inventory.filter(i => i.is_scanned === true);
    } else if (filterType === 'PENDING') {
      collection = dbLocal.inventory.filter(i => i.is_scanned === false);
    }
    
    return await collection.toArray();
  } else {
    let query = supabase.from('inventory').select('*').order('created_at', { ascending: false });
    if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
    if (filterType === 'PENDING') query = query.eq('is_scanned', false);
    
    const { data, error } = await query;
    if (error) throw error;
    return data as InventoryItem[];
  }
};

export default {
  getInventoryStats,
  getItemByBarcode,
  markItemAsScanned,
  fetchRecentInventory,
  uploadBulkInventory,
  clearAllData,
  fetchAllForExport
};