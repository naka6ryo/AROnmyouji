/**
 * SlashProjectileManager.js
 * 斬撃飛翔体（円弧）の生成・更新・衝突判定を行うクラス
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
        // 始点と終点の3D位置を計算（半径0.3m）
        const baseRadius = 0.3;

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

        // 2点を含む円弧を作成
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
            currentRadius: baseRadius,
            direction: this.camera.getWorldDirection(new THREE.Vector3()).normalize(),
            hitEnemies: new Set()
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

            // 時間経過で円弧の半径を拡大
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
     * メッシュの更新（再生成含む）
     */
    updateProjectileMesh(proj, radiusScale, lifeFraction, deltaTimeSec) {
        const newStartPos = proj.startPos.clone().multiplyScalar(radiusScale);
        const newEndPos = proj.endPos.clone().multiplyScalar(radiusScale);

        // 新メッシュを作成
        const newMesh = this.createArcMesh(newStartPos, newEndPos, proj.intensity);

        if (newMesh) {
            newMesh.position.copy(proj.mesh.position);
            newMesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));

            // フェードアウト
            newMesh.material.opacity = (0.7 + proj.intensity * 0.3) * (1 - lifeFraction);

            // 置き換え
            this.disposeProjectileMesh(proj);
            this.scene.add(newMesh);
            proj.mesh = newMesh;
        } else {
            // 移動のみ
            proj.mesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * deltaTimeSec));
            proj.mesh.material.opacity = (0.7 + proj.intensity * 0.3) * (1 - lifeFraction);
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
        const startWorld = proj.startPos.clone().multiplyScalar(radiusScale).add(pivotPos); // startPosは正規化されていないが、初期半径ベースなのでSCALAR倍する
        const endWorld = proj.endPos.clone().multiplyScalar(radiusScale).add(pivotPos);

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
