from fastapi import WebSocket
from typing import Set
import asyncio


async def process_message(websocket: WebSocket, message: dict):
    """处理来自前端的消息"""
    print("收到消息:", message)
    print(websocket)


async def send_personal_message(message: dict, websocket: WebSocket):
    """向指定连接发送消息"""
    await websocket.send_json(message)


class FrontendConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        """处理新的WebSocket连接"""
        await websocket.accept()
        self.active_connections.add(websocket)
        print(f"新前端连接，当前连接数: {len(self.active_connections)}")

        try:
            while True:
                data = await websocket.receive_json()
                await process_message(websocket, data)
        except Exception as e:
            print(f"连接异常: {e}")
        finally:
            self.disconnect(websocket)

    def disconnect(self, websocket: WebSocket):
        """处理连接断开"""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"前端断开连接，剩余连接数: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """广播消息给所有连接的前端"""
        if len(self.active_connections) > 0:
            await asyncio.gather(
                *[connection.send_json(message) for connection in self.active_connections]
            )
