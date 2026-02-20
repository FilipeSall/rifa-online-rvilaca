import { Link } from 'react-router-dom'

type PlaceholderPageProps = {
  title: string
  description?: string
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="min-h-screen bg-luxury-bg text-white flex items-center justify-center font-display">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold text-white">{title}</h1>
        {description ? <p className="text-gray-400">{description}</p> : null}
        <Link className="text-sm font-semibold text-gold underline" to="/">
          Voltar para home
        </Link>
      </section>
    </div>
  )
}
