type UserSearchFieldsInput = {
  name?: string | null
  email?: string | null
  cpf?: string | null
  phone?: string | null
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function extractDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function buildUserSearchFields(input: UserSearchFieldsInput) {
  const output: {
    nameSearch?: string | null
    emailSearch?: string | null
    cpfSearch?: string | null
    phoneSearch?: string | null
  } = {}

  if ('name' in input) {
    const normalized = normalizeText(input.name || '')
    output.nameSearch = normalized || null
  }

  if ('email' in input) {
    const normalized = normalizeText(input.email || '')
    output.emailSearch = normalized || null
  }

  if ('cpf' in input) {
    const digits = extractDigits(input.cpf || '')
    output.cpfSearch = digits || null
  }

  if ('phone' in input) {
    const digits = extractDigits(input.phone || '')
    output.phoneSearch = digits || null
  }

  return output
}
