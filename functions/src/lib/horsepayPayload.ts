import { asRecord, getNestedValue, readString } from './shared.js'

export function extractExternalId(payload: unknown): string | null {
  const record = asRecord(payload)
  const candidatePaths = [
    'external_id',
    'externalId',
    'id',
    'transaction_id',
    'transactionId',
    'data.external_id',
    'data.externalId',
    'data.id',
    'data.transaction_id',
    'data.transactionId',
    'transaction.external_id',
    'transaction.externalId',
    'transaction.id',
    'order.external_id',
    'order.externalId',
    'order.id',
    'result.external_id',
    'result.externalId',
    'result.id',
  ]

  for (const path of candidatePaths) {
    const candidate = readString(getNestedValue(record, path))
    if (candidate) {
      return candidate
    }
  }

  const dataNode = getNestedValue(record, 'data')
  if (Array.isArray(dataNode) && dataNode.length > 0) {
    const first = asRecord(dataNode[0])
    return readString(first.external_id) || readString(first.externalId) || readString(first.id) || null
  }

  return (
    readString(record.external_id) ||
    readString(record.externalId) ||
    readString(record.id) ||
    readString(record.transaction_id) ||
    readString(record.transactionId) ||
    null
  )
}

export function extractPixPayload(payload: unknown): { copyPaste: string | null; qrCode: string | null } {
  const record = asRecord(payload)
  const pix = asRecord(record.pix)
  const dataNode = asRecord(record.data)
  const dataPix = asRecord(dataNode.pix)
  const transactionNode = asRecord(record.transaction)
  const transactionPix = asRecord(transactionNode.pix)
  const paymentNode = asRecord(record.payment)
  const paymentPix = asRecord(paymentNode.pix)
  const resultNode = asRecord(record.result)
  const resultPix = asRecord(resultNode.pix)
  const resultPayment = asRecord(resultNode.payment)
  const dataPayment = asRecord(dataNode.payment)
  const transactionPayment = asRecord(transactionNode.payment)

  const copyPaste =
    readString(record.copy_past) ||
    readString(record.copy_paste) ||
    readString(record.copyPaste) ||
    readString(record.pix_copy_paste) ||
    readString(record.pix_copy_past) ||
    readString(record.pixCode) ||
    readString(record.pix_code) ||
    readString(pix.copy_paste) ||
    readString(pix.copyPaste) ||
    readString(pix.copy_past) ||
    readString(pix.pix_code) ||
    readString(pix.pixCode) ||
    readString(dataNode.copy_paste) ||
    readString(dataNode.copy_past) ||
    readString(dataNode.copyPaste) ||
    readString(dataNode.pix_copy_paste) ||
    readString(dataNode.pix_copy_past) ||
    readString(dataNode.pixCode) ||
    readString(dataNode.pix_code) ||
    readString(dataPix.copy_paste) ||
    readString(dataPix.copy_past) ||
    readString(dataPix.copyPaste) ||
    readString(dataPix.pix_code) ||
    readString(dataPix.pixCode) ||
    readString(paymentNode.copy_paste) ||
    readString(paymentNode.copy_past) ||
    readString(paymentNode.copyPaste) ||
    readString(paymentNode.pix_copy_paste) ||
    readString(paymentNode.pix_copy_past) ||
    readString(paymentNode.pix_code) ||
    readString(paymentNode.pixCode) ||
    readString(paymentNode.emv) ||
    readString(paymentNode.payload) ||
    readString(paymentPix.copy_paste) ||
    readString(paymentPix.copy_past) ||
    readString(paymentPix.copyPaste) ||
    readString(paymentPix.pix_copy_paste) ||
    readString(paymentPix.pix_copy_past) ||
    readString(paymentPix.pix_code) ||
    readString(paymentPix.pixCode) ||
    readString(paymentPix.emv) ||
    readString(resultNode.copy_paste) ||
    readString(resultNode.copy_past) ||
    readString(resultNode.copyPaste) ||
    readString(resultNode.pix_copy_paste) ||
    readString(resultNode.pix_copy_past) ||
    readString(resultNode.pix_code) ||
    readString(resultNode.pixCode) ||
    readString(resultPix.copy_paste) ||
    readString(resultPix.copy_past) ||
    readString(resultPix.copyPaste) ||
    readString(resultPix.pix_code) ||
    readString(resultPix.pixCode) ||
    readString(resultPayment.copy_paste) ||
    readString(resultPayment.copy_past) ||
    readString(resultPayment.copyPaste) ||
    readString(resultPayment.pix_code) ||
    readString(resultPayment.pixCode) ||
    readString(resultPayment.payload) ||
    readString(dataPayment.copy_paste) ||
    readString(dataPayment.copy_past) ||
    readString(dataPayment.copyPaste) ||
    readString(dataPayment.pix_code) ||
    readString(dataPayment.pixCode) ||
    readString(transactionPayment.copy_paste) ||
    readString(transactionPayment.copy_past) ||
    readString(transactionPayment.copyPaste) ||
    readString(transactionPayment.pix_code) ||
    readString(transactionPayment.pixCode) ||
    readString(transactionNode.copy_paste) ||
    readString(transactionNode.copyPaste) ||
    readString(transactionNode.copy_past) ||
    readString(transactionNode.pix_copy_paste) ||
    readString(transactionNode.pix_copy_past) ||
    readString(transactionNode.pixCode) ||
    readString(transactionNode.pix_code) ||
    readString(transactionPix.copy_paste) ||
    readString(transactionPix.copy_past) ||
    readString(transactionPix.copyPaste) ||
    readString(transactionPix.pix_code) ||
    readString(transactionPix.pixCode) ||
    null

  const qrCode =
    readString(record.pix_qr_code) ||
    readString(record.pix_qrcode) ||
    readString(record.qrcode) ||
    readString(record.qrcode_base64) ||
    readString(record.qr_code) ||
    readString(record.qrCode) ||
    readString(pix.qr_code) ||
    readString(pix.qrCode) ||
    readString(pix.qrcode) ||
    readString(pix.qrcode_base64) ||
    readString(dataNode.pix_qr_code) ||
    readString(dataNode.pix_qrcode) ||
    readString(dataNode.qrcode) ||
    readString(dataNode.qrcode_base64) ||
    readString(dataNode.qr_code) ||
    readString(dataNode.qrCode) ||
    readString(dataPix.qr_code) ||
    readString(dataPix.qrCode) ||
    readString(dataPix.qrcode) ||
    readString(dataPix.qrcode_base64) ||
    readString(paymentNode.pix_qr_code) ||
    readString(paymentNode.pix_qrcode) ||
    readString(paymentNode.qr_code) ||
    readString(paymentNode.qrCode) ||
    readString(paymentNode.qrcode) ||
    readString(paymentNode.qrcode_base64) ||
    readString(paymentNode.qr_image) ||
    readString(paymentNode.qrImage) ||
    readString(paymentPix.qr_code) ||
    readString(paymentPix.qrCode) ||
    readString(paymentPix.qrcode) ||
    readString(paymentPix.qrcode_base64) ||
    readString(paymentPix.qr_image) ||
    readString(resultNode.qr_code) ||
    readString(resultNode.qrCode) ||
    readString(resultNode.qrcode) ||
    readString(resultNode.qrcode_base64) ||
    readString(resultPix.qr_code) ||
    readString(resultPix.qrCode) ||
    readString(resultPix.qrcode) ||
    readString(resultPix.qrcode_base64) ||
    readString(resultPayment.qr_code) ||
    readString(resultPayment.qrCode) ||
    readString(resultPayment.qrcode) ||
    readString(resultPayment.qrcode_base64) ||
    readString(resultPayment.qr_image) ||
    readString(dataPayment.qr_code) ||
    readString(dataPayment.qrCode) ||
    readString(dataPayment.qrcode) ||
    readString(dataPayment.qrcode_base64) ||
    readString(transactionPayment.qr_code) ||
    readString(transactionPayment.qrCode) ||
    readString(transactionPayment.qrcode) ||
    readString(transactionPayment.qrcode_base64) ||
    readString(transactionNode.pix_qr_code) ||
    readString(transactionNode.pix_qrcode) ||
    readString(transactionNode.qrcode) ||
    readString(transactionNode.qrcode_base64) ||
    readString(transactionNode.qr_code) ||
    readString(transactionNode.qrCode) ||
    readString(transactionPix.qr_code) ||
    readString(transactionPix.qrCode) ||
    readString(transactionPix.qrcode) ||
    readString(transactionPix.qrcode_base64) ||
    null

  return { copyPaste, qrCode }
}
