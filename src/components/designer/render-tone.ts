'use client';

import * as THREE from 'three';

/**
 * The curve that turns light into an image, chosen rather than inherited.
 *
 * Every path here shares it - the live view, the still export, the
 * panorama and the path-traced photo - because a client comparing two of
 * them is entitled to see the same kitchen.
 *
 * Khronos PBR Neutral, not ACES Filmic. Measured on three finishes side by
 * side under the same light: ACES lifted a navy front from the colour it
 * was painted to a grey-blue, and took the warmth out of a cream door;
 * AgX, which rolls highlights off most gently of the three, did both
 * harder. Neutral held the navy near its own colour and left the cream
 * cream. The scene it was chosen against clipped 0.01% of its pixels under
 * all three, so the highlight roll-off that ACES and AgX are praised for
 * had nothing to do in a kitchen lit like a kitchen - and this product's
 * whole job at that moment is to show someone the door finish they are
 * choosing.
 */
export const toneCurve = THREE.NeutralToneMapping;
