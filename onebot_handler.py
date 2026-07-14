from pprint import pprint

from typing import Dict, Optional
import json
from datetime import datetime, timezone

from db import Database
from config import Config
from frontend_manager import FrontendConnectionManager
from onebot_manager import OneBotConnectionManager


def convert_event_to_message_data(event):
    """
    将 event（对象或字典）转换为统一的消息数据格式

    Args:
        event: 可以是字典或对象，包含消息事件的数据

    Returns:
        dict: 标准化后的消息数据
    """
    # 如果 event 是对象，先转为字典（只提取公有属性）
    if not isinstance(event, dict):
        event_dict = {
            key: getattr(event, key, None)
            for key in dir(event)
            if not key.startswith('_') and not callable(getattr(event, key))
        }
    else:
        event_dict = event.copy()

    # 处理 real_seq（尝试转为 int，失败则设为 None）
    try:
        real_seq = int(event_dict.get('real_seq') or event_dict.get('message_seq'))
    except (ValueError, TypeError, AttributeError):
        real_seq = None

    # 获取 user_id（优先从 event.user_id，其次从 event.sender.user_id）
    user_id = event_dict.get('user_id')
    if user_id is None and isinstance(event_dict.get('sender'), dict):
        user_id = event_dict['sender'].get('user_id')
    elif user_id is None and hasattr(event, 'sender'):
        user_id = getattr(event.sender, 'user_id', None)

    post_type = event_dict.get('post_type')
    message_type = event_dict.get('message_type')
    target_id = event_dict.get('target_id')
    group_id = event_dict.get('group_id')

    if post_type in ['message', 'message_sent']:
        if message_type == 'group':
            if post_type == 'message_sent':
                target_id = target_id or group_id
        elif message_type == 'private':
            target_id = target_id or user_id

    # 构造标准化的消息数据
    message_data = {
        'message_id': event_dict.get('message_id'),
        'real_seq': real_seq,
        'time': event_dict.get('time', int(datetime.now().timestamp())),
        'self_id': event_dict.get('self_id'),
        'sender_id': event_dict.get('sender_id'),
        'post_type': post_type,
        'notice_type': event_dict.get('notice_type'),
        'message_type': message_type,
        'sub_type': event_dict.get('sub_type'),
        'user_id': user_id,
        'group_id': group_id,
        'operator_id': event_dict.get('operator_id'),
        'target_id': target_id,
        'event': json.dumps(event_dict, ensure_ascii=False),  # 原始 event 数据转为 JSON 字符串
        'created_at': datetime.now(timezone.utc).isoformat(),
    }

    return message_data


def format_recent_contacts(contacts):
    formatted_contacts = []
    for contact in contacts:
        event = contact.get('lastestMsg')
        is_temp = False
        if event:
            if event.get('message_type') == 'private':
                event['target_id'] = event.get('peerUin')
            is_temp = 'temp_source' in event
        formatted_contact = {
            'temp': is_temp,
            'type': 'private' if contact.get('chatType') == 1 or is_temp else 'group',
            'real_name': contact.get('peerName'),
            'remark': contact.get('remark'),
            'last_time': datetime.now(timezone.utc).isoformat(),
            'contact_id': int(contact.get('peerUin')),
            'has_message': False
        }
        if event:
            formatted_contact['last_timestamp'] = event['time']
            formatted_contact['latest_msg'] = json.dumps(event)
            formatted_contact['has_message'] = not not event.get('message')
        formatted_contact['name'] = formatted_contact['remark'] or formatted_contact['real_name']
        formatted_contacts.append(formatted_contact)
    return formatted_contacts


class OneBotHandler:
    def __init__(self,
                 db: Database,
                 config: Config,
                 onebot_ws: OneBotConnectionManager,
                 frontend_ws: FrontendConnectionManager
                 ):
        self.db = db
        self.config = config
        self.frontend_ws = frontend_ws
        self.onebot_ws = onebot_ws

        # 注册事件处理器
        onebot_ws.add_message_handler(self.handle_message)

    async def handle_message(self, data):
        processed = await self.process_message(data)
        if processed:
            await self._emit_to_frontend(processed)

    async def _emit_to_frontend(self, message_data: Dict):  # 发送到前端
        """通过WebSocket发送消息"""
        try:
            await self.frontend_ws.broadcast(message_data)
        except Exception as e:
            print(f"通过WebSocket发送消息失败: {type(e).__name__}: {e}")

    async def process_message(self, event: dict) -> Optional[Dict]:
        """处理并存储消息"""
        try:
            # 检查消息类型是否是我们关心的
            # if event.post_type not in ['message', 'notice', 'request']:
            #     return None
            post_type = event.get('post_type')
            if post_type == 'meta_event':
                return None

            print("Received msg:")
            pprint(event)

            # # 检查是否是我们配置中允许的群聊或私聊
            # if post_type == 'message':
            #     message_type = event.get('message_type')
            #     if message_type == 'group':
            #         if self.config.ALLOWED_GROUPS and event.get('group_id') not in self.config.ALLOWED_GROUPS:
            #             return None
            #     elif message_type == 'private':
            #         if self.config.ALLOWED_USERS and event.get('user_id') not in self.config.ALLOWED_USERS:
            #             return None

            message_data = convert_event_to_message_data(event)

            # 存储到数据库
            message_id = self.db.save_message(message_data)
            message_data['id'] = message_id

            # 如果是撤回事件，处理原始消息
            if post_type == 'notice' and event.get('notice_type') in ('group_recall', 'friend_recall'):
                self.db.process_recall_event(message_data)

            return message_data

        except Exception as e:
            print(f"Error processing message: {e}")
            return None

    async def get_max_real_seq(self, id, type):
        api_data = await self.get_messages(id, type, 1)
        if api_data:
            first_message = api_data[0]
            real_seq = first_message.get("real_seq")
            if real_seq is not None:
                return int(real_seq)
        return -1

    async def get_messages(self, id, type, count=20, direction=None, message_id=0):
        params = {
            "count": count,
            "message_seq": message_id,
            "message_id": message_id,  # SnowLuma
            ("group_id" if type == "group" else "user_id"): id
        }
        if direction is not None:
            params['reverse_order'] = direction == 'prev'
        action = "get_group_msg_history" if type == "group" else "get_friend_msg_history"

        # print(action, params)
        api_data = await self.onebot_ws.call_action(action, params)
        if not api_data:
            return []

        messages = api_data.get("messages", [])

        # 检查是否已经获取了足够数量的消息
        if len(messages) >= count:
            return messages[:count]

        # 检查是否已经获取了所有消息（只返回1条且与传入的message_id相同）
        if len(messages) == 0 or (len(messages) == 1 and messages[0]["message_id"] == message_id):
            return messages

        # 计算还需要获取的消息数量
        remaining = count - len(messages)

        # 确定下一次请求的message_id
        if direction == 'prev':
            next_message_id = messages[0]["message_id"]  # 取最早的一条
        else:
            next_message_id = messages[-1]["message_id"]  # 取最新的一条

        # 递归获取剩余的消息（remaining + 1 是为了避免重复）
        remaining_messages = await self.get_messages(
            id, type, remaining + 1, direction, next_message_id
        )

        # 合并消息，并确保没有重复
        if direction == 'prev':
            # 如果是向前获取，remaining_messages 的最后一条可能与当前 messages 的第一条重复
            combined = remaining_messages[:-1] + messages
        else:
            # 如果是向后获取，remaining_messages 的第一条可能与当前 messages 的最后一条重复
            combined = messages + remaining_messages[1:]

        combined = combined[:count]  # 确保最终返回的数量不超过 count

        if type == 'private':
            for msg in combined:
                msg['target_id'] = id

        return combined

    async def get_recent_contacts(self):
        contacts = await self.onebot_ws.call_action('get_recent_contact', {'count': 114514})
        return format_recent_contacts(contacts)
