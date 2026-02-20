import { ANNOUNCEMENT_TEXT } from '../../const/home'

export default function AnnouncementBar() {
  return (
    <div className="bg-luxury-card border-b border-white/5 text-center py-2 px-4 text-xs font-medium tracking-widest text-gold uppercase hidden md:block">
      {ANNOUNCEMENT_TEXT}
    </div>
  )
}
