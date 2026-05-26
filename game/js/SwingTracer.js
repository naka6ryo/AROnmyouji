/**
 * SwingTracer.js
 * 術式段階の軌跡表示を管理するクラス
 * Optimized: Reuses Material.
 */

import * as THREE from 'three';
import { tracerVertexShader, tracerFragmentShader, tubeVertexShader } from './Shaders.js';

export class SwingTracer {
    constructor(scene, camera = null) {
        this.scene = scene;
        this.camera = camera;
        this.parent = camera || scene;
        this.mesh = null;
        this.TRACER_CENTER_Z = -0.4;
        this.root = new THREE.Object3D();
        this.root.position.set(0, 0, this.TRACER_CENTER_Z);
        this.parent.add(this.root);
        this._cameraWorldQuaternion = new THREE.Quaternion();
        this._worldToCameraQuaternion = new THREE.Quaternion();
        this._directionScratch = new THREE.Vector3();
        this._lastTrajectorySignature = '';
        this._lastBuildTime = 0;

        this.TRACER_RADIUS = 0.4 * 1.5; // 球面半径（カメラ回転中心から）
        this.TRACER_BASE_WIDTH = 0.006 * 1.5 * 3; // 軌跡基本幅（4.5倍）

        this._startTime = performance.now();

        // Shared material (Pre-compiled)
        this.material = new THREE.ShaderMaterial({
            vertexShader: tubeVertexShader,
            fragmentShader: tracerFragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uColorCore: { value: new THREE.Color(0x000000) },
                uColorEdge: { value: new THREE.Color(0x0066ff) }
            },
            transparent: true,
            depthTest: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
    }

    /**
     * 軌跡表示開始
     */
    start() {
        this.disposeMesh();
        this._lastTrajectorySignature = '';
        this._lastBuildTime = 0;
    }

    /**
     * 軌跡更新
     */
    update(trajectory) {
        if (!trajectory || trajectory.length < 2) return;

        const now = performance.now();
        const signature = this.getTrajectorySignature(trajectory);
        if (signature === this._lastTrajectorySignature && now - this._lastBuildTime < 48) {
            return;
        }
        this._lastTrajectorySignature = signature;
        this._lastBuildTime = now;

        this.disposeMesh();

        // 軌跡から 3D 点列を作成
        const pts = [];
        for (const pt of trajectory) {
            pts.push(this.pyrToCameraLocalPoint(pt.pitch, pt.yaw));
        }

        if (pts.length < 2) return;

        // Catmull-Rom 曲線で補間
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubularSegments = Math.max(20, pts.length * 3);
        const radius = Math.max(0.001, this.TRACER_BASE_WIDTH);
        const radialSegments = 10;

        const tubeGeometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);

        // Update Uniforms
        this.material.uniforms.uTime.value = (now - this._startTime) * 0.001;

        this.mesh = new THREE.Mesh(tubeGeometry, this.material);
        this.mesh.frustumCulled = false;
        this.root.add(this.mesh);
    }

    getTrajectorySignature(trajectory) {
        const first = trajectory[0];
        const last = trajectory[trajectory.length - 1];
        const mid = trajectory[Math.floor(trajectory.length / 2)] || last;
        const bucket = (value) => Math.round((value || 0) * 2);
        return [
            trajectory.length,
            bucket(first.pitch), bucket(first.yaw),
            bucket(mid.pitch), bucket(mid.yaw),
            bucket(last.pitch), bucket(last.yaw)
        ].join(':');
    }

    /**
     * 時間更新（シェーダー用）
     */
    updateTime() {
        if (this.material && this.material.uniforms) {
            this.material.uniforms.uTime.value = (performance.now() - this._startTime) * 0.001;
        }
    }

    pyrToCameraLocalPoint(pitch, yaw) {
        const pitchRad = pitch * Math.PI / 180;
        const yawRad = yaw * Math.PI / 180;
        const direction = this._directionScratch.set(
            Math.cos(pitchRad) * Math.sin(yawRad),
            Math.sin(pitchRad),
            -Math.cos(pitchRad) * Math.cos(yawRad)
        );

        if (this.camera) {
            this.camera.getWorldQuaternion(this._cameraWorldQuaternion);
            this._worldToCameraQuaternion.copy(this._cameraWorldQuaternion).invert();
            direction.applyQuaternion(this._worldToCameraQuaternion);
        }

        return direction.clone().multiplyScalar(this.TRACER_RADIUS);
    }

    /**
     * 軌跡終了
     */
    end() {
        this.disposeMesh();
        this._lastTrajectorySignature = '';
        this._lastBuildTime = 0;
    }

    /**
     * メッシュ破棄
     */
    disposeMesh() {
        if (this.mesh) {
            this.root.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            // Do not dispose shared material here
            this.mesh = null;
        }
    }

    /**
     * 完全削除
     */
    dispose() {
        this.disposeMesh();
        if (this.root) {
            this.parent.remove(this.root);
            this.root = null;
        }
        if (this.material) this.material.dispose();
    }

    reset() {
        this.disposeMesh();
        this._lastTrajectorySignature = '';
        this._lastBuildTime = 0;
        // Do not dispose material as it is shared/reused
    }
}
