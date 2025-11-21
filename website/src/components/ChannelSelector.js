'use client'

import { useState, useEffect } from 'react'
import { getAllChannels } from '@/lib/supabase'

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
      <div className="animate-pulse bg-gray-700 h-10 w-48 rounded"></div>
    )
  }

  if (error) {
    return (
      <div className="text-red-400 text-sm">
        {error.includes('URL') ? 'Configure .env.local with Supabase credentials' : error}
      </div>
    )
  }

  if (channels.length === 0) {
    return (
      <div className="text-gray-400 text-sm">No channels configured</div>
    )
  }

  return (
    <select
      value={selectedChannel || ''}
      onChange={(e) => onChannelChange(e.target.value)}
      className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {channels.map((channel) => (
        <option key={channel.channel_id} value={channel.channel_id}>
          Channel: {channel.channel_id.slice(-6)} - ₹{Number(channel.capital).toLocaleString()}
        </option>
      ))}
    </select>
  )
}
