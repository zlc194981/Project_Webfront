<template>
  <div class="robot-view-container">
    <!-- 控制面板和状态显示 -->
    <div class="control-panel">
      <h2>控制面板</h2>
      <p>状态: <span :class="statusClass">{{ statusMessage }}</span></p>
      <button @click="startSimulation" :disabled="isSimulating">
        启动 FactoryNutBoltPick 仿真
      </button>
      <!-- 可以添加一个停止按钮 -->
      <!-- <button @click="stopSimulation" :disabled="!isSimulating">停止</button> -->
    </div>

    <!-- 加载遮罩层 -->
    <div v-if="loading" class="loading-overlay">
      <p>正在加载机器人模型...</p>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </div>

    <!-- 3D 渲染画布 -->
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';

// --- 响应式状态管理 ---
const canvasRef = ref(null);
const loading = ref(true);
const errorMessage = ref('');
const isSimulating = ref(false);
const statusMessage = ref('模型加载中...');
const statusClass = computed(() => ({
  'status-simulating': isSimulating.value,
  'status-ready': !isSimulating.value && !errorMessage.value,
  'status-error': !!errorMessage.value,
}));

// --- Three.js 和 WebSocket 变量 ---
let renderer, scene, camera, controls, robot;
let websocket = null;


// --- 后端 API 和 WebSocket 地址 (请根据你的后端配置修改) ---
const API_ENDPOINT = 'http://localhost:8000'; // 你的后端服务器地址
const WEBSOCKET_URL = 'ws://localhost:8000/ws/joint_states'; // 你的WebSocket端点


// --- 主要方法 ---

// 1. 点击按钮，启动仿真
async function startSimulation() {
  if (!robot) {
    statusMessage.value = '错误：机器人模型尚未加载完成！';
    return;
  }

  isSimulating.value = true;
  statusMessage.value = '正在请求后端启动仿真...';

  try {
    // 发送一个HTTP POST请求来触发后端仿真任务
    const response = await fetch(`${API_ENDPOINT}/start-simulation/FactoryTaskNutBoltPick`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`后端启动失败: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('后端响应:', result);
    statusMessage.value = '后端已启动！正在连接WebSocket以接收数据...';

    // 启动成功后，连接WebSocket
    connectWebSocket();

  } catch (error) {
    console.error('启动仿真失败:', error);
    statusMessage.value = `错误: ${error.message}`;
    isSimulating.value = false;
  }
}

// 2. 连接 WebSocket
function connectWebSocket() {
  // 防止重复连接
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    return;
  }

  websocket = new WebSocket(WEBSOCKET_URL);

  websocket.onopen = () => {
    console.log('WebSocket连接成功！');
    statusMessage.value = '数据流已连接，正在接收仿真数据...';
  };

  // 这是最核心的部分：接收并处理后端发来的关节数据
  websocket.onmessage = (event) => {
    try {
      // 假设后端发送的是JSON字符串，格式为: {"joint_name": angle, ...}
      const jointData = JSON.parse(event.data);
      
      // 确保机器人模型已加载
      if (robot) {
        // 遍历收到的所有关节数据，并更新前端模型
        for (const jointName in jointData) {
          if (robot.joints[jointName]) {
            robot.setJointValue(jointName, jointData[jointName]);
          }
        }
      }
    } catch (e) {
      console.error('解析WebSocket消息失败:', e);
    }
  };

  websocket.onclose = () => {
    console.log('WebSocket连接已关闭。');
    statusMessage.value = '仿真结束或连接已断开。';
    isSimulating.value = false;
  };

  websocket.onerror = (error) => {
    console.error('WebSocket发生错误:', error);
    statusMessage.value = 'WebSocket连接错误！';
    errorMessage.value = '无法连接到数据流服务器。';
    isSimulating.value = false;
  };
}

// --- Three.js 初始化和模型加载 (与之前版本基本相同) ---
function init() {
  // ... (场景, 相机, 渲染器, 光照, 控制器等代码与上一版完全相同) ...
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3b4c);
  scene.add(new THREE.GridHelper(2, 10));
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0.8, 0.8, 0.8);
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
  directionalLight.position.set(5, 5, 5);
  directionalLight.castShadow = true;
  scene.add(directionalLight);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.3, 0);
  controls.update();
  
  loadRobot();
}

function loadRobot() {
  const loader = new URDFLoader();
  loader.packages = { 'franka_description': '/models/franka_description' };
  
  loader.load(
    '/models/franka_description/robots/franka_panda.urdf',
    (result) => {
      robot = result;
      robot.rotation.x = -Math.PI / 2; // 扶正
      robot.position.set(0, 0, 0);
      robot.scale.set(0.8, 0.8, 0.8);
      robot.traverse(c => { c.castShadow = true; c.receiveShadow = true; });
      scene.add(robot);
      loading.value = false;
      statusMessage.value = '模型加载完毕，可以启动仿真。'; // 更新状态
    },
    null, // 不再需要进度条，因为加载很快
    (error) => {
      console.error('模型加载失败:', error);
      errorMessage.value = '机器人模型文件加载失败，请检查路径和网络。';
      statusMessage.value = '错误！';
    }
  );
}

// 动画循环 (现在它只负责渲染，不再驱动关节运动)
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}


// --- Vue 生命周期钩子 ---
onMounted(() => {
  init();
  animate();
  window.addEventListener('resize', onWindowResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize);
  // 组件销毁时，确保关闭WebSocket连接
  if (websocket) {
    websocket.close();
  }
  // 清理Three.js资源
  renderer.dispose();
  // ... (其他清理代码)
});

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
</script>

<style scoped>
.robot-view-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.control-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  z-index: 100;
  min-width: 300px;
}
.control-panel h2 {
  margin-top: 0;
}
.control-panel button {
  padding: 10px 15px;
  font-size: 1em;
  cursor: pointer;
  border: none;
  border-radius: 5px;
  background-color: #4CAF50;
  color: white;
}
.control-panel button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}
.status-ready { color: #2196F3; }
.status-simulating { color: #FF9800; }
.status-error { color: #F44336; }

canvas { display: block; }

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(42, 59, 76, 0.9);
  color: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 1.5em;
  font-family: sans-serif;
  text-align: center;
  z-index: 10;
}
.error-message {
  font-size: 0.7em;
  color: #ffc0c0;
  margin-top: 20px;
  max-width: 80%;
}
</style>






