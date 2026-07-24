export default function Footer() {
  return (
    <footer className="border-t border-ink/10 py-8">
      <div className="container-page flex flex-col items-center justify-between gap-3 text-center md:flex-row md:text-left">
        <span className="font-display text-lg font-bold text-brand">Beyond The Lab</span>
        <p className="text-sm text-muted">
          © 2026 <span className="font-semibold text-ink">Beyond The Lab</span>. Inglês para Reprodução Humana.
        </p>
      </div>
    </footer>
  )
}
