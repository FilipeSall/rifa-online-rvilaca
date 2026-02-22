import { useEffect, useRef, useState } from 'react'
import { HiChevronDown } from 'react-icons/hi2'

export type SelectOption = { value: string; label: string; disabled?: boolean }

interface CustomSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly SelectOption[]
  disabled?: boolean
  placeholder?: string
  className?: string
}

export function CustomSelect({ id, value, onChange, options, disabled, placeholder, className }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)
  const selectedLabel = selectedOption?.label ?? placeholder ?? ''

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(optionValue: string) {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} id={id} className={`relative mt-2 ${className ?? ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={[
          'flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-semibold text-white outline-none transition-all duration-150',
          isOpen ? 'border-gold/60 bg-black/60' : 'border-white/10 bg-black/40',
          disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:border-white/20',
        ].join(' ')}
      >
        <span className="truncate text-left">
          {selectedLabel !== '' ? selectedLabel : <span className="text-gray-500">{placeholder ?? 'Selecione...'}</span>}
        </span>
        <HiChevronDown
          className={`ml-2 h-4 w-4 flex-shrink-0 text-gold/70 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`}
        />
      </button>

      <div
        className={[
          'absolute z-50 mt-1 w-full origin-top overflow-hidden rounded-lg border border-white/10 bg-[#111111] shadow-2xl transition-all duration-200',
          isOpen ? 'scale-y-100 opacity-100' : 'pointer-events-none scale-y-95 opacity-0',
        ].join(' ')}
      >
        <div className="max-h-56 overflow-y-auto py-1">
          {options.map((option) => {
            const isSelected = option.value === value
            const isDisabled = Boolean(option.disabled)
            return (
              <button
                key={option.value}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (isDisabled) {
                    return
                  }
                  handleSelect(option.value)
                }}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors',
                  isDisabled
                    ? 'cursor-not-allowed opacity-40 text-white/40'
                    : isSelected
                      ? 'bg-gold/10 text-gold'
                      : 'text-white/75 hover:bg-white/5 hover:text-white',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1.5 w-1.5 flex-shrink-0 rounded-full transition-opacity',
                    isSelected ? 'bg-gold opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
                {option.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
