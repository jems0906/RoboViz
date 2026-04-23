import argparse
import asyncio
import base64
import io
import json
import math
import random
import signal
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from itertools import count
from typing import Any

from PIL import Image, ImageDraw
import websockets


SENSOR_INTERVALS = {
    'camera': 0.4,
    'lidar': 0.15,
    'imu': 0.05,
    'odometry': 0.1,
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RobotAgent:
    robot_id: str
    name: str
    location: str
    endpoint: str
    max_queue_size: int = 5000
    batch_flush_interval: float = 0.2
    current_recording_id: str | None = None
    running: bool = True
    send_queue: deque[dict[str, Any]] = field(default_factory=deque)
    sequences: dict[str, count] = field(default_factory=lambda: {
        'camera': count(),
        'lidar': count(),
        'imu': count(),
        'odometry': count(),
    })
    pose_x: float = 0.0
    pose_y: float = 0.0
    heading: float = 0.0

    async def run(self):
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.stop)
            except NotImplementedError:
                pass

        producer_tasks = [
            asyncio.create_task(self.sensor_loop(sensor_type), name=f'{sensor_type}-producer')
            for sensor_type in SENSOR_INTERVALS
        ]

        try:
            await self.connection_loop()
        finally:
            self.running = False
            for task in producer_tasks:
                task.cancel()
            await asyncio.gather(*producer_tasks, return_exceptions=True)

    def stop(self):
        self.running = False

    async def connection_loop(self):
        retry_seconds = 1.0
        while self.running:
            try:
                async with websockets.connect(self.endpoint, max_size=20_000_000) as websocket:
                    retry_seconds = 1.0
                    await websocket.send(json.dumps({
                        'type': 'register',
                        'robot': self.robot_descriptor(status='online'),
                    }))
                    await asyncio.gather(
                        self.receiver_loop(websocket),
                        self.sender_loop(websocket),
                    )
            except Exception as error:
                print(f'connection lost: {error}; retrying in {retry_seconds:.1f}s')
                await asyncio.sleep(retry_seconds)
                retry_seconds = min(retry_seconds * 1.8, 10.0)

    async def receiver_loop(self, websocket: websockets.ClientConnection):
        async for message in websocket:
            payload = json.loads(message)
            if payload.get('type') == 'registered':
                self.current_recording_id = payload.get('recordingId')
                print(f'registered recording {self.current_recording_id}')
            if payload.get('type') == 'error':
                print(f"server error: {payload.get('message')}")

    async def sender_loop(self, websocket: websockets.ClientConnection):
        while self.running:
            if self.send_queue:
                batch: list[dict[str, Any]] = []
                while self.send_queue and len(batch) < 250:
                    batch.append(self.send_queue.popleft())
                await websocket.send(json.dumps({
                    'type': 'ingest.batch',
                    'robot': self.robot_descriptor(status='online'),
                    'recordingId': self.current_recording_id,
                    'events': batch,
                }))
            await asyncio.sleep(self.batch_flush_interval)

    async def sensor_loop(self, sensor_type: str):
        while self.running:
            self.enqueue_event(sensor_type)
            await asyncio.sleep(SENSOR_INTERVALS[sensor_type])

    def enqueue_event(self, sensor_type: str):
        event = {
            'sensorType': sensor_type,
            'timestamp': utc_now(),
            'sequence': next(self.sequences[sensor_type]),
            'anomaly': random.random() > 0.985,
            'payload': self.make_payload(sensor_type),
        }
        self.send_queue.append(event)
        while len(self.send_queue) > self.max_queue_size:
            self.send_queue.popleft()

    def robot_descriptor(self, status: str) -> dict[str, Any]:
        return {
            'robotId': self.robot_id,
            'name': self.name,
            'location': self.location,
            'status': status,
            'metadata': {
                'firmware': 'sim-0.1.0',
                'battery_pct': round(60 + random.random() * 40, 2),
                'queue_depth': len(self.send_queue),
            },
        }

    def make_payload(self, sensor_type: str) -> dict[str, Any]:
        if sensor_type == 'camera':
            return self.camera_payload()
        if sensor_type == 'lidar':
            return self.lidar_payload()
        if sensor_type == 'imu':
            return self.imu_payload()
        return self.odometry_payload()

    def camera_payload(self) -> dict[str, Any]:
        image = Image.new('RGB', (320, 180), color=(8, 17, 29))
        draw = ImageDraw.Draw(image)
        horizon = 100 + int(math.sin(asyncio.get_event_loop().time()) * 18)
        draw.rectangle((0, horizon, 320, 180), fill=(25, 62, 102))
        draw.rectangle((0, 0, 320, horizon), fill=(7, 20, 38))
        for index in range(5):
            offset = int((asyncio.get_event_loop().time() * 45 + index * 50) % 360)
            draw.ellipse((offset - 12, 50 + index * 8, offset + 18, 80 + index * 8), outline=(86, 255, 197), width=2)
        draw.text((12, 12), f'{self.robot_id} {utc_now()[:19]}', fill=(235, 245, 255))
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        return {
            'imageBase64': base64.b64encode(buffer.getvalue()).decode('ascii'),
            'width': 320,
            'height': 180,
        }

    def lidar_payload(self) -> dict[str, Any]:
        now = asyncio.get_event_loop().time()
        points = []
        for step in range(180):
            angle = step / 180 * math.tau
            radius = 3.5 + math.sin(now * 0.8 + angle * 3) * 0.9 + random.random() * 0.15
            points.append({
                'x': round(math.cos(angle) * radius, 3),
                'y': round(math.sin(angle) * radius, 3),
                'z': round(math.sin(now + angle * 4) * 0.8, 3),
                'intensity': round(0.35 + random.random() * 0.65, 3),
            })
        return {'points': points}

    def imu_payload(self) -> dict[str, Any]:
        now = asyncio.get_event_loop().time()
        return {
            'roll': round(math.sin(now * 0.7) * 0.3, 4),
            'pitch': round(math.cos(now * 0.5) * 0.22, 4),
            'yaw': round((now * 0.4) % math.tau, 4),
            'ax': round(math.sin(now) * 0.4, 4),
            'ay': round(math.cos(now * 0.8) * 0.4, 4),
            'az': round(9.81 + math.sin(now * 0.3) * 0.08, 4),
        }

    def odometry_payload(self) -> dict[str, Any]:
        self.heading += 0.04
        self.pose_x += math.cos(self.heading) * 0.08
        self.pose_y += math.sin(self.heading) * 0.05
        return {
            'x': round(self.pose_x, 3),
            'y': round(self.pose_y, 3),
            'theta': round(self.heading, 3),
            'velocity': round(0.45 + math.sin(self.heading) * 0.1, 3),
        }


async def main():
    parser = argparse.ArgumentParser(description='RoboViz simulated robot agent')
    parser.add_argument('--robot-id', default='robot-sim-01')
    parser.add_argument('--name', default='Warehouse Scout')
    parser.add_argument('--location', default='dock-a')
    parser.add_argument('--endpoint', default='ws://localhost:4000/ws/ingest')
    args = parser.parse_args()

    agent = RobotAgent(
        robot_id=args.robot_id,
        name=args.name,
        location=args.location,
        endpoint=args.endpoint,
    )
    await agent.run()


if __name__ == '__main__':
    asyncio.run(main())
