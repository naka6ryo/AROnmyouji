/**
 * Renderer.js
 * Three.jsを使用したカメラ背景、3D描画、UI同期を行うクラス
 */

export class Renderer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        
        // Three.js セットアップ
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            60, // FOV
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

        // 手を伸ばして端末を持つ前提で、回転中心とカメラ位置を分離
        // pivotを身体側に置き、カメラを少し前方かつわずかに下げる
        this.cameraPivot = new THREE.Object3D();
        this.scene.add(this.cameraPivot);
        this.cameraPivot.add(this.camera);
        this.camera.position.set(0, -0.05, 0.35);

        // 端末を縦向きで持つことを基準に、X軸へ-90度オフセット
        this.orientationOffset = new THREE.Euler(-Math.PI / 2, 0, 0, 'YXZ');
        
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true, // 背景透過
            antialias: true
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.updateRendererSize();
        
        // 端末姿勢（視点制御用）
        this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
        this.viewDirection = { x: 0, y: 0, z: 1 };
        
        // 敵のメッシュ管理
        this.enemyMeshes = new Map(); // enemyId -> mesh
        
        // 斬撃飛翔体の管理
        this.slashProjectiles = [];
        this.SLASH_SPEED = 8.0; // m/s
        this.SLASH_LIFETIME = 1500; // ms
        
        // ライト
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
        
        // リサイズ対応
        window.addEventListener('resize', () => this.onResize());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.onResize());
        }
        
        console.log('[Renderer] 初期化完了');
    }
    
    /**
     * 端末姿勢を更新（DeviceOrientationEvent）
     */
    updateDeviceOrientation(event) {
        this.deviceOrientation = {
            alpha: event.alpha || 0,  // Z軸回転
            beta: event.beta || 0,    // X軸回転
            gamma: event.gamma || 0   // Y軸回転
        };
        
        // 視線方向ベクトルを計算
        this.viewDirection = this.calculateViewDirection();
        
        // カメラの向きを更新
        this.updateCameraRotation();
    }
    
    /**
     * 視線方向ベクトルを計算
     */
    calculateViewDirection() {
        const forward = this.getCameraForward();
        return { x: forward.x, y: forward.y, z: forward.z };
    }
    
    /**
     * カメラの回転を更新
     */
    updateCameraRotation() {
        const { alpha, beta, gamma } = this.deviceOrientation;
        const euler = new THREE.Euler(
            beta * Math.PI / 180,
            alpha * Math.PI / 180,
            -gamma * Math.PI / 180,
            'YXZ'
        );
        euler.x += this.orientationOffset.x;
        euler.y += this.orientationOffset.y;
        euler.z += this.orientationOffset.z;
        this.cameraPivot.rotation.copy(euler);
        // 実際のワールド前方を再取得（カメラ位置オフセット後）
        const forward = this.getCameraForward();
        this.viewDirection = { x: forward.x, y: forward.y, z: forward.z };
    }
    
    /**
     * 敵を追加
     */
    addEnemy(enemy) {
        // 簡易的な敵メッシュ（赤い球体）
        const geometry = new THREE.SphereGeometry(0.3, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        const mesh = new THREE.Mesh(geometry, material);
        
        // 位置を設定（球面座標 -> デカルト座標）
        this.updateEnemyPosition(mesh, enemy);
        
        this.scene.add(mesh);
        this.enemyMeshes.set(enemy.id, mesh);
        
        console.log(`[Renderer] 敵メッシュ追加: id=${enemy.id}`);
    }
    
    /**
     * 敵の位置を更新
     */
    updateEnemyPosition(mesh, enemy) {
        const azimRad = enemy.azim * Math.PI / 180;
        const elevRad = enemy.elev * Math.PI / 180;
        const r = enemy.distance;
        
        mesh.position.set(
            r * Math.cos(elevRad) * Math.sin(azimRad),
            r * Math.sin(elevRad),
            -r * Math.cos(elevRad) * Math.cos(azimRad)
        );
    }
    
    /**
     * 敵を削除
     */
    removeEnemy(enemyId) {
        const mesh = this.enemyMeshes.get(enemyId);
        if (mesh) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            this.enemyMeshes.delete(enemyId);
            console.log(`[Renderer] 敵メッシュ削除: id=${enemyId}`);
        }
    }
    
    /**
     * 全敵の位置を更新
     */
    updateEnemies(enemies) {
        for (const enemy of enemies) {
            const mesh = this.enemyMeshes.get(enemy.id);
            if (mesh) {
                this.updateEnemyPosition(mesh, enemy);
            }
        }
    }
    
    /**
     * 斬撃飛翔体を追加（軌跡円弧版）
     */
    addSlashProjectile(direction, intensity, trajectory) {
        if (!trajectory || trajectory.length < 2) {
            console.warn('[Renderer] 軌跡データが不足しています');
            return;
        }
        
        // 軌跡から円弧メッシュを生成
        const arcMesh = this.createArcMeshFromTrajectory(trajectory, intensity);
        
        if (!arcMesh) {
            console.warn('[Renderer] 円弧メッシュ生成に失敗');
            return;
        }
        
        // カメラの現在位置を取得
        const cameraPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraPos);
        
        // カメラの前方方向
        const cameraForward = new THREE.Vector3();
        this.camera.getWorldDirection(cameraForward);
        
        // 円弧の中心をカメラから少し前方に配置
        arcMesh.position.copy(cameraPos);
        arcMesh.position.add(cameraForward.multiplyScalar(0.5));
        
        this.scene.add(arcMesh);
        
        // 飛翔体として記録
        const projectile = {
            mesh: arcMesh,
            direction: { ...direction },
            speed: this.SLASH_SPEED,
            spawnTime: performance.now(),
            intensity,
            initialScale: 1.0, // 初期スケール
            trajectory: trajectory // 軌跡データ保持
        };
        
        this.slashProjectiles.push(projectile);
        
        console.log(`[Renderer] 斬撃円弧生成: 軌跡点数=${trajectory.length}, 強度=${intensity.toFixed(2)}`);
    }
    
    /**
     * 軌跡データから円弧メッシュを生成
     */
    createArcMeshFromTrajectory(trajectory, intensity) {
        const points = [];
        
        // 軌跡の姿勢角から3D空間の点群を生成
        for (const point of trajectory) {
            const pitchRad = point.pitch * Math.PI / 180;
            const yawRad = point.yaw * Math.PI / 180;
            
            // 球面座標から直交座標へ（半径0.3の球面上）
            const r = 0.3;
            const x = r * Math.cos(pitchRad) * Math.sin(yawRad);
            const y = r * Math.sin(pitchRad);
            const z = -r * Math.cos(pitchRad) * Math.cos(yawRad);
            
            points.push(new THREE.Vector3(x, y, z));
        }
        
        if (points.length < 2) return null;
        
        // CatmullRomCurveで滑らかな曲線を作成
        const curve = new THREE.CatmullRomCurve3(points);
        
        // 曲線から太い線（チューブ）を生成
        const tubeGeometry = new THREE.TubeGeometry(
            curve,
            Math.max(20, points.length * 2), // セグメント数
            0.02, // チューブの半径
            8, // 断面の分割数
            false // 閉じていない
        );
        
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
     * 斬撃飛翔体を更新（円弧版：半径を拡大しながら飛ぶ）
     */
    updateSlashProjectiles(deltaTime) {
        const now = performance.now();
        const deltaTimeSec = deltaTime / 1000;
        
        // 寿命切れをフィルタ
        this.slashProjectiles = this.slashProjectiles.filter(proj => {
            const age = now - proj.spawnTime;
            
            if (age >= this.SLASH_LIFETIME) {
                // 寿命切れ：削除
                this.scene.remove(proj.mesh);
                proj.mesh.geometry.dispose();
                proj.mesh.material.dispose();
                return false;
            }
            
            // 時間経過で半径を拡大（スケールを大きくする）
            const scaleFactor = 1.0 + (age / this.SLASH_LIFETIME) * 4.0; // 最大5倍
            proj.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
            
            // 位置も前方に移動
            proj.mesh.position.x += proj.direction.x * proj.speed * deltaTimeSec;
            proj.mesh.position.y += proj.direction.y * proj.speed * deltaTimeSec;
            proj.mesh.position.z += proj.direction.z * proj.speed * deltaTimeSec;
            
            // 透明度をフェードアウト
            const lifeFraction = age / this.SLASH_LIFETIME;
            proj.mesh.material.opacity = (0.7 + proj.intensity * 0.3) * (1 - lifeFraction);
            
            return true;
        });
    }
    
    /**
     * 描画
     */
    render(deltaTime) {
        this.updateRendererSize();
        this.updateSlashProjectiles(deltaTime);
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * リサイズ処理
     */
    onResize() {
        this.updateRendererSize();
    }
    
    /**
     * 視線方向を取得
     */
    getViewDirection() {
        return this.viewDirection;
    }

    /**
     * 任意のワールド座標をNDCに射影
     */
    projectToNdc(worldPos) {
        const v = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
        v.project(this.camera);
        return v; // x,y,zが-1〜1に正規化された座標
    }

    /**
     * カメラのワールド前方ベクトルを取得
     */
    getCameraForward() {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        return dir.normalize();
    }

    /**
     * レンダラーとカメラのサイズをキャンバス実寸に合わせる
     */
    updateRendererSize() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
            this.renderer.setSize(width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
    }

    /**
     * カメラFOVの半角（度）を取得
     */
    getHalfFovDegrees() {
        return this.camera.fov / 2;
    }

    /**
     * 水平方向FOVの半角（度）を取得
     */
    getHalfFovHorizontalDegrees() {
        const halfVertRad = (this.camera.fov * Math.PI / 180) / 2;
        const halfHorzRad = Math.atan(Math.tan(halfVertRad) * this.camera.aspect);
        return halfHorzRad * 180 / Math.PI;
    }
    
    /**
     * クリーンアップ
     */
    dispose() {
        // 全メッシュを削除
        for (const [id, mesh] of this.enemyMeshes.entries()) {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        this.enemyMeshes.clear();
        
        // 斬撃飛翔体を削除
        for (const proj of this.slashProjectiles) {
            this.scene.remove(proj.mesh);
            proj.mesh.geometry.dispose();
            proj.mesh.material.dispose();
        }
        this.slashProjectiles = [];
        
        this.renderer.dispose();
    }
}
