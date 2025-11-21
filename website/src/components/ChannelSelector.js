'use client'

import { useState, useEffect } from 'react'
import { getAllChannels } from '@/lib/supabase'
import { CHANNEL_CONFIG, getChannelName } from '@/lib/channels'

export default function ChannelSelector({ selectedChannel, onChannelChange }) {
  const [channels, setChannels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchChannels() {
      try {
        const data = await getAllChannels()
        setChannels(data)
        if (data.length > 0 && !selectedChannel) {
          onChannelChange(data[0].channel_id)
        }
      } catch (err) {
        console.error('Error fetching channels:', err)
        setError(err.message || 'Failed to connect to database')
      } finally {
        setLoading(false)
      }
    }
    fetchChannels()
  }, [])

  if (loading) {
    return (
      <div className="animate-pulse bg-[#1a1a1a] h-10 w-48 rounded-lg"></div>
    )
  }

  if (error) {
    return (
      <div className="text-[#ff4444] text-sm">
        {error.includes('URL') ? 'Configure .env.local with Supabase credentials' : error}
      </div>
    )
  }

  if (channels.length === 0) {
    return (
      <div className="text-gray-500 text-sm">No channels configured</div>
    )
  }

  return (
    <select
      value={selectedChannel || ''}
      onChange={(e) => onChannelChange(e.target.value)}
      className="bg-[#0a0a0a] border border-[#1a1a1a] text-white rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer hover:border-gray-600 transition-colors"
    >
      {channels.map((channel) => {
        const config = CHANNEL_CONFIG[channel.channel_id]
        const name = config?.name || `Channel ${channel.channel_id.slice(-6)}`
        return (
          <option key={channel.channel_id} value={channel.channel_id}>
            {name} - ₹{Number(channel.capital).toLocaleString()}
          </option>
        )
      })}
    </select>
  )
}
