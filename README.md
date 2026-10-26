# AI 模拟患者诊断教学网页

面向医学本科教育的 **AI 模拟患者诊断教学** 纯前端原型。学生扮演医生、AI 扮演患者，在微信式对话中练习问诊与诊断；医院端上传病历并由 AI 结构化、去隐私化；管理端统一管理 API、AI 参数、病例与统计。

- 技术栈：**原生 HTML + CSS + JavaScript**，无任何前端框架
- 持久化：**localStorage**（已预留后端 API 适配层，见文末）
- 设计：参考现代 AI 对话软件，电脑端与手机端（含 375px）响应式，无横向滚动

---

## 一、目录结构

```
D:\code\cursor\ai-patient-sim\
├─ index.html                统一入口（选择学生端 / 管理端 / 医院端）
├─ student-diagnosis.html    学生端·诊断练习（微信式对话）
├─ student-records.html      学生端·问诊记录与知识点
├─ student-quiz.html         学生端·题库练习
├─ hospital.html             医院端·病例上传（对话式）+ 病例库
├─ admin-dashboard.html      管理端·仪表盘
├─ admin-apikey.html         管理端·API Key 管理
├─ admin-ai-settings.html    管理端·AI 调用设置
├─ admin-cases.html          管理端·病例审核 / 管理
├─ admin-stats.html          管理端·统计
├─ css\
│  ├─ base.css               设计变量、重置、排版
│  ├─ layout.css             应用骨架、侧边栏、栅格、聊天布局
│  ├─ components.css         按钮/卡片/气泡/表格/模态/Toast 等组件
│  └─ responsive.css         响应式（含 375px 手机适配）
├─ js\
│  ├─ config.js              默认配置、默认积分规则、病例类型、数据键
│  ├─ storage.js             localStorage 统一读写封装
│  ├─ api.js                 统一 AI 调用适配层（真实 / 演示 / 阻止）
│  ├─ auth.js                轻量鉴权与学习者昵称
│  ├─ mock-ai.js             演示模式：模拟患者、结构化病例、出题、去隐私化
│  ├─ utils.js               Toast、模态、脱敏、选择器、时间等工具
│  ├─ points.js              积分机制
│  ├─ hospital.js            医院端逻辑
│  ├─ admin.js               管理端五个页面逻辑
│  ├─ student-diagnosis.js   学生诊断对话逻辑
│  ├─ student-records.js     学生记录与知识点
│  ├─ student-quiz.js        学生题库练习
│  └─ shell.js               外壳交互（移动端抽屉导航）
└─ README.md
```

---

## 二、启动方式

### 方式 A：直接打开（最简单）
双击 `index.html` 即可在现代浏览器（Chrome / Edge / Firefox）中运行。
> localStorage 在 `file://` 下可用；个别浏览器对本地文件限制较严时，请用方式 B。

### 方式 B：本地静态服务器（推荐）
在项目目录执行（任选其一）：

```powershell
# Python
cd D:\code\cursor\ai-patient-sim
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

```powershell
# Node
npx serve D:\code\cursor\ai-patient-sim
```

---

## 三、三个端口入口

从 `index.html` 选择进入：

| 端口 | 入口页面 | 说明 |
|------|----------|------|
| 学生端 | `student-diagnosis.html` | 诊断练习 / 问诊记录 / 题库练习 |
| 管理端 | `admin-dashboard.html` | API、AI 设置、病例审核、统计 |
| 医院端 | `hospital.html` | 上传病历、AI 结构化、去隐私化、入库 |

---

## 四、管理端默认进入方式

- **默认无访问口令**：直接打开 `admin-dashboard.html`（或任意 `admin-*.html`）即可进入，无需登录。
- 如需锁定后台：在「管理端 · AI 设置」中配置 `adminPasscode`（代码位置：`js/config.js` 的 `DEFAULT_CONFIG.adminPasscode`，留空=不锁）。配置后进入管理页会要求输入口令。
- **API Key 永不写死在源码**：只能在「API Key 管理」页由管理员填入，保存在浏览器 localStorage（键 `aips:aiPatientConfig`）。

---

## 五、演示模式说明（无 Key / 停止调用时）

系统判定逻辑见 `js/api.js` 的 `AIPS.api.status()`：

1. **未配置 Key 且演示模式开启** → 自动进入演示模式（模拟患者），页面顶部提示“当前为演示模式”。
2. **管理员在 API Key 页关闭“允许发起 AI 调用”** → 学生端 / 医院端不再发起真实请求，并明确提示 **“管理员已停止 API 调用”**（若演示模式开启则同时回退到模拟患者）。
3. **今日 Token 已达上限** → 阻止调用并提示。
4. 演示模式由 `js/mock-ai.js` 提供：模拟患者对话（含可点击的关键线索词）、由文本生成结构化病例、自动出题。

> 演示模式下所有功能均可正常教学验收，无需任何外部服务。

---

## 六、数据存储位置

全部存于浏览器 **localStorage**，统一前缀 `aips:`：

| 键 | 内容 |
|----|------|
| `aips:aiPatientConfig` | API Key、Base URL、模型、开关、Token 限制、提示词、英文概率、演示模式、积分规则 |
| `aips:cases` | 病例库（结构化病例、线索、知识点、题目） |
| `aips:diagnosisRecords` | 学生诊断记录（对话、评估、积分变化） |
| `aips:quizRecords` | 做题记录 |
| `aips:pointsRecords` | 积分明细 |
| `aips:tokenUsage` | Token 当日用量（跨日自动重置） |
| `aips:studentName` | 学习者昵称 |

> 清除浏览器站点数据即可重置全部内容。

---

## 七、功能对照（验收清单）

- [x] 入口页可选三端
- [x] 管理端：Key 写入 / 脱敏显示（`sk-****abcd`）/ 抹除 / 停止恢复 / 换 Key 立即生效（均有二次确认）
- [x] 管理端：单日 & 单次 Token 限制、用量统计、提示词与参数可编辑
- [x] 医院端：文本 / PDF（`pdf.js`）/ 图片（OCR 适配器）上传，AI 结构化 + 去隐私化，预览可编辑后入库
- [x] 学生端：选类型→选病例→微信式对话；关键线索词可点击查看临床信息
- [x] 英文外国患者：概率默认 10%，管理端可配置
- [x] 学生端：过往问诊记录 + 知识点总结（可展开完整对话）
- [x] 每病例 4 道选择题 + 1 道简答题，可随时练习
- [x] 积分机制覆盖诊断正确率、人文关怀、题目对错，含积分明细
- [x] 375px 与桌面端均不错乱、不横向滚动
- [x] 无 Key / 停止调用时进入演示模式，不发起真实请求
- [x] HTML / CSS / JS 完全分离

---

## 八、仍需替换的适配点（接入真实服务时）

本原型为纯前端，以下位置需替换为真实后端 / 服务：

1. **大模型接入** —— `js/api.js` 的 `callChat()`：当前向 `cfg.baseURL + /chat/completions` 发起 OpenAI 兼容请求。
   - 浏览器直连大模型常受 **CORS** 限制，生产建议改为请求你自己的**后端代理**（在后端注入 Key 并转发），前端只调自己的接口。后端适配层建议封装在 `js/api.js`，对外接口不变。
2. **OCR 识别** —— `js/hospital.js` 顶部的 `window.AIPS.ocrAdapter`：当前为演示占位。可替换为：
   - 前端 `Tesseract.js`（在 `hospital.html` 引入并改写 `recognize`）
   - 或调用后端 OCR 服务（在 `recognize` 内 `fetch` 你的接口）
3. **PDF 解析** —— 已用 `pdf.js`（CDN）。若内网不可用，可将 `pdf.js` 下载到本地 `vendor/` 并修改 `hospital.html` 的引用路径。
4. **后端持久化** —— 当前用 localStorage。要多人共享病例 / 成绩，需在 `js/storage.js` 增加远程读写（REST/GraphQL）分支，页面逻辑无需改动。
5. **真实结构化与出题** —— `js/mock-ai.js` 的 `buildStructuredCase` / `generateQuiz` 为规则兜底；接入大模型后由 `api.js` 的 `generateCase` / `generateQuiz` 走真实模型，失败自动回退演示。
6. **更多病例** —— 预置 3 个演示病例（心血管 / 外科 / 儿科），可在「医院端」上传或由管理端补充。

---

## 九、注意事项

- API Key 仅保存在**当前浏览器**的 localStorage，清除站点数据或换设备即失效；不要在有他人使用的公共电脑上填写真实 Key。
- 演示模式与真实模式对外接口一致，教学验收无需任何外部账号。
- 本项目为教学原型，结构化病例与评估仅供参考，不构成任何医疗建议。
# ai-patient
