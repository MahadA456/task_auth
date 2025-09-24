import { io } from 'socket.io-client'

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000'

export function createCommunitySocket(user) {
  const socket = io(WS_BASE_URL, { transports: ['websocket'], autoConnect: false })
  socket.connect()
  socket.emit('community:join', { id: user?.id, fullName: user?.fullName, email: user?.email })
  const leave = () => socket.emit('community:leave')
  const disconnect = () => socket.disconnect()
  return { socket, leave, disconnect }
}


