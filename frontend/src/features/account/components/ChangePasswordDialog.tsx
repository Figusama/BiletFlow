import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../../components/ui/Button'
import FormField from '../../../components/ui/FormField'
import Icon from '../../../components/ui/Icon'
import Input from '../../../components/ui/Input'
import { ApiError } from '../../../shared/api/client'
import { useLanguage } from '../../../shared/i18n/language'
import { changePassword } from '../api'

const MIN_PASSWORD_LENGTH = 8

interface ChangePasswordDialogProps {
    onClose: (changed: boolean) => void
}

const ChangePasswordDialog = ({ onClose }: ChangePasswordDialogProps) => {
    const { t } = useLanguage()
    const texts = t.account.password
    const dialogRef = useRef<HTMLDialogElement>(null)
    const [current, setCurrent] = useState('')
    const [next, setNext] = useState('')
    const [repeat, setRepeat] = useState('')
    const [errors, setErrors] = useState<{ current?: string; next?: string; repeat?: string }>({})
    const [formError, setFormError] = useState('')
    const [isBusy, setIsBusy] = useState(false)

    useEffect(() => {
        dialogRef.current?.showModal()
    }, [])

    const submit = async (submitEvent: FormEvent) => {
        submitEvent.preventDefault()
        const found: typeof errors = {}
        if (!current) found.current = texts.required
        if (next.length < MIN_PASSWORD_LENGTH) found.next = texts.tooShort
        if (repeat !== next) found.repeat = texts.mismatch
        setErrors(found)
        setFormError('')
        if (Object.keys(found).length > 0) return
        setIsBusy(true)
        try {
            await changePassword(current, next)
            onClose(true)
        } catch (caught) {
            if (caught instanceof ApiError && caught.status === 400) setErrors({ current: texts.incorrect })
            else setFormError(texts.failed)
            setIsBusy(false)
        }
    }

    return (
        <dialog
            ref={dialogRef}
            onClose={() => onClose(false)}
            aria-labelledby="password-dialog-title"
            className="m-auto w-[min(480px,calc(100%-2rem))] rounded-2xl border border-border bg-surface p-0 text-foreground backdrop:bg-black/40"
        >
            <form onSubmit={submit} noValidate>
                <div className="flex items-start justify-between gap-4 border-b border-border p-5">
                    <div>
                        <p className="text-xs font-bold tracking-widest text-accent uppercase">{texts.eyebrow}</p>
                        <h2 id="password-dialog-title" className="mt-1 text-lg font-bold">
                            {texts.title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        aria-label={texts.close}
                        onClick={() => dialogRef.current?.close()}
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunk hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        <Icon name="close" className="size-4" />
                    </button>
                </div>

                <div className="flex flex-col gap-4 p-5">
                    <FormField
                        label={texts.current}
                        htmlFor="current-password"
                        error={errors.current}
                        labelAction={
                            <Link to="/auth/forgot-password" className="text-xs font-semibold text-accent hover:underline">
                                {texts.forgot}
                            </Link>
                        }
                    >
                        <Input
                            id="current-password"
                            type="password"
                            autoComplete="current-password"
                            value={current}
                            hasError={Boolean(errors.current)}
                            onChange={(changeEvent) => setCurrent(changeEvent.target.value)}
                        />
                    </FormField>
                    <FormField label={texts.new} htmlFor="new-password" error={errors.next} hint={texts.hint}>
                        <Input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            value={next}
                            hasError={Boolean(errors.next)}
                            onChange={(changeEvent) => setNext(changeEvent.target.value)}
                        />
                    </FormField>
                    <FormField label={texts.repeat} htmlFor="repeat-password" error={errors.repeat}>
                        <Input
                            id="repeat-password"
                            type="password"
                            autoComplete="new-password"
                            value={repeat}
                            hasError={Boolean(errors.repeat)}
                            onChange={(changeEvent) => setRepeat(changeEvent.target.value)}
                        />
                    </FormField>

                    <div className="rounded-xl bg-surface-sunk p-4 text-sm">
                        <p className="font-semibold">{texts.signOutTitle}</p>
                        <p className="mt-1 text-muted">{texts.signOutText}</p>
                    </div>

                    {formError && (
                        <p role="alert" className="text-sm text-error">
                            {formError}
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t border-border p-4">
                    <Button type="button" variant="secondary" shape="pill" disabled={isBusy} onClick={() => dialogRef.current?.close()}>
                        {texts.cancel}
                    </Button>
                    <Button type="submit" shape="pill" disabled={isBusy}>
                        {texts.change}
                    </Button>
                </div>
            </form>
        </dialog>
    )
}

export default ChangePasswordDialog
