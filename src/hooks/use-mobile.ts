import * as React from "react"

const MOBILE_BREAKPOINT = 768

/*
 * Starts `false` — the same value the server renders, since there is no window
 * there — and corrects itself from matchMedia in the effect. Reading
 * window.innerWidth in the state initializer instead makes the client's first
 * render disagree with the server's on every mobile load, which React reports
 * as a hydration mismatch and then throws away the whole server tree to fix.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
