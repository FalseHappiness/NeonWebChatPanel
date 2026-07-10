from fastapi import WebSocket
from typing import Set, Optional
import asyncio
import uuid


class FrontendConnectionManager:
    def __init__(self, onebot_manager=None):
        self.active_connections: Set[WebSocket] = set()
        self.onebot_manager = onebot_manager

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
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"前端断开连接，剩余连接数: {len(self.active_connections)}")

    async def process_message(self, websocket: WebSocket, message: dict):
        """处理来自前端的消息"""
        msg_type = message.get("type", "")

        if msg_type == "send_action":
            await self.handle_send_action(websocket, message)
        else:
            print("收到消息:", message)
            print(websocket)

    async def handle_send_action(self, websocket: WebSocket, message: dict):
        """处理前端发来的 send_action 请求，转发给 OneBot 并返回结果"""
        if not self.onebot_manager:
            await websocket.send_json({
                "type": "send_action_response",
                "echo": message.get("echo"),
                "status": "failed",
                "message": "OneBot manager not available"
            })
            return

        action = message.get("action", "")
        params = message.get("params", {})
        echo = message.get("echo", str(uuid.uuid4()))

        print(f"前端请求 action: {action}, params: {params}")

        try:
            result = await self.onebot_manager.call_action(action, params)
            print(f"action 响应: {action} -> {result}")

            response = {
                "type": "send_action_response",
                "echo": echo,
                "status": "ok",
                "data": result
            }
        except Exception as e:
            print(f"action 失败: {action} -> {e}")
            response = {
                "type": "send_action_response",
                "echo": echo,
                "status": "failed",
                "message": str(e)
            }

        await websocket.send_json(response)

    async def broadcast(self, message: dict):
        """广播消息给所有连接的前端"""
        if len(self.active_connections) > 0:
            await asyncio.gather(
                *[connection.send_json(message) for connection in self.active_connections]
            )
