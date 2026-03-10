/**
 * Custom PIXI Filter to strip out semi-transparent pixels and apply dynamic opacity.
 */
class AlphaThresholdFilter extends PIXI.Filter {
    constructor(threshold = 0.2, globalOpacity = 1.0) {
        const fragmentShader = `
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform float threshold;
            uniform float globalOpacity;
            void main(void) {
                vec4 color = texture2D(uSampler, vTextureCoord);
                if (color.a < threshold) {
                    gl_FragColor = vec4(0.0);
                } else {
                    gl_FragColor = color * globalOpacity;
                }
            }
        `;
        super(null, fragmentShader, { threshold, globalOpacity });
    }
}

export class ShadowRenderer {
    static update(token, config) {
        if (!token.mesh || Object.keys(config).length === 0) return;

        // Clamp elevation to ensure we do not offset underground tokens
        let elevation = Math.max(0, token.document.elevation);
        const centerY = token.y + token.h / 2;

        if (config.requireStatus) {
            const isAirborne = config.airborneStatuses.some((statusId) => token.document.hasStatusEffect(statusId));
            if (!isAirborne) elevation = 0;
        }

        if (!token.mesh?.texture || token.mesh.texture === PIXI.Texture.EMPTY) return;

        const elevationPixels = elevation * config.meshOffsetMultiplier;
        token.mesh.position.y = centerY - elevationPixels;

        // --- 1. Manage the Token's Alpha Filter (Strips baked shadows) ---
        // Always apply the alpha filter to the token to strip baked-in shadows,
        // ensuring consistent visual behaviour at all elevations.

        if (!token._tokenAlphaFilter) {
            token._tokenAlphaFilter = new AlphaThresholdFilter(config.alphaThreshold, 1.0);
        }

        if (!token.mesh.filters) token.mesh.filters = [];

        if (!token.mesh.filters.includes(token._tokenAlphaFilter)) {
            token.mesh.filters.push(token._tokenAlphaFilter);
        }

        token._tokenAlphaFilter.uniforms.threshold = config.alphaThreshold;
        token._tokenAlphaFilter.uniforms.globalOpacity = 1.0;

        // --- 2. Manage the Dynamic Shadow Sprite ---
        // Only clear the shadow if the sun has set or the token is underground
        if (elevation < 0 || config.isNight) {
            this.clearShadow(token);
            return;
        }

        if (!token._elevationShadow) this._createShadow(token, config);

        const heightRatio = Math.min(elevation / config.maxElevation, 1);
        const elevationScale = Math.max(1 - heightRatio * 0.6, 0.2);

        const darknessLevel = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;
        const ambientLightFactor = 1.0 - darknessLevel;

        const dynamicOpacity = (config.baseOpacity - heightRatio * config.baseOpacity) * ambientLightFactor;

        let shadowLength;
        let blurAmount;

        if (elevation === 0) {
            // Provide a tight, sharp shadow for grounded tokens to mimic baked-in assets.
            // Bounding it to 5% of the token width guarantees it cannot physically detach.
            shadowLength = token.w * 0.05;
            blurAmount = 2;
        } else {
            // Apply standard trigonometric offset and softer blur for flying tokens
            const baseTokenHeight = 10;
            const totalHeight = baseTokenHeight + elevationPixels;
            shadowLength = totalHeight / config.tanAltitude;
            blurAmount = 4 + heightRatio * 15;
        }

        const currentOffsetX = -shadowLength * config.sinAzimuth;
        const currentOffsetY = shadowLength * config.cosAzimuth;

        token._shadowAlphaFilter.uniforms.threshold = config.alphaThreshold;
        token._shadowAlphaFilter.uniforms.globalOpacity = dynamicOpacity;

        token._elevationShadow.texture = token.mesh.texture;
        token._elevationShadow.rotation = token.mesh.rotation;
        token._elevationShadow.anchor.copyFrom(token.mesh.anchor);

        token._elevationShadow.scale.copyFrom(token.mesh.scale);
        token._elevationShadow.scale.x *= elevationScale;
        token._elevationShadow.scale.y *= elevationScale;
        token._elevationShadow.filters[1].blur = blurAmount;

        const centerX = token.x + token.w / 2;
        token._elevationShadow.position.set(centerX + currentOffsetX, centerY + currentOffsetY);

        // Synchronise the shadow's visibility with the token's hidden state.
        if (token._elevationShadow) {
            token._elevationShadow.visible = !token.document.hidden;
        }
    }

    /**
     * Destroys the shadow sprite but leaves the token's alpha filter intact
     */
    static clearShadow(token) {
        if (token._elevationShadow) {
            // Destroy the filters safely before destroying the sprite
            if (token._elevationShadow.filters) {
                for (const filter of token._elevationShadow.filters) {
                    filter.destroy();
                }
            }

            token._elevationShadow.destroy();
            delete token._elevationShadow;
            delete token._shadowAlphaFilter;
        }
    }

    /**
     * Fully cleans up everything (used when a token is deleted from the canvas)
     */
    static clear(token) {
        this.clearShadow(token);
        if (token.mesh && token.mesh.filters && token._tokenAlphaFilter) {
            token.mesh.filters = token.mesh.filters.filter((f) => f !== token._tokenAlphaFilter);
            delete token._tokenAlphaFilter;
        }
    }

    static _createShadow(token, config) {
        const shadow = new PIXI.Sprite(token.mesh.texture);
        shadow.tint = 0x000000;
        const alphaFilter = new AlphaThresholdFilter(config.alphaThreshold);
        const blurFilter = new PIXI.BlurFilter();
        shadow.filters = [alphaFilter, blurFilter];
        shadow.zIndex = -1;

        canvas.primary.addChild(shadow);
        token._elevationShadow = shadow;
        token._shadowAlphaFilter = alphaFilter;
    }
}
