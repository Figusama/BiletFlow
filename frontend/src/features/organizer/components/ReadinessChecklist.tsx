import Icon, { type IconName } from '../../../components/ui/Icon'
import { useLanguage } from '../../../shared/i18n/language'
import type { ReadinessCheck, ReadinessState } from '../readiness'

const stateIcon: Record<ReadinessState, { name: IconName; className: string }> = {
    done: { name: 'check-circle', className: 'text-success' },
    missing: { name: 'x-circle', className: 'text-danger' },
    blocked: { name: 'ban', className: 'text-warning' },
}

const ReadinessChecklist = ({ checks }: { checks: ReadinessCheck[] }) => {
    const { t } = useLanguage()
    const doneCount = checks.filter((check) => check.state === 'done').length

    return (
        <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-bold text-foreground">{t.organizerEvent.readinessTitle}</h2>
                <span className="text-sm text-muted">{t.organizerEvent.readinessCount(doneCount, checks.length)}</span>
            </div>

            <ul className="mt-4 divide-y divide-border">
                {checks.map(({ key, state }) => {
                    const texts = t.organizerEvent.readiness[key]
                    const hint = state === 'blocked' && 'blocked' in texts ? texts.blocked : state !== 'done' ? texts.missing : null
                    const icon = stateIcon[state]

                    return (
                        <li key={key} className="flex gap-3 py-3">
                            <Icon name={icon.name} className={`mt-0.5 size-5 ${icon.className}`} />
                            <div>
                                <p className="font-semibold text-foreground">{texts.title}</p>
                                {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
                            </div>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

export default ReadinessChecklist
