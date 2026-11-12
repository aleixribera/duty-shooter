import type { Plugin } from 'vite';

/**
 * Fixes to three.js's WebGPU build (0.186), applied as it is bundled
 * (next-level ticket 35), each making the same picture cheaper.
 *
 * - An instanced mesh of up to 1024 instances keeps its matrices in a uniform
 *   buffer that three uploads again for every pass of every frame, whether a
 *   matrix moved or not (`Buffer.update` is always true). Each matrix buffer
 *   now says which attribute it mirrors, and is uploaded only when that
 *   attribute's `version` moved. Code that writes matrices sets `needsUpdate`,
 *   as three's other paths already require.
 * - With velocity drawn, each instanced mesh copies its whole matrix array to
 *   last frame's after every pass. It now copies only when the matrices
 *   changed since the last copy: until they do, last frame's are the same.
 * - The scene's background (the game's sky, clouds and sun) was drawn first,
 *   with no depth test, so every pixel of the screen ran the sky's shader and
 *   the world then covered most of them. It is now drawn after the opaque
 *   world and before what is see-through, tested against the depth the world
 *   left: it sits on the far plane, so it fills only the pixels nothing else
 *   did, and glass, smoke and particles still blend over it.
 * - A material with a colour node casts its shadow through a colour node three
 *   built for that material alone, so materials sharing one colour node (every
 *   soldier's body) each built a shadow shader of their own the first time
 *   they cast a shadow. A material whose shadow depends on its colour node
 *   alone now gets the one shadow node made for that colour node.
 *
 * A pattern that is missing (three changed) fails the build: the fix is
 * checked against the new code, never silently dropped. The dev server keeps
 * its bundle of three until three changes: after editing the patches, start
 * it with `--force`.
 */

/** [what to find, what it becomes], each found exactly once. */
export const THREE_PATCHES: readonly (readonly [string, string])[] = [
  [
    "instanceMatrixNode = buffer( instanceMatrix.array, 'mat4', matrixCount ).element( instanceIndex );",
    "const matrixBuffer = buffer( instanceMatrix.array, 'mat4', matrixCount );\n\t\t\tmatrixBuffer.versionSource = instanceMatrix;\n\t\t\tinstanceMatrixNode = matrixBuffer.element( instanceIndex );",
  ],
  [
    'class NodeUniformBuffer extends UniformBuffer {',
    `const _uploadedVersions = new WeakMap();

class NodeUniformBuffer extends UniformBuffer {

	update() {

		const source = this.nodeUniform && this.nodeUniform.versionSource;
		if ( source === undefined ) return true;
		if ( _uploadedVersions.get( this ) === source.version ) return false;
		_uploadedVersions.set( this, source.version );
		return true;

	}
`,
  ],
  [
    "\t\t\t\tnodeMaterial.name = 'Background.material';\n\t\t\t\tnodeMaterial.side = BackSide;\n\t\t\t\tnodeMaterial.depthTest = false;",
    "\t\t\t\tnodeMaterial.name = 'Background.material';\n\t\t\t\tnodeMaterial.side = BackSide;\n\t\t\t\tnodeMaterial.depthTest = true;",
  ],
  [
    'renderList.unshift( backgroundMesh, backgroundMesh.geometry, backgroundMesh.material, 0, 0, null, null );',
    'renderList.push( backgroundMesh, backgroundMesh.geometry, backgroundMesh.material, 0, 0, null, null );',
  ],
  [
    `			previousInstanceMatrix.array.set( matrices.array );
			previousInstanceMatrix.version = matrices.version;

			// handle interleaved path

			const previousInterleavedMatrix = _matrixBuffers.get( previousInstanceMatrix );

			if ( previousInterleavedMatrix !== undefined ) previousInterleavedMatrix.version = matrices.version;
`,
    `			if ( previousInstanceMatrix.version === matrices.version ) return;

			previousInstanceMatrix.array.set( matrices.array );
			previousInstanceMatrix.version = matrices.version;

			// handle interleaved path

			const previousInterleavedMatrix = _matrixBuffers.get( previousInstanceMatrix );

			if ( previousInterleavedMatrix !== undefined ) previousInterleavedMatrix.version = matrices.version;
`,
  ],
  [
    `				colorNode = vec4( shadowRGB, shadowAlpha );

				if ( hasMaskNode ) {`,
    `				if ( hasColorNode && ! hasMap && ! hasCastShadowNode && ! hasMaskNode ) {

					colorNode = _shadowColorNodes.get( material.colorNode );
					if ( colorNode === undefined ) _shadowColorNodes.set( material.colorNode, colorNode = vec4( shadowRGB, shadowAlpha ) );

				} else {

					colorNode = vec4( shadowRGB, shadowAlpha );

				}

				if ( hasMaskNode ) {`,
  ],
  ['\nclass Renderer {', '\nconst _shadowColorNodes = new WeakMap();\n\nclass Renderer {'],
];

/** The WebGPU builds the patches apply to. */
const PATCHED = /[\\/]three[\\/]build[\\/]three\.webgpu(\.nodes)?\.js$/;

/** `code` with every patch applied; throws naming the first that is not found exactly once. */
export function patchThree(code: string): string {
  const unix = code.includes('\r\n') ? code.replace(/\r\n/g, '\n') : code;
  let out = unix;
  for (const [find, replace] of THREE_PATCHES) {
    const at = out.indexOf(find);
    if (at < 0 || out.indexOf(find, at + 1) >= 0) throw new Error(`three-patch: expected exactly one of ${JSON.stringify(find.slice(0, 80))} in three.webgpu.js (has three been upgraded?)`);
    out = out.slice(0, at) + replace + out.slice(at + find.length);
  }
  return out;
}

/** The patches, for the build and for the dev server's pre-bundling of dependencies. */
export function threePatch(): Plugin {
  return {
    name: 'duty-three-patch',
    transform(code, id) {
      if (!PATCHED.test(id.split('?')[0]!)) return null;
      return { code: patchThree(code), map: null };
    },
  };
}
