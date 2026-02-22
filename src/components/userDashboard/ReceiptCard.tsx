import { useNavigate } from 'react-router-dom'
import { exportOrderReceiptPdf } from '../../utils/receiptPdf'
import type { UserOrder } from '../../types/userDashboard'
import { OrderStatusBadge } from './StatusBadges'

function openWhatsAppShare(order: UserOrder) {
  const message = [
    'Comprovante de compra - Rifa Online',
    `Pedido: ${order.id}`,
    `Status: ${order.status === 'pago' ? 'Pago' : order.status === 'aguardando' ? 'Pendente' : 'Cancelado'}`,
    `Data: ${order.date}`,
    `Cotas: ${order.cotas}`,
    `Valor total: ${order.totalBrl}`,
    `Numeros: ${order.numbers.join(', ') || '-'}`,
  ].join('\n')

  const url = `https://wa.me/?text=${encodeURIComponent(message)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

type ReceiptCardProps = {
  order: UserOrder
  campaignTitle: string
}

export default function ReceiptCard({ order, campaignTitle }: ReceiptCardProps) {
  const navigate = useNavigate()
  const stripe =
    order.status === 'pago' ? 'bg-emerald-500' : order.status === 'aguardando' ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-white/5 bg-luxury-card shadow-lg transition-all hover:-translate-y-0.5 hover:border-white/10 hover:shadow-xl ${
        order.status === 'cancelado' ? 'opacity-75 hover:opacity-100' : ''
      }`}
    >
      <div className={`absolute bottom-0 left-0 top-0 w-1.5 ${stripe}`} />
      <div className="flex h-full flex-col justify-between gap-5 p-5 pl-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">{order.id}</p>
            <h3 className="font-bold leading-snug text-white transition-colors group-hover:text-gold">
              {campaignTitle}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">Pedido #{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-y border-white/5 py-4">
          <div>
            <p className="text-[10px] text-text-muted">Data da Compra</p>
            <p className="mt-0.5 text-sm font-medium text-slate-200">{order.date}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted">Quantidade</p>
            <p className="mt-0.5 text-sm font-medium text-slate-200">
              {order.cotas} {order.cotas === 1 ? 'cota' : 'cotas'}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-[10px] text-text-muted">Valor Total</p>
            <p className="mt-0.5 text-xl font-bold text-gold">{order.totalBrl}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {order.status === 'pago' && (
            <>
              <button
                type="button"
                className="group/btn flex w-full items-center justify-center gap-2 rounded-lg border border-gold/30 px-4 py-2.5 text-sm font-bold text-gold transition-all hover:bg-gold hover:text-black"
                onClick={() => exportOrderReceiptPdf(order)}
              >
                <span className="material-symbols-outlined text-[18px] transition-transform group-hover/btn:animate-bounce">
                  download
                </span>
                Baixar Comprovante
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-bold text-emerald-400 transition-all hover:bg-emerald-500 hover:text-white"
                onClick={() => openWhatsAppShare(order)}
              >
                <span className="material-symbols-outlined text-[18px]">share</span>
                Enviar no WhatsApp
              </button>
            </>
          )}

          {order.status === 'aguardando' && (
            <>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-bold text-black shadow-lg shadow-gold/20 transition-all hover:bg-gold-hover"
                onClick={() =>
                  navigate('/checkout', {
                    state: {
                      orderId: order.id,
                      amount: order.amount ?? undefined,
                      quantity: order.cotas,
                      selectedNumbers: order.numbers,
                    },
                  })}
              >
                <span className="material-symbols-outlined text-[18px]">pix</span>
                Pagar Agora
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-text-muted transition-all hover:border-white/20 hover:text-white"
                onClick={async () => {
                  if (!order.copyPaste) {
                    return
                  }

                  await navigator.clipboard.writeText(order.copyPaste)
                }}
                disabled={!order.copyPaste}
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                Copiar codigo PIX
              </button>
            </>
          )}

          {order.status === 'cancelado' && (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-bold text-text-muted opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">block</span>
              Indisponivel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
