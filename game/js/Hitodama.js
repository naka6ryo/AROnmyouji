/**
 * Hitodama.js
 * 敵キャラクター（人魂）の描画・アニメーション管理
 */

import * as THREE from 'three';
import { assetLoader } from './AssetLoader.js';

export class Hitodama {
    constructor(scene, position = new THREE.Vector3(0, 0, 0)) {
        this.scene = scene;
        this.pos = position.clone();
        this.time = 0;

        this.isPurifying = false;
        this.isExploding = false; // Added state initialization
        this.isDead = false;

        this.fragments = [];
        this.tailSprites = [];
        this.shockwaves = [];

        // テクスチャ取得 via AssetLoader
        const spriteTexture = assetLoader.getTexture('spark');
        const glowTexture = assetLoader.getTexture('glow');

        // --- サイズ設定 ---
        const MAX_SCALE_FACTOR = 0.25;
        const SPAWN_SCALE_FACTOR = 0.5;

        // --- 1. Core ---
        const coreGeo = new THREE.SphereGeometry(0.25, 32, 32);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
            this.coreMesh = new THREE.Mesh(coreGeo, coreMat);
            this.coreMesh.position.copy(this.pos);
            this.coreMesh.scale.set(0.8 * SPAWN_SCALE_FACTOR, 1.4 * SPAWN_SCALE_FACTOR, 0.8 * SPAWN_SCALE_FACTOR);
            this.scene.add(this.coreMesh);
            this.baseCoreScale = this.coreMesh.scale.clone();

        // --- 2. Body ---
        const bodyGeo = new THREE.SphereGeometry(0.6, 64, 64);
        const bodyMat = new THREE.MeshBasicMaterial({
            color: 0xff2200,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.position.copy(this.pos);
        this.mesh.position.y += 0.3;
            this.mesh.scale.set(0.75 * SPAWN_SCALE_FACTOR, 1.8 * SPAWN_SCALE_FACTOR, 0.75 * SPAWN_SCALE_FACTOR);
            this.scene.add(this.mesh);
            this.baseMeshScale = this.mesh.scale.clone();
            this.originalPositions = bodyGeo.attributes.position.clone();

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
            this.baseAuraScale = this.auraSprite.scale.clone();

        // --- 4. Light ---
        this.light = new THREE.PointLight(0xff4400, 30, 10);
        this.light.position.copy(this.pos);
        this.scene.add(this.light);

        // --- 5. Tail ---
        this.tailCount = 40;
        this.tailPositions = [];
        for (let i = 0; i < this.tailCount; i++) this.tailPositions.push(this.pos.clone());

        for (let i = 0; i < this.tailCount; i++) {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: spriteTexture,
                color: 0xff5500,
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1.5 * SPAWN_SCALE_FACTOR, 1.5 * SPAWN_SCALE_FACTOR, 1.5 * SPAWN_SCALE_FACTOR);
            this.scene.add(sprite);
            this.tailSprites.push(sprite);
        }

        // コールバック
        this.onExploded = null;
        this.onPurified = null;
    }

    purify() {
        if (this.isPurifying || this.isDead) return;
        this.isPurifying = true;

        this.mesh.visible = false;
        this.coreMesh.visible = false;
        this.auraSprite.visible = false;

        this.light.intensity = 20;

        const fragmentCount = 50;
        const fragGeo = new THREE.ConeGeometry(0.15, 0.4, 3);
        fragGeo.rotateX(Math.PI / 2);

        for (let i = 0; i < fragmentCount; i++) {
            const fragMat = new THREE.MeshBasicMaterial({
                color: 0xff5500,
                transparent: true,
                opacity: 1.0,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide
            });
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

        this.mesh.visible = false;
        this.coreMesh.visible = false;
        this.auraSprite.visible = false;

        this.light.intensity = 300;
        this.light.distance = 50;
        this.light.color.setHex(0xffaa55);

        // 衝撃波
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffddaa,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 32), ringMat.clone());
        ring1.position.copy(this.pos);
        ring1.lookAt(this.scene.camera ? this.scene.camera.position : new THREE.Vector3(0, 0, 0));
        this.scene.add(ring1);
        this.shockwaves.push({ mesh: ring1, speed: 40.0, opacity: 1.0 });

        const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.8, 32), ringMat.clone());
        ring2.position.copy(this.pos);
        ring2.lookAt(this.scene.camera ? this.scene.camera.position : new THREE.Vector3(0, 0, 0));
        this.scene.add(ring2);
        this.shockwaves.push({ mesh: ring2, speed: 20.0, opacity: 1.0 });

        // 破片
        const fragmentCount = 100;
        const fragGeo = new THREE.ConeGeometry(0.2, 0.8, 3);
        fragGeo.rotateX(Math.PI / 2);

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
                const toCamera = camPos.clone().sub(this.pos).normalize();
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

    update(dt) {
        this.time += dt;

        if (this.isExploding) {
            this.updateExplosion(dt);
            return;
        }

        if (this.isPurifying) {
            this.updatePurification(dt);
        } else {
            this.updateNormal(dt);
        }
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
            frag.mesh.position.add(frag.velocity.clone().multiplyScalar(dt));
            frag.mesh.rotation.x += frag.rotationSpeed.x * dt;
            frag.mesh.rotation.y += frag.rotationSpeed.y * dt;
            frag.mesh.rotation.z += frag.rotationSpeed.z * dt;
            frag.life -= frag.decay * dt;
            frag.mesh.material.opacity = Math.max(0, frag.life);
            const s = Math.max(0.0001, frag.life * 2.0);
            frag.mesh.scale.set(s, s, s);
        }

        // Tail fade
        for (const sprite of this.tailSprites) {
            sprite.material.opacity *= 0.8;
            sprite.scale.multiplyScalar(1.05);
            sprite.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
        }

        // Light decay: explosive light is large; ensure it fades so finalizeDeath() can run
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
        const pureColor = new THREE.Color(0xaaddff);
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
            frag.mesh.position.add(frag.velocity.clone().multiplyScalar(dt));
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

        for (const sprite of this.tailSprites) {
            sprite.material.opacity *= 0.92;
            sprite.material.color.lerp(pureColor, 0.1);
            sprite.position.y += dt * 1.0;
        }

        if (activeFragments === 0 && this.light.intensity < 0.1) {
            this.finalizeDeath();
            if (this.onPurified) this.onPurified();
        }
    }

    updateNormal(dt) {
        this.mesh.position.copy(this.pos);
        this.mesh.position.y += 0.3;
        this.coreMesh.position.copy(this.pos);
        this.auraSprite.position.copy(this.pos);
        this.light.position.copy(this.pos);

        const pulse = 1.0 + Math.sin(this.time * 5.0) * 0.1;
        this.auraSprite.scale.set(3.0 * pulse, 5.0 * pulse, 3.0 * pulse);

        // vertex wobble
        const positions = this.mesh.geometry.attributes.position;
        const originals = this.originalPositions;
        for (let i = 0; i < positions.count; i++) {
            const px = originals.getX(i);
            const py = originals.getY(i);
            const pz = originals.getZ(i);
            const r = 0.6;
            const h = Math.max(0, (py + r) / (r * 2));
            const influence = Math.pow(h, 1.2);

            const offsetX = (Math.sin(py * 3.0 - this.time * 8.0) * 0.6 + Math.sin(py * 12.0 - this.time * 18.0) * 0.4) * 0.12 * influence;
            const offsetZ = (Math.cos(py * 2.5 - this.time * 7.0) * 0.6 + Math.cos(py * 14.0 - this.time * 16.0) * 0.4) * 0.12 * influence;
            const offsetY = Math.sin(px * 8.0 + this.time * 12.0) * 0.08 * influence;

            positions.setX(i, px + offsetX);
            positions.setY(i, py + offsetY);
            positions.setZ(i, pz + offsetZ);
        }
        positions.needsUpdate = true;

        // tail
        this.tailPositions.unshift(this.pos.clone());
        if (this.tailPositions.length > this.tailCount) this.tailPositions.pop();
        for (let i = 0; i < this.tailCount; i++) {
            const sprite = this.tailSprites[i];
            const targetPos = this.tailPositions[i];
            if (targetPos) {
                const noise = 0.1 * (i / this.tailCount);
                sprite.position.set(
                    targetPos.x + (Math.random() - 0.5) * noise,
                    targetPos.y + (Math.random() - 0.5) * noise,
                    targetPos.z + (Math.random() - 0.5) * noise
                );
                const ratio = 1 - (i / this.tailCount);
                const scale = 2.0 * ratio;
                sprite.scale.set(scale, scale, scale);
                sprite.material.opacity = 0.4 * ratio;
            }
        }
        // --- Distortion / subtle glitch effect for 人魂 ---
        try {
            const hueShift = Math.sin(this.time * 6.0) * 0.03; // small oscillation
            const baseColor = new THREE.Color(0xff2200);
            const hsl = { h: 0, s: 0, l: 0 };
            baseColor.getHSL(hsl);
            if (this.mesh && this.mesh.material && typeof this.mesh.material.color !== 'undefined') {
                this.mesh.material.color.setHSL((hsl.h + hueShift + 1) % 1, hsl.s, hsl.l);
            }

            const meshJitter = 1.0 + Math.sin(this.time * 9.0) * 0.03;
            const coreJitter = 1.0 + Math.sin(this.time * 7.0 + 0.7) * 0.04;
            const auraJitter = 1.0 + Math.sin(this.time * 5.5 + 1.2) * 0.05;
            if (this.baseMeshScale) this.mesh.scale.copy(this.baseMeshScale).multiplyScalar(meshJitter);
            if (this.baseCoreScale) this.coreMesh.scale.copy(this.baseCoreScale).multiplyScalar(coreJitter);
            if (this.baseAuraScale) this.auraSprite.scale.copy(this.baseAuraScale).multiplyScalar(auraJitter);

            if (this.light) this.light.intensity = (10 + Math.sin(this.time * 10.0) * 6) * (this.isPurifying ? 0.6 : 1.0);
        } catch (e) {
            // ignore if any part missing
        }
    }

    finalizeDeath() {
        this.isDead = true;
        this.light.visible = false;
        // cleanup fragments
        for (const frag of this.fragments) {
            if (frag.mesh) {
                this.scene.remove(frag.mesh);
                if (frag.mesh.geometry) frag.mesh.geometry.dispose();
                if (frag.mesh.material) frag.mesh.material.dispose();
            }
        }
        this.fragments = [];
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
        if (this.coreMesh) {
            this.scene.remove(this.coreMesh);
            if (this.coreMesh.geometry) this.coreMesh.geometry.dispose();
            if (this.coreMesh.material) this.coreMesh.material.dispose();
        }
        if (this.auraSprite) {
            this.scene.remove(this.auraSprite);
            if (this.auraSprite.material) this.auraSprite.material.dispose();
        }
        if (this.light) this.scene.remove(this.light);
        for (const sprite of this.tailSprites) {
            this.scene.remove(sprite);
            if (sprite.material) sprite.material.dispose();
        }
        this.finalizeDeath();
        for (const sw of this.shockwaves) {
            this.scene.remove(sw.mesh);
        }
    }
}
