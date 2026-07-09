import os


class Config:
    # Web 服务器配置
    WEB_HOST = os.getenv('WEB_HOST', '0.0.0.0')
    WEB_PORT = int(os.getenv('WEB_PORT', 58471))
    ONEBOT_WS_TOKEN = os.getenv('ONEBOT_WS_TOKEN', None)

    # 数据库配置
    DATABASE_FILE = os.getenv('DATABASE_FILE', 'messages.db')

    # 消息过滤配置
    # ALLOWED_GROUPS = []  # 空列表表示允许所有群聊
    # ALLOWED_USERS = []  # 空列表表示允许所有私聊

    # NapCatQQ 的 Docker 容器名（当 NapCatQQ 使用 Docker时设置）
    DOCKER_NAPCAT_NAME = os.getenv('DOCKER_NAPCAT_NAME', None)
    # NapCatQQ 容器目录 /app/.config/QQ 的数据卷位置，结尾无需 '/' （当 NapCatQQ 使用 Docker 时设置）
    DOCKER_NAPCAT_QQ_DATA_VOLUME = os.getenv('DOCKER_NAPCAT_QQ_DATA_VOLUME', None)
