import type { Section } from '../../types/userDashboard'

type MobileSectionTabsProps = {
  activeSection: Section
  onSectionChange: (section: Section) => void
}

export default function MobileSectionTabs({ activeSection, onSectionChange }: MobileSectionTabsProps) {
  return (
    <div className="flex gap-1 rounded-xl border border-luxury-border bg-luxury-card p-1 lg:hidden">
      {(['numeros', 'comprovantes'] as Section[]).map((section) => (
        <button
          key={section}
          type="button"
          onClick={() => onSectionChange(section)}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeSection === section ? 'bg-gold text-black' : 'text-text-muted hover:text-white'
          }`}
        >
          {section === 'numeros' ? 'Meus Numeros' : 'Comprovantes'}
        </button>
      ))}
    </div>
  )
}
