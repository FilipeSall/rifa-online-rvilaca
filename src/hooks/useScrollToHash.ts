import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Faz scroll suave para o elemento cujo `id` corresponde ao hash da URL.
 * Ex.: ao navegar para `/#premios`, rola até o elemento com `id="premios"`.
 */
export function useScrollToHash() {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      return
    }

    const targetId = hash.slice(1)
    const targetElement = document.getElementById(targetId)

    if (!targetElement) {
      return
    }

    window.requestAnimationFrame(() => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [hash])
}
