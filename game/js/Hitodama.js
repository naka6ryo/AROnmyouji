import * as THREE from 'three';

export class Hitodama {
    constructor(scene, position = new THREE.Vector3(0, 0, 0)) {
        this.scene = scene;
        this.pos = position;
        this.time = 0;

        // 1. コア（球体）
        // 目標最大サイズ: 半径0.1 (以前の0.3の1/3)
        // 出現サイズ: 半径0.03 (以前の0.3の1/10 = 最大の0.3倍)
        const geometry = new THREE.SphereGeometry(0.1, 64, 64);

        // スプライト用テクスチャを先に読み込む
        const spriteMap = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/spark1.png');

        // 赤い発光マテリアル（コアの明るさを元に戻す）
        const material = new THREE.MeshStandardMaterial({
            color: 0xff3300, // 朱色っぽい赤
            emissive: 0xff0000, // 真っ赤に発光
            emissiveIntensity: 5.0, // 元の発光強度
            transparent: true,
            opacity: 0.9,
            roughness: 0.1,
            metalness: 0.1
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.pos); // 初期位置を設定

        // このオブジェクトはブルーム対象
        this.mesh.userData.bloom = true;

        // 初期スケール設定 (0.3倍からスタート)
        this.currentScale = 0.3;
        this.targetScale = 1.0;
        this.mesh.scale.set(this.currentScale, this.currentScale, this.currentScale);

        this.scene.add(this.mesh);

        // 中心グロウ用スプライト（簡易的な発光表現）
        const glowMaterial = new THREE.SpriteMaterial({
            map: spriteMap,
            color: 0xff6633,
            blending: THREE.AdditiveBlending,
            transparent: true,
            opacity: 0.6
        });
        this.coreGlow = new THREE.Sprite(glowMaterial);
        this.coreGlow.scale.set(0.6, 0.6, 1.0);
        this.coreGlow.position.copy(this.pos);
        this.scene.add(this.coreGlow);

        // 元の頂点位置を保存（アニメーション用）
        this.originalPositions = geometry.attributes.position.clone();

        // 2. 光源（人魂自体が周りを照らす）
        this.light = new THREE.PointLight(0xff4400, 50, 20); // 赤橙色の光
        this.light.position.copy(this.pos);
        this.scene.add(this.light);

        // 3. 尾（パーティクルシステム）
        this.tailCount = 40;
        this.tailPositions = [];
        // 尾の初期化
        for (let i = 0; i < this.tailCount; i++) {
            this.tailPositions.push(this.pos.clone());
        }

        // 尾のジオメトリとマテリアル
        this.tailSprites = [];

        // ベースのスプライトスケール (以前の0.75の1/3 = 0.25)
        this.baseSpriteScale = 0.25;

        for (let i = 0; i < this.tailCount; i++) {
            const spriteMaterial = new THREE.SpriteMaterial({
                map: spriteMap,
                color: 0xff5500, // 尾も赤橙色に設定
                transparent: true,
                opacity: 0.5,
                blending: THREE.AdditiveBlending
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            // 初期スケール適用
            const initialS = this.baseSpriteScale * this.currentScale;
            sprite.scale.set(initialS, initialS, initialS);
            this.scene.add(sprite);
            this.tailSprites.push(sprite);
            // スプライトもブルーム対象
            sprite.userData.bloom = true;
        }
    }

    update(dt) {
        this.time += dt;

        // --- スケール更新（徐々に大きくなる） ---
        if (this.currentScale < this.targetScale) {
            this.currentScale += dt * 0.5; // 2秒程度で最大化
            if (this.currentScale > this.targetScale) this.currentScale = this.targetScale;

            this.mesh.scale.set(this.currentScale, this.currentScale, this.currentScale);
        }

        // メッシュとライトの位置更新
        this.mesh.position.copy(this.pos);
        this.light.position.copy(this.pos);
        if (this.coreGlow) {
            this.coreGlow.position.copy(this.pos);
            const pulse = 1.0 + Math.sin(this.time * 6.0) * 0.08;
            const base = 0.6 * this.currentScale;
            this.coreGlow.scale.set(base * pulse, base * pulse, 1.0);
        }

        // --- 炎のゆらぎアニメーション (メラメラ感強化版) ---
        // ※位置は動きませんが、炎としてのゆらぎ（頂点アニメーション）は維持します。
        const positions = this.mesh.geometry.attributes.position;
        const originals = this.originalPositions;
        const count = positions.count;
        const r = 0.1; // 球の半径 (Base)

        for (let i = 0; i < count; i++) {
            const px = originals.getX(i);
            const py = originals.getY(i);
            const pz = originals.getZ(i);

            // 高さによる影響度: 下部はあまり動かず、上部(炎の先端)ほど激しく動く
            const h = Math.max(0, (py + r) / (r * 2)); // 0.0(底) ～ 1.0(頂上)
            const influence = Math.pow(h, 1.2);

            // メラメラ感を作る複数の波の合成
            const waveBaseX = Math.sin(py * 3.0 - this.time * 8.0);
            const waveBaseZ = Math.cos(py * 2.5 - this.time * 7.0);

            const waveDetailX = Math.sin(py * 12.0 - this.time * 18.0);
            const waveDetailZ = Math.cos(py * 14.0 - this.time * 16.0);

            // 振幅設定
            const amp = 0.12 * influence;

            // 合成
            const offsetX = (waveBaseX * 0.6 + waveDetailX * 0.4) * amp;
            const offsetZ = (waveBaseZ * 0.6 + waveDetailZ * 0.4) * amp;

            // 縦方向の脈動
            const offsetY = Math.sin(px * 8.0 + this.time * 12.0) * 0.08 * influence;

            // 頂点を更新
            positions.setX(i, px + offsetX);
            positions.setY(i, py + offsetY);
            positions.setZ(i, pz + offsetZ);
        }
        positions.needsUpdate = true;

        // --- 尾の更新 ---
        // 現在の位置を履歴の先頭に追加
        this.tailPositions.unshift(this.pos.clone());
        if (this.tailPositions.length > this.tailCount) {
            this.tailPositions.pop();
        }

        // スプライトを履歴の位置に配置
        // ※停止している場合、尾は本体と重なってゆらめきます。
        // 外部コードでHitodamaを動かした場合のみ、尾が伸びます。
        for (let i = 0; i < this.tailCount; i++) {
            const sprite = this.tailSprites[i];
            const targetPos = this.tailPositions[i];

            if (targetPos) {
                // 少しランダムに散らす
                const noise = 0.1 * (i / this.tailCount);
                sprite.position.set(
                    targetPos.x + (Math.random() - 0.5) * noise,
                    targetPos.y + (Math.random() - 0.5) * noise,
                    targetPos.z + (Math.random() - 0.5) * noise
                );

                // 古い尾ほど小さく、薄く
                const ratio = 1 - (i / this.tailCount);

                // max scale determined by currentScale and diminishing ratio
                const s = this.baseSpriteScale * this.currentScale * ratio * 4.0; // x4.0 to correct visibility

                sprite.scale.set(s, s, s);
                sprite.material.opacity = 0.3 * ratio;
            }
        }
    }

    dispose() {
        // リソース解放
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();

        this.scene.remove(this.light);

        if (this.coreGlow) {
            this.scene.remove(this.coreGlow);
            if (this.coreGlow.material) this.coreGlow.material.dispose();
        }

        for (const sprite of this.tailSprites) {
            this.scene.remove(sprite);
            sprite.material.dispose();
        }
    }
}
