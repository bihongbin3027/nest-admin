<template>
  <div class="login-container">
    <div class="ambient-glow glow-1"></div>
    <div class="ambient-glow glow-2"></div>

    <ThemeSwitch class="theme-switch" />

    <div class="login-wrapper">
      <div class="brand-showcase">
        <div class="brand-logo">AI</div>
        <div class="brand-slogan">
          <h2>释放无限想象力</h2>
          <p>基于企业级双轨制 RAG 架构与混合大模型底座，为您提供安全、精准、秒级的智能知识资产沉淀与多维数据洞察。</p>
        </div>
        <div class="brand-footer">
          <span>Enterprise Secure Sandbox Protective</span>
        </div>
      </div>

      <div class="login-card-glass">
        <div class="login-header">
          <h1 class="welcome-title">欢迎回来</h1>
          <p class="welcome-subtitle">请验证您的企业大脑终端凭证</p>
        </div>

        <div class="login-content">
          <el-form
            ref="loginFormRef"
            :disabled="loading"
            :model="formData"
            :rules="loginFormRules"
            label-position="top"
          >
            <el-form-item prop="account">
              <div class="custom-label">安全账户</div>
              <el-input v-model.trim="formData.account" size="large" placeholder="工号 / 邮箱 / 手机号">
                <template #prefix>
                  <el-icon><User /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <el-form-item prop="password">
              <div class="custom-label">终端口令</div>
              <el-input
                type="password"
                size="large"
                v-model="formData.password"
                placeholder="专属访问密码"
                show-password
                @keyup.enter="loginEvent"
              >
                <template #prefix>
                  <el-icon><Lock /></el-icon>
                </template>
              </el-input>
            </el-form-item>

            <div class="form-options">
              <el-checkbox v-model="formData.rememberMe">
                <span>记住此终端</span>
              </el-checkbox>
              <!-- <span class="forget-pwd">忘记密码？</span> -->
            </div>

            <el-button :loading="loading" type="primary" class="login-submit-btn" @click.prevent="loginEvent">
              <span>验证并登入终端</span>
              <el-icon class="btn-icon-next"><ArrowRight /></el-icon>
            </el-button>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { User, Lock, ArrowRight } from '@element-plus/icons-vue'

import ThemeSwitch from '@/components/ThemeSwitch/index.vue'
import { login, type LoginResult } from '@/api/user'
import { setToken } from '@/utils/cache'

// 表单数据
const formData = ref({
  account: '',
  password: '',
  rememberMe: false
})

// 表单验证
const loginFormRules = {
  account: [{ required: true, message: '请输入管理账户或邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入终端口令密码', trigger: 'blur' }]
}
const loginFormRef = ref()
const loading = ref<boolean>(false)

const router = useRouter()

const REMEMBER_KEY = 'RAG_TERMINAL_CREDENTIAL'

// 初始化挂载读取
onMounted(() => {
  const savedData = localStorage.getItem(REMEMBER_KEY)
  if (savedData) {
    try {
      const { account, password } = JSON.parse(savedData)
      formData.value.account = account || ''
      formData.value.password = password || ''
      formData.value.rememberMe = true
    } catch (e) {
      console.error('解析记住的终端凭证失败', e)
    }
  }
})

// 触发验证登录
const loginEvent = () => {
  if (loginFormRef.value) {
    loginFormRef.value.validate(async (valid: boolean) => {
      if (valid) {
        loading.value = true
        try {
          const res = await login({
            account: formData.value.account,
            password: formData.value.password
          })

          if (res?.code === 200) {
            const data = res.data as LoginResult
            setToken(data.accessToken, data.refreshToken)

            if (formData.value.rememberMe) {
              localStorage.setItem(
                REMEMBER_KEY,
                JSON.stringify({
                  account: formData.value.account,
                  password: formData.value.password
                })
              )
            } else {
              localStorage.removeItem(REMEMBER_KEY)
            }

            ElMessage({ message: '凭证验证成功，正在同步数据空间...', type: 'success' })
            router.replace('/')
          } else {
            ElMessage({ message: res?.msg || '安全令牌鉴权失败，请检查账户输入', type: 'error' })
          }
        } catch (err) {
          ElMessage({ message: '网络连接超时，安全沙箱握手失败', type: 'error' })
        } finally {
          loading.value = false
        }
      }
    })
  }
}
</script>

<style lang="scss" scoped>
.login-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100vw;
  height: 100vh;
  background-color: var(--login-bg);
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  transition: background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1);

  .ambient-glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(120px);
    pointer-events: none;
    z-index: 1;
    mix-blend-mode: screen;
    transition: background 0.5s ease;
  }
  .glow-1 {
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, var(--login-glow-1) 0%, rgba(0, 0, 0, 0) 70%);
    top: -10%;
    left: -10%;
    animation: floating-blue 12s infinite alternate ease-in-out;
  }
  .glow-2 {
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, var(--login-glow-2) 0%, rgba(0, 0, 0, 0) 70%);
    bottom: -10%;
    right: -5%;
    animation: floating-purple 10s infinite alternate ease-in-out;
  }

  .theme-switch {
    position: fixed;
    top: 4%;
    right: 4%;
    cursor: pointer;
    z-index: 10;
  }

  .login-wrapper {
    position: relative;
    z-index: 5;
    display: flex;
    width: 960px;
    height: 580px;
    background: var(--login-wrapper-bg);
    border: 1px solid var(--login-wrapper-border);
    border-radius: 24px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    overflow: hidden;
    transition: all 0.4s ease;
  }

  .brand-showcase {
    flex: 1.1;
    background: var(--login-brand-bg);
    border-right: 1px solid var(--login-wrapper-border);
    padding: 48px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: background 0.4s ease;

    .brand-logo {
      width: 48px;
      height: 48px;
      background: var(--login-primary-btn);
      color: #fff;
      font-size: 20px;
      font-weight: 800;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 20px rgba(99, 102, 241, 0.2);
    }

    .brand-slogan {
      h2 {
        color: var(--login-text-main);
        font-size: 32px;
        font-weight: 700;
        margin-bottom: 16px;
        letter-spacing: -0.5px;
        transition: color 0.3s;
      }
      p {
        color: var(--login-text-sub);
        font-size: 14px;
        line-height: 1.7;
        transition: color 0.3s;
      }
    }

    .brand-footer {
      font-size: 11px;
      color: var(--login-text-sub);
      opacity: 0.6;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
  }

  .login-card-glass {
    flex: 1;
    padding: 54px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: var(--login-card-bg);
    transition: background 0.4s ease;

    .login-header {
      margin-bottom: 32px;
      .welcome-title {
        font-size: 26px;
        font-weight: 600;
        color: var(--login-text-main);
        margin-bottom: 6px;
      }
      .welcome-subtitle {
        font-size: 13px;
        color: var(--login-text-sub);
      }
    }

    .custom-label {
      font-size: 12px;
      color: var(--login-text-sub);
      margin-bottom: 6px;
      font-weight: 500;
    }

    :deep(.el-form-item) {
      margin-bottom: 22px;
    }

    :deep(.el-input__wrapper) {
      background-color: var(--login-input-bg) !important;
      border: 1px solid var(--login-input-border) !important;
      box-shadow: none !important;
      border-radius: 10px !important;
      padding: 6px 14px !important;
      transition: all 0.25s ease;

      &:hover {
        border-color: var(--login-text-main) !important;
      }
      &.is-focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15) !important;
      }
    }

    :deep(.el-input__inner) {
      color: var(--login-input-text) !important;
      font-size: 14px !important;
      &::placeholder {
        color: var(--login-text-sub) !important;
        opacity: 0.6;
      }
    }

    :deep(.el-input__prefix-inner .el-icon) {
      font-size: 16px;
      color: var(--login-text-sub);
    }

    .form-options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;

      :deep(.el-checkbox__label) {
        color: var(--login-text-sub);
        font-size: 13px;
      }
      :deep(.el-checkbox__inner) {
        background-color: var(--login-input-bg);
        border-color: var(--login-input-border);
      }
      :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
        background: var(--login-primary-btn);
        border-color: transparent;
      }

      .forget-pwd {
        font-size: 13px;
        color: #6366f1;
        cursor: pointer;
        transition: color 0.2s;
        &:hover {
          filter: brightness(1.2);
        }
      }
    }

    .login-submit-btn {
      width: 100%;
      height: 46px;
      border-radius: 10px;
      background: var(--login-primary-btn) !important;
      border: none !important;
      font-size: 15px;
      font-weight: 600;
      color: #ffffff !important;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.2);
      transition: all 0.3s ease;

      &:hover {
        opacity: 0.95;
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.3);
      }
      &:active {
        transform: translateY(1px);
      }
    }
  }
}

@keyframes floating-blue {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(40px, 30px) scale(1.08);
  }
}
@keyframes floating-purple {
  0% {
    transform: translate(0, 0) scale(1);
  }
  100% {
    transform: translate(-30px, -40px) scale(1.12);
  }
}
</style>
