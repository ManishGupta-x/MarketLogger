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
  // Grid levels table removed - return empty array
  // Grid stats can be calculated from virtual_orders if needed
  return []
}

export async function getConfig(channelId) {
  checkCredentials()
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_id', channelId)
    .limit(1)

  if (error) throw error

  const channel = data?.[0]
  return {
    channel_id: channelId,
    name: channel?.name || 'Unknown',
    capital: parseFloat(channel?.initial_capital || 0),
    amount_per_trade: parseFloat(channel?.amount_per_trade || 0),
    grid_percentage: parseFloat(channel?.grid_percentage || 0)
  }
}

export async function getAllChannels() {
  checkCredentials()
  const { data, error } = await supabase
    .from('channels')
    .select('*')
    .order('name')

  if (error) throw error

  return (data || []).map(ch => ({
    channel_id: ch.channel_id,
    name: ch.name,
    capital: parseFloat(ch.initial_capital || 0),
    amount_per_trade: parseFloat(ch.amount_per_trade || 0),
    grid_percentage: parseFloat(ch.grid_percentage || 0)
  }))
}

// Strategy comparison analytics
export async function getStrategyComparison() {
  checkCredentials()

  // Get all channels
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .order('name')

  if (channelsError) throw channelsError

  // Get stats for each channel
  const comparisons = await Promise.all((channels || []).map(async (channel) => {
    // Get latest portfolio
    const { data: portfolio } = await supabase
      .from('virtual_portfolio')
      .select('*')
      .eq('channel_id', channel.channel_id)
      .order('timestamp', { ascending: false })
      .limit(1)

    // Get order stats
    const { data: orders } = await supabase
      .from('virtual_orders')
      .select('type, pnl, symbol')
      .eq('channel_id', channel.channel_id)

    const latestPortfolio = portfolio?.[0]
    const sellOrders = (orders || []).filter(o => o.type === 'SELL')
    const winningTrades = sellOrders.filter(o => o.pnl > 0).length
    const totalPnl = sellOrders.reduce((sum, o) => sum + (o.pnl || 0), 0)
    const winRate = sellOrders.length > 0 ? (winningTrades / sellOrders.length * 100) : 0

    // Find best performing stock
    const stockPnl = {}
    sellOrders.forEach(o => {
      stockPnl[o.symbol] = (stockPnl[o.symbol] || 0) + (o.pnl || 0)
    })
    const bestStock = Object.entries(stockPnl).sort((a, b) => b[1] - a[1])[0]

    return {
      channel_id: channel.channel_id,
      name: channel.name,
      initial_capital: channel.initial_capital,
      amount_per_trade: channel.amount_per_trade,
      grid_percentage: channel.grid_percentage,
      current_value: latestPortfolio?.total_value || channel.initial_capital,
      total_pnl: totalPnl,
      roi_percent: channel.initial_capital > 0
        ? ((latestPortfolio?.total_value || channel.initial_capital) - channel.initial_capital) / channel.initial_capital * 100
        : 0,
      total_trades: (orders || []).length,
      win_rate: winRate,
      best_stock: bestStock ? bestStock[0] : null,
      best_stock_pnl: bestStock ? bestStock[1] : 0
    }
  }))

  // Sort by ROI
  return comparisons.sort((a, b) => b.roi_percent - a.roi_percent)
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

export async function getAllChannelsPortfolioHistory(days = 30) {
  checkCredentials()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  // Get all channels first
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .order('name')

  if (channelsError) throw channelsError

  // Get portfolio history for all channels
  const channelsHistory = await Promise.all((channels || []).map(async (channel) => {
    const { data: history } = await supabase
      .from('virtual_portfolio')
      .select('*')
      .eq('channel_id', channel.channel_id)
      .gte('timestamp', fromDate.toISOString())
      .order('timestamp', { ascending: true })

    return {
      channel_id: channel.channel_id,
      name: channel.name,
      grid_percentage: channel.grid_percentage,
      amount_per_trade: channel.amount_per_trade,
      history: history || []
    }
  }))

  return channelsHistory
}

export async function getAllChannelsDailyPnl(days = 30) {
  checkCredentials()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  // Get all channels first
  const { data: channels, error: channelsError } = await supabase
    .from('channels')
    .select('*')
    .order('name')

  if (channelsError) throw channelsError

  // Get orders for all channels
  const channelsOrders = await Promise.all((channels || []).map(async (channel) => {
    const { data: orders } = await supabase
      .from('virtual_orders')
      .select('*')
      .eq('channel_id', channel.channel_id)
      .gte('timestamp', fromDate.toISOString())
      .order('timestamp', { ascending: true })

    return {
      channel_id: channel.channel_id,
      name: channel.name,
      grid_percentage: channel.grid_percentage,
      amount_per_trade: channel.amount_per_trade,
      orders: orders || []
    }
  }))

  return channelsOrders
}
