// Channel configuration - only names, other params fetched from database
export const CHANNEL_CONFIG = {
  '1440645863729791006': {
    name: 'Shashank 1'
  },
  '1440646657258684416': {
    name: 'Shashank 2'
  },
  '1440646699235282985': {
    name: 'Manish 1'
  },
  '1441032604013826101': {
    name: 'Manish 2'
  },
  '1441032659106267187': {
    name: 'Ronak 1'
  },
  '1441032734666526771': {
    name: 'Ronak 2'
  },
  '1441032799846142037': {
    name: 'Anshit 1'
  },
  '1441032873124565052': {
    name: 'Anshit 2'
  },
  '1441032833698238465': {
    name: 'Commons 1'
  },
  '1441032735090282557': {
    name: 'Common 2'
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
