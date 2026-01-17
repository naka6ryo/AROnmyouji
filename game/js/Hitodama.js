import * as THREE from 'three';

export class Hitodama {
    constructor(scene) {
        this.scene = scene;
        this.time = 0;

        // Parent group for positioning the entire entity
        this.root = new THREE.Group();
        this.scene.add(this.root);

        // Local position for floating animation
        this.localPos = new THREE.Vector3(0, 0, 0);

        // 1. Core (Sphere)
        // High vertex count for wave animation
        const geometry = new THREE.SphereGeometry(0.3, 64, 64);

        // Red emissive material
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
        this.root.add(this.mesh);

        // Save original positions for animation
        this.originalPositions = geometry.attributes.position.clone();

        // 2. Light
        this.light = new THREE.PointLight(0xff4400, 50, 20);
        this.root.add(this.light);

        // 3. Tail (Particle System)
        this.tailCount = 40;
        this.tailPositions = [];
        // Initialize tail
        for (let i = 0; i < this.tailCount; i++) {
            this.tailPositions.push(this.localPos.clone());
        }

        // Tail sprites
        const spriteMap = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/spark1.png');
        this.tailSprites = [];

        for (let i = 0; i < this.tailCount; i++) {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: spriteMap,
                color: 0xff5500,
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(1.5, 1.5, 1.5);
            this.root.add(sprite); // Add to root so they move with enemy
            this.tailSprites.push(sprite);
        }
    }

    // Set the world position of the enemy (anchor point)
    setPosition(x, y, z) {
        this.root.position.set(x, y, z);
    }

    getPosition() {
        return this.root.position;
    }

    // Get the actual visual position of the core mesh (including floating offset)
    getMeshWorldPosition(target) {
        return this.mesh.getWorldPosition(target);
    }

    update(dt) {
        this.time += dt;

        // --- Motion (Lissajous figure floating) ---
        const floatSpeed = 1.5;
        const radius = 2.0; // Floating radius relative to anchor

        // Calculate local floating position
        this.localPos.x = Math.sin(this.time * 0.7 * floatSpeed) * radius;
        this.localPos.y = Math.sin(this.time * 1.3 * floatSpeed) * 0.8;
        this.localPos.z = Math.cos(this.time * 0.5 * floatSpeed) * radius;

        // Update mesh and light relative to root
        this.mesh.position.copy(this.localPos);
        this.light.position.copy(this.localPos);

        // --- Flame wave animation ---
        const positions = this.mesh.geometry.attributes.position;
        const originals = this.originalPositions;
        const count = positions.count;
        const r = 0.6;

        for (let i = 0; i < count; i++) {
            const px = originals.getX(i);
            const py = originals.getY(i);
            const pz = originals.getZ(i);

            const h = Math.max(0, (py + r) / (r * 2));
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

        // --- Tail Update ---
        this.tailPositions.unshift(this.localPos.clone());
        if (this.tailPositions.length > this.tailCount) {
            this.tailPositions.pop();
        }

        for (let i = 0; i < this.tailCount; i++) {
            const sprite = this.tailSprites[i];
            const targetPos = this.tailPositions[i];

            if (targetPos) {
                const noise = 0.1 * (i / this.tailCount);
                // Position is relative to root
                sprite.position.set(
                    targetPos.x + (Math.random() - 0.5) * noise,
                    targetPos.y + (Math.random() - 0.5) * noise,
                    targetPos.z + (Math.random() - 0.5) * noise
                );

                const ratio = 1 - (i / this.tailCount);
                const scale = 2.0 * ratio;
                sprite.scale.set(scale, scale, scale);
                sprite.material.opacity = 0.3 * ratio;
            }
        }
    }

    dispose() {
        this.scene.remove(this.root);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.tailSprites.forEach(s => s.material.dispose());
    }
}
