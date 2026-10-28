from fastapi import Request, WebSocket

from app.container import Container


def get_container(request: Request) -> Container:
    return request.app.state.container


def ws_container(websocket: WebSocket) -> Container:
    return websocket.app.state.container
