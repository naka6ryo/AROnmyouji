// Hitodama.js
// Three.jsベースの人魂（敵キャラ）クラス
import * as THREE from 'three';

export class HitodamaEnemy {
    constructor(scene) {
        this.scene = scene;
        this.pos = new THREE.Vector3(0, 0, 0);
        this.time = 0;
        // コア
        const geometry = new THREE.SphereGeometry(0.6, 64, 64);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff3300,
            emissive: 0xff0000,
            emissiveIntensity: 5.0,
            transparent: true,
            opacity: 0.9,
            roughness: 0.1,
            metalness: 0.1
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
        this.originalPositions = geometry.attributes.position.clone();
        // 光源
        this.light = new THREE.PointLight(0xff4400, 50, 20);
        this.scene.add(this.light);
        // 尾
        this.tailCount = 40;
        this.tailPositions = [];
        for(let i=0; i<this.tailCount; i++) {
            this.tailPositions.push(this.pos.clone());
        }
        const spriteMap = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/spark1.png');
        this.tailSprites = [];
        for(let i=0; i<this.tailCount; i++) {
            const spriteMaterial = new THREE.SpriteMaterial({ 
                map: spriteMap, 
                color: 0xff5500, 
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1.5, 1.5, 1.5);
            this.scene.add(sprite);
            this.tailSprites.push(sprite);
        }
    }
    update(dt, enemyData) {
        this.time += dt;
        // ゲームの敵データ（azim, elev, distance）に従い位置を決定
        const azimRad = enemyData.azim * Math.PI / 180;
        const elevRad = enemyData.elev * Math.PI / 180;
        const r = enemyData.distance;
        this.pos.x = r * Math.cos(elevRad) * Math.sin(azimRad);
        this.pos.y = r * Math.sin(elevRad);
        this.pos.z = -r * Math.cos(elevRad) * Math.cos(azimRad);
        this.mesh.position.copy(this.pos);
        this.light.position.copy(this.pos);
        // 炎のゆらぎ
        const positions = this.mesh.geometry.attributes.position;
        const originals = this.originalPositions;
        const count = positions.count;
        const rad = 0.6;
        for (let i = 0; i < count; i++) {
            const px = originals.getX(i);
            const py = originals.getY(i);
            const pz = originals.getZ(i);
            const h = Math.max(0, (py + rad) / (rad * 2));
            const influence = Math.pow(h, 1.2); 
            const waveBaseX = Math.sin(py * 3.0 - this.time * 8.0);
            const waveBaseZ = Math.cos(py * 2.5 - this.time * 7.0);
            const waveDetailX = Math.sin(py * 12.0 - this.time * 18.0);
            const waveDetailZ = Math.cos(py * 14.0 - this.time * 16.0);
            const amp = 0.12 * influence; 
            const offsetX = (waveBaseX * 0.6 + waveDetailX * 0.4) * amp;
            const offsetZ = (waveBaseZ * 0.6 + waveDetailZ * 0.4) * amp;
            const offsetY = Math.sin(px * 8.0 + this.time * 12.0) * 0.08 * influence;
            positions.setX(i, px + offsetX);
            positions.setY(i, py + offsetY); 
            positions.setZ(i, pz + offsetZ);
        }
        positions.needsUpdate = true;
        // 尾
        this.tailPositions.unshift(this.pos.clone());
        if (this.tailPositions.length > this.tailCount) {
            this.tailPositions.pop();
        }
        for (let i = 0; i < this.tailCount; i++) {
            const sprite = this.tailSprites[i];
            const targetPos = this.tailPositions[i];
            if (targetPos) {
                const noise = 0.1 * (i / this.tailCount);
                sprite.position.set(
                    targetPos.x + (Math.random()-0.5)*noise, 
                    targetPos.y + (Math.random()-0.5)*noise, 
                    targetPos.z + (Math.random()-0.5)*noise
                );
                const ratio = 1 - (i / this.tailCount);
                const scale = 2.0 * ratio;
                sprite.scale.set(scale, scale, scale);
                sprite.material.opacity = 0.3 * ratio;
            }
        }
    }
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.scene.remove(this.light);
        for (const sprite of this.tailSprites) {
            this.scene.remove(sprite);
            sprite.material.dispose();
        }
    }
}
