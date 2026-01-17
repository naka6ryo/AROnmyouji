/**
 * AssetLoader.js
 * アセット（テクスチャ等）の一括管理・キャッシュ
 */

import * as THREE from 'three';

class AssetLoader {
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
        this.cache = new Map();

        // Pre-defined URLs
        this.URLS = {
            spark: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/spark1.png',
            glow: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/lensflare/lensflare0.png'
        };
    }

    /**
     * テクスチャを取得（キャッシュにあればそれを返す）
     */
    getTexture(keyOrUrl) {
        const url = this.URLS[keyOrUrl] || keyOrUrl;

        if (this.cache.has(url)) {
            return this.cache.get(url);
        }

        const texture = this.textureLoader.load(url);
        this.cache.set(url, texture);
        return texture;
    }
}

export const assetLoader = new AssetLoader();
