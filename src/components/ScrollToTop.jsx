import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Toda troca de rota começa no topo. O browser não restaura scroll sozinho
 * numa SPA, e sem isso a página nova abre no meio.
 *
 * Exceção: quando a URL traz um hash (`/#lista`), o destino é uma seção da
 * rota nova, não o topo. Ela só existe depois que a rota renderizou — por
 * isso o alvo é resolvido aqui, e não no link.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0)
      return
    }

    // O id pode não existir nesta rota (link velho, hash digitado à mão).
    // Nesse caso a página não pode ficar num scroll arbitrário: vai pro topo.
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (target) {
      target.scrollIntoView({ block: 'start' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])

  return null
}
