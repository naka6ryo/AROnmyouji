/**
 * SlashProjectileManager.js
 * 斬撃飛翔体（円弧）の生成・更新・衝突判定を行うクラス
 * Optimized: Reuses Mesh and scales it to avoid per-frame Geometry creation.
 */

import * as THREE from 'three';

const PERFORMANCE_PROFILES = {
    normal: { tubeScale: 1, radialScale: 1, sparkScale: 1 },
    warm: { tubeScale: 0.68, radialScale: 0.75, sparkScale: 0.5 },
    hot: { tubeScale: 0.45, radialScale: 0.55, sparkScale: 0 }
};

export class SlashProjectileManager {
    constructor(scene, camera, getPivotWorldPosition, debugOverlay = null) {
        this.scene = scene;
        this.camera = camera;
        this.getPivotWorldPosition = getPivotWorldPosition; // 関数として受け取る
        this.debugOverlay = debugOverlay;

        this.projectiles = [];
        this.performanceMode = 'normal';
        this.performanceProfile = PERFORMANCE_PROFILES.normal;
        this.SLASH_SPEED = 8.0; // m/s
        this.SLASH_LIFETIME = 1500; // ms
        this._cameraPos = new THREE.Vector3();
        this._moveScratch = new THREE.Vector3();
        this._enemyWorld = new THREE.Vector3();
        this._startWorld = new THREE.Vector3();
        this._endWorld = new THREE.Vector3();
        this._ab = new THREE.Vector3();
        this._ap = new THREE.Vector3();
        this._closest = new THREE.Vector3();
        this._slashNormal = new THREE.Vector3();
        this._slashTangent = new THREE.Vector3();
        this._slashSparkOffset = new THREE.Vector3();
    }

    setPerformanceMode(mode) {
        this.performanceMode = PERFORMANCE_PROFILES[mode] ? mode : 'normal';
        this.performanceProfile = PERFORMANCE_PROFILES[this.performanceMode];
    }

    /**
     * 円弧飛翔体を追加
     */
    addProjectile(startPyr, endPyr, intensity, options = {}) {
        // 始点と終点の3D位置を計算（半径0.3m -> 1.5倍）
        const baseRadius = 0.3 * 1.5;

        const startPitchRad = startPyr.pitch * Math.PI / 180;
        const startYawRad = startPyr.yaw * Math.PI / 180;
        const startPos = new THREE.Vector3(
            baseRadius * Math.cos(startPitchRad) * Math.sin(startYawRad),
            baseRadius * Math.sin(startPitchRad),
            -baseRadius * Math.cos(startPitchRad) * Math.cos(startYawRad)
        );

        const endPitchRad = endPyr.pitch * Math.PI / 180;
        const endYawRad = endPyr.yaw * Math.PI / 180;
        const endPos = new THREE.Vector3(
            baseRadius * Math.cos(endPitchRad) * Math.sin(endYawRad),
            baseRadius * Math.sin(endPitchRad),
            -baseRadius * Math.cos(endPitchRad) * Math.cos(endYawRad)
        );

        // 2点を含む円弧を作成 (Base Geometry at scale 1.0)
        const slashGroup = this.createSlashGroup(startPos, endPos, intensity, options);
        if (!slashGroup) return;

        // カメラの現在位置を基準に配置
        const cameraPos = this._cameraPos;
        this.camera.getWorldPosition(cameraPos);

        slashGroup.position.copy(cameraPos);
        this.scene.add(slashGroup);

        // 飛翔体として記録
        const projectile = {
            mesh: slashGroup,
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            speed: this.SLASH_SPEED,
            spawnTime: performance.now(),
            intensity,
            direction: options.direction
                ? new THREE.Vector3(options.direction.x || 0, options.direction.y || 0, options.direction.z || 0).normalize()
                : this.camera.getWorldDirection(new THREE.Vector3()).normalize(),
            hitEnemies: new Set(),
            baseOpacity: 0.75 + intensity * 0.2,
            visualScale: 1.0 + Math.max(0.5, Math.min(2.0, intensity || 1.0)) * 0.04
        };

        this.projectiles.push(projectile);

        
    }

    /**
     * 飛翔体を更新
     */
    update(deltaTime, enemies, onHitCallback) {
        const now = performance.now();
        const deltaTimeSec = deltaTime / 1000;

        this.projectiles = this.projectiles.filter(proj => {
            const age = now - proj.spawnTime;

            if (age >= this.SLASH_LIFETIME) {
                // 寿命切れ
                this.disposeProjectileMesh(proj);
                return false;
            }

            // 時間経過で円弧の半径を拡大 (Scale)
            const lifeFraction = age / this.SLASH_LIFETIME;
            const radiusScale = 1.0 + lifeFraction * 15.67; // 最大5m

            // 敵との衝突判定
            if (enemies && onHitCallback) {
                for (const enemy of enemies) {
                    if (proj.hitEnemies.has(enemy.id)) continue;

                    const hit = this.checkCollision(proj, radiusScale, enemy);

                    if (hit) {
                        proj.hitEnemies.add(enemy.id);

                        // コールバック呼び出し
                        onHitCallback({
                            enemy: enemy,
                            intensity: proj.intensity
                        });

                        break; // 1フレーム1体
                    }
                }
            }

            // メッシュ更新（拡大・移動・発光の揺らぎ）
            this.updateProjectileMesh(proj, radiusScale, lifeFraction, deltaTimeSec);

            return true;
        });
    }

    /**
     * メッシュの更新
     */
    updateProjectileMesh(proj, radiusScale, lifeFraction, deltaTimeSec) {
        // Move
        proj.mesh.position.add(this._moveScratch.copy(proj.direction).multiplyScalar(proj.speed * deltaTimeSec));

        // Keep the slash straight and visible while it travels.
        const slashPulse = 1.0 + Math.sin(lifeFraction * Math.PI) * 0.03 * Math.min(1.6, proj.intensity);
        const visualScale = proj.visualScale || 1.0;
        proj.mesh.scale.set(radiusScale * visualScale, radiusScale * visualScale * slashPulse, radiusScale * visualScale);

        proj.mesh.traverse(child => {
            if (!child.material) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
                const baseOpacity = material.userData.baseOpacity ?? proj.baseOpacity;
                const flicker = material.userData.flicker
                    ? 0.82 + Math.sin((performance.now() + material.userData.flickerOffset) * 0.035) * 0.18
                    : 1.0;
                material.opacity = baseOpacity * flicker;
            }
        });
    }

    /**
     * 衝突判定
     */
    checkCollision(proj, radiusScale, enemy) {
        // cameraPivotのワールド座標を基準にする
        const pivotPos = this.getPivotWorldPosition();

        // 敵のワールド座標
        const azimRad = enemy.azim * Math.PI / 180;
        const elevRad = enemy.elev * Math.PI / 180;
        const r = enemy.distance;
        const enemyWorld = this._enemyWorld.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        ).add(pivotPos);

        // 斬撃円弧の始点・終点（pivot基準）
        // mesh.position includes the camera offset and movement. 
        // We need to calculate the arc position in world space.
        // The mesh origin is the "center of curvature" (initially cameraPos).
        // Since we scale the mesh, the local vertex (0,0,0) stays at mesh.position.
        // Wait, the "startPos" stored in proj is relative to the mesh origin.
        // So RealWorldPos = mesh.position + (startPos * radiusScale). (orientation is identity)

        const startWorld = this._startWorld.copy(proj.startPos).multiplyScalar(radiusScale).add(proj.mesh.position);
        const endWorld = this._endWorld.copy(proj.endPos).multiplyScalar(radiusScale).add(proj.mesh.position);

        // Note: The original logic used pivotPos as the center of calculation.
        // However, proj.mesh.position moves AWAY from the camera/pivot.
        // Original logic:
        // const startWorld = proj.startPos.clone().multiplyScalar(radiusScale).add(pivotPos);
        // But original logic also RECREATED the mesh at a new position? 
        // No, original logic used `cameraPos` for placement, and updated position via `add(direction*speed)`.
        // BUT original collision logic `checkCollision` seems to ignore the proj.mesh.position and assumes it's centered at pivot??
        // Let's re-read original `checkCollision`.
        // `const startWorld = proj.startPos.clone().multiplyScalar(radiusScale).add(pivotPos);`
        // It uses `pivotPos`! This implies the collision logic assumed the slash originates from the STATIC pivot, 
        // or that `pivotPos` tracks the camera? `getPivotWorldPosition` tracks the pivot.
        // BUT the mesh moves visibly.
        // This suggests the generic collision logic was slightly decoupled from the visual mesh in the original code?
        // Or `startPos` was relative to pivot?

        // If the slash moves physically through space, collision should check against the moving slash.
        // `proj.mesh.position` is the center of the arc in world space.
        // So using `proj.mesh.position` is correct for Visual correctness.
        // I will use `proj.mesh.position` to be accurate to the visual.

        // However, if `pivotPos` is essentially `(0,0,0)` if the player doesn't walk, then it's fine.
        // But if the player walks?
        // Let's stick to the VISUAL position of the mesh.

        // 線分（円弧の弦）と点の距離
        const ab = this._ab.copy(endWorld).sub(startWorld);
        const ap = this._ap.copy(enemyWorld).sub(startWorld);
        const t = Math.max(0, Math.min(1, ab.dot(ap) / ab.lengthSq()));
        const closest = this._closest.copy(startWorld).add(ab.multiplyScalar(t));
        const distToArc = enemyWorld.distanceTo(closest);

        // 判定閾値
        const enemyRadius = enemy.radius ?? 0.5;
        const margin = 0.3;

        return distToArc <= enemyRadius + margin;
    }

    /**
     * 円弧メッシュ作成
     */
    createSlashGroup(startPos, endPos, intensity, options = {}) {
        const points = this.createSlashCurvePoints(startPos, endPos, intensity);
        const curve = new THREE.CatmullRomCurve3(points);
        const strength = Math.max(0.5, Math.min(2.0, intensity || 1.0));
        const colors = options.colors || {};
        const materialOptions = options.material || {};
        const opacityScale = materialOptions.opacityScale ?? 1;
        const useSparks = materialOptions.sparks !== false;
        const profile = this.performanceProfile || PERFORMANCE_PROFILES.normal;
        const group = new THREE.Group();
        group.frustumCulled = false;

        const bladeLengthBoost = 1.0 + strength * 0.04;
        group.scale.set(bladeLengthBoost, bladeLengthBoost, bladeLengthBoost);

        const glowGeometry = this.createTaperedSlashGeometry(curve, this.scaleSegments(36, profile.tubeScale), 0.026 + strength * 0.004, this.scaleSegments(10, profile.radialScale), 0.16);
        const glowMaterial = this.createSlashMaterial(colors.glow ?? 0x00c8ff, (0.18 + strength * 0.04) * opacityScale, true, materialOptions);
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.userData.role = 'glow';
        group.add(glowMesh);

        const edgeGeometry = this.createTaperedSlashGeometry(curve, this.scaleSegments(38, profile.tubeScale), 0.017 + strength * 0.003, this.scaleSegments(9, profile.radialScale), 0.13);
        const edgeMaterial = this.createSlashMaterial(colors.edge ?? 0x64f6ff, (0.38 + strength * 0.05) * opacityScale, true, materialOptions);
        const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edgeMesh.userData.role = 'edge';
        group.add(edgeMesh);

        const coreGeometry = this.createTaperedSlashGeometry(curve, this.scaleSegments(42, profile.tubeScale), 0.0075 + strength * 0.0018, this.scaleSegments(8, profile.radialScale), 0.08);
        const coreMaterial = this.createSlashMaterial(colors.core ?? 0xffffff, (0.88 + strength * 0.04) * opacityScale, false, materialOptions);
        const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
        coreMesh.userData.role = 'core';
        group.add(coreMesh);

        const tailCurve = new THREE.CatmullRomCurve3(this.createTailCurvePoints(points));
        const tailGeometry = this.createTaperedSlashGeometry(tailCurve, this.scaleSegments(26, profile.tubeScale), 0.012 + strength * 0.002, this.scaleSegments(8, profile.radialScale), 0.1);
        const tailMaterial = this.createSlashMaterial(colors.tail ?? 0x0077ff, (0.12 + strength * 0.03) * opacityScale, true, materialOptions);
        const tailMesh = new THREE.Mesh(tailGeometry, tailMaterial);
        tailMesh.userData.role = 'tail';
        group.add(tailMesh);

        if (useSparks) {
            this.addSparkLines(group, points, strength);
        }

        return group;
    }

    scaleSegments(base, scale) {
        return Math.max(4, Math.round(base * scale));
    }

    createSlashCurvePoints(startPos, endPos, intensity) {
        const strength = Math.max(0.5, Math.min(2.0, intensity || 1.0));
        const points = [startPos.clone()];
        for (let i = 1; i < 5; i++) {
            const t = i / 5;
            const midPoint = new THREE.Vector3();
            midPoint.lerpVectors(startPos, endPos, t);
            midPoint.multiplyScalar(1.0 + Math.sin(t * Math.PI) * (0.28 + strength * 0.05)); // 膨らみ
            points.push(midPoint);
        }
        points.push(endPos.clone());
        return points;
    }

    createTailCurvePoints(points) {
        const tailPoints = [];
        for (let i = 0; i < points.length; i++) {
            const t = i / (points.length - 1);
            const p = points[i].clone();
            p.multiplyScalar(0.88 - Math.sin(t * Math.PI) * 0.08);
            tailPoints.push(p);
        }
        return tailPoints;
    }

    createTaperedSlashGeometry(curve, tubularSegments, maxRadius, radialSegments, tipRadiusFactor = 0.12) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const up = new THREE.Vector3(0, 1, 0);
        const altUp = new THREE.Vector3(1, 0, 0);
        const tangent = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const binormal = new THREE.Vector3();

        for (let i = 0; i <= tubularSegments; i++) {
            const t = i / tubularSegments;
            const center = curve.getPointAt(t);
            tangent.copy(curve.getTangentAt(t)).normalize();
            normal.crossVectors(Math.abs(tangent.dot(up)) > 0.92 ? altUp : up, tangent).normalize();
            binormal.crossVectors(tangent, normal).normalize();

            const middleWeight = Math.sin(t * Math.PI);
            const radius = maxRadius * (tipRadiusFactor + (1.0 - tipRadiusFactor) * Math.pow(middleWeight, 0.85));

            for (let j = 0; j < radialSegments; j++) {
                const v = j / radialSegments;
                const angle = v * Math.PI * 2;
                const radialScale = 0.72 + Math.abs(Math.sin(angle)) * 0.28;
                const ringNormal = new THREE.Vector3()
                    .copy(normal).multiplyScalar(Math.cos(angle) * radialScale)
                    .add(binormal.clone().multiplyScalar(Math.sin(angle)))
                    .normalize();
                const vertex = center.clone().add(ringNormal.clone().multiplyScalar(radius));

                vertices.push(vertex.x, vertex.y, vertex.z);
                normals.push(ringNormal.x, ringNormal.y, ringNormal.z);
                uvs.push(t, v);
            }
        }

        for (let i = 0; i < tubularSegments; i++) {
            for (let j = 0; j < radialSegments; j++) {
                const a = i * radialSegments + j;
                const b = i * radialSegments + ((j + 1) % radialSegments);
                const c = (i + 1) * radialSegments + j;
                const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
                indices.push(a, c, b, b, c, d);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setIndex(indices);
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.computeBoundingSphere();
        return geometry;
    }

    createSlashMaterial(color, opacity, flicker, options = {}) {
        const blending = options.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending;
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: Math.max(0, Math.min(1, opacity)),
            side: THREE.DoubleSide,
            blending,
            depthWrite: false
        });
        material.userData.baseOpacity = opacity;
        material.userData.flicker = flicker;
        material.userData.flickerOffset = Math.random() * 1000;
        return material;
    }

    addSparkLines(group, points, strength) {
        const slashDir = this._slashTangent.copy(points[points.length - 1]).sub(points[0]);
        if (slashDir.lengthSq() < 0.000001) {
            slashDir.set(1, 0, 0);
        } else {
            slashDir.normalize();
        }
        const slashNormal = this._slashNormal.set(-slashDir.y, slashDir.x, slashDir.z * 0.2).normalize();
        const profile = this.performanceProfile || PERFORMANCE_PROFILES.normal;
        const sparkCount = Math.round((4 + strength * 5) * profile.sparkScale);
        if (sparkCount <= 0) return;

        for (let i = 0; i < sparkCount; i++) {
            const t = (i + 0.5) / sparkCount;
            const base = new THREE.Vector3().lerpVectors(points[0], points[points.length - 1], t);
            base.multiplyScalar(1.0 + Math.sin(t * Math.PI) * 0.25);

            const side = i % 2 === 0 ? 1 : -1;
            const spread = (0.035 + Math.random() * 0.055) * side * strength;
            const length = 0.08 + Math.random() * 0.13 * strength;
            const offset = this._slashSparkOffset.copy(slashNormal).multiplyScalar(spread);
            const sparkStart = base.clone().add(offset);
            const sparkEnd = sparkStart.clone()
                .add(slashDir.clone().multiplyScalar(length * (0.35 + Math.random() * 0.45)))
                .add(slashNormal.clone().multiplyScalar(spread * 1.7));

            const sparkGeometry = new THREE.BufferGeometry().setFromPoints([sparkStart, sparkEnd]);
            const sparkMaterial = new THREE.LineBasicMaterial({
                color: Math.random() > 0.35 ? 0xeaffff : 0x61e7ff,
                transparent: true,
                opacity: 0.35 + strength * 0.12,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            sparkMaterial.userData.baseOpacity = sparkMaterial.opacity;
            sparkMaterial.userData.flicker = true;
            sparkMaterial.userData.flickerOffset = Math.random() * 1000;

            const spark = new THREE.Line(sparkGeometry, sparkMaterial);
            spark.userData.role = 'spark';
            group.add(spark);
        }
    }

    /**
     * メッシュ破棄補助
     */
    disposeProjectileMesh(proj) {
        if (proj.mesh) {
            this.scene.remove(proj.mesh);
            proj.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    for (const material of materials) {
                        material.dispose();
                    }
                }
            });
        }
    }

    /**
     * 全破棄
     */
    dispose() {
        for (const proj of this.projectiles) {
            this.disposeProjectileMesh(proj);
        }
        this.projectiles = [];
    }

    reset() {
        this.dispose();
    }
}
