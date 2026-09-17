'use client';

import * as THREE from 'three';

/**
 * Turning a cube capture into one equirectangular strip.
 *
 * Two callers want the same projection and must not disagree about it: the
 * 360 export a client looks at, and the reflection every metal and polished
 * surface in the room wears. Only the destination differs - the export is
 * drawn to the canvas so the renderer tone maps and encodes it like the view
 * on screen, while a reflection stays linear in a target, because it is
 * light rather than a picture.
 */
export function equirectangularFromCube(
  renderer: THREE.WebGLRenderer,
  cube: THREE.CubeTexture,
  target: THREE.WebGLRenderTarget | null,
  whiteBalance: [number, number, number] = [1, 1, 1],
) {
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        tCube: { value: cube },
        whiteBalance: { value: new THREE.Vector3(...whiteBalance) },
      },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      // The two includes are what the composer's balance and output passes
      // do to every other frame: the same white balance, the same tone
      // curve at the same exposure, the same sRGB write. Three applies none
      // of them when a render goes to a target, which is what keeps a
      // reflection linear and an export looking like the screen.
      fragmentShader: `
        uniform samplerCube tCube;
        uniform vec3 whiteBalance;
        varying vec2 vUv;
        void main(){
          float lon = (vUv.x - 0.5) * 6.2831853;
          float lat = (vUv.y - 0.5) * 3.1415927;
          vec3 dir = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
          gl_FragColor = vec4(textureCube(tCube, dir).rgb * whiteBalance, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const scene = new THREE.Scene().add(quad);
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, new THREE.Camera());
  } finally {
    renderer.setRenderTarget(null);
    quad.geometry.dispose();
    (quad.material as THREE.Material).dispose();
  }
}
