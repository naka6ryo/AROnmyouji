/**
 * Hitodama.js
 * 敵キャラクター（人魂）の描画・アニメーション管理
 * Optimized version: Shared Geometries & Points for Tail
 */

import * as THREE from 'three';
import { assetLoader } from './AssetLoader.js';
import { HitodamaResources } from './HitodamaResources.js';

const PERFORMANCE_PROFILES = {
    normal: { purifyFragments: 38, explodeFragments: 72, tailStep: 1, wobbleEvery: 1, lightScale: 0.85 },
    warm: { purifyFragments: 18, explodeFragments: 32, tailStep: 3, wobbleEvery: 3, lightScale: 0.6 },
    hot: { purifyFragments: 7, explodeFragments: 12, tailStep: 5, wobbleEvery: 0, lightScale: 0.35 }
};
const MOBILE_PERFORMANCE_PROFILES = {
    normal: { purifyFragments: 26, explodeFragments: 48, tailStep: 2, wobbleEvery: 2, lightScale: 0.7 },
    warm: { purifyFragments: 12, explodeFragments: 22, tailStep: 4, wobbleEvery: 4, lightScale: 0.48 },
    hot: { purifyFragments: 5, explodeFragments: 8, tailStep: 6, wobbleEvery: 0, lightScale: 0.28 }
};

export class Hitodama {
    constructor(scene, position = new THREE.Vector3(0, 0, 0)) {
        // Ensure shared resources are ready
        HitodamaResources.init();

        this.scene = scene;
        this.pos = position.clone();
        this.time = 0;

        this.isPurifying = false;
        this.isExploding = false;
        this.isDead = false;
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '');
        this.performanceProfiles = this.isMobile ? MOBILE_PERFORMANCE_PROFILES : PERFORMANCE_PROFILES;
        this.performanceMode = 'normal';
        this.performanceProfile = this.performanceProfiles.normal;
        this.updateFrame = 0;

        this.fragments = [];
        this.shockwaves = [];
        this._tailBaseColor = new THREE.Color(0xff5500);
        this._tailNormalColor = new THREE.Color(0xff5500);
        this._tailFrozenColor = new THREE.Color(0x88ddff);
        this._bodyNormalColor = new THREE.Color(0xff2200);
        this._coreNormalColor = new THREE.Color(0xffddaa);
        this._auraNormalColor = new THREE.Color(0xff4400);
        this._frozenColor = new THREE.Color(0x88ddff);
        this._pureColor = new THREE.Color(0xaaddff);
        this._scratchColor = new THREE.Color();
        this._scratchVec = new THREE.Vector3();
        this._toCameraScratch = new THREE.Vector3();
        this.frozenUntil = 0;
        this.isFrozen = false;
        this._lastFrozenVisualState = null;
        this._freezeVisualDirty = true;
        this.freezeRing = null;

        // テクスチャ取得 via AssetLoader
        const sparkTexture = assetLoader.getTexture('spark');
        const glowTexture = assetLoader.getTexture('glow');

        // --- サイズ設定 ---
        const SPAWN_SCALE_FACTOR = 0.5;

        // --- 1. Core ---
        this.coreMesh = new THREE.Mesh(HitodamaResources.geometries.core, HitodamaResources.materials.core.clone());
        this.coreMesh.position.copy(this.pos);
        this.coreMesh.scale.set(0.8 * SPAWN_SCALE_FACTOR, 1.4 * SPAWN_SCALE_FACTOR, 0.8 * SPAWN_SCALE_FACTOR);
        this.scene.add(this.coreMesh);

        // --- 2. Body ---
        this.mesh = new THREE.Mesh(HitodamaResources.geometries.body, HitodamaResources.materials.body.clone());
        this.mesh.position.copy(this.pos);
        this.mesh.position.y += 0.3;
        this.mesh.scale.set(0.75 * SPAWN_SCALE_FACTOR, 1.8 * SPAWN_SCALE_FACTOR, 0.75 * SPAWN_SCALE_FACTOR);
        this.scene.add(this.mesh);

        // Save original position attribute for vertex wobble (clone it to avoid modifying the shared geometry)
        this.originalPositions = HitodamaResources.geometries.body.attributes.position.clone();
        // We need a unique geometry for the body to apply vertex wobble without affecting other instances
        this.mesh.geometry = HitodamaResources.geometries.body.clone();

        // --- 3. Aura ---
        const auraMat = new THREE.SpriteMaterial({
            map: glowTexture,
            color: 0xff4400,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending
        });
        this.auraSprite = new THREE.Sprite(auraMat);
        this.auraSprite.scale.set(3.0 * SPAWN_SCALE_FACTOR, 5.0 * SPAWN_SCALE_FACTOR, 3.0 * SPAWN_SCALE_FACTOR);
        this.auraSprite.position.copy(this.pos);
        this.scene.add(this.auraSprite);

        // --- 4. Light ---
        this.light = new THREE.PointLight(0xff4400, 30, 10);
        this.light.position.copy(this.pos);
        this.scene.add(this.light);

        // --- 5. Tail (Optimized using THREE.Points) ---
        this.tailCount = 40;
        this.tailPositions = [];
        for (let i = 0; i < this.tailCount; i++) this.tailPositions.push(this.pos.clone());

        // BufferGeometry for Points
        this.tailGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.tailCount * 3);
        const colors = new Float32Array(this.tailCount * 3); // For fading
        const sizes = new Float32Array(this.tailCount);

        this.tailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.tailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.tailGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const tailMaterial = new THREE.PointsMaterial({
            size: 1.5 * SPAWN_SCALE_FACTOR,
            map: sparkTexture,
            vertexColors: true,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.tailPoints = new THREE.Points(this.tailGeometry, tailMaterial);
        this.scene.add(this.tailPoints);

        this.freezeRing = new THREE.Mesh(
            HitodamaResources.geometries.freezeRing,
            HitodamaResources.materials.freezeRing
        );
        this.freezeRing.visible = false;
        this.scene.add(this.freezeRing);

        // コールバック
        this.onExploded = null;
        this.onPurified = null;
    }

    setPerformanceMode(mode) {
        this.performanceMode = this.performanceProfiles[mode] ? mode : 'normal';
        this.performanceProfile = this.performanceProfiles[this.performanceMode];
        this._freezeVisualDirty = true;
    }

    // ... (purify/explode logic needs update to use shared geometries for fragments)

    purify() {
        if (this.isPurifying || this.isDead) return;
        this.isPurifying = true;
        this.clearFreezeVisuals();

        this.mesh.visible = false;
        this.coreMesh.visible = false;
        this.auraSprite.visible = false;

        this.light.intensity = 20 * this.performanceProfile.lightScale;

        const fragmentCount = this.performanceProfile.purifyFragments;
        // Reuse shared geometry
        const fragGeo = HitodamaResources.geometries.fragment;

        for (let i = 0; i < fragmentCount; i++) {
            // Material needs to be cloned to handle individual opacity/color fades? 
            // Yes, because three.js doesn't support per-instance opacity easily without InstancedMesh+CustomShader.
            // For now, cloning material is still better than cloning geometry AND material.
            const fragMat = HitodamaResources.materials.fragment.clone();

            const fragment = new THREE.Mesh(fragGeo, fragMat);
            fragment.position.copy(this.pos);
            fragment.position.x += (Math.random() - 0.5) * 0.8;
            fragment.position.y += (Math.random() - 0.5) * 0.8;
            fragment.position.z += (Math.random() - 0.5) * 0.8;
            fragment.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.scene.add(fragment);

            const speed = 1.0 + Math.random() * 4.0;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const velocity = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.sin(phi) * Math.sin(theta),
                Math.cos(phi)
            ).normalize().multiplyScalar(speed);
            velocity.y += Math.random() * 3.0 + 1.0;

            this.fragments.push({
                mesh: fragment,
                velocity: velocity,
                rotationSpeed: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
                life: 1.0,
                decay: 0.5 + Math.random() * 0.5
            });
        }
    }

    explode(opts = {}) {
        if (this.isExploding || this.isDead) return;
        this.isExploding = true;
        this.clearFreezeVisuals();

        this.mesh.visible = false;
        this.coreMesh.visible = false;
        this.auraSprite.visible = false;

        this.light.intensity = 300 * this.performanceProfile.lightScale;
        this.light.distance = 50;
        this.light.color.setHex(0xffaa55);

        // 衝撃波
        // Clone materials for fade
        const ringMat1 = HitodamaResources.materials.shockwave.clone();
        const ring1 = new THREE.Mesh(HitodamaResources.geometries.shockwaveSmall, ringMat1);
        ring1.position.copy(this.pos);
        ring1.lookAt(this.scene.camera ? this.scene.camera.position : new THREE.Vector3(0, 0, 0));
        this.scene.add(ring1);
        this.shockwaves.push({ mesh: ring1, speed: 40.0, opacity: 1.0 });

        const ringMat2 = HitodamaResources.materials.shockwave.clone();
        const ring2 = new THREE.Mesh(HitodamaResources.geometries.shockwaveLarge, ringMat2);
        ring2.position.copy(this.pos);
        ring2.lookAt(this.scene.camera ? this.scene.camera.position : new THREE.Vector3(0, 0, 0));
        this.scene.add(ring2);
        this.shockwaves.push({ mesh: ring2, speed: 20.0, opacity: 1.0 });

        // 破片
        const fragmentCount = opts.lightweight
            ? Math.max(8, Math.round(this.performanceProfile.explodeFragments * 0.28))
            : this.performanceProfile.explodeFragments;
        const fragGeo = HitodamaResources.geometries.explosionFragment;

        for (let i = 0; i < fragmentCount; i++) {
            const fragMat = new THREE.MeshBasicMaterial({
                color: 0xff3300,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
            const fragment = new THREE.Mesh(fragGeo, fragMat);
            fragment.position.copy(this.pos);
            fragment.position.x += (Math.random() - 0.5);
            fragment.position.y += (Math.random() - 0.5);
            fragment.position.z += (Math.random() - 0.5);
            fragment.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            this.scene.add(fragment);

            const speed = 2.0 + Math.random() * 12.0;
            const velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed);

            if (opts.toCameraBias && this.scene.userData && this.scene.userData.cameraPosition) {
                const camPos = this.scene.userData.cameraPosition;
                const toCamera = this._toCameraScratch.copy(camPos).sub(this.pos).normalize();
                if (Math.random() < 0.5) velocity.add(toCamera.multiplyScalar(8.0 + Math.random() * 5.0));
            }

            this.fragments.push({
                mesh: fragment,
                velocity: velocity,
                rotationSpeed: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
                life: 1.0,
                decay: 0.5 + Math.random() * 1.5
            });
        }
    }

    reduceExplosionLoad(maxFragments = 18) {
        if (!this.isExploding || this.fragments.length <= maxFragments) return;

        for (let i = this.fragments.length - 1; i >= maxFragments; i--) {
            const frag = this.fragments[i];
            if (frag && frag.mesh) {
                this.scene.remove(frag.mesh);
                if (frag.mesh.material) frag.mesh.material.dispose();
            }
            this.fragments.splice(i, 1);
        }

        if (this.light) {
            this.light.intensity = Math.min(this.light.intensity, 90 * this.performanceProfile.lightScale);
            this.light.distance = Math.min(this.light.distance || 10, 24);
        }
    }

    setFrozen(durationMs) {
        this.setFrozenUntil(performance.now() + durationMs);
    }

    setFrozenUntil(frozenUntil) {
        if (typeof frozenUntil !== 'number') return;
        const nextFrozenUntil = Math.max(this.frozenUntil || 0, frozenUntil);
        if (nextFrozenUntil === this.frozenUntil) return;
        this.frozenUntil = nextFrozenUntil;
        this._freezeVisualDirty = true;
    }

    clearFreezeVisuals() {
        this.frozenUntil = 0;
        this.isFrozen = false;
        this._freezeVisualDirty = true;
        this.applyFreezeVisualState(false);
        if (this.freezeRing) {
            this.freezeRing.visible = false;
        }
    }

    update(dt, nowMs = performance.now()) {
        this.time += dt;
        this.updateFrame++;

        if (this.isExploding) {
            this.updateExplosion(dt);
            // Hide tail if exploding
            this.tailPoints.visible = false;
            return;
        }

        if (this.isPurifying) {
            this.updatePurification(dt);
            // Tail fading during purification is handled in updatePurification
        } else {
            this.updateNormal(dt, nowMs);
            // Update Tail Particle System
            const tailStep = this.isFrozen
                ? Math.max(2, this.performanceProfile.tailStep * 2)
                : this.performanceProfile.tailStep;
            if (this.updateFrame % tailStep === 0) {
                this.updateTailPoints();
            }
        }
    }

    updateTailPoints() {
        if (!this.tailGeometry) return;

        const positions = this.tailGeometry.attributes.position.array;
        const colors = this.tailGeometry.attributes.color.array;
        const sizes = this.tailGeometry.attributes.size.array;

        const baseColor = this._tailBaseColor;

        for (let i = 0; i < this.tailCount; i++) {
            const pos = this.tailPositions[i];
            const idx = i * 3;

            // Should add some noise to position to match original effect
            const noise = 0.1 * (i / this.tailCount);

            if (pos) {
                positions[idx] = pos.x + (Math.random() - 0.5) * noise;
                positions[idx + 1] = pos.y + (Math.random() - 0.5) * noise;
                positions[idx + 2] = pos.z + (Math.random() - 0.5) * noise;
            }

            const ratio = 1 - (i / this.tailCount);

            // Fade opacity using color logic if material supports vertex color alpha
            // THREE.PointsMaterial uses color attribute as diffuse color. 
            // There is no separate 'alpha' attribute.
            // If we want alpha fading, we just scale the color? No, standard PointsMaterial doesn't do per-vertex alpha easily unless we use custom shader.
            // However, with AdditiveBlending, darker colors look transparent.

            colors[idx] = baseColor.r * ratio;
            colors[idx + 1] = baseColor.g * ratio;
            colors[idx + 2] = baseColor.b * ratio;

            // Scale size
            sizes[i] = 1.0 * ratio; // Scale factor needs tuning. Original was 1.5 * scale.
        }

        this.tailGeometry.attributes.position.needsUpdate = true;
        this.tailGeometry.attributes.color.needsUpdate = true;
        this.tailGeometry.attributes.size.needsUpdate = true;
    }

    updateExplosion(dt) {
        // Shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            const scaleIncrease = sw.speed * dt;
            const currentScale = sw.mesh.scale.x || 1.0;
            const newScale = currentScale + scaleIncrease;
            sw.mesh.scale.set(newScale, newScale, newScale);
            sw.opacity -= dt * 2.0;
            if (sw.mesh.material) sw.mesh.material.opacity = Math.max(0, sw.opacity);
            if (sw.opacity <= 0) {
                this.scene.remove(sw.mesh);
                if (sw.mesh.material) sw.mesh.material.dispose(); // Dispose cloned material
                this.shockwaves.splice(i, 1);
            }
        }

        // Fragments
        let activeFragments = 0;
        for (const frag of this.fragments) {
            if (frag.life <= 0) {
                frag.mesh.visible = false;
                continue;
            }
            activeFragments++;
            frag.mesh.position.add(this._scratchVec.copy(frag.velocity).multiplyScalar(dt));
            frag.mesh.rotation.x += frag.rotationSpeed.x * dt;
            frag.mesh.rotation.y += frag.rotationSpeed.y * dt;
            frag.mesh.rotation.z += frag.rotationSpeed.z * dt;
            frag.life -= frag.decay * dt;
            frag.mesh.material.opacity = Math.max(0, frag.life);
            const s = Math.max(0.0001, frag.life * 2.0);
            frag.mesh.scale.set(s, s, s);
        }

        // Light decay
        if (this.light) {
            this.light.intensity = Math.max(0, this.light.intensity - 200 * dt);
            if (typeof this.light.distance === 'number') this.light.distance *= Math.max(0.9, 1 - 0.5 * dt);
        }

        if (activeFragments === 0 && (!this.shockwaves || this.shockwaves.length === 0) && this.light.intensity < 0.1) {
            this.finalizeDeath();
            if (this.onExploded) this.onExploded();
        }
    }

    updatePurification(dt) {
        const pureColor = this._pureColor;
        this.light.color.lerp(pureColor, dt * 2.0);
        this.light.intensity *= 0.95;

        // Fragments
        let activeFragments = 0;
        for (const frag of this.fragments) {
            if (frag.life <= 0) {
                frag.mesh.visible = false;
                continue;
            }
            activeFragments++;
            frag.mesh.position.add(this._scratchVec.copy(frag.velocity).multiplyScalar(dt));
            frag.mesh.rotation.x += frag.rotationSpeed.x * dt;
            frag.mesh.rotation.y += frag.rotationSpeed.y * dt;
            frag.mesh.rotation.z += frag.rotationSpeed.z * dt;
            frag.velocity.multiplyScalar(0.95);
            frag.mesh.material.color.lerp(pureColor, dt * 3.0);
            frag.life -= frag.decay * dt;
            frag.mesh.material.opacity = Math.max(0, frag.life);
            const s = Math.max(0.0001, frag.life);
            frag.mesh.scale.set(s, s, s);
        }

        // Tail fade in purification
        // With Points, we can fade them out by reducing global opacity or zeroing out the colors
        if (this.tailPoints.material) {
            this.tailPoints.material.opacity *= 0.92;
            // Also drift up?
            const positions = this.tailGeometry.attributes.position.array;
            for (let i = 0; i < this.tailCount; i++) {
                positions[i * 3 + 1] += dt * 1.0;
            }
            this.tailGeometry.attributes.position.needsUpdate = true;

            // Tint color
            const colors = this.tailGeometry.attributes.color.array;
            for (let i = 0; i < this.tailCount * 3; i += 3) {
                const c = this._scratchColor.setRGB(colors[i], colors[i + 1], colors[i + 2]);
                c.lerp(pureColor, 0.1);
                colors[i] = c.r;
                colors[i + 1] = c.g;
                colors[i + 2] = c.b;
            }
            this.tailGeometry.attributes.color.needsUpdate = true;
        }

        if (activeFragments === 0 && this.light.intensity < 0.1) {
            this.finalizeDeath();
            if (this.onPurified) this.onPurified();
        }
    }

    updateNormal(dt, nowMs = performance.now()) {
        const isFrozen = nowMs < this.frozenUntil;
        if (this.isFrozen !== isFrozen) {
            this.isFrozen = isFrozen;
            this._freezeVisualDirty = true;
        }

        this.mesh.position.copy(this.pos);
        this.mesh.position.y += 0.3;
        this.coreMesh.position.copy(this.pos);
        this.auraSprite.position.copy(this.pos);
        this.light.position.copy(this.pos);

        const pulseSpeed = isFrozen ? 1.8 : 5.0;
        const pulseAmount = isFrozen ? 0.035 : 0.1;
        const pulse = 1.0 + Math.sin(this.time * pulseSpeed) * pulseAmount;
        this.auraSprite.scale.set(3.0 * pulse, 5.0 * pulse, 3.0 * pulse);

        this.applyFreezeVisualState(isFrozen);
        this.updateFreezeRing(isFrozen, dt);

        // vertex wobble
        const wobbleEvery = this.performanceProfile.wobbleEvery === 0
            ? 0
            : (isFrozen ? Math.max(3, this.performanceProfile.wobbleEvery * 3) : this.performanceProfile.wobbleEvery);
        if (wobbleEvery === 0 || this.updateFrame % wobbleEvery !== 0) {
            const tailPos = this.tailPositions.pop() || new THREE.Vector3();
            tailPos.copy(this.pos);
            this.tailPositions.unshift(tailPos);
            return;
        }
        const positions = this.mesh.geometry.attributes.position;
        // Check if originalPositions exists (it should, we cloned it in constructor)
        if (!this.originalPositions) return;

        for (let i = 0; i < positions.count; i++) {
            const px = this.originalPositions.getX(i);
            const py = this.originalPositions.getY(i);
            const pz = this.originalPositions.getZ(i);
            const r = 0.6;
            const h = Math.max(0, (py + r) / (r * 2));
            const influence = Math.pow(h, 1.2);

            const wobbleScale = isFrozen ? 0.25 : 1.0;
            const timeScale = isFrozen ? 0.35 : 1.0;
            const t = this.time * timeScale;
            const offsetX = (Math.sin(py * 3.0 - t * 8.0) * 0.6 + Math.sin(py * 12.0 - t * 18.0) * 0.4) * 0.12 * influence * wobbleScale;
            const offsetZ = (Math.cos(py * 2.5 - t * 7.0) * 0.6 + Math.cos(py * 14.0 - t * 16.0) * 0.4) * 0.12 * influence * wobbleScale;
            const offsetY = Math.sin(px * 8.0 + t * 12.0) * 0.08 * influence * wobbleScale;

            positions.setX(i, px + offsetX);
            positions.setY(i, py + offsetY);
            positions.setZ(i, pz + offsetZ);
        }
        positions.needsUpdate = true;

        // tail
        const tailPos = this.tailPositions.pop() || new THREE.Vector3();
        tailPos.copy(this.pos);
        this.tailPositions.unshift(tailPos);
    }

    applyFreezeVisualState(isFrozen) {
        if (!this._freezeVisualDirty && this._lastFrozenVisualState === isFrozen) return;

        this._lastFrozenVisualState = isFrozen;
        this._freezeVisualDirty = false;

        if (this.mesh.material && this.mesh.material.color) {
            this.mesh.material.color.copy(isFrozen ? this._frozenColor : this._bodyNormalColor);
            this.mesh.material.opacity = isFrozen ? 0.72 : 0.5;
        }
        if (this.coreMesh.material && this.coreMesh.material.color) {
            this.coreMesh.material.color.copy(isFrozen ? this._frozenColor : this._coreNormalColor);
            this.coreMesh.material.opacity = isFrozen ? 1.0 : 0.8;
        }
        if (this.auraSprite.material && this.auraSprite.material.color) {
            this.auraSprite.material.color.copy(isFrozen ? this._frozenColor : this._auraNormalColor);
            this.auraSprite.material.opacity = isFrozen ? 0.62 : 0.4;
        }
        if (this.light) {
            this.light.color.copy(isFrozen ? this._frozenColor : this._auraNormalColor);
            this.light.intensity = (isFrozen ? 42 : 30) * this.performanceProfile.lightScale;
        }
        this._tailBaseColor.copy(isFrozen ? this._tailFrozenColor : this._tailNormalColor);
    }

    updateFreezeRing(isFrozen, dt) {
        if (!this.freezeRing) return;

        if (this.freezeRing.visible !== isFrozen) {
            this.freezeRing.visible = isFrozen;
        }
        if (!isFrozen) return;

        this.freezeRing.position.copy(this.pos);
        this.freezeRing.position.y += 0.28;
        this.freezeRing.rotation.x = Math.PI / 2;
        this.freezeRing.scale.setScalar(1);
    }

    finalizeDeath() {
        this.clearFreezeVisuals();
        this.isDead = true;
        this.light.visible = false;
        // cleanup fragments
        for (const frag of this.fragments) {
            if (frag.mesh) {
                this.scene.remove(frag.mesh);
                if (frag.mesh.material) frag.mesh.material.dispose();
            }
        }
        this.fragments = [];
        this.tailPoints.visible = false; // Hide tail
    }

    dispose() {
        this.clearFreezeVisuals();
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose(); // Dispose unique body geometry
            if (this.mesh.material) this.mesh.material.dispose();
        }
        if (this.coreMesh) {
            this.scene.remove(this.coreMesh);
            if (this.coreMesh.material) this.coreMesh.material.dispose();
        }
        if (this.auraSprite) {
            this.scene.remove(this.auraSprite);
            if (this.auraSprite.material) this.auraSprite.material.dispose();
        }
        if (this.light) this.scene.remove(this.light);

        if (this.tailPoints) {
            this.scene.remove(this.tailPoints);
            if (this.tailGeometry) this.tailGeometry.dispose();
            if (this.tailPoints.material) this.tailPoints.material.dispose(); // This was created in constructor, not shared
        }

        if (this.freezeRing) {
            this.scene.remove(this.freezeRing);
        }

        this.finalizeDeath();
        for (const sw of this.shockwaves) {
            this.scene.remove(sw.mesh);
            if (sw.mesh.material) sw.mesh.material.dispose();
        }
    }
}
