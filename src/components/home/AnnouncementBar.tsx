import {
  ANNOUNCEMENT_PRELAUNCH_TEXT,
  ANNOUNCEMENT_MARKETING_TEXT,
  ANNOUNCEMENT_URGENCY_TEXT,
  ANNOUNCEMENT_URGENCY_THRESHOLD_PERCENT,
} from '../../const/home'
import { useCampaignSettings } from '../../hooks/useCampaignSettings'
import { usePublicSalesSnapshot } from '../../hooks/usePublicSalesSnapshot'
import { parseCampaignDateTime } from '../../utils/campaignSchedule'

export default function AnnouncementBar() {
  const { soldPercentage } = usePublicSalesSnapshot()
  const { campaign } = useCampaignSettings()
  const startsAtMs = parseCampaignDateTime(campaign.startsAt, campaign.startsAtTime, false)
  const isCampaignNotStarted = campaign.status === 'scheduled'
    || (startsAtMs !== null && Date.now() < startsAtMs)
  const announcementText = isCampaignNotStarted
    ? ANNOUNCEMENT_PRELAUNCH_TEXT
    : soldPercentage >= ANNOUNCEMENT_URGENCY_THRESHOLD_PERCENT
      ? ANNOUNCEMENT_URGENCY_TEXT
      : ANNOUNCEMENT_MARKETING_TEXT

  return (
    <div className="bg-luxury-card border-b border-white/5 text-center py-2 px-4 text-xs font-medium tracking-widest text-gold uppercase hidden md:block">
      {announcementText}
    </div>
  )
}
