import asyncio
import inspect
import json
import logging
import re
import traceback
from typing import Dict, Set, Optional, Any, Callable, Union, AsyncGenerator
from uuid import uuid4
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger("onebot")


def extract_token(auth_header: Optional[str]) -> Optional[str]:
    """从 Authorization 头部提取 token"""
    if not auth_header:
        return None

    match = re.compile(r'^(?:token|bearer)\s+(\S+)$', re.IGNORECASE).match(auth_header.strip())
    return match.group(1) if match else None


# noinspection PyBroadException
class OneBotConnectionManager:
    def __init__(self, token: Optional[str] = None):
        self.token = token
        self.active_connections: Dict[str, WebSocket] = {}  # self_id -> WebSocket
        self.connection_states: Dict[WebSocket, Dict[str, Any]] = {}  # 连接状态存储
        self.pending_actions: Dict[str, Union[asyncio.Future, asyncio.Queue]] = {}
        self.message_handlers: Set[Callable[[Dict[str, Any]], Any]] = set()

    async def connect(self, websocket: WebSocket):
        authorization = websocket.headers.get('Authorization', None)

        if not await self.authenticate(websocket, authorization):
            return

        await websocket.accept()

        try:
            while True:
                message = await websocket.receive_json()
                await self.handle_message(websocket, message)
        except WebSocketDisconnect:
            await self.disconnect(websocket)
        except Exception as e:
            print(f"WebSocket error: {e}")
            await self.disconnect(websocket)

    async def authenticate(self, websocket: WebSocket, auth_header: Optional[str] = None) -> bool:
        """验证连接Token"""
        if not self.token:
            return True

        token = extract_token(auth_header)
        if token != self.token:
            # print('Invalid token:', token)
            await websocket.close(code=1008, reason="Invalid token")
            return False
        return True

    async def register_connection(self, websocket: WebSocket, self_id: str) -> bool:
        """注册已验证的连接"""
        if self_id in self.active_connections:
            await websocket.close(code=1008, reason=f"Duplicate self_id: {self_id}")
            return False

        self.active_connections[self_id] = websocket
        self.connection_states[websocket] = {"self_id": self_id, "authenticated": True}
        logger.info(f"OneBot connected: {self_id}")
        return True

    async def disconnect(self, websocket: WebSocket) -> None:
        """断开连接并清理资源"""
        state = self.connection_states.get(websocket)
        if state and "self_id" in state:
            self_id = state["self_id"]
            self.active_connections.pop(self_id, None)
            logger.info(f"OneBot disconnected: {self_id}")
        self.connection_states.pop(websocket, None)

        try:
            await websocket.close()
        except:
            pass

    def get_first_self_id(self):
        return next(iter(self.active_connections.keys()))

    async def call_action(self, action, params, self_id=None, timeout: float = 30.0):
        if not self.active_connections:
            raise Exception("No active OneBot connections")

        if self_id is None:
            if len(self.active_connections) == 1:
                self_id = next(iter(self.active_connections.keys()))
            else:
                raise Exception("self_id required when multiple bots connected")

        result = await self.send_action(
            self_id=self_id,
            action=action,
            params=params,
            timeout=timeout
        )

        if result.get('status') == 'ok':
            return result.get('data')

        return result

    def cancel_action(self, echo: str):
        """取消一个正在等待响应的 action"""
        future = self.pending_actions.pop(echo, None)
        if future and not future.done():
            future.cancel()
            print(f"OneBot action cancelled (echo: {echo})")

    # noinspection PyAsyncCall
    async def send_action(self, self_id: str, action: str, params: Dict[str, Any], timeout: float = 30.0) -> Any:
        """发送API动作并等待响应"""
        if self_id not in self.active_connections:
            raise ConnectionError(f"No active connection for self_id: {self_id}")

        echo = str(uuid4())
        future = asyncio.get_event_loop().create_future()
        self.pending_actions[echo] = future

        try:
            await self.active_connections[self_id].send_json({
                "action": action,
                "params": params,
                "echo": echo
            })

            result_data = await asyncio.wait_for(future, timeout)

            return result_data
        except asyncio.TimeoutError:
            self.pending_actions.pop(echo, None)
            raise TimeoutError("Action timed out")
        except asyncio.CancelledError:
            self.pending_actions.pop(echo, None)
            raise
        except ActionFailed as e:
            self.pending_actions.pop(echo, None)
            raise e
        except Exception as e:
            traceback.print_exc()
            self.pending_actions.pop(echo, None)
            raise e

    async def call_stream_action(self, action: str, params: Dict[str, Any],
                                 self_id: Optional[str] = None,
                                 timeout: float = 30.0) -> AsyncGenerator[Dict[str, Any], None]:
        """发送流式API动作并异步生成响应"""
        if not self.active_connections:
            raise Exception("No active OneBot connections")

        if self_id is None:
            if len(self.active_connections) == 1:
                self_id = next(iter(self.active_connections.keys()))
            else:
                raise Exception("self_id required when multiple bots connected")

        echo = str(uuid4())
        queue = asyncio.Queue()
        self.pending_actions[echo] = queue

        try:
            await self.active_connections[self_id].send_json({
                "action": action,
                "params": params,
                "echo": echo
            })

            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout)
                    if data.get("data", {}).get("type") == "response":
                        break  # 遇到最终响应时结束
                    yield data
                    if data.get("data", {}).get("type") == "error":
                        raise Exception(f"Stream action failed: {data.get('data', {})}")
                except asyncio.TimeoutError:
                    raise TimeoutError("Stream action timed out")
                except Exception as e:
                    raise e

        finally:
            # noinspection PyAsyncCall
            self.pending_actions.pop(echo, None)

    async def handle_message(self, websocket: WebSocket, message: dict) -> None:
        """处理接收到的消息"""
        try:
            data = message

            # 处理连接生命周期事件
            if data.get("post_type") == "meta_event" and data.get("meta_event_type") == "lifecycle":
                state = self.connection_states.get(websocket, {})
                if not state.get("authenticated"):
                    # 从WebSocket headers中获取Authorization
                    auth_header = websocket.headers.get("Authorization")
                    if not await self.authenticate(websocket, auth_header):
                        return
                    if not await self.register_connection(websocket, str(data["self_id"])):
                        return

            # 处理API响应
            if "echo" in data and isinstance(data["echo"], str):
                echo = data["echo"]
                if echo in self.pending_actions:
                    # 处理普通动作响应
                    if echo in self.pending_actions and isinstance(self.pending_actions[echo], asyncio.Future):
                        future = self.pending_actions[echo]
                        if "status" in data and data["status"] == "failed":
                            future.set_exception(ActionFailed(data))
                        else:
                            future.set_result(data)
                        return

                    # 处理流式动作响应
                    if echo in self.pending_actions and isinstance(self.pending_actions[echo], asyncio.Queue):
                        queue = self.pending_actions[echo]
                        await queue.put(data)
                        return

            # 处理事件推送
            if "post_type" in data:
                for handler in list(self.message_handlers):
                    try:
                        if inspect.iscoroutinefunction(handler):
                            await handler(data)
                        else:
                            handler(data)
                    except Exception as e:
                        logger.error(f"Error in message handler: {e}", exc_info=True)

        except json.JSONDecodeError:
            logger.error(f"Invalid JSON message: {message}")

    def add_message_handler(self, handler: Callable[[Dict[str, Any]], Any]) -> Callable[[], None]:
        """添加消息处理器"""
        self.message_handlers.add(handler)
        return lambda: self.message_handlers.discard(handler)

    async def broadcast_event(self, event: Dict[str, Any]) -> None:
        """向所有连接的客户端广播事件"""
        for ws in list(self.active_connections.values()):
            try:
                await ws.send_json(event)
            except:
                await self.disconnect(ws)


class ActionFailed(Exception):
    def __init__(self, data: Dict[str, Any]):
        self.data = data
        super().__init__(f"Action failed: {data.get('message', 'Unknown error')}")
