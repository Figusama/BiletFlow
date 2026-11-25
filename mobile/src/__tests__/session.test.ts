import { bumpDevice, deviceCount, sessionInitials, setSessionEmail } from '../session';

describe('session', () => {
  it('инициалы берутся из email', () => {
    setSessionEmail('admin@test.kz');
    expect(sessionInitials()).toBe('AD');
  });
  it('без email показывает ME', () => {
    setSessionEmail('');
    expect(sessionInitials()).toBe('ME');
  });
  it('счётчик устройства не уходит ниже нуля', () => {
    bumpDevice('e1', 2);
    bumpDevice('e1', -5);
    expect(deviceCount('e1')).toBe(0);
  });
});
