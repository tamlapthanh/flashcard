import { describe, expect, it } from 'vitest';
import { applyRemoteSettings, normalizeSettings, settings, STROKE_TOLERANCE, syncPayload } from '../src/settings';

/* `dark` is always given: without it the normaliser asks the browser (matchMedia), which Node does not have. */
const norm = (input: Record<string, unknown>, ...rest: [boolean?, ('strict' | 'normal' | 'loose')?]) => normalizeSettings({ dark: false, ...input }, ...rest);

describe('stroke strictness', () => {
  it('is "normal" unless a valid value is given', () => {
    expect(norm({}).strokeStrictness).toBe('normal');
    expect(norm({ strokeStrictness: 'loose' }).strokeStrictness).toBe('loose');
    expect(norm({ strokeStrictness: 'strict' }).strokeStrictness).toBe('strict');
    expect(norm({ strokeStrictness: 'wild' }).strokeStrictness).toBe('normal');
    expect(norm({ strokeStrictness: 3 }).strokeStrictness).toBe('normal');
  });

  it('a value that is missing falls back to the one passed in (the local one, when the server sent settings without it)', () => {
    expect(norm({}, true, 'loose').strokeStrictness).toBe('loose');
    expect(norm({ strokeStrictness: 'strict' }, true, 'loose').strokeStrictness).toBe('strict');
  });

  it('is a setting of this device: not sent to the server, and not replaced by what the server holds', () => {
    settings.strokeStrictness = 'loose';
    const sent = syncPayload(settings) as Record<string, unknown>;
    expect('strokeStrictness' in sent).toBe(false);
    expect('showTooltips' in sent).toBe(false);
    expect(sent.autoFrontSec).toBeDefined(); // the rest still goes

    applyRemoteSettings({ dark: true }); // the server's copy knows nothing about it
    expect(settings.strokeStrictness).toBe('loose');
    expect(settings.dark).toBe(true);
    settings.strokeStrictness = 'normal';
    settings.dark = false;
  });

  it('maps to a tolerance: strict is tighter than normal, loose is more forgiving', () => {
    expect(STROKE_TOLERANCE.normal).toBe(1);
    expect(STROKE_TOLERANCE.strict).toBeLessThan(1);
    expect(STROKE_TOLERANCE.loose).toBeGreaterThan(1);
  });
});
