import logo from '../../assets/logo.webp'
import { Link } from 'react-router-dom'
import { FOOTER_NAV_LINKS, FOOTER_SUPPORT_LINKS } from '../../const/home'

export default function Footer() {
  return (
    <footer className="bg-luxury-card border-t border-white/5 pt-16 pb-8">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <img src={logo} alt="JhonyBarber" className="h-14 w-14 object-contain" />
              <h2 className="text-lg font-barber text-white uppercase tracking-widest">
                JHONYBARBER
              </h2>
            </div>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              O Jhony tá aqui pra realizar sonhos — com transparência, seriedade e muita animação. Participe e boa sorte!
            </p>
            <div className="flex gap-4">
              <a
                className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-neon-pink transition-colors"
                href="#"
              >
                <span className="material-symbols-outlined text-sm">alternate_email</span>
              </a>
              <a
                className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white hover:bg-neon-pink transition-colors"
                href="#"
              >
                <span className="material-symbols-outlined text-sm">chat</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Navegação</h3>
            <ul className="space-y-3 text-sm text-gray-500">
              {FOOTER_NAV_LINKS.map((item) => (
                <li key={item.label}>
                  <Link className="hover:text-neon-pink transition-colors" to={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Suporte</h3>
            <ul className="space-y-3 text-sm text-gray-500">
              {FOOTER_SUPPORT_LINKS.map((item) => (
                <li key={item.label}>
                  <Link className="hover:text-neon-pink transition-colors" to={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-widest mb-6">Pagamento Seguro</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white/10 px-3 py-1.5 rounded border border-white/10 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-400 text-sm">photos</span>
                <span className="text-xs font-bold text-white">PIX</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              Pagamentos processados em ambiente seguro criptografado. Seus dados estão protegidos.
            </p>
          </div>
        </div>

        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">
            © 2024 JhonyBarber. Todos os direitos reservados.
          </p>
          <p className="text-xs text-gray-600 flex items-center gap-1">
            Feito com <span className="text-neon-pink">♥</span> para vencedores.
          </p>
        </div>
      </div>
    </footer>
  )
}
