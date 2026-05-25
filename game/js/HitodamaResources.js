import * as THREE from 'three';

// Shared Resources Cache
export const HitodamaResources = {
    geometries: {
        core: null,
        body: null,
        fragment: null,
        explosionFragment: null,
        shockwaveSmall: null,
        shockwaveLarge: null,
        freezeRing: null,
        tail: null // Initialized per instance or shared buffer? Shared buffer is hard if length varies, but here length is fixed (40).
    },
    materials: {
        core: null,
        body: null,
        aura: null,
        tail: null,
        fragment: null,
        shockwave: null,
        freezeRing: null
    },

    init() {
        if (this.geometries.core) return; // Already initialized

        // --- Geometries ---
        this.geometries.core = new THREE.SphereGeometry(0.25, 16, 16); // Reduced segments from 32
        this.geometries.body = new THREE.SphereGeometry(0.6, 32, 32);  // Reduced segments from 64

        // Optimize fragment geometry: Cone
        const fragGeo = new THREE.ConeGeometry(0.15, 0.4, 3);
        fragGeo.rotateX(Math.PI / 2);
        this.geometries.fragment = fragGeo;

        const explosionFragGeo = new THREE.ConeGeometry(0.2, 0.8, 3);
        explosionFragGeo.rotateX(Math.PI / 2);
        this.geometries.explosionFragment = explosionFragGeo;

        // Shockwaves
        this.geometries.shockwaveSmall = new THREE.RingGeometry(0.2, 0.5, 32);
        this.geometries.shockwaveLarge = new THREE.RingGeometry(0.2, 0.8, 32);
        this.geometries.freezeRing = new THREE.TorusGeometry(0.95, 0.025, 8, 48);

        // --- Materials ---
        // Core
        this.materials.core = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        // Body
        this.materials.body = new THREE.MeshBasicMaterial({
            color: 0xff2200,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // Fragment (Base - usually cloned for opacity fading, but we can stick to one if we use instance color opacity? 
        // For now, Hitodama.js modifies opacity. So we might need to clone, but at least we share the base definition)
        this.materials.fragment = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });

        // Shockwave
        this.materials.shockwave = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        this.materials.freezeRing = new THREE.MeshBasicMaterial({
            color: 0x88ddff,
            transparent: true,
            opacity: 0.36,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
    }
};
