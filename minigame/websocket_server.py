import asyncio
import json
import uuid
import logging
import signal
import sys
import websockets
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

connected_clients = {}
lobbies = {}

async def handle_client(websocket):
    """Handle a client connection."""
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
    """Process incoming messages."""
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
    """Create a new lobby."""
    player_name = data.get('data', {}).get('player_name', 'Anonymous')
    
    connected_clients[client_id]['name'] = player_name
    
    lobby_id = str(uuid.uuid4())
    player_id = connected_clients[client_id]['player_id']    
    lobbies[lobby_id] = {
        'id': lobby_id,
        'host_id': player_id,
        'max_players': 4,
        'players': {
            player_id: {
                'display_name': player_name,
                'is_ready': False
            }
        },
        'game_status': 'waiting_for_players',
        'phase_time_remaining': 0,
        'theme': None,
        'theme_votes': {},
        'drawings': {},
        'drawing_votes': {},
        'results': None,
        'created_at': datetime.now().timestamp()
    }
    
    connected_clients[client_id]['current_lobby'] = lobby_id
    await connected_clients[client_id]['websocket'].send(json.dumps({
        'type': 'lobby_joined',
        'data': lobbies[lobby_id]
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
    if lobby['game_status'] != 'waiting_for_players':
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': 'Cannot join lobby - game already in progress'}
        }))
        return
        
    if len(lobby['players']) >= lobby.get('max_players', 4):
        await connected_clients[client_id]['websocket'].send(json.dumps({
            'type': 'error',
            'data': {'message': 'Lobby is full'}
        }))
        return
    connected_clients[client_id]['name'] = player_name
    connected_clients[client_id]['current_lobby'] = lobby_id
    
    player_id = connected_clients[client_id]['player_id']
    
    lobby['players'][player_id] = {
        'display_name': player_name,
        'is_ready': False
    }
    
    await connected_clients[client_id]['websocket'].send(json.dumps({
        'type': 'lobby_joined',
        'data': lobby
    }))
    await broadcast_lobby_update(lobby_id)
    
    await broadcast_lobby_list()
    
    logger.info(f"Player {player_id} joined lobby {lobby_id}")

async def leave_lobby(client_id):
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    
    if player_id in lobby['players']:
        del lobby['players'][player_id]
    
    client['current_lobby'] = None
    
    if not lobby['players']:
        del lobbies[lobby_id]
        logger.info(f"Lobby {lobby_id} deleted - no players remaining")
    else:
        if lobby['host_id'] == player_id:
            lobby['host_id'] = next(iter(lobby['players'].keys()))
            logger.info(f"New host assigned in lobby {lobby_id}: {lobby['host_id']}")
        
    
    await broadcast_lobby_list()
    
    logger.info(f"Player {player_id} left lobby {lobby_id}")

async def send_lobby_list(client_id):
    try:
        available_lobbies = [
            {
                'id': lobby['id'],
                'host_id': lobby['host_id'],
                'player_count': len(lobby['players']),
                'max_players': lobby.get('max_players', 4), 
                'status': lobby['game_status'],                'created_at': lobby['created_at']
            }
            for lobby in lobbies.values()
            if lobby['game_status'] == 'waiting_for_players'
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
    """Set player ready status."""
    is_ready = data.get('data', {}).get('is_ready', False)
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    
    if player_id in lobby['players']:
        lobby['players'][player_id]['is_ready'] = is_ready
    
    await broadcast_lobby_update(lobby_id)
    
    # No longer auto-start the game when all players are ready
    # Only the host can start the game now

async def start_theme_voting(lobby_id):
    """Start the theme voting phase."""
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
        'player_name': lobby['players'][player_id]['display_name'], # Changed 'name' to 'display_name'
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
        # If all drawings are submitted, and the timer for drawing phase might still be running,
        # we should ideally cancel that timer and immediately move to voting.
        # For now, assuming the timer will naturally lead to voting or this check suffices.
        await start_voting_phase(lobby_id)
    else:
        await broadcast_lobby_update(lobby_id)

async def handle_drawing_vote(client_id, data):
    voted_author_player_id = data.get('data', {}).get('player_id') # This is the player_id of the drawing's author
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    voter_player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not voted_author_player_id:
        logger.warning(f"Invalid vote attempt: lobby_id={lobby_id}, voted_author_player_id={voted_author_player_id}")
        return
    
    lobby = lobbies[lobby_id]

    # If we're in showcase_voting mode, only allow votes for the currently showcased drawing
    if lobby['game_status'] == 'showcase_voting':
        drawings = list(lobby['drawings'].values())
        current_index = lobby.get('showcase_current_index', 0)
        
        if current_index < len(drawings):
            current_drawing = drawings[current_index]
            if voted_author_player_id != current_drawing['player_id']:
                logger.warning(f"Player {voter_player_id} attempted to vote for {voted_author_player_id} but current showcase is {current_drawing['player_id']}")
                return

    # Ensure player is not voting for themselves (optional, can also be frontend enforced)
    if voter_player_id == voted_author_player_id:
        logger.info(f"Player {voter_player_id} attempted to vote for themselves.")
        return

    # Ensure the voted_author_player_id corresponds to an actual drawing's author
    author_exists = any(d['player_id'] == voted_author_player_id for d in lobby['drawings'].values())
    if not author_exists:
        logger.warning(f"Player {voter_player_id} attempted to vote for non-existent author {voted_author_player_id}")
        return

    lobby['drawing_votes'][voter_player_id] = voted_author_player_id
    logger.info(f"Player {voter_player_id} voted for drawing by {voted_author_player_id} in lobby {lobby_id}")
    
    # Recalculate vote counts for all drawings in this lobby
    current_vote_counts = {} # { author_player_id: count }
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
    
    # Initialize showcase voting state
    drawings = list(lobby['drawings'].values())
    lobby['showcase_current_index'] = 0
    lobby['showcase_total_drawings'] = len(drawings)
    lobby['showcase_time_per_drawing'] = 10
    lobby['phase_time_remaining'] = lobby['showcase_time_per_drawing']
    
    await broadcast_lobby_update(lobby_id)
    
    # Start the showcase timer for the first drawing
    asyncio.create_task(showcase_timer(lobby_id))

async def showcase_timer(lobby_id):
    """Handle the showcase voting timer where each drawing is shown for 10 seconds"""
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    
    while (lobby_id in lobbies and 
           lobby['game_status'] == 'showcase_voting' and 
           lobby['showcase_current_index'] < lobby['showcase_total_drawings']):
        
        # Countdown for current drawing showcase
        seconds_left = lobby['showcase_time_per_drawing']
        
        while seconds_left > 0 and lobby_id in lobbies and lobby['game_status'] == 'showcase_voting':
            lobby['phase_time_remaining'] = seconds_left
            await broadcast_lobby_update(lobby_id)
            await asyncio.sleep(1)
            seconds_left -= 1
        
        if lobby_id not in lobbies or lobby['game_status'] != 'showcase_voting':
            return
            
        # Move to next drawing
        lobby['showcase_current_index'] += 1
        
        if lobby['showcase_current_index'] < lobby['showcase_total_drawings']:
            # Reset timer for next drawing
            lobby['phase_time_remaining'] = lobby['showcase_time_per_drawing']
            await broadcast_lobby_update(lobby_id)
        else:
            # All drawings showcased, move to results
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
    
    await asyncio.sleep(10)
    
    if lobby_id in lobbies:
        lobby['game_status'] = 'waiting'
        lobby['theme'] = None
        lobby['theme_votes'] = {}
        lobby['drawings'] = {}
        lobby['drawing_votes'] = {}
        lobby['results'] = None
        
        for player in lobby['players'].values():
            player['is_ready'] = False
            
        await broadcast_lobby_update(lobby_id)

async def broadcast_lobby_update(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    
    for client_id, client in connected_clients.items():
        if client['current_lobby'] == lobby_id:
            try:
                await client['websocket'].send(json.dumps({
                    'type': 'lobby_update',
                    'data': lobby
                }))
            except Exception as e:
                logger.error(f"Error sending lobby update to {client_id}: {e}")

async def broadcast_lobby_list():
    available_lobbies = [
        {
            'id': lobby['id'],
            'host_id': lobby['host_id'],
            'player_count': len(lobby['players']),
            'max_players': lobby.get('max_players', 4),
            'status': lobby['game_status'],            'created_at': lobby['created_at']
        }
        for lobby in lobbies.values()
        if lobby['game_status'] == 'waiting_for_players'
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
    
    if lobby_id and lobby_id in lobbies:
        await leave_lobby(client_id)
    
    del connected_clients[client_id]

async def start_game(client_id, data):
    """Start the game - only the host can do this."""
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
    
    # Check if the player is the host
    if lobby['host_id'] != player_id:
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'Only the host can start the game'}
        })
        return
    
    # Check if there are enough players
    if len(lobby['players']) < 2:
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'Need at least 2 players to start the game'}
        })
        return
    
    # Check if all players are ready
    if not all(player['is_ready'] for player in lobby['players'].values()):
        await send_message(client_id, {
            'type': 'error',
            'data': {'message': 'All players must be ready before starting the game'}
        })
        return
    
    # Start the game by beginning theme voting
    await start_theme_voting(lobby_id)

async def send_message(client_id, message):
    """Send a message to a specific client."""
    try:
        await connected_clients[client_id]['websocket'].send(json.dumps(message))
    except Exception as e:
        logger.error(f"Error sending message to {client_id}: {e}")

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