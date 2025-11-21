import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
)

// Helper functions for common queries
export async function getPortfolio(channelId) {
  const { data, error } = await supabase
    .from('virtual_portfolio')
    .select('*')
    .eq('channel_id', channelId)
    .order('timestamp', { ascending: false })
    .limit(1)

  if (error) throw error
  return data?.[0] || null
}

export async function getHoldings(channelId) {
  const { data, error } = await supabase
    .from('virtual_holdings')
    .select('*')
    .eq('channel_id', channelId)
    .order('symbol', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getOrders(channelId, limit = 50) {
  const { data, error } = await supabase
    .from('virtual_orders')
    .select('*')
    .eq('channel_id', channelId)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function getGridLevels(channelId) {
  const { data, error } = await supabase
    .from('grid_levels')
    .select('*')
    .eq('channel_id', channelId)
    .order('total_pnl', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getConfig(channelId) {
  const { data, error } = await supabase
    .from('config')
    .select('*')
    .eq('channel_id', channelId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function getAllChannels() {
  const { data, error } = await supabase
    .from('config')
    .select('channel_id, capital, per_trade_amount, grid_percentage')
    .order('channel_id')

  if (error) throw error
  return data || []
}

export async function getPortfolioHistory(channelId, days = 30) {
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  const { data, error } = await supabase
    .from('virtual_portfolio')
    .select('*')
    .eq('channel_id', channelId)
    .gte('timestamp', fromDate.toISOString())
    .order('timestamp', { ascending: true })

  if (error) throw error
  return data || []
}
