import traceback

from fastapi import WebSocket
from typing import Set, Optional, Dict, Tuple
import asyncio
import uuid


class FrontendConnectionManager:
    def __init__(self, onebot_manager=None, req_backend_handlers: dict = None):
        self.active_connections: Set[WebSocket] = set()
        self.onebot_manager = onebot_manager
        # 存储正在执行的 action 任务 (echo -> (websocket, Task))
        self.pending_action_tasks: Dict[str, Tuple[WebSocket, asyncio.Task]] = {}
        # req_backend 处理器映射: endpoint -> handler_function(params) -> dict
        self.req_backend_handlers = req_backend_handlers or {}

    async def connect(self, websocket: WebSocket):
        """处理新的WebSocket连接"""
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"新前端连接，当前连接数: {len(self.active_connections)}")

        try:
            while True:
                data = await websocket.receive_json()
                await self.process_message(websocket, data)
        except Exception as e:
            print(f"连接异常: {e}")
        finally:
            self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket):
        """处理连接断开"""
        # 取消该连接相关的所有 pending action 任务
        for echo, (ws, task) in list(self.pending_action_tasks.items()):
            if ws is websocket and not task.done():
                task.cancel()
                self.pending_action_tasks.pop(echo, None)

        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"前端断开连接，剩余连接数: {len(self.active_connections)}")

    async def process_message(self, websocket: WebSocket, message: dict):
        """处理来自前端的消息"""
        msg_type = message.get("type", "")

        if msg_type == "send_action":
            echo = message.get("echo", str(uuid.uuid4()))
            # 将 action 作为后台任务运行，以便可以取消
            task = asyncio.create_task(
                self.handle_send_action(websocket, message, echo)
            )
            self.pending_action_tasks[echo] = (websocket, task)
            task.add_done_callback(lambda _: self.pending_action_tasks.pop(echo, None))
        elif msg_type == "cancel_action":
            await self.handle_cancel_action(websocket, message)
        elif msg_type == "req_backend":
            echo = message.get("echo", str(uuid.uuid4()))
            task = asyncio.create_task(
                self.handle_req_backend(websocket, message, echo)
            )
            self.pending_action_tasks[echo] = (websocket, task)
            task.add_done_callback(lambda _: self.pending_action_tasks.pop(echo, None))
        else:
            print("收到消息:", message)
            print(websocket)

    async def handle_cancel_action(self, websocket: WebSocket, message: dict):
        """处理前端发来的 cancel_action 请求，取消正在执行的 action"""
        echo = message.get("echo", "")
        if not echo:
            return

        entry = self.pending_action_tasks.pop(echo, None)
        if entry:
            ws, task = entry
            if not task.done():
                task.cancel()
                print(f"取消 action (echo: {echo})")

    async def handle_send_action(self, websocket: WebSocket, message: dict, echo: str):
        """处理前端发来的 send_action 请求，转发给 OneBot 并返回结果"""
        try:
            if not self.onebot_manager:
                await websocket.send_json({
                    "type": "send_action_response",
                    "echo": echo,
                    "status": "error",
                    "message": "OneBot manager not available"
                })
                return

            action = message.get("action", "")
            params = message.get("params", {})

            # print(f"前端请求 action: {action}, params: {params}")

            try:
                result = await self.onebot_manager.call_action(action, params)
                # print(f"action 响应: {action} -> {result}")

                response = {
                    "type": "send_action_response",
                    "echo": echo,
                    "status": "ok",
                    "data": result
                }
            except asyncio.CancelledError:
                # action 被取消，发送取消响应
                print(f"action 已取消: {action} (echo: {echo})")
                response = {
                    "type": "send_action_response",
                    "echo": echo,
                    "status": "cancelled",
                    "message": "Action cancelled by user"
                }
            except Exception as e:
                print(f"action 失败: {action} -> {e}")
                response = {
                    "type": "send_action_response",
                    "echo": echo,
                    "status": "error",
                    "message": str(e)
                }

            await websocket.send_json(response)
        except asyncio.CancelledError:
            # 任务被取消时的清理
            raise

    async def handle_req_backend(self, websocket: WebSocket, message: dict, echo: str):
        """处理前端发来的 req_backend 请求，调用本地注册的处理器并返回结果"""
        try:
            endpoint = message.get("endpoint", "")
            params = message.get("params", {})

            if endpoint not in self.req_backend_handlers:
                await websocket.send_json({
                    "type": "req_backend_response",
                    "echo": echo,
                    "status": "error",
                    "message": f"Unknown endpoint: {endpoint}"
                })
                return

            handler = self.req_backend_handlers[endpoint]
            try:
                result = await handler(params)
                response = {
                    "type": "req_backend_response",
                    "echo": echo,
                    "status": "ok",
                    "data": result
                }
            except asyncio.CancelledError:
                print(f"req_backend 已取消: {endpoint} (echo: {echo})")
                response = {
                    "type": "req_backend_response",
                    "echo": echo,
                    "status": "cancelled",
                    "message": "Request cancelled by user"
                }
            except Exception as e:
                print(f"req_backend 失败: {endpoint} -> {e}")
                traceback.print_exc()
                response = {
                    "type": "req_backend_response",
                    "echo": echo,
                    "status": "error",
                    "message": str(e)
                }

            await websocket.send_json(response)
        except asyncio.CancelledError:
            raise

    async def broadcast(self, message: dict):
        """广播消息给所有连接的前端"""
        if len(self.active_connections) > 0:
            await asyncio.gather(
                *[connection.send_json(message) for connection in self.active_connections]
            )