import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Please define VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file'
  )
}

// Create Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-application-name': 'stock-opname-pro'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
})

// Helper functions
export const checkConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.from('inventory').select('count').limit(1)
    return !error
  } catch (error) {
    console.error('Supabase connection check failed:', error)
    return false
  }
}

export const getTableCount = async (tableName: string): Promise<number> => {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
    
    if (error) throw error
    return count || 0
  } catch (error) {
    console.error(`Error getting count from ${tableName}:`, error)
    return 0
  }
}

export const batchInsert = async <T>(
  tableName: string,
  data: T[],
  batchSize: number = 100
): Promise<{ success: number; errors: string[] }> => {
  const errors: string[] = []
  let success = 0

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)
    
    try {
      const { error } = await supabase
        .from(tableName)
        .insert(batch)
      
      if (error) {
        errors.push(`Batch ${i / batchSize + 1}: ${error.message}`)
      } else {
        success += batch.length
      }
    } catch (error: any) {
      errors.push(`Batch ${i / batchSize + 1}: ${error.message}`)
    }
  }

  return { success, errors }
}

export default supabase