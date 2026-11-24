const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export const formatKzt = (minor: number): string => `${numberFormat.format(minor / 100)} ₸`
