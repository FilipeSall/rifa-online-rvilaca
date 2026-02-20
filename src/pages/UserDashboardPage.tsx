import Header from '../components/home/Header'
import { UserDashboardContent } from '../components/userDashboard'
import { useUserDashboard } from '../hooks/useUserDashboard'

export default function UserDashboardPage() {
  const dashboardState = useUserDashboard()

  return (
    <div className="min-h-screen bg-luxury-bg font-display text-white">
      <Header />
      <UserDashboardContent dashboardState={dashboardState} />
    </div>
  )
}
