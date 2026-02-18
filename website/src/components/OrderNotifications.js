'use client'

import { useOrderNotifications } from '@/lib/useSSE'

export default function OrderNotifications() {
  useOrderNotifications()
  return null
}
