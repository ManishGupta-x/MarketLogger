// Channel configuration - hardcoded 2 channels only
export const CHANNEL_CONFIG = {
  '1443823756823891979': {
    name: 'Small Amount',
    initialCapital: 100000,
    amountPerTrade: 3000,
    gridPercentage: 0.25
  },
  '1443823807155409009': {
    name: 'Large Amount',
    initialCapital: 100000,
    amountPerTrade: 10000,
    gridPercentage: 0.25
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
