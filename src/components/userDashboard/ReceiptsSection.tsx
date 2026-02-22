import { RECEIPT_FILTERS } from '../../const/userDashboard'
import type { ReceiptFilter, UserOrder } from '../../types/userDashboard'
import { getReceiptFilterDot } from '../../utils/userDashboard'
import ReceiptCard from './ReceiptCard'

type ReceiptsSectionProps = {
  receiptFilter: ReceiptFilter
  receiptSearch: string
  filteredOrders: UserOrder[]
  totalOrders: number
  campaignTitle: string
  onReceiptFilterChange: (filter: ReceiptFilter) => void
  onReceiptSearchChange: (value: string) => void
}

export default function ReceiptsSection({
  receiptFilter,
  receiptSearch,
  filteredOrders,
  totalOrders,
  campaignTitle,
  onReceiptFilterChange,
  onReceiptSearchChange,
}: ReceiptsSectionProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">Comprovantes</h2>
        <p className="mt-0.5 text-sm text-text-muted">
          Gerencie seus recibos e visualize o status das suas compras.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-luxury-border bg-luxury-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-text-muted">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              search
            </span>
          </div>
          <input
            value={receiptSearch}
            onChange={(event) => onReceiptSearchChange(event.target.value)}
            className="block w-full rounded-lg border border-luxury-border bg-luxury-bg py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-gold/50 focus:outline-none focus:ring-1 focus:ring-gold/30"
            placeholder="Buscar por ID do pedido ou numero..."
            type="text"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          {RECEIPT_FILTERS.map((filter) => {
            const dot = getReceiptFilterDot(filter)

            return (
              <button
                key={filter}
                type="button"
                onClick={() => onReceiptFilterChange(filter)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  receiptFilter === filter
                    ? 'bg-gold text-black'
                    : 'border border-luxury-border bg-luxury-bg text-text-muted hover:border-white/20 hover:text-white'
                }`}
              >
                {dot && receiptFilter !== filter && <span className={`h-2 w-2 rounded-full ${dot}`} />}
                {filter}
              </button>
            )
          })}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-luxury-border bg-luxury-card py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-luxury-border bg-luxury-bg">
            <span className="material-symbols-outlined text-4xl text-text-muted">receipt_long</span>
          </div>
          <p className="font-bold text-white">Nenhum comprovante encontrado</p>
          <p className="mt-1 max-w-xs text-sm text-text-muted">Tente ajustar os filtros ou faca sua primeira compra.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <ReceiptCard key={order.id} order={order} campaignTitle={campaignTitle} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-luxury-border pt-4">
        <p className="text-sm text-text-muted">
          Mostrando <span className="font-bold text-white">{filteredOrders.length}</span> de{' '}
          <span className="font-bold text-white">{totalOrders}</span> resultados
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-luxury-border text-text-muted transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-luxury-border text-text-muted transition-colors hover:bg-white/5 hover:text-white"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
  )
}
