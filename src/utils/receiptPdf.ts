import { jsPDF } from 'jspdf'
import type { UserOrder } from '../types/userDashboard'
import { formatTicketNumbers } from './ticketNumber'

function formatAmount(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return 'R$ --'
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function chunkNumbers(numbers: number[]) {
  if (numbers.length === 0) {
    return ['-']
  }

  const joined = formatTicketNumbers(numbers).join(', ')
  const rows: string[] = []
  let cursor = 0

  while (cursor < joined.length) {
    rows.push(joined.slice(cursor, cursor + 95))
    cursor += 95
  }

  return rows
}

export function exportOrderReceiptPdf(order: UserOrder) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Comprovante de Pagamento - Rifa Online', 14, 18)

  doc.setDrawColor(210, 210, 210)
  doc.line(14, 22, 196, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)

  const rows: Array<[string, string]> = [
    ['Pedido', order.id],
    ['Status', order.status === 'pago' ? 'Pago' : order.status === 'aguardando' ? 'Pendente' : 'Cancelado'],
    ['Data', order.date],
    ['Quantidade de cotas', String(order.cotas)],
    ['Valor total', formatAmount(order.amount)],
    ['Campanha', order.campaignId || 'padrao'],
  ]

  let cursorY = 32
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${label}:`, 14, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.text(value || '-', 58, cursorY)
    cursorY += 7
  }

  cursorY += 4
  doc.setFont('helvetica', 'bold')
  doc.text('Numeros do pedido:', 14, cursorY)
  cursorY += 6
  doc.setFont('helvetica', 'normal')

  const numberRows = chunkNumbers(order.numbers)
  for (const line of numberRows) {
    doc.text(line, 14, cursorY)
    cursorY += 6
    if (cursorY > 280) {
      doc.addPage()
      cursorY = 20
    }
  }

  cursorY += 6
  doc.setDrawColor(210, 210, 210)
  doc.line(14, cursorY, 196, cursorY)
  cursorY += 8

  doc.setFontSize(9)
  doc.setTextColor(90, 90, 90)
  doc.text('Comprovante gerado automaticamente no portal do cliente.', 14, cursorY)

  const safeId = order.id.replace(/[^a-zA-Z0-9_-]/g, '') || 'pedido'
  doc.save(`comprovante-${safeId}.pdf`)
}
