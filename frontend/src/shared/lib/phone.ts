const KZ_MOBILE_PREFIXES = new Set([
    '700', '701', '702', '705', '706', '707', '708',
    '747', '771', '775', '776', '777', '778',
])

export type PhoneError = 'phoneIncomplete' | 'phoneInvalid'

export const validateKzMobilePhone = (value: string): true | PhoneError => {
    if (!/^7\d{10}$/.test(value)) {
        return 'phoneIncomplete'
    }

    if (!KZ_MOBILE_PREFIXES.has(value.slice(1, 4))) {
        return 'phoneInvalid'
    }

    return true
}