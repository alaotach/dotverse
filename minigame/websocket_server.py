import asyncio
import json
import uuid
import logging
import signal
import sys
import websockets
from datetime import datetime
from models import Lobby, Player, GameStatus

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

connected_clients = {}
lobbies = {}

async def handle_client(websocket):
    client_id = str(uuid.uuid4())
    player_id = str(uuid.uuid4())
    connected_clients[client_id] = {
        'websocket': websocket,
        'player_id': player_id,
        'current_lobby': None,
        'name': None
    }
    
    logger.info(f"New client connected: {client_id}")
    
    try:
        await websocket.send(json.dumps({
            'type': 'connection_ack',
            'data': {
                'player_id': player_id
            }
        }))
        
        async for message in websocket:
            await process_message(client_id, message)
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client disconnected: {client_id}")
    finally:
        await handle_client_disconnect(client_id)
        
async def process_message(client_id, message):
    try:
        data = json.loads(message)
        logger.info(f"Received from {client_id}: {data}")
        
        action = data.get('action')
        if not action:
            return
        
        client = connected_clients[client_id]
        
        if action == 'create_lobby':
            await create_lobby(client_id, data)
        elif action == 'join_lobby':
            await join_lobby(client_id, data)
        elif action == 'leave_lobby':
            await leave_lobby(client_id)
        elif action == 'get_lobby_list':
            await send_lobby_list(client_id)        
        elif action == 'player_ready':
            await set_player_ready(client_id, data)
        elif action == 'start_game':
            await start_game(client_id, data)
        elif action == 'vote_theme':
            await handle_theme_vote(client_id, data)
        elif action == 'submit_drawing':
            await handle_drawing_submission(client_id, data)
        elif action == 'vote_for_drawing':
            await handle_drawing_vote(client_id, data)
        elif action == 'kick_player':
            await kick_player(client_id, data)
        elif action == 'ban_player':
            await ban_player(client_id, data)
        elif action == 'transfer_host':
            await transfer_host(client_id, data)
        else:
            logger.warning(f"Unknown action: {action}")
            
    except Exception as e:
        logger.error(f"Error processing message: {e}")
        try:
            await connected_clients[client_id]['websocket'].send(json.dumps({
                'type': 'error',
                'data': {'message': f"Error processing request: {str(e)}"}
            }))
        except Exception:
            pass

async def create_lobby(client_id, data):
    player_name = data.get('data', {}).get('player_name', 'Anonymous')
    
    connected_clients[client_id]['name'] = player_name
    
    lobby_id = str(uuid.uuid4())
    player_id = connected_clients[client_id]['player_id']
    
    lobby = Lobby(lobby_id, max_players=4, min_players=2)
    player = Player(player_id, player_name)
    lobby.add_player(player)
    lobbies[lobby_id] = lobby
    
    connected_clients[client_id]['current_lobby'] = lobby_id
    await connected_clients[client_id]['websocket'].send(json.dumps({
        'type': 'lobby_joined',
        'data': lobby.get_lobby_state()
    }))
    
    await broadcast_lobby_list()
    
    logger.info(f"Lobby created: {lobby_id} by player {player_id}")

async def join_lobby(client_id, data):
    lobby_id = data.get('data', {}).get('lobby_id')
    player_name = data.get('data', {}).get('player_name', 'Anonymous')
    
    if not lobby_id or lobby_id not in lobbies:
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': 'Lobby not found'}
        }))
        return
        
    lobby = lobbies[lobby_id]
    player_id = connected_clients[client_id]['player_id']
    
    can_join, reason = lobby.can_player_join(player_id)
    if not can_join:
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': reason}
        }))
        return
    connected_clients[client_id]['name'] = player_name
    connected_clients[client_id]['current_lobby'] = lobby_id
    player = Player(player_id, player_name)
    lobby.add_player(player)
    
    await connected_clients[client_id]['websocket'].send(json.dumps({
        'type': 'lobby_joined',
        'data': lobby.get_lobby_state()
    }))
    await broadcast_lobby_update(lobby_id)
    await broadcast_lobby_list()
    
    logger.info(f"Player {player_id} joined lobby {lobby_id}")
    await broadcast_lobby_list()
    
    logger.info(f"Player {player_id} joined lobby {lobby_id}")

async def kick_player(client_id, data):
    target_player_id = data.get('data', {}).get('target_player_id')
    
    if not target_player_id:
        await send_error(client_id, 'No target player specified')
        return
    
    host_id = connected_clients[client_id]['player_id']
    lobby_id = connected_clients[client_id]['current_lobby']
    
    if not lobby_id or lobby_id not in lobbies:
        await send_error(client_id, 'Not in a lobby')
        return
    
    lobby = lobbies[lobby_id]
    success, message = lobby.kick_player(host_id, target_player_id)
    
    if not success:
        await send_error(client_id, message)
        return
    target_client_id = None
    for cid, client in connected_clients.items():
        if client['player_id'] == target_player_id:
            target_client_id = cid
            break
    
    if target_client_id:
        connected_clients[target_client_id]['current_lobby'] = None
        await connected_clients[target_client_id]['websocket'].send(json.dumps({
            'type': 'kicked_from_lobby',
            'data': {'message': 'You have been kicked from the lobby'}
        }))
    await broadcast_to_lobby(lobby_id, {
        'type': 'player_kicked',
        'data': {'message': message, 'player_id': target_player_id}
    })
    
    await broadcast_lobby_update(lobby_id)
    await broadcast_lobby_list()

async def ban_player(client_id, data):
    target_player_id = data.get('data', {}).get('target_player_id')
    
    if not target_player_id:
        await send_error(client_id, 'No target player specified')
        return
    
    host_id = connected_clients[client_id]['player_id']
    lobby_id = connected_clients[client_id]['current_lobby']
    
    if not lobby_id or lobby_id not in lobbies:
        await send_error(client_id, 'Not in a lobby')
        return
    
    lobby = lobbies[lobby_id]
    success, message = lobby.ban_player(host_id, target_player_id)
    
    if not success:
        await send_error(client_id, message)
        return
    target_client_id = None
    for cid, client in connected_clients.items():
        if client['player_id'] == target_player_id:
            target_client_id = cid
            break
    
    if target_client_id:
        connected_clients[target_client_id]['current_lobby'] = None
        await connected_clients[target_client_id]['websocket'].send(json.dumps({
            'type': 'banned_from_lobby',
            'data': {'message': 'You have been banned from the lobby'}
        }))
    await broadcast_to_lobby(lobby_id, {
        'type': 'player_banned',
        'data': {'message': message, 'player_id': target_player_id}
    })
      
    await broadcast_lobby_update(lobby_id)
    await broadcast_lobby_list()

async def transfer_host(client_id, data):
    target_player_id = data.get('data', {}).get('target_player_id')
    
    if not target_player_id:
        await send_error(client_id, 'No target player specified')
        return
    
    current_host_id = connected_clients[client_id]['player_id']
    lobby_id = connected_clients[client_id]['current_lobby']
    
    if not lobby_id or lobby_id not in lobbies:
        await send_error(client_id, 'Not in a lobby')
        return
    
    lobby = lobbies[lobby_id]
    success, message = lobby.transfer_host(current_host_id, target_player_id)
    
    if not success:
        await send_error(client_id, message)
        return
    await broadcast_to_lobby(lobby_id, {
        'type': 'host_transferred',
        'data': {'message': message, 'new_host_id': target_player_id}
    })
    
    await broadcast_lobby_update(lobby_id)

async def broadcast_to_lobby(lobby_id: str, message: dict):
    if lobby_id not in lobbies:
        return
    
    for client_id, client in connected_clients.items():
        if client['current_lobby'] == lobby_id:
            try:
                await client['websocket'].send(json.dumps(message))
            except Exception as e:
                logger.error(f"Error broadcasting to client {client_id}: {e}")

async def send_error(client_id: str, message: str):
    try:
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': message}
        }))
    except Exception as e:
        logger.error(f"Error sending error message to {client_id}: {e}")

async def leave_lobby(client_id):
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    was_host = lobby.is_host(player_id)
    lobby.remove_player(player_id)
    client['current_lobby'] = None
    if was_host and lobby.players:
        new_host = lobby.players[0]
        await broadcast_to_lobby(lobby_id, {
            'type': 'host_transferred',
            'data': {
                'new_host_id': new_host.player_id,
                'new_host_name': new_host.display_name,
                'message': f'{new_host.display_name} is now the lobby host (previous host left)',
                'reason': 'host_left'
            }
        })
        logger.info(f"Host reassigned from {player_id} to {new_host.player_id} in lobby {lobby_id} due to host leaving")
    
    if not lobby.players:
        del lobbies[lobby_id]
        logger.info(f"Lobby {lobby_id} deleted - no players remaining")
    else:
        await broadcast_lobby_update(lobby_id)
    
    await broadcast_lobby_list()
    logger.info(f"Player {player_id} left lobby {lobby_id}")

async def send_lobby_list(client_id):
    try:
        available_lobbies = [
            {
                'id': lobby.lobby_id,
                'host_id': lobby.host_id,
                'player_count': len(lobby.players),
                'max_players': lobby.max_players,
                'status': lobby.game_status.value,
                'created_at': datetime.now().timestamp()
            }
            for lobby in lobbies.values()
            if lobby.game_status == GameStatus.WAITING_FOR_PLAYERS
        ]
        
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'lobby_list',
            'data': available_lobbies
        }))
        logger.info(f"Sent lobby list to client {client_id}: {available_lobbies}")
    except Exception as e:
        logger.error(f"Error sending lobby list: {e}")
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': f"Error retrieving lobby list: {str(e)}"}
        }))

async def set_player_ready(client_id, data):
    is_ready = data.get('data', {}).get('is_ready', False)
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    lobby.set_player_ready(player_id, is_ready)
    
    await broadcast_lobby_update(lobby_id)
    

async def start_theme_voting(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby['game_status'] = 'theme_voting'
    lobby['phase_time_remaining'] = 30
    
    themes = ['Nature', 'Space', 'Technology', 'Fantasy', 'Food']
    lobby['available_themes'] = themes
    
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(countdown_timer(lobby_id, 'theme_voting', 30))

async def handle_theme_vote(client_id, data):
    theme = data.get('data', {}).get('theme')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not theme:
        return
    
    lobby = lobbies[lobby_id]
    
    lobby['theme_votes'][player_id] = theme
    
    await broadcast_lobby_update(lobby_id)

async def handle_drawing_submission(client_id, data):
    drawing_data = data.get('data', {}).get('drawing')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not drawing_data:
        return
    
    lobby = lobbies[lobby_id]

    drawing_id = str(uuid.uuid4())
    lobby['drawings'][drawing_id] = {
        'id': drawing_id,
        'player_id': player_id,
        'player_name': lobby['players'][player_id]['display_name'],
        'data': drawing_data,
        'theme': lobby['theme'],
        'votes': 0
    }
    
    await client['websocket'].send(json.dumps({
        'type': 'drawing_submitted',
        'data': {'success': True}
    }))
    
    all_submitted = len(lobby['drawings']) >= len(lobby['players'])
    
    if all_submitted:
        await start_voting_phase(lobby_id)
    else:
        await broadcast_lobby_update(lobby_id)

async def handle_drawing_vote(client_id, data):
    voted_author_player_id = data.get('data', {}).get('player_id')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    voter_player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not voted_author_player_id:
        logger.warning(f"Invalid vote attempt: lobby_id={lobby_id}, voted_author_player_id={voted_author_player_id}")
        return
    
    lobby = lobbies[lobby_id]

    if lobby['game_status'] == 'showcase_voting':
        drawings = list(lobby['drawings'].values())
        current_index = lobby.get('showcase_current_index', 0)
        
        if current_index < len(drawings):
            current_drawing = drawings[current_index]
            if voted_author_player_id != current_drawing['player_id']:
                logger.warning(f"Player {voter_player_id} attempted to vote for {voted_author_player_id} but current showcase is {current_drawing['player_id']}")
                return

    if voter_player_id == voted_author_player_id:
        logger.info(f"Player {voter_player_id} attempted to vote for themselves.")
        return

    author_exists = any(d['player_id'] == voted_author_player_id for d in lobby['drawings'].values())
    if not author_exists:
        logger.warning(f"Player {voter_player_id} attempted to vote for non-existent author {voted_author_player_id}")
        return

    lobby['drawing_votes'][voter_player_id] = voted_author_player_id
    logger.info(f"Player {voter_player_id} voted for drawing by {voted_author_player_id} in lobby {lobby_id}")
    current_vote_counts = {}
    for author_id_in_vote_log in lobby['drawing_votes'].values():
        current_vote_counts[author_id_in_vote_log] = current_vote_counts.get(author_id_in_vote_log, 0) + 1
        
    for drawing_id_key, drawing_details_val in lobby['drawings'].items():
        author_id_of_drawing = drawing_details_val['player_id']
        drawing_details_val['votes'] = current_vote_counts.get(author_id_of_drawing, 0)
            
    await broadcast_lobby_update(lobby_id)

async def start_voting_phase(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby['game_status'] = 'showcase_voting'
    
    drawings = list(lobby['drawings'].values())
    lobby['showcase_current_index'] = 0
    lobby['showcase_total_drawings'] = len(drawings)
    lobby['showcase_time_per_drawing'] = 10
    lobby['phase_time_remaining'] = lobby['showcase_time_per_drawing']
    
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(showcase_timer(lobby_id))

async def showcase_timer(lobby_id):
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    
    while (lobby_id in lobbies and 
           lobby['game_status'] == 'showcase_voting' and 
           lobby['showcase_current_index'] < lobby['showcase_total_drawings']):
        
        seconds_left = lobby['showcase_time_per_drawing']
        
        while seconds_left > 0 and lobby_id in lobbies and lobby['game_status'] == 'showcase_voting':
            lobby['phase_time_remaining'] = seconds_left
            await broadcast_lobby_update(lobby_id)
            await asyncio.sleep(1)
            seconds_left -= 1
        
        if lobby_id not in lobbies or lobby['game_status'] != 'showcase_voting':
            return
            
        lobby['showcase_current_index'] += 1
        
        if lobby['showcase_current_index'] < lobby['showcase_total_drawings']:
            lobby['phase_time_remaining'] = lobby['showcase_time_per_drawing']
            await broadcast_lobby_update(lobby_id)
        else:
            await start_showcasing_phase(lobby_id)

async def start_showcasing_phase(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby['game_status'] = 'showcasing'
    
    vote_count = {}
    for voted_id in lobby['drawing_votes'].values():
        vote_count[voted_id] = vote_count.get(voted_id, 0) + 1
    
    lobby['results'] = sorted(vote_count.items(), key=lambda x: x[1], reverse=True)
    
    await broadcast_lobby_update(lobby_id)
    
    lobby['phase_time_remaining'] = 20
    asyncio.create_task(countdown_timer(lobby_id, 'showcasing', 20))

async def countdown_timer(lobby_id, expected_status, seconds):
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    
    while seconds > 0 and lobby_id in lobbies:
        if lobbies[lobby_id]['game_status'] != expected_status:
            return
            
        seconds -= 1
        lobbies[lobby_id]['phase_time_remaining'] = seconds
        
        if seconds % 5 == 0 or seconds == 0:
            await broadcast_lobby_update(lobby_id)
            
        await asyncio.sleep(1)
    
    if lobby_id not in lobbies:
        return
        
    if expected_status == 'theme_voting':
        await finish_theme_voting(lobby_id)
    elif expected_status == 'drawing':
        await finish_drawing_phase(lobby_id)
    elif expected_status == 'voting':
        await start_showcasing_phase(lobby_id)
    elif expected_status == 'showcasing':
        await end_game(lobby_id)

async def finish_theme_voting(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    
    theme_counts = {}
    for theme in lobby['theme_votes'].values():
        theme_counts[theme] = theme_counts.get(theme, 0) + 1
    
    if theme_counts:
        sorted_themes = sorted(theme_counts.items(), key=lambda x: x[1], reverse=True)
        winning_theme = sorted_themes[0][0]
    else:
        import random
        themes = lobby.get('available_themes', ['Default Theme'])
        winning_theme = random.choice(themes)
    
    lobby['theme'] = winning_theme
    lobby['game_status'] = 'drawing'
    lobby['phase_time_remaining'] = 120 
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(countdown_timer(lobby_id, 'drawing', 120))

async def finish_drawing_phase(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    
    submitted_players = {drawing['player_id'] for drawing in lobby['drawings'].values()}
    if len(submitted_players) >= 2:
        await start_voting_phase(lobby_id)
    else:
        lobby['game_status'] = 'ended'
        lobby['results'] = []
        await broadcast_lobby_update(lobby_id)

async def end_game(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby['game_status'] = 'ended'
    lobby['phase_time_remaining'] = 0
    
    await broadcast_lobby_update(lobby_id)
    
    if lobby_id in lobbies:
        await reset_lobby_for_rejoin(lobby_id)

async def reset_lobby_for_rejoin(lobby_id):
    if lobby_id not in lobbies:
        return
    lobby = lobbies[lobby_id]
    lobby['game_status'] = 'waiting_for_players'
    lobby['phase_time_remaining'] = 0
    lobby['theme'] = None
    lobby['theme_votes'] = {}
    lobby['drawings'] = {}
    lobby['drawing_votes'] = {}
    lobby['results'] = None
    for player in lobby['players'].values():
        player['is_ready'] = False
    logger.info(f"Lobby {lobby_id} reset for rejoin")
    await broadcast_lobby_update(lobby_id)
    await broadcast_lobby_list()

async def broadcast_lobby_update(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    
    for client_id, client in connected_clients.items():
        if client['current_lobby'] == lobby_id:
            try:
                await client['websocket'].send(json.dumps({
                    'type': 'lobby_update',
                    'data': lobby.get_lobby_state()
                }))
            except Exception as e:
                logger.error(f"Error sending lobby update to {client_id}: {e}")

async def broadcast_lobby_list():
    available_lobbies = [
        {
            'id': lobby.lobby_id,
            'host_id': lobby.host_id,
            'player_count': len(lobby.players),
            'max_players': lobby.max_players,
            'status': lobby.game_status.value,
            'created_at': datetime.now().timestamp()
        }
        for lobby in lobbies.values()
        if lobby.game_status == GameStatus.WAITING_FOR_PLAYERS
    ]
    
    for client_id, client in connected_clients.items():
        try:
            await client['websocket'].send(json.dumps({
                'type': 'lobby_list',
                'data': available_lobbies
            }))
        except Exception as e:
            logger.error(f"Error sending lobby list to {client_id}: {e}")

async def handle_client_disconnect(client_id):
    if client_id not in connected_clients:
        return
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if lobby_id and lobby_id in lobbies:
        lobby = lobbies[lobby_id]
        was_host = lobby.is_host(player_id)
        
        lobby.remove_player(player_id)

        if was_host and lobby.players:
            new_host = lobby.players[0]
            await broadcast_to_lobby(lobby_id, {
                'type': 'host_transferred',
                'data': {
                    'new_host_id': new_host.player_id,
                    'new_host_name': new_host.display_name,
                    'message': f'{new_host.display_name} is now the lobby host (previous host disconnected)',
                    'reason': 'host_disconnected'
                }
            })
            logger.info(f"Host reassigned from {player_id} to {new_host.player_id} in lobby {lobby_id} due to disconnect")
        
        if not lobby.players:
            del lobbies[lobby_id]
            logger.info(f"Lobby {lobby_id} deleted - no players remaining after host disconnect")
        else:
            await broadcast_lobby_update(lobby_id)
        
        await broadcast_lobby_list()
        logger.info(f"Player {player_id} disconnected from lobby {lobby_id}")
    
    del connected_clients[client_id]

async def start_game(client_id, data):
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'No lobby found'}
        })
        return
    
    lobby = lobbies[lobby_id]
    
    if not lobby.is_host(player_id):
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'Only the host can start the game'}
        })
        return
    
    if not lobby.can_start_game():
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'Cannot start game - need more players or not all players are ready'}
        })
        return
    
    lobby.start_theme_voting()
    await broadcast_lobby_update(lobby_id)

async def send_message(client_id, message):
    try:
        await connected_clients[client_id]['websocket'].send(json.dumps(message))
    except Exception as e:
        logger.error(f"Error sending message to {client_id}: {e}")

async def ensure_lobby_has_host(lobby_id):
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    current_host_id = lobby.get('host_id')
    if current_host_id and current_host_id in lobby['players']:
        return
    if lobby['players']:
        new_host_id = next(iter(lobby['players'].keys()))
        lobby['host_id'] = new_host_id
        for pid, player in lobby['players'].items():
            player['is_host'] = (pid == new_host_id)
        
        new_host_name = lobby['players'][new_host_id].get('display_name', 'Unknown')
        await broadcast_to_lobby(lobby_id, {
            'type': 'host_transferred',
            'data': {
                'new_host_id': new_host_id,
                'new_host_name': new_host_name,
                'message': f'{new_host_name} is now the lobby host',
                'reason': 'host_reassigned'
            }
        })
        logger.info(f"Host reassigned to {new_host_id} in lobby {lobby_id}")
        await broadcast_lobby_update(lobby_id)

async def start_server():    
    stop = asyncio.Future()
    
    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda sig, _: stop.set_result(None))
    
    async with websockets.serve(handle_client, "0.0.0.0", 8765):
        logger.info("WebSocket server running at ws://0.0.0.0:8765")
        await stop
        
    logger.info("WebSocket server stopped")

if __name__ == "__main__":
    logger.info("Minigame WebSocket server starting")
    asyncio.run(start_server())