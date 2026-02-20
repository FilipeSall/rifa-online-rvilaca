import type { useUserDashboard } from '../../hooks/useUserDashboard'
import DashboardSidebar from './DashboardSidebar'
import EditProfileModal from './EditProfileModal'
import MobileSectionTabs from './MobileSectionTabs'
import MyNumbersSection from './MyNumbersSection'
import ProfileCard from './ProfileCard'
import ReceiptsSection from './ReceiptsSection'
import StatsCards from './StatsCards'

type UserDashboardContentProps = {
  dashboardState: ReturnType<typeof useUserDashboard>
}

export default function UserDashboardContent({ dashboardState }: UserDashboardContentProps) {
  if (dashboardState.isLoading || !dashboardState.user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-luxury-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold border-t-transparent" />
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
    displayName,
    initials,
    handlePhotoChange,
    handleSignOut,
    loadPhoneForUser,
  } = dashboardState

  return (
    <>
      {isEditOpen && (
        <EditProfileModal
          userId={user.uid}
          currentName={displayName}
          currentEmail={user.email}
          onClose={() => setIsEditOpen(false)}
          onSaved={(_name, newPhone) => setFirestorePhone(newPhone || null)}
          loadPhone={loadPhoneForUser}
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
              isUploadingPhoto={isUploadingPhoto}
              photoInputRef={photoInputRef}
              onPhotoChange={handlePhotoChange}
              onOpenEdit={() => setIsEditOpen(true)}
              onSignOut={handleSignOut}
            />

            <StatsCards paidCount={paidCount} />

            <MobileSectionTabs activeSection={activeSection} onSectionChange={setActiveSection} />

            {activeSection === 'numeros' && (
              <MyNumbersSection
                ticketFilter={ticketFilter}
                ticketSearch={ticketSearch}
                filteredTickets={filteredTickets}
                onTicketFilterChange={setTicketFilter}
                onTicketSearchChange={setTicketSearch}
              />
            )}

            {activeSection === 'comprovantes' && (
              <ReceiptsSection
                receiptFilter={receiptFilter}
                receiptSearch={receiptSearch}
                filteredOrders={filteredOrders}
                onReceiptFilterChange={setReceiptFilter}
                onReceiptSearchChange={setReceiptSearch}
              />
            )}
          </div>
        </main>
      </div>
    </>
  )
}
