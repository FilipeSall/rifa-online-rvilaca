import type { useUserDashboard } from '../../hooks/useUserDashboard'
import DashboardSidebar from './DashboardSidebar'
import EditProfileModal from './EditProfileModal'
import MobileSectionTabs from './MobileSectionTabs'
import MyNumbersSection from './MyNumbersSection'
import ProfileCard from './ProfileCard'
import ReceiptsSection from './ReceiptsSection'
import StatsCards from './StatsCards'
import PrizeWinnersShowcase from '../winners/PrizeWinnersShowcase'

type UserDashboardContentProps = {
  dashboardState: ReturnType<typeof useUserDashboard>
}

export default function UserDashboardContent({ dashboardState }: UserDashboardContentProps) {
  if (dashboardState.isLoading || !dashboardState.user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-luxury-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neon-pink border-t-transparent" />
      </div>
    )
  }

  const {
    user,
    activeSection,
    setActiveSection,
    isEditOpen,
    setIsEditOpen,
    firestorePhone,
    setFirestorePhone,
    firestoreCpf,
    setFirestoreCpf,
    isUploadingPhoto,
    photoInputRef,
    ticketFilter,
    setTicketFilter,
    ticketSearch,
    setTicketSearch,
    receiptFilter,
    setReceiptFilter,
    receiptSearch,
    setReceiptSearch,
    filteredTickets,
    filteredOrders,
    paidCount,
    totalOrders,
    totalTickets,
    campaignTitle,
    supportWhatsappNumber,
    mainPrize,
    secondPrize,
    bonusPrize,
    winningSummary,
    nextDrawDateLabel,
    displayName,
    initials,
    handlePhotoChange,
    handleSignOut,
    loadPhoneForUser,
    loadCpfForUser,
    refreshProfile,
  } = dashboardState

  const supportWhatsappDigits = supportWhatsappNumber.replace(/\D/g, '')
  const winnerWhatsappMessage = winningSummary.latestWin
    ? `Olá equipe! Sou um(a) ganhador(a) e preciso do suporte para premiação.\nSorteio: ${winningSummary.latestWin.drawDate}\nPrêmio: ${winningSummary.latestWin.drawPrize}\nCódigo: ${winningSummary.latestWin.drawId}`
    : 'Olá equipe! Sou um(a) ganhador(a) e preciso de suporte para receber meu prêmio.'
  const winnerWhatsappUrl = `https://wa.me${supportWhatsappDigits ? `/${supportWhatsappDigits}` : ''}?text=${encodeURIComponent(winnerWhatsappMessage)}`

  return (
    <>
      {isEditOpen && (
        <EditProfileModal
          userId={user.uid}
          currentName={displayName}
          currentEmail={user.email}
          onClose={() => setIsEditOpen(false)}
          onSaved={async (_name, newPhone, newCpf) => {
            setFirestorePhone(newPhone || null)
            if (newCpf) {
              setFirestoreCpf(newCpf)
            }
            await refreshProfile()
          }}
          loadPhone={loadPhoneForUser}
          loadCpf={loadCpfForUser}
        />
      )}

      <div className="flex">
        <DashboardSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-4xl space-y-6">
            <ProfileCard
              user={user}
              displayName={displayName}
              initials={initials}
              firestorePhone={firestorePhone}
              firestoreCpf={firestoreCpf}
              isUploadingPhoto={isUploadingPhoto}
              photoInputRef={photoInputRef}
              onPhotoChange={handlePhotoChange}
              onOpenEdit={() => setIsEditOpen(true)}
              onSignOut={handleSignOut}
            />

            <StatsCards paidCount={paidCount} nextDrawDateLabel={nextDrawDateLabel} />

            {winningSummary.hasWins ? (
              <section className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">Conta premiada</p>
                <h2 className="mt-2 text-xl font-black text-white">Parabéns, você tem premiação registrada!</h2>
                <p className="mt-2 text-sm text-emerald-100">
                  {winningSummary.latestWin
                    ? `Último prêmio: ${winningSummary.latestWin.drawPrize} (sorteio ${winningSummary.latestWin.drawDate}).`
                    : 'Nossa equipe de atendimento irá concluir seu processo de premiação.'}
                </p>
                <div className="mt-4">
                  <a
                    className="inline-flex h-11 items-center justify-center rounded-lg border border-emerald-200/40 bg-emerald-500/20 px-4 text-xs font-black uppercase tracking-[0.14em] text-emerald-100 transition-colors hover:bg-emerald-500/35"
                    href={winnerWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Falar no WhatsApp da equipe
                  </a>
                </div>
              </section>
            ) : null}

            <MobileSectionTabs activeSection={activeSection} onSectionChange={setActiveSection} />

            {activeSection === 'numeros' && (
              <MyNumbersSection
                ticketFilter={ticketFilter}
                ticketSearch={ticketSearch}
                filteredTickets={filteredTickets}
                totalTickets={totalTickets}
                mainPrize={mainPrize}
                secondPrize={secondPrize}
                bonusPrize={bonusPrize}
                hasWins={winningSummary.hasWins}
                latestWinDate={winningSummary.latestWin?.drawDate || null}
                latestWinPrize={winningSummary.latestWin?.drawPrize || null}
                onTicketFilterChange={setTicketFilter}
                onTicketSearchChange={setTicketSearch}
                onCheckIfWon={() => setActiveSection('ganhadores')}
              />
            )}

            {activeSection === 'comprovantes' && (
              <ReceiptsSection
                receiptFilter={receiptFilter}
                receiptSearch={receiptSearch}
                filteredOrders={filteredOrders}
                totalOrders={totalOrders}
                campaignTitle={campaignTitle}
                supportWhatsappNumber={supportWhatsappNumber}
                onReceiptFilterChange={setReceiptFilter}
                onReceiptSearchChange={setReceiptSearch}
              />
            )}

            {activeSection === 'ganhadores' && (
              <PrizeWinnersShowcase mode="dashboard" />
            )}
          </div>
        </main>
      </div>
    </>
  )
}
