import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from './api.js'
import { applyPublicScheme, applyScheme } from './schemes.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = still checking

  const refresh = useCallback(async () => {
    try {
      const me = await api('/auth/me')
      setUser(me)
      // The profile's scheme (their pick, or their role's default) wins over this device's, so a choice made
      // elsewhere follows the user here.
      applyScheme(me.colorScheme)
      return me
    } catch {
      setUser(null)
      applyPublicScheme()
      return null
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = async (email, password) => {
    await api('/auth/login', { method: 'POST', body: { email, password } })
    return refresh()
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
    applyPublicScheme()
  }

  return <AuthContext.Provider value={{ user, login, logout, setUser }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

// Each role has one home page: taxpayers file returns, admins play the agencies, support agents look things up.
const HOMES = { admin: '/admin', support: '/support' }
export const homeFor = (user) => HOMES[user?.role] ?? '/'
