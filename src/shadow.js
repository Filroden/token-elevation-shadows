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

        let elevation = token.document.elevation;
        const centerY = token.y + token.h / 2;

        if (config.requireStatus) {
            const isAirborne = config.airborneStatuses.some((statusId) =>
                token.document.hasStatusEffect(statusId),
            );
            if (!isAirborne) elevation = 0;
        }

        const elevationPixels = elevation * config.meshOffsetMultiplier;
        token.mesh.position.y = centerY - elevationPixels;

        // --- 1. Manage the Token's Alpha Filter (Strips baked shadows) ---
        // As long as the token is elevated, keep stripping the baked shadow, even at night
        if (elevation > 0) {
            if (!token._tokenAlphaFilter) {
                token._tokenAlphaFilter = new AlphaThresholdFilter(
                    config.alphaThreshold,
                    1.0,
                );
            }
            if (!token.mesh.filters) token.mesh.filters = [];
            if (!token.mesh.filters.includes(token._tokenAlphaFilter)) {
                token.mesh.filters.push(token._tokenAlphaFilter);
            }
            token._tokenAlphaFilter.uniforms.threshold = config.alphaThreshold;
            token._tokenAlphaFilter.uniforms.globalOpacity = 1.0;
        } else {
            // If the token lands, remove the filter so natural ground shadows return
            if (token.mesh.filters && token._tokenAlphaFilter) {
                token.mesh.filters = token.mesh.filters.filter(
                    (f) => f !== token._tokenAlphaFilter,
                );
            }
        }

        // --- 2. Manage the Dynamic Shadow Sprite ---
        // If grounded or if the sun has set, clear ONLY the shadow
        if (elevation <= 0 || config.isNight) {
            this.clearShadow(token);
            return;
        }

        if (!token._elevationShadow) this._createShadow(token, config);

        const heightRatio = Math.min(elevation / config.maxElevation, 1);
        const elevationScale = Math.max(1 - heightRatio * 0.6, 0.2);

        const darknessLevel =
            canvas.scene?.environment?.darknessLevel ??
            canvas.scene?.darkness ??
            0;
        const ambientLightFactor = 1.0 - darknessLevel;

        const dynamicOpacity =
            (config.baseOpacity - heightRatio * config.baseOpacity) *
            ambientLightFactor;

        const blurAmount = 4 + heightRatio * 15;
        const baseTokenHeight = 10;
        const totalHeight = baseTokenHeight + elevationPixels;

        const shadowLength = totalHeight / config.tanAltitude;
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
        token._elevationShadow.position.set(
            centerX + currentOffsetX,
            centerY + currentOffsetY,
        );
    }

    /**
     * Destroys the shadow sprite but leaves the token's alpha filter intact
     */
    static clearShadow(token) {
        if (token._elevationShadow) {
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
            token.mesh.filters = token.mesh.filters.filter(
                (f) => f !== token._tokenAlphaFilter,
            );
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
