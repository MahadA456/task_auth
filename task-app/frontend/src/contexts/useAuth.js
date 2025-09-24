import { useContext } from 'react'
import { AuthContext } from './AuthContextContext'

export function useAuth() {
  return useContext(AuthContext)
}


