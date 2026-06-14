<template>
  <div class="rag-container animate-fade-in">
    <el-row :gutter="20" class="metrics-row">
      <el-col :span="6" v-for="(metric, index) in metricsData" :key="index">
        <el-card class="metric-card" shadow="hover">
          <div class="card-content">
            <div class="metric-info">
              <span class="metric-label">{{ metric.title }}</span>
              <h2 class="metric-value">
                {{ metric.value }}<span class="unit">{{ metric.unit }}</span>
              </h2>
            </div>
            <div class="metric-icon-box" :style="{ background: metric.bg, color: metric.color }">
              <el-icon :size="22"><component :is="metric.icon" /></el-icon>
            </div>
          </div>
          <div class="card-footer">
            <span class="trend-text" :class="metric.trendType">{{ metric.trend }}</span>
            <span class="footer-desc">较上周</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="workbench-card" shadow="never">
      <div class="toolbar-wrapper">
        <div class="left-actions">
          <el-button type="primary" class="action-btn" @click="openRegisterDialog">
            <el-icon class="mr-1"><Plus /></el-icon> 注册新资源
          </el-button>
          <el-button type="default" class="action-btn" @click="openFolderDialog">
            <el-icon class="mr-1"><FolderAdd /></el-icon> 新建知识库
          </el-button>
          <el-button-group class="ml-3">
            <el-button :type="viewMode === 'list' ? 'primary' : 'default'" @click="viewMode = 'list'">
              <el-icon><List /></el-icon>
            </el-button>
            <el-button :type="viewMode === 'grid' ? 'primary' : 'default'" @click="viewMode = 'grid'">
              <el-icon><Grid /></el-icon>
            </el-button>
          </el-button-group>
        </div>

        <div class="right-filters">
          <el-input
            v-model="queryParams.name"
            placeholder="输入资源名称进行过滤..."
            class="search-input"
            clearable
            @clear="fetchData"
            @keyup.enter="fetchData"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" plain @click="fetchData">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </div>

      <div v-loading="loading" class="data-display-area">
        <el-table
          v-if="viewMode === 'list' && tableData.length > 0"
          :data="tableData"
          row-key="id"
          class="custom-table"
          :header-cell-style="{ background: '#f8fafc', color: '#1e293b', fontWeight: '600' }"
        >
          <el-table-column prop="name" label="资源名称" min-width="240">
            <template #default="{ row }">
              <div class="file-name-cell">
                <el-icon :size="20" class="file-icon" :class="row.isFolder ? 'folder-clr' : 'file-clr'">
                  <component :is="row.isFolder ? 'Folder' : 'Document'" />
                </el-icon>
                <div class="file-info-text">
                  <span class="main-name">{{ row.name }}</span>
                  <span class="sub-code">{{ row.code || 'RAG-UUID-' + row.id }}</span>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column prop="size" label="数据大小" width="120">
            <template #default="{ row }">
              <span class="text-slate-500">{{ row.isFolder ? '-' : row.size || '0 KB' }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="status" label="解析状态" width="140">
            <template #default="{ row }">
              <span class="status-indicator" :class="'status-' + getStatusTag(row.status)">
                <span class="pulse-dot"></span>
                {{ getStatusText(row.status) }}
              </span>
            </template>
          </el-table-column>

          <el-table-column prop="updatedAt" label="最后更新时间" width="180">
            <template #default="{ row }">
              <span class="time-text">{{ row.updatedAt || row.createdAt }}</span>
            </template>
          </el-table-column>

          <el-table-column label="快捷管理操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <div class="table-ops">
                <el-button link type="danger" @click="handleDelete(row)">
                  <el-icon><Delete /></el-icon> 移除
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <el-row v-else-if="viewMode === 'grid' && tableData.length > 0" :gutter="20" class="grid-layout">
          <el-col :span="6" v-for="item in tableData" :key="item.id" class="grid-col">
            <el-card class="grid-item-card" shadow="hover">
              <div class="grid-card-main">
                <div class="grid-header">
                  <el-icon :size="36" :class="item.isFolder ? 'folder-clr' : 'file-clr'">
                    <component :is="item.isFolder ? 'FolderOpened' : 'Document'" />
                  </el-icon>
                  <span class="status-indicator-mini" :class="'status-' + getStatusTag(item.status)"></span>
                </div>
                <h4 class="grid-title">{{ item.name }}</h4>
                <p class="grid-code">{{ item.code || 'RAG-UUID-' + item.id }}</p>
                <div class="grid-meta">
                  <span>{{ item.isFolder ? '知识库目录' : item.size || '0 KB' }}</span>
                  <span>{{ (item.updatedAt || item.createdAt || '').split(' ')[0] }}</span>
                </div>
              </div>
              <div class="grid-card-actions">
                <span class="del-action" @click="handleDelete(item)">
                  <el-icon class="mr-1"><Delete /></el-icon> 移除资产
                </span>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-empty v-else description="暂无符合检索条件的知识库资产" class="custom-empty">
          <template #image>
            <el-icon :size="64" class="empty-icon"><FolderDelete /></el-icon>
          </template>
          <el-button type="primary" plain @click="openRegisterDialog">立即注册资产</el-button>
        </el-empty>
      </div>
    </el-card>

    <el-dialog v-model="folderDialogVisible" title="新建高维向量隔离知识库" width="500px" append-to-body>
      <el-form :model="folderForm" ref="folderFormRef" :rules="folderRules" label-width="100px">
        <el-form-item label="目录名称" prop="name">
          <el-input v-model="folderForm.name" placeholder="请输入知识库分类目录名称" />
        </el-form-item>
        <el-form-item label="资源编码" prop="code">
          <el-input v-model="folderForm.code" placeholder="如: rag_prod_kb (不填自动生成)" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitFolder">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="registerDialogVisible" title="注册新知识库资源文件" width="520px" append-to-body>
      <el-form :model="registerForm" ref="registerFormRef" :rules="registerRules" label-width="100px">
        <el-form-item label="资源名称" prop="name">
          <el-input v-model="registerForm.name" placeholder="如：企业2026年Q2财报脱敏数据.pdf" />
        </el-form-item>
        <el-form-item label="归属知识库" prop="parentId">
          <el-select v-model="registerForm.parentId" placeholder="请选择归属的父级知识库目录" style="width: 100%">
            <el-option label="根目录 (不归属任何知识库)" :value="0" />
            <el-option v-for="folder in folderOptions" :key="folder.id" :label="folder.name" :value="folder.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="虚拟大小" prop="size">
          <el-input v-model="registerForm.size" placeholder="例如: 2.5 MB" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="registerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="submitRegister">确认注册</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, FolderAdd, List, Grid, Search, Refresh, Delete, FolderDelete } from '@element-plus/icons-vue'

// 🔍 引用项目统一的 axios 实例（带 token 拦截器）
// 之前这里写了 `import axios from 'axios' + axios.create({ baseURL: '/' })`，
// 那个新实例没有任何拦截器，token 永远带不过去，导致服务端 JwtAuthGuard
// 抛 403 "请先登录"。
// 改用 @/utils/request 后会自动把 token 注入 Authorization 头。
import request from '@/utils/request'

// 视图、加载控制
const loading = ref(false)
const submitLoading = ref(false)
const viewMode = ref<'list' | 'grid'>('list')
const tableData = ref<any[]>([])

// 对接后端检索参数
const queryParams = reactive({
  name: ''
})

// 大厂风顶层 Insight 数据看板计算属性
const metricsData = computed(() => [
  {
    title: '知识库资产总量',
    value: tableData.value.length.toString(),
    unit: '个',
    icon: 'Files',
    trend: '实时同步',
    trendType: 'stable',
    bg: 'rgba(59, 130, 246, 0.1)',
    color: '#3b82f6'
  },
  {
    title: '多维关联分类',
    value: tableData.value.filter((i) => i.isFolder).length.toString(),
    unit: '个目录',
    icon: 'Connection',
    trend: '结构化',
    trendType: 'up',
    bg: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981'
  },
  {
    title: 'Embedding 就绪率',
    value: tableData.value.length
      ? ((tableData.value.filter((i) => i.status === 'success').length / tableData.value.length) * 100).toFixed(1)
      : '100',
    unit: '%',
    icon: 'Cpu',
    trend: '高可用',
    trendType: 'up',
    bg: 'rgba(139, 92, 246, 0.1)',
    color: '#8b5cf6'
  },
  {
    title: '集群托管算力空间',
    value: '14.8',
    unit: 'GB',
    icon: 'PieChart',
    trend: '配额充足',
    trendType: 'stable',
    bg: 'rgba(245, 158, 11, 0.1)',
    color: '#f59e0b'
  }
])

/* ======================================================================
   🔌 后端服务 API 桥接核心逻辑
   ====================================================================== */

// 🌐 接口 1: 读取列表 (GET /api/rag/files/list)
const fetchData = async () => {
  loading.value = true
  try {
    const response: any = await request({ url: '/rag/files/list', method: 'get', params: queryParams })
    tableData.value = response.data?.data || response.data || []
  } catch (error) {
    ElMessage.error('获取知识库资产列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

// 📂 接口 2: 新建文件夹弹窗与提交 (POST /api/rag/folder/create)
const folderDialogVisible = ref(false)
const folderFormRef = ref<FormInstance>()
const folderForm = reactive({ name: '', code: '' })
const folderRules = reactive<FormRules>({
  name: [{ required: true, message: '请填写目录名称', trigger: 'blur' }]
})

const openFolderDialog = () => {
  folderForm.name = ''
  folderForm.code = ''
  folderDialogVisible.value = true
}

const submitFolder = async () => {
  if (!folderFormRef.value) return
  // 🔥 显式为 valid 参数指定 boolean 类型，消除 TS 报错
  await folderFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      try {
        await request({ url: '/rag/folder/create', method: 'post', data: folderForm })
        ElMessage.success('成功创建高维向量隔离知识库目录')
        folderDialogVisible.value = false
        fetchData()
      } catch (error) {
        ElMessage.error('知识库目录创建失败')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 📄 接口 3: 注册新资源文件弹窗与提交 (POST /api/rag/file/register)
const registerDialogVisible = ref(false)
const registerFormRef = ref<FormInstance>()
const registerForm = reactive({ name: '', parentId: 0, size: '120 KB' })
const registerRules = reactive<FormRules>({
  name: [{ required: true, message: '请指定资源名称', trigger: 'blur' }],
  parentId: [{ required: true, message: '请选择归属节点', trigger: 'change' }]
})

// 提取当前列表中所有的文件夹作为下拉选项
const folderOptions = computed(() => tableData.value.filter((item) => item.isFolder))

const openRegisterDialog = () => {
  registerForm.name = ''
  registerForm.parentId = 0
  registerForm.size = '1.2 MB'
  registerDialogVisible.value = true
}

const submitRegister = async () => {
  if (!registerFormRef.value) return
  // 🔥 显式为 valid 参数指定 boolean 类型，消除 TS 报错
  await registerFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      try {
        await request({ url: '/rag/file/register', method: 'post', data: registerForm })
        ElMessage.success('新知识资源已成功向 RAG 节点注册')
        registerDialogVisible.value = false
        fetchData()
      } catch (error) {
        ElMessage.error('资源注册失败')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 🗑️ 视图内平滑卸载
const handleDelete = (row: any) => {
  ElMessageBox.confirm(`确定从资源树移除 [${row.fileName}] 吗？`, '安全警告', {
    confirmButtonText: '确认解绑',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      tableData.value = tableData.value.filter((item) => item.id !== row.id)
      ElMessage.success('资产已安全从视图平滑卸载')
    })
    .catch(() => {})
}

// 辅助转换外观控制
const getStatusTag = (status: string) => {
  const map: Record<string, string> = { success: 'success', processing: 'primary', failed: 'danger' }
  return map[status] || 'success'
}

const getStatusText = (status: string) => {
  const map: Record<string, string> = { success: '已就绪', processing: '解析中', failed: '解析失败' }
  return map[status] || '已就绪'
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
/* Styles keep identical for big厂 vibe */
.rag-container {
  padding: 24px;
  background-color: #f8fafc;
  min-height: calc(100vh - 84px);
}
.metrics-row {
  margin-bottom: 24px;
}
.metric-card {
  border: none;
  border-radius: 12px;
  background: #ffffff;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.metric-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -10px rgba(148, 163, 184, 0.4);
}
.card-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.metric-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}
.metric-value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
  margin: 6px 0 0 0;
}
.metric-value .unit {
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  margin-left: 4px;
}
.metric-icon-box {
  width: 46px;
  height: 46px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-footer {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 12px;
}
.trend-text {
  color: #10b981;
  font-weight: 600;
}
.footer-desc {
  color: #94a3b8;
  margin-left: 6px;
}
.workbench-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}
.toolbar-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.search-input {
  width: 260px;
  margin-right: 12px;
}
.custom-table {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #edf2f7;
}
.file-name-cell {
  display: flex;
  align-items: center;
}
.file-icon {
  margin-right: 12px;
}
.folder-clr {
  color: #ffb020;
}
.file-clr {
  color: #3b82f6;
}
.file-info-text {
  display: flex;
  flex-direction: column;
}
.main-name {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
}
.sub-code {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}
.status-indicator {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 20px;
}
.status-success {
  background: #f0fdf4;
  color: #15803d;
}
.status-primary {
  background: #eff6ff;
  color: #1d4ed8;
}
.status-failed {
  background: #fef2f2;
  color: #b91c1c;
}
.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 8px;
  display: inline-block;
}
.status-success .pulse-dot {
  background: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
}
.status-primary .pulse-dot {
  background: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
}
.status-failed .pulse-dot {
  background: #dc2626;
  box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
}
.time-text {
  color: #64748b;
  font-size: 13px;
}
.grid-layout {
  margin-top: -10px;
}
.grid-col {
  margin-top: 20px;
}
.grid-item-card {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  transition: all 0.3s ease;
}
.grid-item-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 10px 20px -5px rgba(148, 163, 184, 0.2);
}
:deep(.grid-item-card .el-card__body) {
  padding: 0 !important;
}
.grid-card-main {
  padding: 20px;
  border-bottom: 1px solid #f1f5f9;
}
.grid-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.status-indicator-mini {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.status-indicator-mini.status-success {
  background: #16a34a;
}
.status-indicator-mini.status-primary {
  background: #2563eb;
}
.status-indicator-mini.status-failed {
  background: #dc2626;
}
.grid-title {
  font-size: 15px;
  font-weight: 600;
  color: #0f172a;
  margin: 14px 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.grid-code {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 16px 0;
}
.grid-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
}
.grid-card-actions {
  display: flex;
  background: #f8fafc;
}
.grid-card-actions span {
  flex: 1;
  text-align: center;
  padding: 11px 0;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.grid-card-actions span:hover {
  background: #edf2f7;
}
.grid-card-actions span.del-action:hover {
  color: #ef4444;
  background: #fef2f2;
}
.custom-empty {
  padding: 60px 0;
}
.empty-icon {
  color: #cbd5e1;
  margin-bottom: 10px;
}
.animate-fade-in {
  animation: fadeIn 0.45s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
