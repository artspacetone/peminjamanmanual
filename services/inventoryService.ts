import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

// 1. Ambil Statistik (Sangat Ringan: Hanya hitung jumlah tanpa load data)
export const getInventoryStats = async () => {
  const { count: total, error: errTotal } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true });

  const { count: scanned, error: errScanned } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('is_scanned', true);

  if (errTotal || errScanned) console.error("Stats Error:", errTotal || errScanned);

  return {
    total: total || 0,
    scanned: scanned || 0
  };
};

// 2. Helper: Ambil item berdasarkan barcode
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle(); // Aman: return null jika tidak ada, tidak error
  
  if (error) console.error("Get Item Error:", error);
  return data as InventoryItem;
};

// 3. PROSES SCAN (Critical Part)
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  // A. Cek keberadaan item dulu
  const item = await getItemByBarcode(barcode);
  
  if (!item) {
    throw new Error("Item tidak ditemukan di database (Nihil)");
  }

  // B. Cek status lokal (untuk feedback cepat)
  if (item.is_scanned) {
    throw new Error("Item sudah discan sebelumnya");
  }

  // C. Update ke Database
  // Kita tambahkan filter .eq('is_scanned', false) lagi di sini
  // Ini teknik 'Optimistic Locking' agar jika ada orang lain yang scan
  // di milidetik yang sama, transaksi ini akan gagal/kosong.
  const { data, error } = await supabase
    .from('inventory')
    .update({ 
        is_scanned: true, 
        scan_timestamp: Date.now() 
    })
    .eq('id', item.id)
    .eq('is_scanned', false) // Double check di level database
    .select()
    .maybeSingle();

  if (error) throw error;
  
  // Jika data null setelah update, berarti keduluan orang lain scan
  if (!data) {
      throw new Error("Item baru saja discan oleh user lain");
  }

  return data as InventoryItem;
};

// 4. Data untuk Tabel (Hanya ambil 50 data terbaru agar HP enteng)
export const fetchRecentInventory = async (searchQuery: string = ''): Promise<InventoryItem[]> => {
  let query = supabase
    .from('inventory')
    .select('*')
    .order('scan_timestamp', { ascending: false, nullsFirst: false }) // Yang baru discan muncul diatas
    .order('created_at', { ascending: false }) // Fallback sort
    .limit(50); // LIMIT PENTING UNTUK PERFORMA

  if (searchQuery) {
    // Search logic
    query = supabase
      .from('inventory')
      .select('*')
      .or(`barcode.ilike.%${searchQuery}%,item_name.ilike.%${searchQuery}%`)
      .limit(50);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as InventoryItem[];
};

// 5. Upload Massal (Aman untuk 25.000 data)
export const uploadBulkInventory = async (items: any[], onProgress: (percent: number) => void) => {
  const BATCH_SIZE = 1000; 
  const total = items.length;
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    // Upsert: Insert atau Update jika barcode sudah ada
    const { error } = await supabase
        .from('inventory')
        .upsert(chunk, { onConflict: 'barcode' });
    
    if (error) throw new Error(`Gagal upload pada baris ${i}: ${error.message}`);
    
    // Update progress bar
    const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    onProgress(progress);
  }
};

// 6. Reset Scan (Hanya ubah status jadi false)
export const resetInventoryStatus = async () => {
    const { error } = await supabase
        .from('inventory')
        .update({ is_scanned: false, scan_timestamp: null })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update semua baris
    if (error) throw error;
}

// 7. Hapus Semua Data
export const clearAllData = async () => {
    const { error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete semua baris
    if (error) throw error;
}

// 8. Export Data (Stream data agar tidak crash)
export const fetchAllForExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    let query = supabase.from('inventory').select('*');
    
    if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
    if (filterType === 'PENDING') query = query.eq('is_scanned', false);
    
    // Limit 30k cukup untuk CSV. Jika lebih, perlu teknik pagination advanced.
    const { data, error } = await query.limit(30000); 
    if (error) throw error;
    return data as InventoryItem[];
}