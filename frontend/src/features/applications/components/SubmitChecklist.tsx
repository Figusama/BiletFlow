import Icon from '../../../components/ui/Icon'
import { useLanguage } from '../../../shared/i18n/language'
import { CHECKLIST } from '../form'

interface SubmitChecklistProps {
    missing: string[]
}

const SubmitChecklist = ({ missing }: SubmitChecklistProps) => {
    const { t } = useLanguage()

    return (
        <ul className="flex flex-col gap-2.5 text-sm">
            {CHECKLIST.map((item) => {
                const isDone = item.codes.every((code) => !missing.includes(code))
                return (
                    <li key={item.key} className="flex items-center gap-2.5">
                        {isDone ? (
                            <Icon name="check-circle" className="size-5 text-success" />
                        ) : (
                            <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-border-strong" />
                        )}
                        <span className={isDone ? 'text-foreground' : 'text-muted'}>{t.application.checklist[item.key]}</span>
                    </li>
                )
            })}
        </ul>
    )
}

export default SubmitChecklist
