import { IMPORT_EMPTY_MS, IMPORT_QUIET_MS } from '../backends/backend';
import { ImportTracker } from '../backends/imports';

describe('ImportTracker', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('holds a new network until its chats stop arriving', () => {
    const onChange = jest.fn();
    const t = new ImportTracker(onChange);
    t.setBaseline(['whatsapp']);

    t.begin('instagram', false);
    expect(t.list()).toEqual([{ network: 'instagram', found: 0 }]);

    t.activity('instagram', 3);
    jest.advanceTimersByTime(IMPORT_QUIET_MS - 2000);
    t.activity('instagram', 5); // still arriving: the quiet period restarts
    jest.advanceTimersByTime(IMPORT_QUIET_MS - 2000);
    expect(t.isImporting('instagram')).toBe(true);

    jest.advanceTimersByTime(4000);
    expect(t.isImporting('instagram')).toBe(false);
    expect(onChange).toHaveBeenCalled();
    t.stop();
  });

  it('does not treat reconnecting an existing network as an import', () => {
    const t = new ImportTracker(() => {});
    t.setBaseline(['whatsapp']);
    t.begin('whatsapp', true);
    t.activity('whatsapp', 40);
    expect(t.list()).toEqual([]);
  });

  it('notices chats for a network connected from elsewhere', () => {
    const t = new ImportTracker(() => {});
    t.setBaseline(['whatsapp']);
    t.activity('signal', 1);
    expect(t.isImporting('signal')).toBe(true);
    t.stop();
  });

  it('gives up on an account that never produces chats', () => {
    const t = new ImportTracker(() => {});
    t.setBaseline([]);
    t.begin('telegram', false);
    jest.advanceTimersByTime(IMPORT_EMPTY_MS + 2000);
    expect(t.isImporting('telegram')).toBe(false);
  });
});
