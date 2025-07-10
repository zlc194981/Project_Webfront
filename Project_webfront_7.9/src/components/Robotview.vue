<template>
  <div class="robot-view-container" ref="robotContainer"></div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import * as THREE from 'three';
import { LoadingManager } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import ROSLIB from 'roslib';
import URDFLoader from 'urdf-loader';

const robotContainer = ref(null);
const ros = ref(null);
const robotModel = ref(null);

let renderer, controls;

// --- ROS 连接部分 ---
const initRos = () => {
  ros.value = new ROSLIB.Ros({
    url: 'ws://localhost:9090' // 确保此地址正确
  });

  ros.value.on('connection', () => {
    console.log('成功连接到 ROS Bridge。');
    subscribeToJointStates();
  });

  ros.value.on('error', (error) => {
    console.error('连接 ROS Bridge 时出错: ', error);
  });

  ros.value.on('close', () => {
    console.log('与 ROS Bridge 的连接已关闭。');
  });
};

const subscribeToJointStates = () => {
  const jointStateListener = new ROSLIB.Topic({
    ros: ros.value,
    name: '/joint_states',
    messageType: 'sensor_msgs/JointState'
  });

  jointStateListener.subscribe((message) => {
    if (!robotModel.value) return;
    for (let i = 0; i < message.name.length; i++) {
      robotModel.value.setJointValue(message.name[i], message.position[i]);
    }
  });
};

// --- Three.js 场景初始化和模型加载部分 ---
const initThree = () => {
  if (!robotContainer.value) return;

  // 1. 基础场景设置
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcccccc);
  scene.add(new THREE.GridHelper(10, 10));

  const camera = new THREE.PerspectiveCamera(60, robotContainer.value.clientWidth / robotContainer.value.clientHeight, 0.1, 1000);
  camera.position.set(2, 2, 2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(robotContainer.value.clientWidth, robotContainer.value.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  robotContainer.value.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0.5, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 10, 7.5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  
  // 2. 加载器和管理器设置
  const manager = new LoadingManager();
  manager.onLoad = () => console.log('所有模型资源已成功加载！机器人应该可见了。');
  manager.onProgress = (url, itemsLoaded, itemsTotal) => console.log(`正在加载文件: ${url}. [${itemsLoaded}/${itemsTotal}]`);
  manager.onError = (url) => console.error(`加载文件时发生错误: ${url}`);

  const loader = new URDFLoader(manager);
  const stlLoader = new STLLoader(manager);
  const colladaLoader = new ColladaLoader(manager);

  loader.loadMeshCb = (path, mgr, onComplete) => {
    if (/\.stl$/i.test(path)) {
      stlLoader.load(path, geometry => {
        const material = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        onComplete(mesh);
      }, undefined, err => console.error(`STLLoader: ${err}`));
    } else if (/\.dae$/i.test(path)) {
      colladaLoader.load(path, dae => {
        dae.scene.traverse(c => {
          c.castShadow = true;
          c.receiveShadow = true;
        });
        onComplete(dae.scene);
      }, undefined, err => console.error(`ColladaLoader: ${err}`));
    } else {
      console.warn(`URDFLoader: No loader available for mesh format: ${path}`);
      onComplete(null);
    }
  };

  // 3. 模型加载核心逻辑 (路径不包含 'public/')
  loader.packages = {
    'r': '/models/ur_description/'
  };
  
  loader.load(
    '/models/ur_description/robot.urdf',
    (robot) => {
      console.log("URDF 加载成功:", robot);
      robot.rotation.x = -Math.PI / 2;
      scene.add(robot);
      robotModel.value = robot;
    },
    undefined,
    (error) => {
      console.error("URDF 加载失败! 请检查URDF文件内容和路径配置。", error);
    }
  );

  // 4. 渲染循环和窗口自适应
  const animate = () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
  
  const handleResize = () => {
    if (robotContainer.value) {
      camera.aspect = robotContainer.value.clientWidth / robotContainer.value.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(robotContainer.value.clientWidth, robotContainer.value.clientHeight);
    }
  };
  window.addEventListener('resize', handleResize);

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
  });
};

// --- Vue生命周期钩子 ---
onMounted(() => {
  initThree();
  initRos();
});

onUnmounted(() => {
  if (ros.value && ros.value.isConnected) {
    ros.value.close();
  }
  if (renderer) {
    renderer.dispose();
  }
  if (controls) {
    controls.dispose();
  }
});
</script>

<style scoped>
.robot-view-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: block;
}
</style>