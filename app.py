import asyncio
import base64
import mimetypes
import time
import urllib
from datetime import datetime
from typing import Dict, Union, List, Any, Optional, AsyncIterator

import aiohttp
import requests
from fastapi import FastAPI, WebSocket, Depends, Request, Response, WebSocketException, HTTPException
from fastapi.params import Header
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json
import uvicorn
from urllib.parse import urlparse, quote
import docker

from frontend_manager import FrontendConnectionManager
from onebot_manager import OneBotConnectionManager, ActionFailed
from onebot_handler import OneBotHandler, convert_event_to_message_data
from db import Database
from config import Config

import logging
import sys

# 配置 logging
# logging.basicConfig(
#     level=logging.INFO,
#     format='%(asctime)s - %(levelname)s - %(message)s',
#     handlers=[
#         logging.FileHandler('logs.log', encoding='utf-8'),
#         logging.StreamHandler(sys.stdout)  # 同时输出到控制台
#     ]
# )

# 初始化配置和数据库
config = Config()
db = Database(config.DATABASE_FILE)

# 创建FastAPI应用
app = FastAPI(title="Qireno Web Chat")

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化 WebSocket 管理器
onebot_manager = OneBotConnectionManager(config.ONEBOT_WS_TOKEN)
frontend_manager = FrontendConnectionManager(onebot_manager)


@app.websocket("/ws/{path:path}")
async def dynamic_websocket(websocket: WebSocket, path: str):
    parts = path.split('/')
    name = parts[0]
    # sub_name = parts[1] if len(parts) > 1 else None

    if name == 'frontend':
        await frontend_manager.connect(websocket)
    elif name == 'napcat':
        await onebot_manager.connect(websocket)
    else:
        raise WebSocketException(
            code=1008,  # WebSocket 关闭代码 1008
            reason="404 Not Found"
        )


# OneBotHandler初始化
onebot_handler = OneBotHandler(db, config, onebot_manager, frontend_manager)


# 依赖函数：从请求中获取参数（支持GET和POST）
async def get_request_params(request: Request):
    """从查询参数和JSON body中获取所有参数"""
    params = {}

    # 获取查询参数
    for key, value in request.query_params.items():
        params[key] = value

    # 如果请求有body，尝试解析JSON
    if request.method in ["POST", "PUT", "PATCH"]:
        try:
            body_data = await request.json()
            params.update(body_data)
        except:
            pass

    return params


# 通用参数解析函数
def parse_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.lower() in ('true', '1', 'yes', 'on')
    return bool(value)


def parse_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


# -------- 公共核心方法（供 FastAPI 路由和 req_backend 共同调用） --------

async def get_messages_core(params: dict):
    """获取消息列表（核心实现）"""
    limit = parse_int(params.get('limit', 100))
    cursor = params.get('cursor')
    if cursor is not None:
        cursor = parse_int(cursor)

    cursor_type = params.get('cursor_type', "id")
    direction = params.get('direction', 'prev')
    include_cursor = parse_bool(params.get('include_cursor', False))
    message_id = parse_int(params.get('message_id', 0))

    cursor_time = params.get('cursor_time')
    if cursor_time is not None:
        cursor_time = parse_int(cursor_time)

    # 是否为notice消息
    notice_message = parse_bool(params.get('notice_message', False))
    # notice_cursor, -1为未知, 0为最新/旧
    notice_before_cursor = parse_int(params.get('notice_before_message', -1))
    notice_after_cursor = parse_int(params.get('notice_after_message', -1))

    # 获取筛选参数
    post_type = params.get('post_type')
    message_type = params.get('message_type')
    group_id = parse_int(params.get('group_id', -1))
    user_id = parse_int(params.get('user_id', -1))
    target_id = parse_int(params.get('target_id', -1))

    filters = {
        "self_id": onebot_manager.get_first_self_id()
    }

    if post_type is not None:
        filters['post_type'] = post_type
    if message_type is not None:
        filters['message_type'] = message_type
    if group_id != -1:
        filters['group_id'] = group_id
    if target_id != -1:
        filters['target_id'] = target_id
    if user_id != -1:
        filters['user_id'] = user_id

    if post_type is None and message_type is not None and user_id == -1:
        if message_type in ['group', 'private']:
            notice_filter: Dict[str, Union[str, int, float, bool, List, None]] = {
                'sub_type': ['poke', 'add', 'ban', 'lift_ban', 'approve', 'invite', 'kick_me'],
                'notice_type': ['notify', 'essence', 'group_ban', 'group_increase', 'group_decrease'],
                'post_type': 'notice',
            }
            filters['post_type'] = ['message', 'message_sent']
            if message_type == 'group':
                filters['sub_type'] = 'normal'
                notice_filter['group_id'] = group_id
            elif message_type == 'private':
                filters['sub_type'] = ['friend', 'group']
                notice_filter['user_id'] = target_id
                notice_filter['group_id'] = None
            filters = [filters, notice_filter]

    result = db.get_messages(
        limit=limit,
        cursor=cursor,
        direction=direction,
        include_cursor=include_cursor,
        filters=filters,
        use_real_seq=False if cursor_type == 'id' else True,
    )
    result['max_real_seq'] = None

    del result['max_id'], result['min_id']

    db_messages = result['messages']

    api_messages = None
    if post_type is None and user_id == -1:
        found_message_id = False
        if notice_message:
            if direction == 'prev':
                message_id = notice_after_cursor
                if message_id == -1:
                    after_message = db.get_nearest_message_to_notice(
                        cursor,
                        group_id=None if group_id == -1 else group_id,
                        target_id=None if target_id == -1 else target_id,
                        get_after=True,
                        get_before=False
                    )
                    if after_message is not None:
                        message_id = after_message.message_id
                    else:
                        # 默认为最新
                        message_id = 0

                found_message_id = True
            elif direction == 'next':
                message_id = notice_before_cursor
                if message_id == -1:
                    before_message = db.get_nearest_message_to_notice(
                        cursor,
                        group_id=None if group_id == -1 else group_id,
                        target_id=None if target_id == -1 else target_id,
                        get_after=False,
                        get_before=True
                    )
                    if before_message is not None:
                        message_id = before_message.message_id
                        found_message_id = True
                else:
                    found_message_id = True

        if not notice_message or found_message_id:
            if direction == 'prev' or message_id != 0:
                api_messages = await onebot_handler.get_messages(
                    id=(group_id if message_type == 'group' else target_id),
                    type=message_type,
                    count=limit + 1,
                    direction=direction,
                    message_id=message_id,
                )
                api_messages = [convert_event_to_message_data(event) for event in api_messages]
                if cursor_time is not None:
                    if direction == 'prev':
                        api_messages = [msg for msg in api_messages if msg.get('time', cursor_time + 1) <= cursor_time]
                    elif direction == 'next':
                        api_messages = [msg for msg in api_messages if msg.get('time', 0) >= cursor_time]

    if api_messages is not None:
        # 合并列表并按real_seq排序，重复的以后面的为准
        merged = {}
        temp_merged_messages = api_messages + db_messages

        for idx, msg in enumerate(temp_merged_messages):
            # 如果有 real_seq，就用它作为键（重复时后面的覆盖前面的）
            real_seq = msg.get("real_seq", None) or msg.get("message_seq", None)
            if ('real_seq' in msg or 'message_seq' in msg) and real_seq is not None:
                msg['real_seq'] = real_seq
                old_msg = merged.get(real_seq)
                if isinstance(msg, dict):
                    event = msg.get('event')
                    if isinstance(event, str):
                        try:
                            event = json.loads(event)
                            if not event.get('message'):
                                if 'recall_operator' not in event:
                                    event['recall_operator'] = -1
                                    msg['event'] = json.dumps(event)
                        except json.JSONDecodeError:
                            pass

                if isinstance(old_msg, dict) and isinstance(msg, dict):
                    old_event = old_msg.get('event')
                    event = msg.get('event')
                    if isinstance(old_event, str) and isinstance(event, str):
                        try:
                            old_event = json.loads(old_event)
                            event = json.loads(event)
                            old_message = old_event.get('message')
                            if not old_message:
                                if 'recall_operator' not in event:
                                    event['recall_operator'] = -1
                                    msg['event'] = json.dumps(event)
                            else:
                                db_message = event.get('message', [])
                                if len(old_message) == len(db_message):
                                    for i in range(len(old_message)):
                                        old_msg_data = old_message[i].get('data')
                                        db_msg_data = db_message[i].get('data')
                                        if isinstance(old_msg_data, dict) and isinstance(db_msg_data, dict):
                                            if 'url' in old_msg_data and 'url' in db_msg_data:
                                                db_msg_data['url'] = old_msg_data['url']
                                    msg['event'] = json.dumps(event)
                        except json.JSONDecodeError:
                            pass

                merged[real_seq] = msg
            # 如果没有 real_seq，就用 (time, idx) 作为键（确保唯一性）
            else:
                merged[(msg['time'], idx)] = msg

        sorted_messages = sorted(
            merged.values(),
            key=lambda x: (
                x.get('time', float('inf')) or float('inf'),  # 优先按 time 排序，没有则放最后
                x.get('real_seq', float('inf')) or float('inf'),  # 其次按 real_seq 排序，没有则放最后
                x.get('id', float('inf')) or float('inf'),  # 最后按 id 排序，没有则放最后
                id(x)  # 如果全部相同，保持原始顺序（稳定排序）
            )
        )

        # 根据include_cursor过滤
        if not include_cursor:
            sorted_messages = [msg for msg in sorted_messages if msg.get('message_id') != message_id]

        # 根据direction和count提取子集
        if direction == 'prev':
            messages = sorted_messages[-limit:] if limit else []
        else:  # 'next'
            messages = sorted_messages[:limit] if limit else []

        if message_id == 0:
            result['max_real_seq'] = int(messages[-1]["real_seq"] or -1)
    else:
        messages = db_messages

    result['messages'] = messages

    return result


async def get_msg_core(params: dict):
    """获取单条消息（核心实现），返回消息数据，未找到时抛出异常"""
    id_val = params.get('id')
    message_id_val = params.get('message_id')

    if id_val is not None:
        id_val = parse_int(id_val)
    if message_id_val is not None:
        message_id_val = parse_int(message_id_val)

    type = 'id' if id_val is not None else 'message_id'
    msg = db.get_msg(
        id_val if id_val is not None else message_id_val,
        type
    )

    if msg is None and message_id_val is not None:
        try:
            api_data = await onebot_manager.call_action('get_msg', {'message_id': message_id_val})
            msg = convert_event_to_message_data(api_data)
        except Exception as e:
            raise ValueError(f"Failed to get message from API: {e}")

    if msg is None:
        raise ValueError(f"Message not found: {params}")

    return msg


async def sync_messages_core(params: dict):
    """同步新消息（核心实现）"""
    last_id = parse_int(params.get('last_id', 0))
    messages = db.get_new_messages(last_id)
    return {
        'messages': messages,
        'last_id': max([msg['id'] for msg in messages], default=last_id)
    }


async def get_contacts_core():
    """获取联系人列表（核心实现）"""
    db_contacts = db.get_contacts()
    api_contacts = await onebot_handler.get_recent_contacts()

    # 创建一个字典用于快速查找
    contact_dict = {}

    # 首先添加 db_contacts 到字典
    for contact in db_contacts:
        key = (contact['contact_id'], contact['type'])
        contact_dict[key] = contact.copy()  # 创建副本避免修改原始数据

    # 然后合并 api_contacts，合并冲突字段
    for contact in api_contacts:
        key = (contact['contact_id'], contact['type'])
        if key in contact_dict:
            # 合并两个联系人字典，api_contacts的数据优先
            db_contact = contact_dict[key]
            if contact.get('latest_msg') and contact.get('has_message'):
                db_contact['latest_msg'] = contact['latest_msg']
            db_contact['temp'] = contact.get('temp')
            if contact.get('last_timestamp'):
                db_contact['last_timestamp'] = contact.get('last_timestamp')
            db_contact['name'] = contact.get('name')
            db_contact['real_name'] = contact.get('real_name')
            db_contact['remark'] = contact.get('remark')
        else:
            contact_dict[key] = contact.copy()

    # 将字典值转换为列表
    contacts = list(contact_dict.values())

    # 排序
    contacts = sorted(
        contacts,
        key=lambda x: (
            -x.get('last_timestamp', 0),
            -datetime.fromisoformat(x['last_time']).timestamp() if 'last_time' in x else 0
        )
    )

    return contacts


# -------- req_backend 处理器注册 --------

async def _req_backend_messages(params: dict):
    return await get_messages_core(params)


async def _req_backend_get_msg(params: dict):
    return await get_msg_core(params)


async def _req_backend_sync(params: dict):
    return await sync_messages_core(params)


async def _req_backend_contacts(params: dict):
    return await get_contacts_core()


frontend_manager.req_backend_handlers = {
    'contacts': _req_backend_contacts,
    'messages': _req_backend_messages,
    'get_msg': _req_backend_get_msg,
    'sync': _req_backend_sync,
}


# -------- 原 FastAPI 路由（保持接口不变，调用公共核心方法） --------

@app.api_route("/api/messages", methods=["GET", "POST"])
async def get_messages(params: dict = Depends(get_request_params)):
    result = await get_messages_core(params)
    return {"status": "success", "code": 200, "data": result}


@app.api_route("/api/get_msg", methods=["GET", "POST"])
async def get_msg(params: dict = Depends(get_request_params)):
    try:
        msg = await get_msg_core(params)
        return {"status": "success", "code": 200, "data": msg}
    except ValueError as e:
        return JSONResponse(
            status_code=404,
            content={
                "status": "fail",
                "code": 404,
                'error': str(e),
            }
        )


@app.api_route("/api/sync", methods=["GET", "POST"])
async def sync_messages(params: dict = Depends(get_request_params)):
    result = await sync_messages_core(params)
    return {"status": "success", "code": 200, "data": result}


@app.api_route("/api/messages/clear", methods=["POST"])
async def clear_messages():
    db.clear_messages()
    return {'success': True}


@app.api_route("/api/contacts", methods=["GET", "POST"])
async def get_contacts():
    result = await get_contacts_core()
    return {"status": "success", "code": 200, "data": result}


# 通用API请求处理函数
async def make_api_request(endpoint, original_params=None, request_params=None, request_data=None, custom_handler=None,
                           error_handler=None):
    """
    通用API请求处理方法

    :param endpoint: 要请求的API端点
    :param original_params: FastAPI请求参数
    :param request_params: 请求参数中需要提取的参数列表
    :param request_data: 要发送给API的额外数据
    :param custom_handler: 自定义处理函数，用于处理API返回数据
    :param error_handler: 自定义错误处理函数，格式为 func(exception, context) -> response
    :return: 响应
    """
    if original_params is None:
        original_params = {}
    try:
        # 1. 检查必需参数
        params = {}
        if request_params:
            for param in request_params:
                if not param in original_params:
                    error_msg = f"Missing required parameter: {param}"
                    if error_handler:
                        return error_handler(ValueError(error_msg), {
                            'stage': 'parameter_validation',
                            'param': param,
                            'endpoint': endpoint
                        })
                    return {
                        "status": "error",
                        "code": -1,
                        "error": error_msg
                    }
                value = original_params.get(param)
                params[param] = value

        # 2. 准备请求数据
        request_data = request_data or {}
        request_data.update(params)

        api_data = await onebot_manager.call_action(endpoint, request_data)

        # 3. 自定义处理或直接返回数据
        if custom_handler:
            return custom_handler(api_data, params)

        return {
            "status": "ok",
            "code": 200,
            "data": api_data
        }
    except Exception as e:
        stage = 'unexpected_error'
        error_info = f"An unexpected error occurred: {str(e) or 'Unknown error'}"
        if isinstance(e, ActionFailed):
            stage = 'action_failed_error'
            error_info = str(e)

        if error_handler:
            return error_handler(e, {
                'stage': stage,
                'endpoint': endpoint,
                'request_data': request_data,
            })
        return {
            "status": "error",
            "code": -1,
            "error": error_info
        }


@app.api_route("/api/get_friend_info", methods=["GET", "POST"])
async def get_friend_info(op=Depends(get_request_params)):
    def friend_handler(data, params):
        # 在好友列表中查找特定用户
        for friend in data:
            if str(friend.get('user_id')) == str(params['user_id']):
                return {
                    "status": "ok",
                    "code": 200,
                    "data": friend
                }
        return {
            "status": "error",
            "code": -1,
            "error": "User not found in friend list"
        }

    return await make_api_request(
        endpoint='get_friend_list',
        original_params=op,
        request_params=['user_id'],
        custom_handler=friend_handler
    )


def is_allowed_proxy_domain(target_url):
    try:
        parsed_url = urlparse(target_url)
        netloc = parsed_url.netloc

        # 移除端口部分（如 :443）
        domain = netloc.split(':')[0]  # 得到纯净域名

        # 完整匹配的域名列表
        allowed_full_domains = ["multimedia.nt.qq.com.cn", "gxh.vip.qq.com", 'gzc-download.ftn.qq.com']

        # 允许的域名后缀列表
        allowed_suffixes = ['.gtimg.cn', '.qpic.cn', '.ugcimg.cn', '.ftn.qq.com']

        # 检查条件：完整匹配 或 符合允许的后缀
        return (
                domain in allowed_full_domains or
                any(domain.endswith(suffix) for suffix in allowed_suffixes)
        )
    except Exception as e:
        # 如果解析失败（如非法URL），直接拒绝
        print(f"URL解析失败: {e}")
        return False


@app.api_route("/api/proxy_multimedia", methods=["GET", "POST"])
async def proxy(params: dict = Depends(get_request_params)):
    # 获取用户传入的完整 URL
    target_url = params.get("url")
    if not target_url:
        return JSONResponse(status_code=400, content="Missing 'url' parameter")

    # 如果输入没有协议头，自动添加 https:// 以便正确解析
    if not target_url.startswith(('http://', 'https://')):
        target_url = 'https://' + target_url

    if not is_allowed_proxy_domain(target_url):
        return JSONResponse(status_code=403, content="Forbidden: Invalid domain")

    try:
        # 发起代理请求（设置超时和 User-Agent）
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = requests.get(
            target_url,
            headers=headers,
            timeout=10,  # 10秒超时
            stream=True  # 流式传输大文件（如视频）
        )

        # 返回原始内容和响应头
        async def generate():
            for chunk in resp.iter_content(chunk_size=8192):
                yield chunk

        return StreamingResponse(
            generate(),
            media_type=resp.headers.get("content-type"),
            status_code=resp.status_code
        )

    except requests.exceptions.Timeout:
        return JSONResponse(status_code=504, content="Request timeout")
    except requests.exceptions.RequestException as e:
        return JSONResponse(status_code=502, content=f"Proxy error: {str(e)}")


def get_host_path(container_path):
    docker_napcat_qq_data_volume = config.DOCKER_NAPCAT_QQ_DATA_VOLUME
    if docker_napcat_qq_data_volume is not None:
        return container_path.replace(
            "/app/.config/QQ",
            docker_napcat_qq_data_volume,
            1
        )

    docker_napcat_name = config.DOCKER_NAPCAT_NAME
    if docker_napcat_name is None:
        return container_path

    client = docker.from_env()
    container = client.containers.get(docker_napcat_name)

    for mount in container.attrs['Mounts']:
        if container_path.startswith(mount['Destination']):
            # 替换容器路径为宿主机路径
            return container_path.replace(
                mount['Destination'],
                mount['Source'],
                1
            )
    return container_path  # 如果没有挂载，返回原路径


@app.api_route("/api/get_file_data", methods=["GET", "POST"])
async def get_file(params: dict = Depends(get_request_params)):
    type_val = params.get("type", 'file')
    # 读取 out_format 参数，默认 mp3
    out_format = params.get("out_format", "mp3")

    allowed_types = ['image', 'record', 'file']
    allowed_audio_formats = ["mp3", "wav"]

    # 校验 type 参数
    if type_val not in allowed_types:
        return JSONResponse(
            status_code=400,
            content="The value of the 'type' parameter is not allowed, only supported " + str(allowed_types)
        )

    # 仅 record 类型时校验音频格式
    if type_val == "record" and out_format not in allowed_audio_formats:
        return JSONResponse(
            status_code=400,
            content=f"The out_format only supports {allowed_audio_formats}"
        )

    req_data = {}
    if type_val == 'record':
        req_data['out_format'] = out_format

    def process_file(data, _):
        file_path = data.get('file')
        if type_val == 'record':
            base64_data = data.get('base64', '')
            if base64_data == '':
                return process_error("file not found")
            audio_data = base64.b64decode(base64_data)

            # 根据格式设置MIME和文件名
            if out_format == "wav":
                media_type = "audio/wav"
                filename = "audio.wav"
            else:  # mp3
                media_type = "audio/mpeg"
                filename = "audio.mp3"

            return Response(
                content=audio_data,
                media_type=media_type,
                headers={
                    'Content-Disposition': f'inline; filename={filename}'
                }
            )
        else:
            if file_path == '':
                return process_error("file not found")
            real_path = get_host_path(file_path)
            return FileResponse(real_path, media_type='application/octet-stream')

    def process_error(e, context=None):
        if context is None:
            context = dict()
        status_code = 500 if context.get('stage', '') == 'unexpected_error' else 404
        return JSONResponse(
            status_code=status_code,
            content={
                "status": "error",
                "code": -1,
                "error": f"An unexpected error occurred: {str(e) or 'Unknown error'}"
            }
        )

    return await make_api_request(
        endpoint='get_' + type_val,
        original_params=params,
        request_params=['file_id'],
        request_data=req_data,
        custom_handler=process_file,
        error_handler=process_error
    )


@app.api_route("/api/get_stream_file_data", methods=["GET", "POST"])
async def get_stream_file(params: dict = Depends(get_request_params)):
    file_id = params.get('file') or params.get('file_id')
    if not file_id:
        # 处理错误，如果没有 file_id
        return {"error": "file_id is required"}

    # 获取流式数据源
    stream = onebot_manager.call_stream_action("download_file_stream", {"file_id": file_id})

    # 先异步获取第一个 chunk 以提取文件信息
    file_name = "unknown_file"
    file_size = 0
    media_type = "application/octet-stream"  # 默认 MIME 类型，可以根据 file_name 扩展名推断
    try:
        first_chunk = await stream.__anext__()  # 获取第一个 chunk
        data = first_chunk.get("data", {})
        if data.get("type") == "stream" and data.get("data_type") == "file_info":
            file_name = data.get("file_name", file_name)
            file_size = data.get("file_size", file_size)
            # 根据文件扩展名猜测 MIME 类型
            guessed_type = mimetypes.guess_type(file_name)[0]
            if guessed_type:
                media_type = guessed_type
    except StopAsyncIteration:
        return {"error": "No data received"}

    # 创建异步生成器来流式返回文件数据
    async def file_generator():
        # 第一个 chunk 已处理，跳过，继续处理后续 chunks
        async for chunk in stream:
            chunk_data = chunk.get("data", {})
            if chunk_data.get("type") == "stream" and chunk_data.get("data_type") == "file_chunk":
                base64_data = chunk_data.get("data", "")
                try:
                    binary_data = base64.b64decode(base64_data)
                    yield binary_data
                except Exception as e:
                    # 处理解码错误，记录日志或结束
                    print(f"Error decoding chunk: {e}")
                    break
            elif chunk_data.get("type") == "response" and chunk_data.get("data_type") == "file_complete":
                break  # 文件传输完成，结束流

    # 使用 quote 对文件名进行 URL 编码
    encoded_filename = quote(file_name)
    # 设置响应头
    headers = {
        "Content-Disposition": f"filename=\"{file_name.encode('ascii', 'ignore').decode('ascii')}\"; filename*=UTF-8''{encoded_filename}",
        "Content-Length": str(file_size) if file_size > 0 else None,  # 如果知道大小，可设置，否则浏览器可能无法显示进度（但仍能下载）
    }
    # 移除 None 值
    headers = {k: v for k, v in headers.items() if v is not None}

    return StreamingResponse(
        content=file_generator(),
        media_type=media_type,
        headers=headers
    )


@app.api_route("/api/send_message", methods=["GET", "POST"])
async def send_message(params: dict = Depends(get_request_params)):
    try:
        # 从参数中获取数据
        group_id = parse_int(params.get("group_id", -1))
        user_id = parse_int(params.get("user_id", -1))
        message = params.get("message")

        # 公共验证逻辑
        if message is None:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "message参数缺失"}
            )

        # 尝试解析message为JSON（如果是字符串形式）
        try:
            if isinstance(message, str):
                message = json.loads(message)
        except json.JSONDecodeError:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "message参数不是有效的JSON"}
            )

        # 验证user_id或group_id
        if group_id == -1 and user_id == -1:
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "必须提供user_id或group_id"}
            )

        if message and isinstance(message, list) and len(message) > 0:
            poke_data = message[0].get("data")
            if message[0].get("type") == 'poke' and poke_data:
                poke_user = poke_data.get("user_id", -1)
                poke_group = poke_data.get("group_id", -1)
                poke_target = poke_data.get("target_id", -1)
                req_data = {
                    'user_id': poke_user or poke_target,
                    'target_id': poke_target or poke_user,
                }
                if poke_group != -1:
                    req_data['group_id'] = poke_group

                if poke_user != -1:
                    return await make_api_request(
                        endpoint="send_poke",
                        request_data=req_data,
                    )

        # 准备请求数据
        req_data = {"message": message}
        if group_id == -1:
            req_data['user_id'] = user_id
        else:
            req_data['group_id'] = group_id

        endpoint = f"send_{'private' if group_id == -1 else 'group'}_msg"

        # 调用API
        return await make_api_request(
            endpoint=endpoint,
            request_data=req_data,
        )

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(e)}
        )


@app.api_route("/api/get_essence_msg_list", methods=["GET", "POST"])
async def get_essence_msg_list(params: dict = Depends(get_request_params)):
    only_real_seq = parse_bool(params.get('only_real_seq', False))

    def process_data(data, _):
        return {
            "status": "ok",
            "code": 200,
            "data": [item.get('msg_seq') for item in data] if only_real_seq else data
        }

    return await make_api_request(
        endpoint='get_essence_msg_list',
        request_params=['group_id'],
        original_params=params,
        custom_handler=process_data
    )


# ===================== 简易内存缓存（支持滑动过期） =====================
class TTLCache:
    def __init__(self, ttl: int = 300):
        self._store: Dict[str, Dict] = {}
        self.ttl = ttl
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            entry = self._store.get(key)
            if entry and time.time() < entry["expire"]:
                # 命中即续期（滑动过期）
                entry["expire"] = time.time() + self.ttl
                return entry["value"]
            # 过期或不存在则清理
            if entry:
                del self._store[key]
            return None

    async def set(self, key: str, value: str) -> None:
        async with self._lock:
            self._store[key] = {
                "value": value,
                "expire": time.time() + self.ttl
            }


group_files_url_cache = TTLCache(ttl=600)  # 缓存 10 分钟，按需调整


def get_content_disposition(filename: str, inline: bool = True) -> str:
    """
    兼容中文文件名，遵循 RFC 5987 标准，解决 latin-1 编码报错
    inline=True 在线预览，inline=False 下载
    """
    # 基础 ascii 备用名（防止老浏览器兼容）
    ascii_name = urllib.parse.quote(filename, safe="")
    # RFC5987 编码文件名
    encoded_name = urllib.parse.quote(filename, encoding="utf-8")
    if inline:
        return f'inline; filename="{ascii_name}"; filename*=utf-8\'\'{encoded_name}'
    else:
        return f'attachment; filename="{ascii_name}"; filename*=utf-8\'\'{encoded_name}'


# ===================== 简易内存缓存（支持滑动过期） =====================
class TTLCache:
    def __init__(self, ttl: int = 300):
        self._store: Dict[str, Dict] = {}
        self.ttl = ttl
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            entry = self._store.get(key)
            # 修复：time.time() 加括号调用获取时间戳
            if entry and time.time() < entry["expire"]:
                # 命中即续期（滑动过期）
                entry["expire"] = time.time() + self.ttl
                return entry["value"]
            # 过期或不存在则清理
            if entry:
                del self._store[key]
            return None

    async def set(self, key: str, value: str) -> None:
        async with self._lock:
            self._store[key] = {
                "value": value,
                "expire": time.time() + self.ttl
            }


group_files_url_cache = TTLCache(ttl=600)  # 缓存 10 分钟，按需调整


def get_content_disposition(filename: str, inline: bool = True) -> str:
    """
    兼容中文文件名，遵循 RFC 5987 标准，解决 latin-1 编码报错
    inline=True 在线预览，inline=False 下载
    """
    # 基础 ascii 备用名（防止老浏览器兼容）
    ascii_name = urllib.parse.quote(filename, safe="")
    # RFC5987 编码文件名
    encoded_name = urllib.parse.quote(filename, encoding="utf-8")
    if inline:
        return f'inline; filename="{ascii_name}"; filename*=utf-8\'\'{encoded_name}'
    else:
        return f'attachment; filename="{ascii_name}"; filename*=utf-8\'\'{encoded_name}'


# ===================== 核心流式代理工具（移除冗余ProxyResult + 修复版） =====================
async def proxy_target_file(target_url: str, range_header: Optional[str] = None):
    """
    流式代理远程文件，正确透传 Range 响应头（Content-Range, Content-Length 等）
    移除多余 ProxyResult 封装，直接返回原生参数
    """
    headers = {}
    if range_header:
        headers["Range"] = range_header

    timeout = aiohttp.ClientTimeout(total=300)
    session = aiohttp.ClientSession(timeout=timeout)
    # 手动管理 session，以便在生成器中关闭
    resp = await session.get(target_url, headers=headers)
    if resp.status >= 400:
        await session.close()
        raise HTTPException(status_code=resp.status, detail="远程文件访问失败")

    # 收集需要透传的关键响应头，剔除Content-Type防止覆盖本地media_type
    proxy_headers = {}
    pass_keys = ("Content-Range", "Content-Length", "Accept-Ranges", "ETag")
    for key in pass_keys:
        val = resp.headers.get(key)
        if val:
            proxy_headers[key] = val

    async def chunk_generator():
        try:
            async for chunk in resp.content.iter_chunked(64 * 1024):
                yield chunk
        finally:
            resp.release()
            await session.close()

    # 直接返回原生参数，无需封装类
    return resp.status, proxy_headers, chunk_generator()


# ===================== 接口实现 =====================
@app.api_route("/api/proxy_group_file", methods=["GET", "POST"])
async def proxy_group_file(
        request_params: dict = Depends(get_request_params),
        range_header: Optional[str] = Header(None, alias="Range")  # 正确捕获请求头 Range
):
    params = request_params  # 你的 get_request_params 应能解析 GET/POST 参数
    target_url = params.get("url")
    target_name = params.get("name")
    file_id = params.get("file_id")
    group_id = params.get("group_id")

    # 分支1：直接传入代理URL
    if target_url and is_allowed_proxy_domain(target_url):
        pass
    # 分支2：通过群ID+文件ID拉取真实文件链接（带缓存）
    elif file_id and group_id:
        cache_key = f"{group_id}:{file_id}"
        cached_url = await group_files_url_cache.get(cache_key)
        if cached_url:
            target_url = cached_url
        else:
            result = await make_api_request(
                endpoint='get_group_file_url',
                request_params=['group_id', 'file_id'],
                original_params=params,
            )
            if result.get("status") == 'ok':
                target_url = result.get('data', {}).get("url")
                if target_url:
                    # 缓存原始链接
                    await group_files_url_cache.set(cache_key, target_url)
            else:
                return result
    # 无有效文件链接
    if not target_url:
        return {"status": "error", "message": "没有有效文件", "code": 400}

    # ========== 精准识别音视频MIME ==========
    media_type = "application/octet-stream"
    if target_name:
        mime_type, _ = mimetypes.guess_type(target_name)
        if mime_type:
            media_type = mime_type

    # 2. 文件名处理
    if not target_name:
        parsed = urllib.parse.urlparse(target_url)
        filename = parsed.path.split("/")[-1] or "file"
        target_name = urllib.parse.unquote(filename)

    # 3. 流式代理（含 Range 支持）
    status_code, proxy_headers, body_iterator = await proxy_target_file(target_url, range_header)

    # 4. 拼接响应头
    response_headers = {
        "Content-Disposition": get_content_disposition(target_name, inline=True),
        "Accept-Ranges": "bytes",
    }
    # 合并远程返回的 Range 相关头部（不含Content-Type，避免覆盖）
    response_headers.update(proxy_headers)

    return StreamingResponse(
        content=body_iterator,
        status_code=status_code,
        media_type=media_type,
        headers=response_headers,
    )


# 托管dist静态文件
app.mount("/", StaticFiles(directory="viewer/dist", html=True), name="frontend")


# History路由兜底
@app.get("/{path:path}")
async def catch_all():
    return FileResponse("dist/index.html")


def run_fastapi():
    print(f"Starting server at http://{config.WEB_HOST}:{config.WEB_PORT}")
    uvicorn.run(app, host=config.WEB_HOST, port=config.WEB_PORT, log_level="info")


if __name__ == '__main__':
    # 启动FastAPI服务
    run_fastapi()
