"""
WebSocket connection manager for handling multiple concurrent connections.

Provides connection lifecycle management, broadcasting, and heartbeat mechanisms.
"""

import asyncio
import json
import logging
from typing import Dict, List, Set, Optional, Any
from datetime import datetime
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections with support for broadcasting,
    targeted messaging, and connection health monitoring.
    """

    def __init__(self, heartbeat_interval: int = 30):
        """
        Initialize the connection manager.

        Args:
            heartbeat_interval: Seconds between heartbeat pings (default: 30)
        """
        # Store active connections by connection ID
        self.active_connections: Dict[str, WebSocket] = {}
        
        # Store connections grouped by topic/channel
        self.topic_connections: Dict[str, Set[str]] = {}
        
        # Track last heartbeat time for each connection
        self.last_heartbeat: Dict[str, datetime] = {}
        
        # Heartbeat configuration
        self.heartbeat_interval = heartbeat_interval
        self.heartbeat_task: Optional[asyncio.Task] = None
        
        logger.info("ConnectionManager initialized")

    async def connect(self, websocket: WebSocket, connection_id: str) -> None:
        """
        Accept and register a new WebSocket connection.

        Args:
            websocket: The WebSocket connection to accept
            connection_id: Unique identifier for this connection
        """
        await websocket.accept()
        self.active_connections[connection_id] = websocket
        self.last_heartbeat[connection_id] = datetime.utcnow()
        logger.info(f"WebSocket connected: {connection_id}")
        logger.debug(f"Total active connections: {len(self.active_connections)}")

    def disconnect(self, connection_id: str) -> None:
        """
        Remove a connection from the manager.

        Args:
            connection_id: The connection ID to remove
        """
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
            logger.info(f"WebSocket disconnected: {connection_id}")
        
        if connection_id in self.last_heartbeat:
            del self.last_heartbeat[connection_id]
        
        # Remove from all topics
        for topic_connections in self.topic_connections.values():
            topic_connections.discard(connection_id)
        
        logger.debug(f"Total active connections: {len(self.active_connections)}")

    def subscribe(self, connection_id: str, topic: str) -> None:
        """
        Subscribe a connection to a specific topic/channel.

        Args:
            connection_id: The connection to subscribe
            topic: The topic to subscribe to
        """
        if topic not in self.topic_connections:
            self.topic_connections[topic] = set()
        
        self.topic_connections[topic].add(connection_id)
        logger.debug(f"Connection {connection_id} subscribed to topic: {topic}")

    def unsubscribe(self, connection_id: str, topic: str) -> None:
        """
        Unsubscribe a connection from a specific topic/channel.

        Args:
            connection_id: The connection to unsubscribe
            topic: The topic to unsubscribe from
        """
        if topic in self.topic_connections:
            self.topic_connections[topic].discard(connection_id)
            logger.debug(f"Connection {connection_id} unsubscribed from topic: {topic}")

    async def send_personal_message(
        self, 
        message: Dict[str, Any], 
        connection_id: str
    ) -> bool:
        """
        Send a message to a specific connection.

        Args:
            message: The message data to send (will be JSON serialized)
            connection_id: The target connection ID

        Returns:
            True if message was sent successfully, False otherwise
        """
        if connection_id not in self.active_connections:
            logger.warning(f"Attempted to send message to non-existent connection: {connection_id}")
            return False

        websocket = self.active_connections[connection_id]
        try:
            await websocket.send_json(message)
            logger.debug(f"Sent message to {connection_id}: {message.get('type', 'unknown')}")
            return True
        except WebSocketDisconnect:
            logger.warning(f"Connection {connection_id} disconnected during send")
            self.disconnect(connection_id)
            return False
        except Exception as e:
            logger.error(f"Error sending message to {connection_id}: {e}")
            self.disconnect(connection_id)
            return False

    async def broadcast(self, message: Dict[str, Any]) -> int:
        """
        Broadcast a message to all active connections.

        Args:
            message: The message data to broadcast (will be JSON serialized)

        Returns:
            Number of connections that successfully received the message
        """
        if not self.active_connections:
            logger.debug("No active connections to broadcast to")
            return 0

        successful_sends = 0
        disconnected_connections = []

        for connection_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
                successful_sends += 1
            except WebSocketDisconnect:
                logger.warning(f"Connection {connection_id} disconnected during broadcast")
                disconnected_connections.append(connection_id)
            except Exception as e:
                logger.error(f"Error broadcasting to {connection_id}: {e}")
                disconnected_connections.append(connection_id)

        # Clean up disconnected connections
        for connection_id in disconnected_connections:
            self.disconnect(connection_id)

        logger.debug(f"Broadcast message to {successful_sends}/{len(self.active_connections)} connections")
        return successful_sends

    async def broadcast_to_topic(self, message: Dict[str, Any], topic: str) -> int:
        """
        Broadcast a message to all connections subscribed to a topic.

        Args:
            message: The message data to broadcast (will be JSON serialized)
            topic: The topic to broadcast to

        Returns:
            Number of connections that successfully received the message
        """
        if topic not in self.topic_connections:
            logger.debug(f"No connections subscribed to topic: {topic}")
            return 0

        connection_ids = list(self.topic_connections[topic])
        if not connection_ids:
            return 0

        successful_sends = 0
        disconnected_connections = []

        for connection_id in connection_ids:
            if connection_id not in self.active_connections:
                disconnected_connections.append(connection_id)
                continue

            websocket = self.active_connections[connection_id]
            try:
                await websocket.send_json(message)
                successful_sends += 1
            except WebSocketDisconnect:
                logger.warning(f"Connection {connection_id} disconnected during topic broadcast")
                disconnected_connections.append(connection_id)
            except Exception as e:
                logger.error(f"Error broadcasting to {connection_id} on topic {topic}: {e}")
                disconnected_connections.append(connection_id)

        # Clean up disconnected connections
        for connection_id in disconnected_connections:
            self.disconnect(connection_id)

        logger.debug(f"Broadcast to topic '{topic}': {successful_sends}/{len(connection_ids)} connections")
        return successful_sends

    async def send_heartbeat(self, connection_id: str) -> bool:
        """
        Send a heartbeat ping to a specific connection.

        Args:
            connection_id: The connection to ping

        Returns:
            True if ping was sent successfully, False otherwise
        """
        return await self.send_personal_message(
            {"type": "ping", "timestamp": datetime.utcnow().isoformat()},
            connection_id
        )

    async def heartbeat_loop(self) -> None:
        """
        Background task that sends periodic heartbeat pings to all connections.
        Removes connections that haven't responded in time.
        """
        logger.info("Heartbeat loop started")
        
        while True:
            try:
                await asyncio.sleep(self.heartbeat_interval)
                
                if not self.active_connections:
                    continue

                current_time = datetime.utcnow()
                stale_connections = []

                # Send heartbeat to all connections
                for connection_id in list(self.active_connections.keys()):
                    # Check if connection is stale (no heartbeat response in 2x interval)
                    last_beat = self.last_heartbeat.get(connection_id)
                    if last_beat:
                        time_since_last = (current_time - last_beat).total_seconds()
                        if time_since_last > (self.heartbeat_interval * 2):
                            logger.warning(f"Connection {connection_id} is stale (no heartbeat for {time_since_last}s)")
                            stale_connections.append(connection_id)
                            continue

                    # Send heartbeat ping
                    success = await self.send_heartbeat(connection_id)
                    if not success:
                        stale_connections.append(connection_id)

                # Clean up stale connections
                for connection_id in stale_connections:
                    logger.info(f"Removing stale connection: {connection_id}")
                    self.disconnect(connection_id)

            except asyncio.CancelledError:
                logger.info("Heartbeat loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in heartbeat loop: {e}")

    def update_heartbeat(self, connection_id: str) -> None:
        """
        Update the last heartbeat time for a connection.
        Should be called when receiving a pong response.

        Args:
            connection_id: The connection that sent a pong
        """
        if connection_id in self.active_connections:
            self.last_heartbeat[connection_id] = datetime.utcnow()
            logger.debug(f"Heartbeat updated for connection: {connection_id}")

    async def start_heartbeat(self) -> None:
        """Start the heartbeat background task."""
        if self.heartbeat_task is None or self.heartbeat_task.done():
            self.heartbeat_task = asyncio.create_task(self.heartbeat_loop())
            logger.info("Heartbeat task started")

    async def stop_heartbeat(self) -> None:
        """Stop the heartbeat background task."""
        if self.heartbeat_task and not self.heartbeat_task.done():
            self.heartbeat_task.cancel()
            try:
                await self.heartbeat_task
            except asyncio.CancelledError:
                pass
            logger.info("Heartbeat task stopped")

    async def disconnect_all(self) -> None:
        """Disconnect all active connections gracefully."""
        logger.info(f"Disconnecting all {len(self.active_connections)} connections")
        
        for connection_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.close()
            except Exception as e:
                logger.error(f"Error closing connection {connection_id}: {e}")
            finally:
                self.disconnect(connection_id)

    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.active_connections)

    def get_topic_connection_count(self, topic: str) -> int:
        """Get the number of connections subscribed to a topic."""
        return len(self.topic_connections.get(topic, set()))

    def get_all_topics(self) -> List[str]:
        """Get a list of all topics with active subscriptions."""
        return [topic for topic, connections in self.topic_connections.items() if connections]

# Made with Bob
