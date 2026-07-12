# Neon Web Chat Panel

一个基于 **NapCatQQ** 与 **OneBot 11 协议** 的网页聊天面板，通过 NapCatQQ 的 WebSocket 反向连接获取消息，在前端呈现类 QQ 风格的聊天界面。

> 它通过 [NapCatQQ](https://github.com/NapNeko/NapCatQQ) 的 OneBot 11 WebSocket 接口接收消息，本质上是一个 **OneBot 11 的 Web 客户端**。
>
> **重要：本项目仅限个人学习与开发测试使用，严禁用于商业目的，请勿在公开平台或群组中大量分享传播。**

---

## 使用说明

### 1. 克隆项目

```bash
git clone https://github.com/FalseHappiness/NeonWebChatPanel.git
cd NeonWebChatPanel
```

### 2. 构建前端

前端使用 Vue 3 + Vite 构建，位于 [`viewer/`](viewer/) 目录下。

```bash
# 进入前端目录
cd viewer

# 安装依赖
npm install

# 构建前端（生成 dist 目录）
npm run build

# （可选）初始化 QQ 表情资源
npm run init-emoji

# 返回项目根目录
cd ..
```

> 构建完成后，生成的 [`viewer/dist`](viewer/dist) 目录会被后端自动托管。
>
> 如果需要开发调试前端，可以单独启动开发服务器：
> ```bash
> cd viewer
> npm run dev
> ```
> 开发服务器默认运行在 `http://localhost:51730`。

### 3. 安装 Python 依赖并启动后端

后端使用 Python FastAPI 实现，需要 Python 3.9+ (本项目使用 Python 3.11)。

```bash
# 在项目根目录执行
pip install -r requirements.txt

# 启动后端服务
python app.py
```

后端默认在 `http://0.0.0.0:58471` 启动。

可通过环境变量配置（参见 [`config.py`](config.py:5)）：

| 环境变量                           | 说明                        | 默认值           |
|--------------------------------|---------------------------|---------------|
| `WEB_HOST`                     | 监听地址                      | `0.0.0.0`     |
| `WEB_PORT`                     | 监听端口                      | `58471`       |
| `ONEBOT_WS_TOKEN`              | NapCat WebSocket 认证 Token | 无（不鉴权）        |
| `DATABASE_FILE`                | SQLite 数据库文件路径            | `messages.db` |
| `DOCKER_NAPCAT_NAME`           | NapCatQQ Docker 容器名       | 无             |
| `DOCKER_NAPCAT_QQ_DATA_VOLUME` | NapCatQQ 容器数据卷路径          | 无             |

### 4. 配置 NapCatQQ WebSocket 反向连接

使用浏览器打开后端地址，例如 `http://127.0.0.1:58471`，即可访问聊天面板。

要让 NapCatQQ 将消息推送给本项目的后端，需要配置 NapCatQQ 的 **WebSocket 反向连接（Reverse WebSocket）**。

#### 4.1 编辑 NapCat 配置文件

到 NapCatQQ WebUI 网络配置 添加 Websocket 客户端，名称随意，URL 填写 ws://localhost:58471/ws/napcat，开启上报自身消息，消息格式为
Array

如果后端设置了 `ONEBOT_WS_TOKEN`，需要将 `Token` 设为相同的值：

#### 4.2 重启 NapCatQQ

保存配置后，重启 NapCatQQ 使配置生效。NapCat 会自动连接到本项目的后端 WebSocket。终端日志中会输出类似以下信息：

```
OneBot connected: 1234567890
```

#### 4.3 验证连接

打开浏览器访问 `http://127.0.0.1:58471`，如果一切正常，你应该能看到聊天面板界面，并开始接收消息。

---

## 项目结构

```
├── app.py                 # FastAPI 后端主入口
├── config.py              # 后端配置
├── db.py                  # SQLite 数据库操作
├── onebot_handler.py      # OneBot 消息处理
├── onebot_manager.py      # OneBot WebSocket 连接管理
├── frontend_manager.py    # 前端 WebSocket 连接管理
├── requirements.txt       # Python 依赖
├── viewer/                # 前端 Vue 3 项目
│   ├── .env               # 前端环境变量（API 地址等）
│   ├── package.json
│   ├── vite.config.js
│   └── src/               # 前端源码
└── README.md
```

---

## 技术栈

- **后端**: Python FastAPI + Uvicorn
- **前端**: Vue 3 + Vite + Pinia
- **数据库**: SQLite
- **消息协议**: OneBot 11 (WebSocket)
- **消息源**: NapCatQQ

---

## 相关链接

- [NapCatQQ](https://github.com/NapNeko/NapCatQQ) - 基于 OneBot 11 的 QQ 机器人框架
- [OneBot 11 标准](https://github.com/botuniverse/onebot-11) - 通用聊天机器人应用接口标准

---

# 声明

> **本项目目前处于早期开发阶段，代码、界面、功能均可能发生重大变动，**  
> **请勿在生产环境或正式社交场景中使用。**

## 关于项目性质与使用范围

- 本项目是一个 **基于 NapCatQQ 与 OneBot 11 协议** 的网页聊天面板，**并非腾讯 QQ 的官方网页版**，也与腾讯公司无任何关联。
- 本项目通过 NapCatQQ 提供的 OneBot 11 WebSocket 接口接收和展示消息，NapCatQQ 本身是一个第三方非官方的 QQ 机器人实现。
- 使用本项目意味着您理解并接受：**您正在使用第三方工具与 QQ 服务进行交互，而非腾讯官方提供的客户端或接口。**
- **本项目仅限个人学习与开发测试使用**，**严禁用于任何商业目的**，**请勿在公开平台或群组中大量分享、传播本项目或其衍生版本**。
- 项目仅面向有技术背景的开发者，用于学习 OneBot 协议、WebSocket 通信、Vue 前端开发等技术，不面向普通用户。

## 关于界面与图标资源

- 项目前端界面目前参考了 QQ 的视觉风格，并临时使用了部分 QQ 的图标/表情资源。
- 这些资源的所有权归属于腾讯公司或其相关权利人，**本项目仅作个人学习与开发测试之用**，不主张任何权利，也不用于商业目的。
- 若您认为资源使用不当，请联系我们，我们会尽快替换或移除。
- 在未来，将会重写 UI 并替换第三方图标。

## 关于数据存储与安全

- 后端默认将接收到的聊天数据**以明文（未加密）形式存储于本地文件**。
- 这意味着：
    - 数据**未做脱敏或加密处理**，可能被同一设备上的其他进程或用户读取；
    - 不提供网络传输加密（如 TLS）方面的保证（除非您自行配置）；
    - 不提供用户身份认证、访问控制等安全机制。
- **请勿用于传输任何敏感、隐私或机密信息**。因使用本项目导致的数据泄露、丢失或滥用，开发者不承担任何责任。

## 关于 NapCatQQ 与腾讯风控

- 本项目通过 NapCatQQ 接口与 QQ 服务交互，该接口为第三方非官方实现，**存在被腾讯封禁、限制或终止服务的风险**。
- 使用本项目的 QQ 账号、设备可能面临**风控处罚（如限制登录、功能禁用、甚至永久封号等）**，请自行评估风险并承担后果。
- 开发者**不对任何账号封禁、功能限制或其他腾讯处罚措施负责**，亦不提供任何绕过风控的保证。
- 建议使用**小号或测试账号**进行体验，切勿使用主账号或包含重要信息的账号。

## 关于开源协议与使用限制

- 本项目采用 **MIT 许可证** 开源，您有权自由使用、修改、分发，但**需保留原始版权声明**。
- MIT 协议仅提供"按原样"的免责，**不提供任何质量保证或适用性保证**。  
  详见项目根目录的 `LICENSE` 文件。
- 尽管 MIT 协议允许商业使用，但鉴于本项目的不稳定性和安全缺陷，**强烈不建议用于任何正式或商业场景**。

## 最终提醒

- 您使用本项目的任何行为（包括下载、运行、修改、二次分发）均代表您**已阅读并接受本免责声明**。
- 若您不同意上述条款，请立即停止使用并删除所有相关代码与数据。
- 开发者保留随时修改本免责声明的权利，修改后继续使用即视为接受新声明。

---

**项目仍在演进，仅限个人学习与开发测试使用，请勿大量分享传播。请对自己和他人的数据负责。** 🙏