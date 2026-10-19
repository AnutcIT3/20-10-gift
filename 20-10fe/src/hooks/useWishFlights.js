import { useCallback, useEffect, useReducer } from 'react'
import { FLIGHT_GAP_MS, MAX_FLIGHTS } from '../lib/wishHeap'

// landed: số lá đã nằm trong đống (= số đang hiện); flights: lá đang bay
const INITIAL = { landed: null, flights: [], nextId: 1 }

function reducer(state, action) {
  if (action.type === 'sync') {
    const { target, instant } = action
    if (target === null) return state
    // Lần đầu, hay số giảm (admin từ chối/xoá lời chúc): đặt thẳng, không bay
    if (state.landed === null || target < state.landed || instant) {
      return { ...state, landed: target, flights: [] }
    }
    const pending = target - state.landed - state.flights.length
    if (pending <= 0) return state
    const room = Math.max(0, MAX_FLIGHTS - state.flights.length)
    const launch = Math.min(pending, room)
    const flights = [...state.flights]
    for (let k = 0; k < launch; k += 1) {
      flights.push({ id: state.nextId + k, delay: k * FLIGHT_GAP_MS })
    }
    // Phần quá số lá được bay thì đặt thẳng vào đống
    return { landed: state.landed + (pending - launch), flights, nextId: state.nextId + launch }
  }
  if (action.type === 'land') {
    if (!state.flights.some((flight) => flight.id === action.id)) return state
    return { ...state, landed: state.landed + 1, flights: state.flights.filter((flight) => flight.id !== action.id) }
  }
  return state
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * Đống thư đi theo số lời chúc của máy chủ: số tăng thì từng lá thư bay vào
 * (tối đa vài lá một lúc), rồi mới cộng vào số đang hiện. `paused` (đang mở
 * khung gửi lời chúc) thì chờ, đóng khung rồi mới bay để người gửi thấy được.
 * Tab đang ẩn hay máy đặt "giảm chuyển động" thì cộng thẳng, không bay.
 */
export default function useWishFlights(target, { paused = false } = {}) {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  useEffect(() => {
    if (target === null || target === undefined) return undefined
    if (paused && state.landed !== null) return undefined
    // setTimeout 0: chỉ đổi state trong callback bất đồng bộ (quy tắc react-hooks v7)
    const timer = setTimeout(() => {
      const instant = prefersReducedMotion() || (typeof document !== 'undefined' && document.hidden)
      dispatch({ type: 'sync', target, instant })
    }, 0)
    return () => clearTimeout(timer)
  }, [target, paused, state.landed, state.flights.length])

  const land = useCallback((id) => dispatch({ type: 'land', id }), [])
  return { landed: state.landed, flights: state.flights, land }
}
