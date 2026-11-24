import type { ChangeEvent } from 'react'
import Icon from '../../../components/ui/Icon'
import { useLanguage } from '../../../shared/i18n/language'
import type { ApplicationImage } from '../api'

const MAX_IMAGES = 10

interface ImageUploaderProps {
    images: ApplicationImage[]
    isEditable: boolean
    isUploading: boolean
    error: string
    onUpload: (file: File) => void
    onRemove: (imageId: string) => void
    onMakeCover: (imageId: string) => void
}

const ImageUploader = ({ images, isEditable, isUploading, error, onUpload, onRemove, onMakeCover }: ImageUploaderProps) => {
    const { t } = useLanguage()

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) onUpload(file)
    }

    return (
        <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {images.map((image, index) => (
                    <figure key={image.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-sunk">
                        <img src={image.url} alt="" className="size-full object-cover" />
                        {index === 0 && (
                            <figcaption className="absolute top-2 left-2 rounded-md bg-night px-2 py-0.5 text-xs font-semibold text-on-night">
                                {t.application.cover}
                            </figcaption>
                        )}
                        {isEditable && (
                            <>
                                <button
                                    type="button"
                                    aria-label={t.application.removeImage}
                                    onClick={() => onRemove(image.id)}
                                    className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-night/80 text-on-night hover:bg-night"
                                >
                                    <Icon name="close" className="size-4" />
                                </button>
                                {index > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onMakeCover(image.id)}
                                        className="absolute bottom-2 left-2 rounded-md bg-night/80 px-2 py-0.5 text-xs font-semibold text-on-night hover:bg-night"
                                    >
                                        {t.application.makeCover}
                                    </button>
                                )}
                            </>
                        )}
                    </figure>
                ))}

                {isEditable && images.length < MAX_IMAGES && (
                    <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-strong text-sm font-semibold text-muted hover:border-accent hover:text-accent has-disabled:cursor-wait">
                        <Icon name="plus" />
                        {isUploading ? t.application.uploading : t.application.upload}
                        <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isUploading}
                            onChange={handleChange}
                            className="sr-only"
                        />
                    </label>
                )}
            </div>

            {error && (
                <p role="alert" className="mt-2 text-sm text-error">
                    {error}
                </p>
            )}
        </div>
    )
}

export default ImageUploader
