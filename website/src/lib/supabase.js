import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const isMissingCredentials = !supabaseUrl || !supabaseAnonKey

if (isMissingCredentials) {
  console.warn('Supabase credentials not found. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
)

// Helper to check credentials before queries
function checkCredentials() {
  if (isMissingCredentials) {
    throw new Error('Missing Supabase URL/Key - configure .env.local')
  }
}

// Helper functions for common queries
export async function getPortfolio(channelId) {
  checkCredentials()
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
  checkCredentials()
  const { data, error } = await supabase
    .from('virtual_holdings')
    .select('*')
    .eq('channel_id', channelId)
    .order('symbol', { ascending: true })

  if (error) throw error
  return data || []
}

export async function getOrders(channelId, limit = 50) {
  checkCredentials()
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
  checkCredentials()
  const { data, error } = await supabase
    .from('grid_levels')
    .select('*')
    .eq('channel_id', channelId)
    .order('total_pnl', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getConfig(channelId) {
  checkCredentials()
  const { data, error } = await supabase
    .from('config')
    .select('key, value')
    .eq('channel_id', channelId)

  if (error) throw error

  // Convert key-value rows to object
  const config = {}
  if (data) {
    data.forEach(row => {
      config[row.key] = row.value
    })
  }

  return {
    channel_id: channelId,
    capital: parseFloat(config.initial_capital || 0),
    amount_per_trade: parseFloat(config.amount_per_trade || 0),
    grid_percentage: parseFloat(config.grid_percentage || 0)
  }
}

export async function getAllChannels() {
  checkCredentials()
  const { data, error } = await supabase
    .from('config')
    .select('channel_id, key, value')
    .order('channel_id')

  if (error) throw error

  // Group by channel_id and convert to objects
  const channelMap = {}
  if (data) {
    data.forEach(row => {
      if (!channelMap[row.channel_id]) {
        channelMap[row.channel_id] = { channel_id: row.channel_id }
      }
      channelMap[row.channel_id][row.key] = row.value
    })
  }

  // Convert to array with parsed values
  return Object.values(channelMap).map(ch => ({
    channel_id: ch.channel_id,
    capital: parseFloat(ch.initial_capital || 0),
    amount_per_trade: parseFloat(ch.amount_per_trade || 0),
    grid_percentage: parseFloat(ch.grid_percentage || 0)
  }))
}

export async function getPortfolioHistory(channelId, days = 30) {
  checkCredentials()
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
