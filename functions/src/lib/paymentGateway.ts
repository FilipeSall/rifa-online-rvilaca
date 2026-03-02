import { HORSEPAY_BASE_URL, type PixType } from './constants.js'
import { getHorsePayToken, horsePayRequest } from './horsepayClient.js'
import { type JsonRecord } from './shared.js'

export interface CreateDepositOrderInput {
  amount: number
  payerName: string
  callbackUrl: string
  clientReferenceId: string
  phone?: string | null
}

export interface RequestWithdrawInput {
  amount: number
  pixKey: string
  pixType: PixType
  clientReferenceId: string
}

export interface PaymentGateway {
  createDepositOrder: (input: CreateDepositOrderInput) => Promise<JsonRecord>
  requestWithdraw: (input: RequestWithdrawInput) => Promise<JsonRecord>
  getBalance: () => Promise<JsonRecord>
}

interface PaymentGatewayOptions {
  useMock: boolean
  baseUrl: string
  clientKey: string
  clientSecret: string
}

function readBoolFlag(value: unknown): boolean {
  const normalized = `${value ?? ''}`.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function randomSuffix(): string {
  return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')
}

class HorsePayPaymentGateway implements PaymentGateway {
  private readonly baseUrl: string

  private readonly clientKey: string

  private readonly clientSecret: string

  constructor(options: { baseUrl: string; clientKey: string; clientSecret: string }) {
    this.baseUrl = options.baseUrl
    this.clientKey = options.clientKey
    this.clientSecret = options.clientSecret
  }

  private async getAccessToken(): Promise<string> {
    return getHorsePayToken({
      baseUrl: this.baseUrl,
      clientKey: this.clientKey,
      clientSecret: this.clientSecret,
    })
  }

  async createDepositOrder(input: CreateDepositOrderInput): Promise<JsonRecord> {
    const accessToken = await this.getAccessToken()

    const payload: JsonRecord = {
      amount: input.amount,
      payer_name: input.payerName,
      callback_url: input.callbackUrl,
      client_reference_id: input.clientReferenceId,
      payment_method: 'PIX',
    }

    if (input.phone) {
      payload.phone = input.phone
    }

    return horsePayRequest<JsonRecord>({
      baseUrl: this.baseUrl,
      method: 'post',
      path: '/transaction/neworder',
      token: accessToken,
      data: payload,
    })
  }

  async requestWithdraw(input: RequestWithdrawInput): Promise<JsonRecord> {
    const accessToken = await this.getAccessToken()

    return horsePayRequest<JsonRecord>({
      baseUrl: this.baseUrl,
      method: 'post',
      path: '/transaction/withdraw',
      token: accessToken,
      data: {
        amount: input.amount,
        pix_key: input.pixKey,
        pix_type: input.pixType,
        client_reference_id: input.clientReferenceId,
      },
    })
  }

  async getBalance(): Promise<JsonRecord> {
    const accessToken = await this.getAccessToken()

    return horsePayRequest<JsonRecord>({
      baseUrl: this.baseUrl,
      method: 'get',
      path: '/user/balance',
      token: accessToken,
    })
  }
}

class MockHorsePayPaymentGateway implements PaymentGateway {
  async createDepositOrder(input: CreateDepositOrderInput): Promise<JsonRecord> {
    const externalId = `mock-deposit-${Date.now()}-${randomSuffix()}`
    const copyPaste = `00020126580014BR.GOV.BCB.PIX0136${input.clientReferenceId.slice(0, 32)}520400005303986540${input.amount.toFixed(2)}5802BR5925MOCK PAGADOR6009SAO PAULO62070503***6304ABCD`

    return {
      external_id: externalId,
      status: 'pending',
      payment_method: 'PIX',
      amount: input.amount,
      data: {
        external_id: externalId,
        copy_paste: copyPaste,
      },
      payment: {
        copy_paste: copyPaste,
      },
    }
  }

  async requestWithdraw(input: RequestWithdrawInput): Promise<JsonRecord> {
    const externalId = `mock-withdraw-${Date.now()}-${randomSuffix()}`

    return {
      external_id: externalId,
      status: 'pending',
      amount: input.amount,
      pix_type: input.pixType,
      pix_key_masked: `${input.pixKey.slice(0, 3)}***`,
      client_reference_id: input.clientReferenceId,
    }
  }

  async getBalance(): Promise<JsonRecord> {
    return {
      status: 'success',
      balance: 10000,
      currency: 'BRL',
      source: 'mock',
    }
  }
}

export function resolveHorsePayBaseUrl(): string {
  const fromEnv = `${process.env.HORSEPAY_BASE_URL ?? ''}`.trim()
  return fromEnv || HORSEPAY_BASE_URL
}

export function shouldUseMockHorsePay(): boolean {
  return readBoolFlag(process.env.USE_MOCK_HORSEPAY)
}

export function createPaymentGateway(options: PaymentGatewayOptions): PaymentGateway {
  if (options.useMock) {
    return new MockHorsePayPaymentGateway()
  }

  return new HorsePayPaymentGateway({
    baseUrl: options.baseUrl,
    clientKey: options.clientKey,
    clientSecret: options.clientSecret,
  })
}
