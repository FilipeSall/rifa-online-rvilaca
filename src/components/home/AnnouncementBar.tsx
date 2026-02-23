import {
  ANNOUNCEMENT_MARKETING_TEXT,
  ANNOUNCEMENT_URGENCY_TEXT,
  ANNOUNCEMENT_URGENCY_THRESHOLD_PERCENT,
} from '../../const/home'
import { usePublicSalesSnapshot } from '../../hooks/usePublicSalesSnapshot'

export default function AnnouncementBar() {
  const { soldPercentage } = usePublicSalesSnapshot()
  const announcementText = soldPercentage >= ANNOUNCEMENT_URGENCY_THRESHOLD_PERCENT
    ? ANNOUNCEMENT_URGENCY_TEXT
    : ANNOUNCEMENT_MARKETING_TEXT

  return (
    <div className="bg-luxury-card border-b border-white/5 text-center py-2 px-4 text-xs font-medium tracking-widest text-gold uppercase hidden md:block">
      {announcementText}
    </div>
  )
}
