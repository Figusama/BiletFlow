// formatKzt(150000) -> 1 500 тенге 
export const formatKzt = (minor: number): string => {
    return (minor / 100).toLocaleString('kk-KZ', {
        style: 'currency',
        currency: 'KZT'
    });
}