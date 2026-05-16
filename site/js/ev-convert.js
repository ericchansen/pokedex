/**
 * ev-convert.js — Cross-scale EV/IV conversion for bulk Showdown export.
 *
 * Pokémon Champions uses a 0–32 SP per-stat / 66 SP total system. Classic
 * (SV / SwSh / Showdown VGC) uses 0–252 EV per-stat / 510 EV total + 0–31 IVs.
 *
 * The two systems use DIFFERENT stat formulas:
 *
 *   Champions (from Showdown data/mods/champions/scripts.ts):
 *     HP    = Base + SP + 75
 *     Other = (Base + SP + 20) × Nature
 *     → 1 SP = exactly 1 stat point (no level scaling)
 *
 *   Classic Gen 9 at Level 50:
 *     HP    = ⌊(2·Base + IV + ⌊EV/4⌋) × 50/100⌋ + 60
 *     Other = ⌊(⌊(2·Base + IV + ⌊EV/4⌋) × 50/100⌋ + 5) × Nature⌋
 *     → ⌊EV/4⌋ gets halved by the ×50/100 step, so ~8 EVs ≈ 1 stat point
 *
 * Therefore 1 SP ≈ 8 EVs at Level 50. The caps align well:
 *   32 SP × 8 = 256 → capped at 252 per stat
 *   66 SP × 8 = 528 → capped at 510 total
 *
 * This is an approximation — the formulas are structurally different so no
 * single multiplier is exact across all base stats and natures. ×8 is the
 * closest Level 50 heuristic and fills the Classic EV budget correctly.
 */

export const EvConvert = (() => {
  const emptySpread = DomainMappers.emptySpread;
  const STAT_KEYS = DomainMappers.STAT_KEYS;
  const CHAMPIONS_PER_STAT_CAP = 32;
  const CHAMPIONS_TOTAL_CAP = 66;
  const CLASSIC_PER_STAT_CAP = 252;
  const CLASSIC_TOTAL_CAP = 510;

  function normalize(spread) {
    if (!spread) return emptySpread();
    const out = emptySpread();
    for (const k of STAT_KEYS) out[k] = Math.max(0, Math.floor(Number(spread[k] || 0)));
    return out;
  }

  function total(spread) {
    return STAT_KEYS.reduce((s, k) => s + (spread[k] || 0), 0);
  }

  /**
   * Champions SP → Classic EVs.
   * Heuristic: 1 SP ≈ 8 EVs at Level 50, capped at 252 per stat / 510 total.
   * When ×8 exceeds 510 total, trims 4 EVs at a time from the smallest
   * non-zero stats to preserve the "max/max/dump" shape of typical spreads.
   * All output values are multiples of 4 (sub-4 EVs contribute nothing in
   * the classic formula due to ⌊EV/4⌋).
   */
  function championsToClassic(championsEvs) {
    const sp = normalize(championsEvs);
    const out = emptySpread();
    for (const k of STAT_KEYS) {
      const raw = sp[k] * 8;
      // Floor to multiple of 4, then cap at 252
      out[k] = Math.min(Math.floor(raw / 4) * 4, CLASSIC_PER_STAT_CAP);
    }
    // Trim from smallest non-zero stats in 4-EV chunks to fit 510 cap
    while (total(out) > CLASSIC_TOTAL_CAP) {
      let minKey = null;
      let minVal = Infinity;
      for (const k of STAT_KEYS) {
        if (out[k] > 0 && out[k] < minVal) { minVal = out[k]; minKey = k; }
      }
      if (!minKey) break;
      out[minKey] = Math.max(0, out[minKey] - 4);
    }
    return out;
  }

  /**
   * Classic EVs → Champions SP. Lossy — the formulas are structurally different.
   * Algorithm:
   *   1. SP = round(EV / 8)               — closest L50 stat-equivalence
   *   2. clamp each SP to [0, 32]          — per-stat cap
   *   3. while sum > 66, decrement the largest SP — total cap
   */
  function classicToChampions(classicEvs) {
    const ev = normalize(classicEvs);
    const out = emptySpread();
    for (const k of STAT_KEYS) {
      out[k] = Math.min(Math.round(ev[k] / 8), CHAMPIONS_PER_STAT_CAP);
    }
    while (total(out) > CHAMPIONS_TOTAL_CAP) {
      // Find the largest stat (ties: prefer later index in STAT_KEYS so HP/Atk are preserved when possible)
      let maxKey = STAT_KEYS[0];
      let maxVal = out[maxKey];
      for (const k of STAT_KEYS) {
        if (out[k] >= maxVal) { maxVal = out[k]; maxKey = k; }
      }
      if (maxVal <= 0) break;
      out[maxKey] -= 1;
    }
    return out;
  }

  function spreadsEqual(a, b) {
    const na = normalize(a);
    const nb = normalize(b);
    return STAT_KEYS.every((k) => na[k] === nb[k]);
  }

  /**
   * Decide what EVs/IVs to emit for a given target system, given a build.
   * Returns: {
   *   evs:        spread for the target system (always present, never null)
   *   ivs:        IV spread or null. Null means "omit IVs line" (defaults to 31).
   *   evSystem:   'classic' | 'champions' (the target)
   *   converted:  true if conversion happened (warn the user)
   *   fromSystem: 'classic' | 'champions' | null — source system when converted
   *   note:       short human-readable summary of the situation
   * }
   */
  function evsForTarget(build, targetSystem) {
    const evs = (build && build.evs) || {};
    const target = targetSystem === 'champions' ? 'champions' : 'classic';

    let stored = null;
    if (evs[target]) stored = normalize(evs[target]);

    if (stored) {
      return {
        evs: stored,
        ivs: target === 'classic' ? pickClassicIvs(build, evs) : null,
        evSystem: target,
        converted: false,
        fromSystem: null,
        note: '',
      };
    }

    // Need conversion. Pick the source system from the explicit per-system spread.
    let sourceSystem = null;
    let sourceEvs = null;
    if (target === 'classic' && evs.champions) {
      sourceSystem = 'champions';
      sourceEvs = normalize(evs.champions);
    } else if (target === 'champions' && evs.classic) {
      sourceSystem = 'classic';
      sourceEvs = normalize(evs.classic);
    }

    if (!sourceEvs) {
      // No EVs at all — emit empty spread, omit IVs. formatMember will skip both lines.
      return {
        evs: emptySpread(),
        ivs: null,
        evSystem: target,
        converted: false,
        fromSystem: null,
        note: '',
      };
    }

    let convertedEvs;
    let note;
    if (sourceSystem === 'champions' && target === 'classic') {
      convertedEvs = championsToClassic(sourceEvs);
      const used = total(convertedEvs);
      const remaining = CLASSIC_TOTAL_CAP - used;
      note = remaining > 0
        ? `Converted from Champions SP (×8 heuristic). Uses ${used} of 510 EVs (${remaining} unspent).`
        : `Converted from Champions SP (×8 heuristic). Uses ${used} of 510 EVs.`;
    } else if (sourceSystem === 'classic' && target === 'champions') {
      convertedEvs = classicToChampions(sourceEvs);
      const totalSp = total(convertedEvs);
      const headroom = CHAMPIONS_TOTAL_CAP - totalSp;
      const clamped = STAT_KEYS.filter((k) => Math.round(sourceEvs[k] / 8) > CHAMPIONS_PER_STAT_CAP);
      const detail = [];
      if (clamped.length) detail.push(`${clamped.length} stat(s) clamped to 32 SP`);
      if (headroom > 0) detail.push(`${headroom} SP unspent`);
      note = `Converted from Classic EVs (÷8 heuristic, lossy)${detail.length ? ` — ${detail.join(', ')}` : ''}. Round-trip back to Classic will not recover the original spread.`;
    }

    return {
      evs: convertedEvs,
      // Champions doesn't model IVs; for Classic exports converted from Champions, default to 31s (omit line).
      ivs: target === 'classic' && sourceSystem !== 'champions' ? pickClassicIvs(build, evs) : null,
      evSystem: target,
      converted: sourceSystem !== target,
      fromSystem: sourceSystem,
      note,
    };
  }

  function pickClassicIvs(build, evs) {
    if (evs && evs.classic_ivs) return evs.classic_ivs;
    if (build && build.ivs) return build.ivs;
    return null;
  }

  /**
   * Build a Showdown export-ready member object for the target system.
   * Drops Tera Type when target === 'champions' (Champions has no Tera mechanic).
   */
  function memberForTarget(build, targetSystem) {
    const conv = evsForTarget(build, targetSystem);
    const member = {
      ...build,
      evs: { [targetSystem]: conv.evs },
    };
    if (conv.ivs) member.evs.classic_ivs = conv.ivs;
    delete member.ivs; // IVs are now inside structured evs
    if (targetSystem === 'champions') delete member.tera_type;
    return { member, conversion: conv };
  }

  // Self-test (runs once on load; logs to console only on failure).
  function selfTest() {
    const cases = [
      // 32/0/0/0/32/2 × 8 = 256/0/0/0/256/16 → cap per-stat → 252/0/0/0/252/16 = 520 → trim smallest → 252/0/0/0/252/8 = 512 → trim → 252/0/0/0/252/4 = 508
      { name: 'champions→classic ×8 with overflow trim',
        in: { evs: { champions: { hp: 32, atk: 0, def: 0, spa: 0, spd: 32, spe: 2 } } },
        target: 'classic',
        expectEvs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 252, spe: 4 },
        expectConverted: true },
      // 252/8 = 31.5 → round → 32, 4/8 = 0.5 → round → 1, 252/8 = 32
      { name: 'classic→champions ÷8 round',
        in: { evs: { classic: { hp: 0, atk: 252, def: 4, spa: 0, spd: 0, spe: 252 } } },
        target: 'champions',
        expectEvs: { hp: 0, atk: 32, def: 1, spa: 0, spd: 0, spe: 32 },
        expectConverted: true },
      { name: 'classic→champions clamp + trim',
        in: { evs: { classic: { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } } },
        target: 'champions',
        // 252/8 round = 32 each → 32/32/0/0/0/32 = 96 → trim to 66
        expectTotalLte: 66,
        expectConverted: true },
      { name: 'pass-through native classic',
        in: { evs: { classic: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } } },
        target: 'classic',
        expectConverted: false },
      { name: 'pass-through native champions',
        in: { evs: { champions: { hp: 4, atk: 30, def: 0, spa: 0, spd: 0, spe: 32 } } },
        target: 'champions',
        expectConverted: false },
      { name: 'no EVs at all → empty spread',
        in: { evs: {} },
        target: 'classic',
        expectEvs: emptySpread(),
        expectConverted: false },
      // Scovillain-style: 32/0/25/0/9/0 × 8 = 256/0/200/0/72/0 → cap → 252/0/200/0/72/0 = 524 → trim smallest (72→68→…) until ≤510
      { name: 'champions→classic Scovillain build fills budget',
        in: { evs: { champions: { hp: 32, atk: 0, def: 25, spa: 0, spd: 9, spe: 0 } } },
        target: 'classic',
        expectTotalLte: CLASSIC_TOTAL_CAP,
        expectConverted: true,
        expectMinTotal: 500 },
      // Small spreads: 10/10/10/10/10/10 × 8 = 80 each = 480 total (no trimming needed)
      { name: 'champions→classic even spread no overflow',
        in: { evs: { champions: { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 } } },
        target: 'classic',
        expectEvs: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
        expectConverted: true },
      // Classic EVs not a multiple of 8: 12 EVs → round(12/8) = round(1.5) = 2 SP
      { name: 'classic→champions non-multiple-of-8',
        in: { evs: { classic: { hp: 12, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } } },
        target: 'champions',
        expectEvs: { hp: 2, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        expectConverted: true },
    ];
    let failures = 0;
    for (const c of cases) {
      const res = evsForTarget(c.in, c.target);
      if (c.expectEvs && !spreadsEqual(res.evs, c.expectEvs)) {
        console.error('[EvConvert] FAIL', c.name, 'evs', res.evs, 'expected', c.expectEvs);
        failures++;
      }
      if (c.expectTotalLte != null && total(res.evs) > c.expectTotalLte) {
        console.error('[EvConvert] FAIL', c.name, 'total', total(res.evs), '> cap', c.expectTotalLte);
        failures++;
      }
      if (c.expectMinTotal != null && total(res.evs) < c.expectMinTotal) {
        console.error('[EvConvert] FAIL', c.name, 'total', total(res.evs), '< min', c.expectMinTotal);
        failures++;
      }
      if (c.expectConverted !== undefined && res.converted !== c.expectConverted) {
        console.error('[EvConvert] FAIL', c.name, 'converted', res.converted, 'expected', c.expectConverted);
        failures++;
      }
    }
    if (failures === 0) {
      // Quiet success — only log in dev tools console at debug level
      console.debug('[EvConvert] self-test passed (' + cases.length + ' cases)');
    }
  }
  try { selfTest(); } catch (e) { console.error('[EvConvert] self-test threw', e); }

  return {
    championsToClassic,
    classicToChampions,
    evsForTarget,
    memberForTarget,
    CHAMPIONS_PER_STAT_CAP,
    CHAMPIONS_TOTAL_CAP,
    CLASSIC_PER_STAT_CAP,
    CLASSIC_TOTAL_CAP,
  };
})();

if (typeof window !== 'undefined') window.EvConvert = EvConvert;
