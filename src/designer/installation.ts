import type { Cabinet, Design } from './model';
export type InstallationProfile = {
  id: string;
  name: string;
  kind: Cabinet['kind'];
  source: string;
  dimensions: { width: number; depth: number; height: number };
  clearance: { front: number; rear: number; side: number; above: number };
  voltage: number;
  loadAmps: number;
  note: string;
};
export const installationProfiles: InstallationProfile[] = [
  {
    id: 'ge-gts22kgnrww',
    name: 'GE GTS22KGNRWW',
    kind: 'refrigerator',
    source:
      'https://products.geappliances.com/appliance/gea-compare/%26sku%3DGTS22KGNRWW',
    dimensions: { width: 32.75, depth: 34.5, height: 66.375 },
    clearance: { front: 29, rear: 2, side: 0.125, above: 1 },
    voltage: 120,
    loadAmps: 15,
    note: 'GE lists 63½″ depth with door open and 35⅜″ open-door width. Front envelope is the 29″ difference from closed depth; lateral door swing still needs review. Optional ice maker plumbing is not modeled.',
  },
  {
    id: 'bosch-shp65cm5n',
    name: 'Bosch SHP65CM5N',
    kind: 'dishwasher',
    source:
      'https://media3.bosch-home.com/Documents/20595186_SHP65CM5N%20Spec%20Sheet.pdf',
    dimensions: { width: 23.5625, depth: 23.75, height: 33.875 },
    clearance: { front: 24, rear: 0.25, side: 0.21875, above: 0 },
    voltage: 120,
    loadAmps: 12,
    note: 'Specification sheet, April 2025, pp. 1–3: minimum niche 24″ W × 24″ D × 33⅞″ H; 120 V / 60 Hz / 12 A load; minimum supply pressure 14 psi; drain high loop 33–43″ above cabinet floor. Centered niche gaps are derived from niche minus appliance dimensions. Front 24″ is a demo operating envelope, not a sourced minimum.',
  },
];
export const installationDefaults = {
  profile: '',
  voltage: 0,
  circuitAmps: 0,
  water: 'unknown' as const,
  drain: false,
  vent: 'unknown' as const,
  ductDiameter: 0,
  notes: '',
};
export function profileFor(item: Cabinet) {
  return installationProfiles.find(
    (p) => p.id === item.installation?.profile && p.kind === item.kind,
  );
}
export function installationIssues(design: Design) {
  const issues: { id: string; message: string; itemIds: string[] }[] = [];
  for (const item of design.items) {
    const state = item.installation,
      profile = profileFor(item);
    const add = (key: string, message: string) =>
      issues.push({
        id: `install-${item.id}-${key}`,
        message: `${item.sku}: ${message}`,
        itemIds: [item.id],
      });
    if (item.opening) {
      const host = design.items.find(
        (h) => h.id === item.opening?.hostId && h.kind === 'partition',
      );
      if (!host) add('host', 'opening host partition is missing.');
      else if (
        item.width > host.width ||
        item.elevation + item.height > host.elevation + host.height
      )
        add('opening', 'opening exceeds its partition.');
    }
    if (
      ![
        'refrigerator',
        'dishwasher',
        'washing_machine',
        'range',
        'sink',
        'hood',
      ].includes(item.kind)
    )
      continue;
    if (!profile && item.kind !== 'sink')
      add(
        'profile',
        'no verified product profile selected; installation requirements remain unverified.',
      );
    if (profile) {
      if (
        Object.entries(profile.dimensions).some(
          ([k, v]) =>
            Math.abs(item[k as 'width' | 'depth' | 'height'] - v) > 0.01,
        )
      )
        add(
          'dimensions',
          'dimensions differ from the selected manufacturer model.',
        );
      if (!state?.voltage) add('voltage', 'supply voltage is not recorded.');
      else if (state.voltage !== profile.voltage)
        add(
          'voltage',
          `supply voltage differs from the documented ${profile.voltage} V.`,
        );
      if (!state?.circuitAmps)
        add('circuit', 'circuit capacity is not recorded.');
      else if (state.circuitAmps < profile.loadAmps)
        add(
          'circuit',
          `recorded circuit capacity is below the ${profile.loadAmps} A product rating. Breaker sizing still requires the installation manual.`,
        );
      if (state?.profile === 'bosch-shp65cm5n') {
        if (!state.waterPressure || state.waterPressure < 14)
          add(
            'pressure',
            'recorded water pressure is unknown or below 14 psi.',
          );
        if (
          state.drainRise === undefined ||
          state.drainRise < 33 ||
          state.drainRise > 43
        )
          add(
            'loop',
            'drain high loop must be recorded between 33″ and 43″ above the cabinet floor.',
          );
      }
    }
    if (['sink', 'dishwasher', 'washing_machine'].includes(item.kind)) {
      if (!state || state.water === 'unknown' || state.water === 'none')
        add('water', 'water supply connection is not documented.');
      if (!state?.drain) add('drain', 'drain connection is not documented.');
    }
    if (['range', 'hood'].includes(item.kind)) {
      if (!state || state.vent === 'unknown' || state.vent === 'none')
        add('vent', 'ventilation route/type is not documented.');
      if (state?.vent === 'outside' && (!state.ductDiameter || !state.ventCfm))
        add(
          'duct',
          'outside exhaust needs a recorded duct diameter and airflow; manufacturer limits are not yet verified.',
        );
    }
    if (
      state &&
      (!Number.isFinite(state.serviceX) ||
        !Number.isFinite(state.serviceY) ||
        !Number.isFinite(state.serviceZ))
    )
      add('location', 'service connection coordinates are incomplete.');
  }
  return issues;
}
