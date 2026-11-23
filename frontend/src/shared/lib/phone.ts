const KZ_MOBILE_PREFIXES = new Set([
    '700', '701', '702', '705', '706', '707', '708',
    '747', '771', '775', '776', '777', '778',
])

export const validateKzMobilePhone = (value: string): true | string => {
    if (!/^7\d{10}$/.test(value)) {
        return 'Enter a complete phone number'
    }

    if (!KZ_MOBILE_PREFIXES.has(value.slice(1, 4))) {
        return 'Enter a valid Kazakhstan mobile number'
    }

    return true
}