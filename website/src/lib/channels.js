// Hardcoded channel configuration
// Format: CHANNEL_ID-NAME-INITIAL_CAPITAL-AMOUNT_PER_TRADE-GRID_PERCENTAGE

export const CHANNEL_CONFIG = {
  '1440645863729791006': {
    name: 'Shashank 1',
    capital: 250000,
    amountPerTrade: 40000,
    gridPercentage: 1.5
  },
  '1440646657258684416': {
    name: 'Shashank 2',
    capital: 250000,
    amountPerTrade: 25000,
    gridPercentage: 1.25
  },
  '1440646699235282985': {
    name: 'Manish 1',
    capital: 250000,
    amountPerTrade: 20000,
    gridPercentage: 1.5
  },
  '1441032604013826101': {
    name: 'Manish 2',
    capital: 250000,
    amountPerTrade: 10000,
    gridPercentage: 2.0
  },
  '1441032659106267187': {
    name: 'Ronak 1',
    capital: 250000,
    amountPerTrade: 15000,
    gridPercentage: 1.5
  },
  '1441032734666526771': {
    name: 'Ronak 2',
    capital: 250000,
    amountPerTrade: 100000,
    gridPercentage: 1.0
  },
  '1441032799846142037': {
    name: 'Anshit 1',
    capital: 250000,
    amountPerTrade: 8000,
    gridPercentage: 2.0
  },
  '1441032873124565052': {
    name: 'Anshit 2',
    capital: 250000,
    amountPerTrade: 8000,
    gridPercentage: 1.69
  },
  '1441032833698238465': {
    name: 'Commons 1',
    capital: 250000,
    amountPerTrade: 1000,
    gridPercentage: 0.25
  },
  '1441032735090282557': {
    name: 'Common 2',
    capital: 250000,
    amountPerTrade: 10000,
    gridPercentage: 0.50
  }
}

export function getChannelName(channelId) {
  return CHANNEL_CONFIG[channelId]?.name || `Channel ${channelId.slice(-6)}`
}

export function getChannelConfig(channelId) {
  return CHANNEL_CONFIG[channelId] || null
}

export function getAllChannelIds() {
  return Object.keys(CHANNEL_CONFIG)
}
