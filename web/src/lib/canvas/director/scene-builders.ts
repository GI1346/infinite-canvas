import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
    DIRECTOR_ACTION_PRESETS,
    normalizeJoints,
    resolveCharacterPreset,
    sampleActionPose,
} from "./presets";
import type {
    DirectorCameraItem,
    DirectorCharacterItem,
    DirectorCustomAction,
    DirectorCustomAsset,
    DirectorKeyframe,
    DirectorPropItem,
    DirectorStageState,
    DirectorTimelineState,
    PoseJoints25,
} from "@/types/canvas";

const deg = (v: number) => (v * Math.PI) / 180;

export function toScale3(s: number | [number, number, number] | undefined): [number, number, number] {
    if (Array.isArray(s)) return [s[0] || 1, s[1] || 1, s[2] || 1];
    const n = typeof s === "number" && Number.isFinite(s) ? s : 1;
    return [n, n, n];
}

/** 运行时缓存已加载的 GLB/GLTF/FBX 3D 模型模板 */
const loadedModelCache = new Map<string, THREE.Object3D>();
const loadingModelPromises = new Map<string, Promise<THREE.Object3D | null>>();

export async function loadCustomAssetModel(asset: DirectorCustomAsset): Promise<THREE.Object3D | null> {
    if (!asset.url) return null;
    const cached = loadedModelCache.get(asset.id);
    if (cached) return cached;
    const inflight = loadingModelPromises.get(asset.id);
    if (inflight) return inflight;

    const promise = (async () => {
        try {
            let root: THREE.Object3D;
            if (asset.format === "fbx") {
                const loader = new FBXLoader();
                root = await loader.loadAsync(asset.url!);
            } else {
                const loader = new GLTFLoader();
                const gltf = await loader.loadAsync(asset.url!);
                root = gltf.scene;
            }
            // 计算包围盒，按目标高度等比例缩放并使底部 y=0 贴地
            const box = new THREE.Box3().setFromObject(root);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);
            const h = Math.max(0.01, size.y);
            const factor = (asset.targetHeight || 1.7) / h;

            const wrapper = new THREE.Group();
            root.scale.multiplyScalar(factor);
            root.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
            root.traverse((obj) => {
                if ((obj as THREE.Mesh).isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
            });
            wrapper.add(root);
            loadedModelCache.set(asset.id, wrapper);
            return wrapper;
        } catch {
            return null;
        } finally {
            loadingModelPromises.delete(asset.id);
        }
    })();

    loadingModelPromises.set(asset.id, promise);
    return promise;
}

/** 创建带实时阴影的哑光分块 25 自由度 3D 人偶（含「简化角色外形」Seedance 参考模式与 3D 关节点高亮） */
export function buildDirectorMannequin(
    item: DirectorCharacterItem,
    opts?: {
        simplified?: boolean;
        poseEditMode?: boolean;
        activeJointGroup?: string;
        customTemplate?: THREE.Object3D | null;
    },
): THREE.Group {
    const root = new THREE.Group();
    root.userData = { directorKind: "character", directorId: item.id };
    root.position.set(item.position[0], item.position[1], item.position[2]);
    root.rotation.set(deg(item.rotation[0]), deg(item.rotation[1]), deg(item.rotation[2]));

    const preset = resolveCharacterPreset(item.bodyType);
    const sc = toScale3(item.scale);
    root.scale.set(preset.scale[0] * sc[0], preset.scale[1] * sc[1], preset.scale[2] * sc[2]);
    root.visible = item.visible !== false;

    const opacity = Math.max(0.05, Math.min(1, (item.opacity ?? 100) / 100));
    const transparent = opacity < 0.99;

    // 自定义导入 FBX/GLB 角色模型
    if (opts?.customTemplate && !opts?.simplified) {
        const clone = opts.customTemplate.clone(true);
        clone.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh) {
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData = { directorKind: "character", directorId: item.id };
                if (transparent && mesh.material) {
                    const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
                    m.transparent = true;
                    m.opacity = opacity;
                    mesh.material = m;
                }
            }
        });
        root.add(clone);
        return root;
    }

    const baseMat = new THREE.MeshStandardMaterial({
        color: item.color || preset.defaultColor,
        roughness: 0.52,
        metalness: 0.06,
        transparent,
        opacity,
    });
    const jointMat = new THREE.MeshStandardMaterial({
        color: "#22262e",
        roughness: 0.6,
        metalness: 0.12,
        transparent,
        opacity,
    });
    const accentMat = new THREE.MeshStandardMaterial({
        color: "#37d39b",
        roughness: 0.35,
        metalness: 0.15,
        transparent,
        opacity,
    });

    const addShadow = (m: THREE.Mesh) => {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData = { directorKind: "character", directorId: item.id };
        return m;
    };

    // 简化角色外形模式（无四肢简化轮廓体，专为视频生成构图与走位参考优化）
    if (opts?.simplified) {
        const body = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.96, 8, 16), baseMat));
        body.position.y = 0.72;
        const head = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 16), baseMat));
        head.position.y = 1.54;
        const dirMark = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 8), accentMat));
        dirMark.rotation.x = Math.PI / 2;
        dirMark.position.set(0, 1.52, 0.16);
        root.add(body, head, dirMark);
        return root;
    }

    const j: PoseJoints25 = normalizeJoints(item.joints);
    const makeJointHandle = (groupId: string, pos: [number, number, number], radius = 0.052) => {
        if (!opts?.poseEditMode) return null;
        const isActive = opts.activeJointGroup === groupId;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 14, 12),
            new THREE.MeshBasicMaterial({
                color: isActive ? "#37d39b" : "#22d3ee",
                depthTest: false,
                transparent: true,
                opacity: isActive ? 0.95 : 0.72,
            }),
        );
        sphere.position.set(pos[0], pos[1], pos[2]);
        sphere.renderOrder = 20;
        sphere.userData = { directorKind: "joint", directorId: item.id, jointGroup: groupId };
        return sphere;
    };

    // 1. 身体整体枢轴（围绕骨盆中心）
    const bodyPivot = new THREE.Group();
    bodyPivot.position.set(0, 0.94, 0);
    bodyPivot.rotation.set(deg(j.bodyPitch || 0), deg(j.bodyYaw || 0), deg(j.bodyRoll || 0));
    root.add(bodyPivot);

    const pelvis = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.21), baseMat));
    bodyPivot.add(pelvis);
    const waistBand = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.155, 0.09, 12), jointMat));
    waistBand.position.y = 0.11;
    bodyPivot.add(waistBand);
    const bodyHandle = makeJointHandle("body", [0, 0, 0], 0.065);
    if (bodyHandle) bodyPivot.add(bodyHandle);

    // 2. 胸腰枢轴
    const chestPivot = new THREE.Group();
    chestPivot.position.set(0, 0.14, 0);
    chestPivot.rotation.set(deg(j.chestPitch || 0), deg(j.chestYaw || 0), deg(j.chestRoll || 0));
    bodyPivot.add(chestPivot);

    const abdomen = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.135, 0.2, 10), baseMat));
    abdomen.position.y = 0.1;
    const chest = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.29, 0.23), baseMat));
    chest.position.y = 0.34;
    const chestCollar = addShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.08, 0.08, 10), jointMat));
    chestCollar.position.y = 0.51;
    const chestMark = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.032, 0.025), accentMat));
    chestMark.position.set(0, 0.36, 0.12);
    chestPivot.add(abdomen, chest, chestCollar, chestMark);
    const chestHandle = makeJointHandle("chest", [0, 0.28, 0], 0.06);
    if (chestHandle) chestPivot.add(chestHandle);

    // 3. 头部枢轴
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.55, 0);
    headPivot.rotation.set(deg(j.headPitch || 0), deg(j.headYaw || 0), deg(j.headRoll || 0));
    chestPivot.add(headPivot);

    const head = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 14), baseMat));
    head.scale.set(0.92, 1.12, 1.02);
    head.position.y = 0.13;
    const jaw = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.11, 6), baseMat));
    jaw.rotation.x = Math.PI;
    jaw.position.set(0, 0.04, 0.045);
    const visor = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.03), jointMat));
    visor.position.set(0, 0.15, 0.11);
    const nose = addShadow(new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.06, 6), accentMat));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.11, 0.13);
    headPivot.add(head, jaw, visor, nose);
    const headHandle = makeJointHandle("head", [0, 0.13, 0], 0.055);
    if (headHandle) headPivot.add(headHandle);

    // 4. 左右臂（前后摆 / 内收外展 / 内旋外旋 / 肘屈伸）
    const makeArm = (
        side: -1 | 1,
        groupId: "leftArm" | "rightArm",
        pitch: number,
        abduct: number,
        twist: number,
        bend: number,
    ) => {
        const shoulder = new THREE.Group();
        shoulder.position.set(side * 0.235, 0.44, 0);
        shoulder.rotation.order = "ZYX";
        shoulder.rotation.x = deg(pitch);
        shoulder.rotation.z = deg(side * abduct);
        shoulder.rotation.y = deg(side * twist);

        const sBall = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 10), jointMat));
        const upper = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.21, 6, 10), baseMat));
        upper.position.y = -0.15;
        shoulder.add(sBall, upper);

        const elbow = new THREE.Group();
        elbow.position.y = -0.3;
        elbow.rotation.x = deg(-Math.abs(bend));
        const eBall = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 8), jointMat));
        const lower = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 6, 10), baseMat));
        lower.position.y = -0.14;
        const hand = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.032), baseMat));
        hand.position.y = -0.29;
        elbow.add(eBall, lower, hand);
        shoulder.add(elbow);

        const h = makeJointHandle(groupId, [0, -0.3, 0], 0.052);
        if (h) shoulder.add(h);
        chestPivot.add(shoulder);
    };
    makeArm(-1, "leftArm", j.leftArmPitch || 0, j.leftArmAbduct || 0, j.leftArmTwist || 0, j.leftArmBend || 0);
    makeArm(1, "rightArm", j.rightArmPitch || 0, j.rightArmAbduct || 0, j.rightArmTwist || 0, j.rightArmBend || 0);

    // 5. 左右腿（前后摆 / 内收外展 / 内旋外旋 / 膝屈伸）
    const makeLeg = (
        side: -1 | 1,
        groupId: "leftLeg" | "rightLeg",
        pitch: number,
        abduct: number,
        twist: number,
        bend: number,
    ) => {
        const hip = new THREE.Group();
        hip.position.set(side * 0.105, -0.04, 0);
        hip.rotation.order = "ZYX";
        hip.rotation.x = deg(pitch);
        hip.rotation.z = deg(side * abduct);
        hip.rotation.y = deg(side * twist);

        const hBall = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 10), jointMat));
        const thigh = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.31, 6, 12), baseMat));
        thigh.position.y = -0.22;
        hip.add(hBall, thigh);

        const knee = new THREE.Group();
        knee.position.y = -0.44;
        knee.rotation.x = deg(Math.abs(bend));
        const kBall = addShadow(new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), jointMat));
        const shin = addShadow(new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 6, 12), baseMat));
        shin.position.y = -0.22;
        const foot = addShadow(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.2), baseMat));
        foot.position.set(0, -0.43, 0.045);
        knee.add(kBall, shin, foot);
        hip.add(knee);

        const h = makeJointHandle(groupId, [0, -0.44, 0], 0.055);
        if (h) hip.add(h);
        bodyPivot.add(hip);
    };
    makeLeg(-1, "leftLeg", j.leftLegPitch || 0, j.leftLegAbduct || 0, j.leftLegTwist || 0, j.leftLegBend || 0);
    makeLeg(1, "rightLeg", j.rightLegPitch || 0, j.rightLegAbduct || 0, j.rightLegTwist || 0, j.rightLegBend || 0);

    return root;
}

/** 为全部 13 个几何体 + 71 个简模物体构建辨识度清晰的 Three.js 三维模型 */
export function buildDirectorProp(
    prop: DirectorPropItem,
    customTemplate?: THREE.Object3D | null,
): THREE.Group {
    const root = new THREE.Group();
    root.userData = { directorKind: "prop", directorId: prop.id };
    root.position.set(prop.position[0], prop.position[1], prop.position[2]);
    root.rotation.set(deg(prop.rotation[0]), deg(prop.rotation[1]), deg(prop.rotation[2]));
    root.scale.set(prop.scale[0] || 1, prop.scale[1] || 1, prop.scale[2] || 1);
    root.visible = prop.visible !== false;

    const opacity = Math.max(0.05, Math.min(1, (prop.opacity ?? 100) / 100));
    const transparent = opacity < 0.99;

    if (customTemplate) {
        const clone = customTemplate.clone(true);
        const hRatio = prop.baseHeight > 0 ? prop.dimensions[1] / prop.baseHeight : 1;
        clone.scale.multiplyScalar(hRatio);
        clone.traverse((child) => {
            const m = child as THREE.Mesh;
            if (m.isMesh) {
                m.castShadow = true;
                m.receiveShadow = true;
                m.userData = { directorKind: "prop", directorId: prop.id };
            }
        });
        root.add(clone);
        return root;
    }

    const [w, h, d] = prop.dimensions;
    const mat = new THREE.MeshStandardMaterial({
        color: prop.color || "#8d96a5",
        roughness: 0.58,
        metalness: 0.08,
        transparent,
        opacity,
    });
    const darkMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(prop.color || "#8d96a5").multiplyScalar(0.55),
        roughness: 0.65,
        metalness: 0.15,
        transparent,
        opacity,
    });
    const lightMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(prop.color || "#8d96a5").lerp(new THREE.Color("#ffffff"), 0.35),
        roughness: 0.45,
        metalness: 0.05,
        transparent,
        opacity,
    });

    const addPart = (geo: THREE.BufferGeometry, x: number, y: number, z: number, material: THREE.Material = mat, rot?: [number, number, number]) => {
        const m = new THREE.Mesh(geo, material);
        m.position.set(x, y, z);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData = { directorKind: "prop", directorId: prop.id };
        root.add(m);
        return m;
    };

    const id = prop.presetId;

    // 13 基础几何体
    if (id === "geo_simple_human") {
        addPart(new THREE.CapsuleGeometry(w * 0.42, Math.max(0.2, h * 0.52), 8, 14), 0, h * 0.41, 0);
        addPart(new THREE.SphereGeometry(Math.min(w, h) * 0.28, 16, 14), 0, h * 0.87, 0);
        return root;
    }
    if (id === "geo_cube" || id === "geo_box" || id === "geo_plane") {
        addPart(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
        return root;
    }
    if (id === "geo_sphere") {
        const m = addPart(new THREE.SphereGeometry(0.5, 24, 18), 0, h / 2, 0);
        m.scale.set(w, h, d);
        return root;
    }
    if (id === "geo_cylinder" || id === "geo_disc") {
        addPart(new THREE.CylinderGeometry(w / 2, w / 2, h, 24), 0, h / 2, 0);
        return root;
    }
    if (id === "geo_cone") {
        addPart(new THREE.ConeGeometry(w / 2, h, 24), 0, h / 2, 0);
        return root;
    }
    if (id === "geo_pyramid") {
        addPart(new THREE.ConeGeometry(w * 0.68, h, 4), 0, h / 2, 0, mat, [0, Math.PI / 4, 0]);
        return root;
    }
    if (id === "geo_torus") {
        addPart(new THREE.TorusGeometry(w * 0.38, Math.min(w, d) * 0.22, 14, 32), 0, h / 2, 0);
        return root;
    }
    if (id === "geo_capsule") {
        addPart(new THREE.CapsuleGeometry(w / 2, Math.max(0.1, h - w), 8, 16), 0, h / 2, 0);
        return root;
    }
    if (id === "geo_half_arch") {
        addPart(new THREE.TorusGeometry(w * 0.44, d * 0.35, 12, 24, Math.PI), 0, d * 0.35, 0);
        return root;
    }
    if (id === "geo_half_cylinder") {
        addPart(new THREE.CylinderGeometry(w / 2, w / 2, h, 20, 1, false, 0, Math.PI), 0, h / 2, 0);
        return root;
    }

    // 71 简模物体分造型构建
    switch (id) {
        case "chair":
        case "armchair": {
            const seatY = h * 0.48;
            addPart(new THREE.BoxGeometry(w, 0.08, d), 0, seatY, 0);
            addPart(new THREE.BoxGeometry(w, h - seatY, 0.08), 0, seatY + (h - seatY) / 2, -d / 2 + 0.04);
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    addPart(new THREE.BoxGeometry(0.06, seatY, 0.06), sx * (w / 2 - 0.05), seatY / 2, sz * (d / 2 - 0.05), darkMat);
                }
                if (id === "armchair") {
                    addPart(new THREE.BoxGeometry(0.09, h * 0.26, d * 0.85), sx * (w / 2 - 0.045), seatY + h * 0.13, 0, lightMat);
                }
            }
            return root;
        }
        case "stool":
            addPart(new THREE.CylinderGeometry(w / 2, w / 2, 0.08, 18), 0, h - 0.04, 0);
            addPart(new THREE.CylinderGeometry(0.05, 0.12, h - 0.08, 12), 0, (h - 0.08) / 2, 0, darkMat);
            return root;
        case "sofa":
        case "bench": {
            const seatH = h * 0.44;
            addPart(new THREE.BoxGeometry(w, seatH, d * 0.85), 0, seatH / 2, d * 0.05);
            addPart(new THREE.BoxGeometry(w, h - seatH, d * 0.22), 0, seatH + (h - seatH) / 2, -d * 0.36, lightMat);
            if (id === "sofa") {
                addPart(new THREE.BoxGeometry(0.18, h * 0.68, d * 0.9), -w / 2 + 0.09, h * 0.34, 0, darkMat);
                addPart(new THREE.BoxGeometry(0.18, h * 0.68, d * 0.9), w / 2 - 0.09, h * 0.34, 0, darkMat);
            }
            return root;
        }
        case "square_table":
        case "long_table":
        case "coffee_table":
        case "side_table":
        case "desk": {
            addPart(new THREE.BoxGeometry(w, 0.07, d), 0, h - 0.035, 0);
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    addPart(new THREE.BoxGeometry(0.06, h - 0.07, 0.06), sx * (w / 2 - 0.08), (h - 0.07) / 2, sz * (d / 2 - 0.08), darkMat);
                }
            }
            return root;
        }
        case "round_table":
            addPart(new THREE.CylinderGeometry(w / 2, w / 2, 0.07, 24), 0, h - 0.035, 0);
            addPart(new THREE.CylinderGeometry(0.08, 0.24, h - 0.07, 16), 0, (h - 0.07) / 2, 0, darkMat);
            return root;
        case "bed":
            addPart(new THREE.BoxGeometry(w, h * 0.46, d), 0, h * 0.23, 0);
            addPart(new THREE.BoxGeometry(w, h, 0.14), 0, h / 2, -d / 2 + 0.07, darkMat);
            addPart(new THREE.BoxGeometry(w * 0.36, 0.14, 0.36), -w * 0.24, h * 0.53, -d * 0.32, lightMat);
            addPart(new THREE.BoxGeometry(w * 0.36, 0.14, 0.36), w * 0.24, h * 0.53, -d * 0.32, lightMat);
            return root;
        case "bookshelf":
        case "wardrobe":
        case "low_cabinet":
        case "fridge":
        case "wall_cabinet": {
            addPart(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
            const shelves = id === "bookshelf" ? 4 : 2;
            for (let i = 1; i <= shelves; i++) {
                addPart(new THREE.BoxGeometry(w * 0.94, 0.03, d * 0.06), 0, (h / (shelves + 1)) * i, d / 2 + 0.01, darkMat);
            }
            return root;
        }
        case "tv":
        case "wall_tv":
        case "monitor":
            addPart(new THREE.BoxGeometry(w, h * 0.78, Math.max(0.05, d * 0.35)), 0, h * 0.6, 0, darkMat);
            if (id !== "wall_tv") {
                addPart(new THREE.BoxGeometry(w * 0.12, h * 0.22, 0.06), 0, h * 0.12, 0, mat);
                addPart(new THREE.BoxGeometry(w * 0.45, 0.04, d), 0, 0.02, 0, mat);
            }
            return root;
        case "laptop":
            addPart(new THREE.BoxGeometry(w, 0.025, d), 0, 0.0125, 0, darkMat);
            addPart(new THREE.BoxGeometry(w, h * 0.92, 0.02), 0, h * 0.46, -d / 2 + 0.02, mat, [-0.2, 0, 0]);
            return root;
        case "floor_lamp":
        case "table_lamp":
        case "street_lamp":
            addPart(new THREE.CylinderGeometry(w * 0.32, w * 0.38, 0.05, 16), 0, 0.025, 0, darkMat);
            addPart(new THREE.CylinderGeometry(0.035, 0.045, h * 0.78, 10), 0, h * 0.4, 0, darkMat);
            addPart(new THREE.ConeGeometry(w * 0.45, h * 0.24, 16), 0, h * 0.88, 0, lightMat);
            return root;
        case "stairs": {
            const steps = 6;
            for (let i = 0; i < steps; i++) {
                const sh = ((i + 1) / steps) * h;
                const sd = d / steps;
                addPart(new THREE.BoxGeometry(w, sh, sd), 0, sh / 2, -d / 2 + sd * (i + 0.5));
            }
            return root;
        }
        case "ramp":
            addPart(new THREE.BoxGeometry(w, h * 0.16, Math.hypot(d, h)), 0, h / 2, 0, mat, [Math.atan2(h, d), 0, 0]);
            return root;
        case "arch":
            addPart(new THREE.BoxGeometry(w * 0.22, h * 0.65, d), -w * 0.39, h * 0.325, 0);
            addPart(new THREE.BoxGeometry(w * 0.22, h * 0.65, d), w * 0.39, h * 0.325, 0);
            addPart(new THREE.TorusGeometry(w * 0.39, w * 0.11, 10, 20, Math.PI), 0, h * 0.65, 0);
            return root;
        case "door":
        case "window":
            addPart(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
            addPart(new THREE.BoxGeometry(w * 0.82, h * 0.86, d + 0.02), 0, h * 0.5, 0, lightMat);
            return root;
        case "fence":
        case "railing":
            addPart(new THREE.BoxGeometry(w, 0.07, d), 0, h - 0.05, 0);
            addPart(new THREE.BoxGeometry(w, 0.06, d), 0, h * 0.45, 0);
            for (let i = -2; i <= 2; i++) {
                addPart(new THREE.BoxGeometry(0.06, h, d), (i / 2) * (w / 2 - 0.05), h / 2, 0, darkMat);
            }
            return root;
        case "ladder":
            addPart(new THREE.BoxGeometry(0.05, h, 0.06), -w / 2 + 0.03, h / 2, 0);
            addPart(new THREE.BoxGeometry(0.05, h, 0.06), w / 2 - 0.03, h / 2, 0);
            for (let i = 1; i <= 7; i++) {
                addPart(new THREE.BoxGeometry(w, 0.04, 0.04), 0, (h / 8) * i, 0, darkMat);
            }
            return root;
        case "statue":
            addPart(new THREE.BoxGeometry(w, h * 0.32, d), 0, h * 0.16, 0, darkMat);
            addPart(new THREE.OctahedronGeometry(w * 0.46, 0), 0, h * 0.68, 0, lightMat);
            return root;
        case "small_tree":
        case "big_tree":
            addPart(new THREE.CylinderGeometry(w * 0.08, w * 0.13, h * 0.42, 10), 0, h * 0.21, 0, darkMat);
            addPart(new THREE.DodecahedronGeometry(w * 0.46, 1), 0, h * 0.66, 0, mat);
            addPart(new THREE.DodecahedronGeometry(w * 0.34, 1), w * 0.16, h * 0.78, -w * 0.1, lightMat);
            return root;
        case "potted_plant":
            addPart(new THREE.CylinderGeometry(w * 0.42, w * 0.3, h * 0.35, 14), 0, h * 0.175, 0, darkMat);
            addPart(new THREE.DodecahedronGeometry(w * 0.46, 1), 0, h * 0.66, 0, mat);
            return root;
        case "rock":
        case "bush":
            addPart(new THREE.DodecahedronGeometry(Math.min(w, h) * 0.56, 1), 0, h * 0.48, 0);
            return root;
        case "stump":
            addPart(new THREE.CylinderGeometry(w * 0.45, w * 0.52, h, 14), 0, h / 2, 0);
            return root;
        case "car":
        case "truck": {
            const wheelR = h * 0.22;
            addPart(new THREE.BoxGeometry(w, h * 0.44, d), 0, wheelR + h * 0.22, 0);
            addPart(
                new THREE.BoxGeometry(w * 0.88, h * 0.42, id === "truck" ? d * 0.34 : d * 0.52),
                0,
                wheelR + h * 0.6,
                id === "truck" ? d * 0.28 : -d * 0.05,
                lightMat,
            );
            if (id === "truck") {
                addPart(new THREE.BoxGeometry(w * 0.96, h * 0.62, d * 0.6), 0, wheelR + h * 0.5, -d * 0.18, mat);
            }
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    addPart(
                        new THREE.CylinderGeometry(wheelR, wheelR, 0.22, 14),
                        sx * (w / 2 - 0.06),
                        wheelR,
                        sz * (d * 0.32),
                        darkMat,
                        [0, 0, Math.PI / 2],
                    );
                }
            }
            return root;
        }
        case "bicycle":
        case "motorcycle": {
            const wr = h * 0.34;
            addPart(new THREE.TorusGeometry(wr, 0.06, 8, 18), 0, wr, -d * 0.34, darkMat, [0, Math.PI / 2, 0]);
            addPart(new THREE.TorusGeometry(wr, 0.06, 8, 18), 0, wr, d * 0.34, darkMat, [0, Math.PI / 2, 0]);
            addPart(new THREE.BoxGeometry(w * 0.45, h * 0.32, d * 0.65), 0, wr + h * 0.18, 0, mat);
            addPart(new THREE.BoxGeometry(w * 0.9, 0.05, 0.05), 0, h * 0.88, d * 0.26, darkMat);
            return root;
        }
        case "traffic_cone":
            addPart(new THREE.BoxGeometry(w, 0.05, d), 0, 0.025, 0, darkMat);
            addPart(new THREE.ConeGeometry(w * 0.4, h - 0.05, 16), 0, h / 2 + 0.02, 0);
            return root;
        case "road_sign":
            addPart(new THREE.CylinderGeometry(0.04, 0.05, h * 0.82, 10), 0, h * 0.41, 0, darkMat);
            addPart(new THREE.BoxGeometry(w, w * 0.9, 0.05), 0, h * 0.84, 0);
            return root;
        case "hydrant":
        case "trash_can":
        case "oil_drum":
        case "mug":
            addPart(new THREE.CylinderGeometry(w * 0.45, w * 0.48, h, 16), 0, h / 2, 0);
            return root;
        case "bathtub":
            addPart(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
            addPart(new THREE.BoxGeometry(w * 0.86, h * 0.2, d * 0.78), 0, h * 0.92, 0, darkMat);
            return root;
        case "toilet":
            addPart(new THREE.CylinderGeometry(w * 0.42, w * 0.34, h * 0.5, 14), 0, h * 0.25, d * 0.12);
            addPart(new THREE.BoxGeometry(w * 0.9, h * 0.55, d * 0.32), 0, h * 0.72, -d * 0.28, lightMat);
            return root;
        case "chandelier":
        case "ceiling_fan":
            addPart(new THREE.CylinderGeometry(0.03, 0.03, h * 0.65, 8), 0, h * 0.68, 0, darkMat);
            addPart(new THREE.CylinderGeometry(w * 0.46, w * 0.46, h * 0.22, 16), 0, h * 0.2, 0, lightMat);
            return root;
        default:
            addPart(new THREE.BoxGeometry(w, h, d), 0, h / 2, 0);
            return root;
    }
}

/** 构造 3D 摄像机模型与注视点标识 */
export function buildCameraAndTargetGizmo(
    cam: DirectorCameraItem,
    active: boolean,
    showTarget: boolean,
): { cameraGroup: THREE.Group; targetGroup: THREE.Group; sightLine: THREE.Line } {
    const color = active ? "#37d39b" : "#38bdf8";

    const cameraGroup = new THREE.Group();
    cameraGroup.userData = { directorKind: "camera", directorId: cam.id };
    cameraGroup.position.set(cam.position[0], cam.position[1], cam.position[2]);
    cameraGroup.lookAt(cam.target[0], cam.target[1], cam.target[2]);

    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.36), bodyMat);
    body.userData = { directorKind: "camera", directorId: cam.id };
    const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), bodyMat);
    topHandle.position.set(0, 0.13, 0);
    topHandle.userData = { directorKind: "camera", directorId: cam.id };
    const lens = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.34, 4),
        new THREE.MeshBasicMaterial({ color, wireframe: true }),
    );
    lens.rotation.x = -Math.PI / 2;
    lens.rotation.z = Math.PI / 4;
    lens.position.z = 0.34;
    lens.userData = { directorKind: "camera", directorId: cam.id };
    cameraGroup.add(body, topHandle, lens);

    // 注视点 Gizmo
    const targetGroup = new THREE.Group();
    targetGroup.userData = { directorKind: "target", directorId: cam.id };
    targetGroup.position.set(cam.target[0], cam.target[1], cam.target[2]);
    targetGroup.visible = showTarget;
    const tCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.11, 0),
        new THREE.MeshBasicMaterial({ color: active ? "#37d39b" : "#fbbf24", wireframe: false }),
    );
    tCore.userData = { directorKind: "target", directorId: cam.id };
    const tRing = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.19, 18),
        new THREE.MeshBasicMaterial({ color: active ? "#37d39b" : "#fbbf24", side: THREE.DoubleSide }),
    );
    tRing.rotation.x = Math.PI / 2;
    tRing.userData = { directorKind: "target", directorId: cam.id };
    targetGroup.add(tCore, tRing);

    // 机位到注视点虚线/连接线
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cam.position[0], cam.position[1], cam.position[2]),
        new THREE.Vector3(cam.target[0], cam.target[1], cam.target[2]),
    ]);
    const sightLine = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: active ? 0.55 : 0.28 }),
    );
    sightLine.visible = showTarget;

    return { cameraGroup, targetGroup, sightLine };
}

/** 在指定时间点插值单个关键帧属性 */
function sampleTrack<T extends number | [number, number, number]>(
    keyframes: DirectorKeyframe[],
    objectId: string,
    property: DirectorKeyframe["property"],
    time: number,
    fallback: T,
): T {
    const kfs = keyframes
        .filter((k) => k.objectId === objectId && k.property === property)
        .sort((a, b) => a.time - b.time);
    if (!kfs.length) return fallback;
    if (time <= kfs[0].time) return kfs[0].value as T;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value as T;
    for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        if (time >= a.time && time <= b.time) {
            const u = (time - a.time) / Math.max(0.0001, b.time - a.time);
            // Smoothstep for cinematic motion easing
            const e = u * u * (3 - 2 * u);
            if (Array.isArray(a.value) && Array.isArray(b.value)) {
                return [
                    a.value[0] + (b.value[0] - a.value[0]) * e,
                    a.value[1] + (b.value[1] - a.value[1]) * e,
                    a.value[2] + (b.value[2] - a.value[2]) * e,
                ] as T;
            }
            if (typeof a.value === "number" && typeof b.value === "number") {
                return (a.value + (b.value - a.value) * e) as T;
            }
        }
    }
    return fallback;
}

export type EvaluatedScene = {
    characters: DirectorCharacterItem[];
    props: DirectorPropItem[];
    cameras: DirectorCameraItem[];
    storyboardCameraId?: string;
};

/** 计算动态预演在任意时间点 timeSec 的完整三维场景状态 */
export function evaluateSceneAtTime(
    state: DirectorStageState,
    timeSec: number,
    customActions: DirectorCustomAction[] = [],
): EvaluatedScene {
    const tl: DirectorTimelineState | undefined = state.timeline;
    const isDynamic = state.mode === "dynamic" && Boolean(tl);
    const props = state.props || [];
    if (!isDynamic || !tl) {
        return {
            characters: state.characters,
            props,
            cameras: state.cameras,
            storyboardCameraId: state.cameras[0]?.id,
        };
    }

    const kfs = tl.keyframes || [];
    const clips = tl.actionClips || [];
    const allActions = [...DIRECTOR_ACTION_PRESETS, ...customActions];

    const characters = state.characters.map((ch) => {
        const pos = sampleTrack<[number, number, number]>(kfs, ch.id, "position", timeSec, ch.position);
        let rot = sampleTrack<[number, number, number]>(kfs, ch.id, "rotation", timeSec, ch.rotation);
        const sc = sampleTrack<[number, number, number]>(kfs, ch.id, "scale", timeSec, toScale3(ch.scale));

        // 沿路径自动转向
        if (ch.autoFacePath) {
            const posKfs = kfs.filter((k) => k.objectId === ch.id && k.property === "position");
            if (posKfs.length >= 2) {
                const nextPos = sampleTrack<[number, number, number]>(kfs, ch.id, "position", Math.min(tl.duration, timeSec + 0.08), pos);
                const dx = nextPos[0] - pos[0];
                const dz = nextPos[2] - pos[2];
                if (Math.hypot(dx, dz) > 0.004) {
                    const yawDeg = (Math.atan2(dx, dz) * 180) / Math.PI;
                    rot = [rot[0], Number(yawDeg.toFixed(1)), rot[2]];
                }
            }
        }

        // 查找当前时间覆盖的动作片段
        let joints = ch.joints;
        const activeClip = clips.find(
            (c) => c.characterId === ch.id && timeSec >= c.startTime && timeSec <= c.startTime + c.duration,
        );
        if (activeClip) {
            const actionDef = allActions.find((a) => a.id === activeClip.actionId);
            if (actionDef) {
                const normT =
                    activeClip.mode === "pose"
                        ? activeClip.poseFrame ?? 0.35
                        : ((timeSec - activeClip.startTime) % Math.max(0.2, actionDef.durationSec)) / Math.max(0.2, actionDef.durationSec);
                joints = sampleActionPose(actionDef, normT);
            }
        }

        return { ...ch, position: pos, rotation: rot, scale: sc, joints };
    });

    const evalProps = props.map((pr) => ({
        ...pr,
        position: sampleTrack<[number, number, number]>(kfs, pr.id, "position", timeSec, pr.position),
        rotation: sampleTrack<[number, number, number]>(kfs, pr.id, "rotation", timeSec, pr.rotation),
        scale: sampleTrack<[number, number, number]>(kfs, pr.id, "scale", timeSec, pr.scale),
    }));

    const cameras = state.cameras.map((cam) => ({
        ...cam,
        position: sampleTrack<[number, number, number]>(kfs, cam.id, "position", timeSec, cam.position),
        target: sampleTrack<[number, number, number]>(kfs, cam.id, "target", timeSec, cam.target),
        fov: sampleTrack<number>(kfs, cam.id, "fov", timeSec, cam.fov),
        roll: sampleTrack<number>(kfs, cam.id, "roll", timeSec, cam.roll || 0),
    }));

    const activeCut = (tl.storyboardCuts || []).find(
        (cut) => timeSec >= cut.startTime && timeSec < cut.startTime + cut.duration,
    );

    return {
        characters,
        props: evalProps,
        cameras,
        storyboardCameraId: activeCut?.cameraId || state.activeCameraId || cameras[0]?.id,
    };
}
