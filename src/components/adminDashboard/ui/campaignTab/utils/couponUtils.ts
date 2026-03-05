export function generateCouponCode() {
  const seed = Math.random().toString(36).slice(2, 8).toUpperCase()
  const suffix = String(Date.now()).slice(-4)
  return `CUPOM-${seed}-${suffix}`
}
