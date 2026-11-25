import { resolveUrls } from '../env';

describe('resolveUrls', () => {
  it('без настроек: localhost, порты 8000 и 5173', () => {
    expect(resolveUrls({})).toEqual({ api: 'http://localhost:8000', web: 'http://localhost:5173' });
  });
  it('EXPO_PUBLIC_HOST задаёт оба адреса', () => {
    expect(resolveUrls({ EXPO_PUBLIC_HOST: ' 10.0.0.5 ' })).toEqual({ api: 'http://10.0.0.5:8000', web: 'http://10.0.0.5:5173' });
  });
  it('полные адреса имеют приоритет, косая черта на конце убирается', () => {
    expect(resolveUrls({ EXPO_PUBLIC_HOST: '1.2.3.4', EXPO_PUBLIC_API_URL: 'https://api.example.kz/', EXPO_PUBLIC_WEB_URL: 'https://example.kz//' })).toEqual({
      api: 'https://api.example.kz',
      web: 'https://example.kz',
    });
  });
  it('пустые значения считаются незаданными', () => {
    expect(resolveUrls({ EXPO_PUBLIC_HOST: '  ', EXPO_PUBLIC_API_URL: '' }).api).toBe('http://localhost:8000');
  });
});
