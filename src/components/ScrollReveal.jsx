'use client'

import useScrollReveal from '@/hooks/useScrollReveal.js'

/**
 * Ponte entre uma página server component e o hook de scroll-reveal, que
 * depende de IntersectionObserver. Só isto precisa rodar no cliente — sem
 * ele a página inteira teria que virar client component só por causa do
 * `useEffect` do hook.
 */
export default function ScrollReveal() {
  useScrollReveal()
  return null
}
