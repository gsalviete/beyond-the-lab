'use client'

import { useState } from 'react'
import Image from 'next/image'

/**
 * Player do vídeo da professora dentro da moldura de celular.
 *
 * O arquivo tem 11,2 MB. Com `preload="metadata"` o Chrome ainda puxava um
 * pedaço grande do MP4 no load e ele sozinho respondia pela maior parte do
 * payload inicial (LCP mobile em 11,3 s). Agora só o poster entra no load:
 * o `<video>` nem existe no DOM até o primeiro clique, e aí monta já com
 * `autoPlay`, então o gesto continua sendo um único toque.
 *
 * `preload="none"` fica mesmo assim como cinto de segurança — se alguma
 * mudança futura montar este componente sem interação, o vídeo não baixa
 * sozinho.
 */
export default function PhoneVideo({ screenStyle }) {
  const [ativo, setAtivo] = useState(false)

  if (ativo) {
    return (
      /* As legendas são queimadas na imagem pela edição — não existe faixa de
         texto para expor num <track>. Não procure o .vtt, ele não existe. */
      /* controls nativo de propósito: dá teclado, foco e anúncio de play/pause
         sem estado próprio. */
      <video
        className="absolute object-cover"
        src="/assets/teacher.mp4"
        aria-label="Giovanna, professora do Beyond The Lab, falando para a câmera"
        controls
        autoPlay
        playsInline
        preload="none"
        style={screenStyle}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setAtivo(true)}
      className="group absolute overflow-hidden"
      style={screenStyle}
      aria-label="Reproduzir vídeo: Giovanna, professora do Beyond The Lab, falando para a câmera"
    >
      {/* `fill` porque a caixa é dimensionada em % da moldura — não há
         width/height em px para declarar. O pai já tem aspect-ratio fixo,
         então isto não mexe no CLS. */}
      <Image
        src="/assets/teacher-poster.jpg"
        alt=""
        fill
        sizes="(min-width: 1024px) 317px, 90vw"
        className="object-cover"
      />
      <span className="pointer-events-none absolute inset-0 bg-ink/10" />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2
                   -translate-y-1/2 place-items-center rounded-full bg-white/90 text-brand
                   shadow-[0_10px_30px_-8px_rgba(2,45,87,0.45)]
                   [transition:transform_var(--motion-short)_var(--ease-out)]
                   group-hover:scale-110"
      >
        {/* triângulo de play, deslocado 2px à direita para compensar o peso óptico */}
        <svg width="22" height="26" viewBox="0 0 22 26" fill="currentColor" aria-hidden="true" className="ml-[3px]">
          <path d="M21 11.268a2 2 0 0 1 0 3.464L3 25.124a2 2 0 0 1-3-1.732V2.608a2 2 0 0 1 3-1.732l18 10.392Z" />
        </svg>
      </span>
    </button>
  )
}
