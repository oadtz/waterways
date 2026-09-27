import { LayerExtension } from '@deck.gl/core';

// Turns SolidPolygonLayer walls into light curtains: full colour at the river, brightening and
// fading toward the crest. Side vertices carry positions.y = 0 at the base and 1 at the top;
// the thin top cap counts as the crest.
export class WallGradientExtension extends LayerExtension<{ fadeTo: number; lift: number }> {
  static extensionName = 'WallGradientExtension';

  // deck.gl invokes this with the layer as `this` and the extension as the argument.
  getShaders(this: unknown, extension: WallGradientExtension) {
    const { fadeTo, lift } = extension.opts;
    return {
      inject: {
        'vs:#decl': 'out float vWallT;',
        'vs:DECKGL_FILTER_COLOR': `
          #ifdef IS_SIDE_VERTEX
            vWallT = positions.y;
          #else
            vWallT = 1.0;
          #endif
        `,
        'fs:#decl': 'in float vWallT;',
        'fs:DECKGL_FILTER_COLOR': `
          float k = smoothstep(0.0, 1.0, vWallT);
          color.rgb = mix(color.rgb, min(color.rgb * 1.25 + ${lift.toFixed(3)}, vec3(1.0)), k);
          color.a *= mix(0.22, ${fadeTo.toFixed(3)}, smoothstep(0.0, 0.85, k));
        `,
      },
    };
  }
}
