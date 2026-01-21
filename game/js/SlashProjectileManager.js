/**
 * SlashProjectileManager.js
 * 斬撃飛翔体（円弧）の生成・更新・衝突判定を行うクラス
 * Optimized: Reuses Mesh and scales it to avoid per-frame Geometry creation.
 */

import * as THREE from 'three';

export class SlashProjectileManager {
    constructor(scene, camera, getPivotWorldPosition, debugOverlay = null) {
        this.scene = scene;
        this.camera = camera;
        this.getPivotWorldPosition = getPivotWorldPosition; // 関数として受け取る
        this.debugOverlay = debugOverlay;

        this.projectiles = [];
        this.SLASH_SPEED = 8.0; // m/s
        this.SLASH_LIFETIME = 1500; // ms
    }

    /**
     * 円弧飛翔体を追加
     */
    addProjectile(startPyr, endPyr, intensity) {
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
        const arcMesh = this.createArcMesh(startPos, endPos, intensity);
        if (!arcMesh) return;

        // カメラの現在位置を基準に配置
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);

        arcMesh.position.copy(cameraPos);
        this.scene.add(arcMesh);

        // 飛翔体として記録
        const projectile = {
            mesh: arcMesh,
            startPos: startPos.clone(),
            endPos: endPos.clone(),
            speed: this.SLASH_SPEED,
            spawnTime: performance.now(),
            intensity,
            direction: this.camera.getWorldDirection(new THREE.Vector3()).normalize(),
            hitEnemies: new Set(),
            baseOpacity: 0.7 + intensity * 0.3
        };

        this.projectiles.push(projectile);

        console.log(`[SlashManager] 円弧飛翔体生成: intensity=${intensity.toFixed(2)}`);
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

                        if (this.debugOverlay) {
                            this.debugOverlay.logInfo(`斬撃命中: id=${enemy.id}`);
                        }

                        break; // 1フレーム1体
                    }
                }
            }

            // メッシュ更新（拡大・移動・フェード）
            this.updateProjectileMesh(proj, radiusScale, lifeFraction, deltaTimeSec);

            return true;
        });
    }

    /**
     * メッシュの更新
     */
    updateProjectileMesh(proj, radiusScale, lifeFraction, deltaTimeSec) {
        // Move
        proj.mesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));

        // Scale (Note: This scales tube thickness too, which is an acceptable tradeoff for performance here)
        proj.mesh.scale.set(radiusScale, radiusScale, radiusScale);

        // Fade
        // Need to check if material is transparent, which it is by default in createArcMesh
        if (proj.mesh.material) {
            proj.mesh.material.opacity = proj.baseOpacity * (1.0 - lifeFraction);
        }
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
        const enemyWorld = new THREE.Vector3(
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

        const startWorld = proj.startPos.clone().multiplyScalar(radiusScale).add(proj.mesh.position);
        const endWorld = proj.endPos.clone().multiplyScalar(radiusScale).add(proj.mesh.position);

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
        const ab = endWorld.clone().sub(startWorld);
        const ap = enemyWorld.clone().sub(startWorld);
        const t = Math.max(0, Math.min(1, ab.dot(ap) / ab.lengthSq()));
        const closest = startWorld.clone().add(ab.multiplyScalar(t));
        const distToArc = enemyWorld.distanceTo(closest);

        // 判定閾値
        const enemyRadius = 0.5;
        const margin = 0.3;

        return distToArc <= enemyRadius + margin;
    }

    /**
     * 円弧メッシュ作成
     */
    createArcMesh(startPos, endPos, intensity) {
        const points = [startPos];
        for (let i = 1; i < 5; i++) {
            const t = i / 5;
            const midPoint = new THREE.Vector3();
            midPoint.lerpVectors(startPos, endPos, t);
            midPoint.multiplyScalar(1.0 + Math.sin(t * Math.PI) * 0.3); // 膨らみ
            points.push(midPoint);
        }
        points.push(endPos);

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeometry = new THREE.TubeGeometry(curve, 20, 0.02, 8, false);

        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.7 + intensity * 0.3,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        return new THREE.Mesh(tubeGeometry, material);
    }

    /**
     * メッシュ破棄補助
     */
    disposeProjectileMesh(proj) {
        if (proj.mesh) {
            this.scene.remove(proj.mesh);
            if (proj.mesh.geometry) proj.mesh.geometry.dispose();
            if (proj.mesh.material) proj.mesh.material.dispose();
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
}
