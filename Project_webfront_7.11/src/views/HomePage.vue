<template>
  <div>
    <h1>机器人仿真控制台</h1>
    <button @click="sendActionToBackend" :disabled="isSending">
      {{ isSending ? '发送中...' : '执行机械臂抬手' }}
    </button>
    <p v-if="message">{{ message }}</p>

    <div class="robot-display">
      <RobotViewer />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import RobotViewer from '../components/RobotViewer.vue'; // 导入机器人视图组件

const isSending = ref(false);
const message = ref('');

const sendActionToBackend = async () => {
  isSending.value = true;
  message.value = '正在发送请求...';
  try {
    // 替换为你的后端API地址
    const response = await fetch('ws://112.22.12.63:9090', {
      method: 'POST',       // ******************************************************
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        targetLocation: { x: 0.5, y: 0.2, z: 0.8 }, // 示例目标地点
        action: 'lift_arm' // 示例动作
      }),
    });

    if (response.ok) {
      const data = await response.json();
      message.value = `动作请求成功: ${data.status}`;
    } else {
      message.value = `动作请求失败: ${response.statusText}`;
    }
  } catch (error) {
    message.value = `网络或服务器错误: ${error.message}`;
    console.error('发送请求失败:', error);
  } finally {
    isSending.value = false;
  }
};
</script>

<style scoped>
h1 {
  text-align: center;
  margin-top: 20px;
}

button {
  display: block;
  margin: 20px auto;
  padding: 10px 20px;
  font-size: 18px;
  cursor: pointer;
}

.robot-display {
  position: fixed; /* 让Three.js画布覆盖整个页面 */
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1; /* 确保在按钮和文本下方 */
}
</style>