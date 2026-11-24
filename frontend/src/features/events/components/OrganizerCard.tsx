import { useLanguage } from '../../../shared/i18n/language'
import type { EventDetails } from '../api'

const OrganizerCard = ({ event }: { event: EventDetails }) => {
    const { t } = useLanguage()
    const { public_contact_name: name, public_contact_email: email, public_contact_phone: phone } = event

    if (!name && !email && !phone) {
        return <p className="text-sm text-muted">{t.eventPage.noContacts}</p>
    }

    return (
        <>
            {name && <p className="font-semibold text-foreground">{name}</p>}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                {email && (
                    <a href={`mailto:${email}`} className="text-accent hover:underline">
                        {email}
                    </a>
                )}
                {phone && (
                    <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-accent hover:underline">
                        {phone}
                    </a>
                )}
            </p>
        </>
    )
}

export default OrganizerCard
