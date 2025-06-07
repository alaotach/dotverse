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
        action = data.get('action') or data.get('type')
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
        elif action == 'set_ready':
            await set_player_ready(client_id, data)
        elif action == 'player_ready':
            await set_player_ready(client_id, data)
        elif action == 'start_game':
            await start_game(client_id, data)
        elif action == 'vote_theme':
            await handle_theme_vote(client_id, data)
        elif action == 'submit_drawing':
            await handle_drawing_submission(client_id, data)
        elif action == 'vote_drawing':
            await handle_drawing_vote(client_id, data)
        elif action == 'vote_for_drawing':
            await handle_drawing_vote(client_id, data)
        elif action == 'kick_player':
            await kick_player(client_id, data)
        elif action == 'ban_player':
            await ban_player(client_id, data)
        elif action == 'transfer_host':
            await transfer_host(client_id, data)
        elif action == 'update_lobby_settings':
            await update_lobby_settings(client_id, data)
        elif action == 'join_lobby_with_password':
            await join_lobby_with_password(client_id, data)
        else:
            logger.warning(f"Unknown action: {action}")
            await send_error(client_id, f"Unknown action: {action}")
            
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON from {client_id}: {e}")
        await send_error(client_id, "Invalid JSON format")
    except Exception as e:
        logger.error(f"Error processing message from {client_id}: {e}", exc_info=True)
        await send_error(client_id, f"Failed to process message: {str(e)}")

async def create_lobby(client_id, data):
    try:
        logger.info(f"Creating lobby for client {client_id} with data: {data}")
        
        player_name = data.get('data', {}).get('player_name', 'Anonymous')
        settings = data.get('data', {}).get('settings', {})
        
        if not player_name or player_name.strip() == '':
            await send_error(client_id, 'Player name is required')
            return
            
        connected_clients[client_id]['name'] = player_name
        lobby_id = str(uuid.uuid4())
        player_id = connected_clients[client_id]['player_id']
        
        max_players = settings.get('max_players', 4)
        min_players = settings.get('min_players', 2)
        
        if max_players < 2 or max_players > 20:
            await send_error(client_id, 'Max players must be between 2 and 20')
            return
            
        if min_players < 2 or min_players > max_players:
            await send_error(client_id, 'Min players must be between 2 and max players')
            return
        
        lobby = Lobby(lobby_id, max_players=max_players, min_players=min_players)
        
        if settings:
            lobby.settings.update_from_dict(settings)
        
        player = Player(player_id, player_name)
        lobby.add_player(player)
        lobby.set_host(player_id)        
        lobbies[lobby_id] = lobby
        connected_clients[client_id]['current_lobby'] = lobby_id
        
        logger.info(f"Lobby {lobby_id} created by {player_name} with settings: {settings}")
        
        await send_message(client_id, {
            'type': 'lobby_joined',
            'data': lobby.get_lobby_state()
        })
        
        await broadcast_lobby_list()
        
    except Exception as e:
        logger.error(f"Error creating lobby for client {client_id}: {e}", exc_info=True)
        await send_error(client_id, f'Failed to create lobby: {str(e)}')

async def update_lobby_settings(client_id, data):
    client = connected_clients.get(client_id)
    if not client or not client.get('current_lobby'):
        await send_error(client_id, "You are not in a lobby")
        return
    lobby_id = client['current_lobby']
    lobby = lobbies.get(lobby_id)
    if not lobby:
        await send_error(client_id, "Lobby not found")
        return
    player_id = client['player_id']
    new_settings = data.get('data', {}).get('settings', {})
    success, message = lobby.update_settings(player_id, new_settings)
    if success:
        await broadcast_lobby_update(lobby_id)
        await send_message(client_id, {
            'type': 'settings_updated',
            'data': {
                'message': message,
                'settings': lobby.settings.to_dict()
            }
        })
        logger.info(f"Lobby {lobby_id} settings updated by {player_id}: {new_settings}")
    else:
        await send_error(client_id, message)

async def join_lobby_with_password(client_id, data):
    lobby_id = data.get('data', {}).get('lobby_id')
    player_name = data.get('data', {}).get('player_name', 'Anonymous')
    password = data.get('data', {}).get('password', '')
    
    if not lobby_id:
        await send_error(client_id, "Lobby ID required")
        return
    
    lobby = lobbies.get(lobby_id)
    if not lobby:
        await send_error(client_id, "Lobby not found")
        return
    if lobby.settings.private_lobby:
        if not lobby.settings.lobby_password:
            await send_error(client_id, "Lobby password not set properly")
            return
        if lobby.settings.lobby_password != password:
            await send_error(client_id, "Incorrect lobby password")
            return
    
    await _internal_join_lobby(client_id, data)

async def _internal_join_lobby(client_id, data):
    """Internal function to join a lobby without password checks"""
    lobby_id = data.get('data', {}).get('lobby_id')
    player_name = data.get('data', {}).get('player_name', 'Anonymous')
    
    if not lobby_id or lobby_id not in lobbies:
        await send_error(client_id, 'Lobby not found')
        return
        
    lobby = lobbies[lobby_id]
    player_id = connected_clients[client_id]['player_id']
    
    can_join, reason = lobby.can_player_join(player_id)
    if not can_join:
        await send_error(client_id, reason)
        return
        
    connected_clients[client_id]['name'] = player_name
    connected_clients[client_id]['current_lobby'] = lobby_id
    player = Player(player_id, player_name)
    lobby.add_player(player)
    
    await send_message(client_id, {
        'type': 'lobby_joined',
        'data': lobby.get_lobby_state()
    })
    
    await broadcast_lobby_update(lobby_id)
    await broadcast_lobby_list()
    
    logger.info(f"Player {player_id} ({player_name}) joined lobby {lobby_id}")

async def join_lobby(client_id, data):
    lobby_id = data.get('data', {}).get('lobby_id')
    
    if not lobby_id or lobby_id not in lobbies:
        await send_error(client_id, 'Lobby not found')
        return
        
    lobby = lobbies[lobby_id]
    
    if lobby.settings.private_lobby and lobby.settings.lobby_password:
        await send_error(client_id, 'This lobby requires a password. Please use join with password option.')
        return
    
    await _internal_join_lobby(client_id, data)

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
                'created_at': datetime.now().timestamp(),
                'private_lobby': lobby.settings.private_lobby,
                'has_password': lobby.settings.lobby_password is not None
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
    lobby.start_theme_voting()  # Use the Lobby object's method
    
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(countdown_timer(lobby_id, 'theme_voting', lobby.settings.theme_voting_time))

async def handle_theme_vote(client_id, data):
    theme = data.get('data', {}).get('theme')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not theme:
        return
    
    lobby = lobbies[lobby_id]
    
    # Use the proper Lobby object method instead of treating it as a dictionary
    success = lobby.cast_color_theme_vote(player_id, theme)
    if not success:
        await send_error(client_id, "Failed to cast theme vote")
        return
    
    await broadcast_lobby_update(lobby_id)

async def handle_drawing_submission(client_id, data):
    drawing_data = data.get('data', {}).get('drawing')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies or not drawing_data:
        return
    
    lobby = lobbies[lobby_id]
    
    # Use the Lobby object's method to submit drawing
    success = lobby.submit_drawing(player_id, drawing_data)
    if not success:
        await send_error(client_id, "Failed to submit drawing")
        return
    
    await client['websocket'].send(json.dumps({
        'type': 'drawing_submitted',
        'data': {'success': True}
    }))
    
    # Check if all players have submitted drawings
    submitted_count = len([p for p in lobby.players if p.drawing is not None])
    
    if submitted_count >= len(lobby.players):
        await start_voting_phase(lobby_id)
    else:
        await broadcast_lobby_update(lobby_id)

async def handle_drawing_vote(client_id, data):
    voted_drawing_id = data.get('data', {}).get('drawing_id')
    voted_player_id = data.get('data', {}).get('player_id')
    
    client = connected_clients[client_id]
    lobby_id = client['current_lobby']
    voter_player_id = client['player_id']
    
    if not lobby_id or lobby_id not in lobbies:
        logger.warning(f"Invalid vote attempt: lobby_id={lobby_id}")
        return
    
    lobby = lobbies[lobby_id]
    
    # If player_id is provided instead of drawing_id, find the drawing by player_id
    if voted_player_id and not voted_drawing_id:
        target_drawing = next((d for d in lobby.drawings if d.player_id == voted_player_id), None)
        if target_drawing:
            voted_drawing_id = target_drawing.drawing_id
    
    if not voted_drawing_id:
        logger.warning(f"Invalid vote attempt: no drawing_id or player_id provided")
        return
    
    # Use the Lobby object's cast_vote method
    success = lobby.cast_vote(voter_player_id, voted_drawing_id)
    if not success:
        await send_error(client_id, "Failed to cast vote")
        return
    
    logger.info(f"Player {voter_player_id} voted for drawing {voted_drawing_id} in lobby {lobby_id}")
    await broadcast_lobby_update(lobby_id)

async def start_voting_phase(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby.start_voting_phase()  # Use the Lobby object's method
    
    await broadcast_lobby_update(lobby_id)
    
    # Start the auto-display timer instead of regular voting timer
    asyncio.create_task(voting_display_timer(lobby_id))

async def voting_display_timer(lobby_id):
    """Timer for auto-displaying drawings during voting phase"""
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    logger.info(f"Starting auto-display voting timer for lobby {lobby_id}")
    
    while (lobby_id in lobbies and 
           lobby.game_status.value == 'voting_for_drawings' and 
           lobby.current_voting_drawing_index < len(lobby.drawings)):
        
        current_drawing = lobby.get_current_voting_drawing()
        if not current_drawing:
            break
            
        logger.info(f"Displaying drawing {lobby.current_voting_drawing_index + 1}/{len(lobby.drawings)} by player {current_drawing.player_id}")
        
        # Display current drawing for 10 seconds
        display_time = 10
        while display_time > 0 and lobby_id in lobbies and lobby.game_status.value == 'voting_for_drawings':
            # Update every second for smooth countdown
            await broadcast_lobby_update(lobby_id)
            await asyncio.sleep(1)
            display_time -= 1
        
        if lobby_id not in lobbies or lobby.game_status.value != 'voting_for_drawings':
            return
            
        # Advance to next drawing
        if not lobby.advance_voting_display():
            # All drawings have been displayed
            logger.info(f"All drawings displayed for lobby {lobby_id}, moving to showcase")
            await start_showcasing_phase(lobby_id)
            return
    
    # If we exit the loop, move to showcase phase
    if lobby_id in lobbies:
        await start_showcasing_phase(lobby_id)

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
    lobby.start_showcasing_results()  # Use the Lobby object's method
    
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(countdown_timer(lobby_id, 'showcasing', lobby.settings.showcase_time_per_drawing))

async def countdown_timer(lobby_id, expected_status, seconds):
    if lobby_id not in lobbies:
        return
    
    lobby = lobbies[lobby_id]
    logger.info(f"Starting countdown timer for lobby {lobby_id}, status {expected_status}, {seconds} seconds")
    
    while seconds > 0 and lobby_id in lobbies:
        current_lobby = lobbies[lobby_id]
        if current_lobby.game_status.value != expected_status:
            logger.info(f"Timer stopped early - status changed from {expected_status} to {current_lobby.game_status.value}")
            return
            
        seconds -= 1
        
        # Update more frequently for better user experience
        # For theme voting (short phase), update every second
        # For longer phases, update every 2 seconds for the last 30 seconds, every 5 seconds otherwise
        should_update = False
        if expected_status == 'theme_voting':
            # Theme voting is short, update every second
            should_update = True
        elif seconds <= 30:
            # Last 30 seconds of any phase, update every 2 seconds
            should_update = (seconds % 2 == 0)
        else:
            # Regular updates every 5 seconds for long phases
            should_update = (seconds % 5 == 0)
        
        if should_update or seconds == 0:
            logger.info(f"Updating lobby {lobby_id} - {seconds} seconds remaining")
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
    elif expected_status == 'showcasing':
        await end_game(lobby_id)

async def finish_theme_voting(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    logger.info(f"Theme voting finished for lobby {lobby_id}, transitioning to drawing phase")
    
    # Use the Lobby object's method instead of accessing as dictionary
    theme_counts = {}
    for player in lobby.players:
        if player.color_theme_vote:
            theme = player.color_theme_vote
            theme_counts[theme] = theme_counts.get(theme, 0) + 1
    
    if theme_counts:
        sorted_themes = sorted(theme_counts.items(), key=lambda x: x[1], reverse=True)
        winning_theme = sorted_themes[0][0]
    else:
        import random
        themes = lobby.possible_color_themes
        winning_theme = random.choice(themes)
    
    lobby.current_canvas_color_theme = winning_theme
    lobby.start_drawing_phase()
    await broadcast_lobby_update(lobby_id)
    
    asyncio.create_task(countdown_timer(lobby_id, 'drawing', lobby.settings.drawing_time))

async def finish_drawing_phase(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    
    # Check if enough drawings have been submitted
    submitted_count = len([p for p in lobby.players if p.drawing is not None])
    if submitted_count >= 2:
        await start_voting_phase(lobby_id)
    else:
        lobby.end_game()
        await broadcast_lobby_update(lobby_id)

async def end_game(lobby_id):
    if lobby_id not in lobbies:
        return
        
    lobby = lobbies[lobby_id]
    lobby.end_game()  # Use the Lobby object's method
    
    await broadcast_lobby_update(lobby_id)
    
    if lobby_id in lobbies:
        await reset_lobby_for_rejoin(lobby_id)

async def reset_lobby_for_rejoin(lobby_id):
    if lobby_id not in lobbies:
        return
    lobby = lobbies[lobby_id]
    lobby.end_game()  # Use the Lobby object's method to reset game state
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
    
    # Start the countdown timer for theme voting
    asyncio.create_task(countdown_timer(lobby_id, 'theme_voting', lobby.settings.theme_voting_time))

async def send_message(client_id, message):
    """Send a message to a specific client."""
    if client_id not in connected_clients:
        logger.warning(f"Tried to send message to non-existent client {client_id}")
        return
    
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